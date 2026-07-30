// Two devices, one relay, and a thought that crosses between them.
//
// **This is the test that says "sync works".** Everything else in the sync suite
// checks one layer against a fake of the next; this one wires the REAL pieces
// together and asks the only question that matters — capture something on one
// device, and does it come back on the other?
//
// What is real here: two `openSession`s over separate stores, the real gate on
// every keystroke, the real `seal`, the real `exchangeOnce`, the real
// `httpWire`, and the real relay `handle()` — routing, status codes, JSON
// bodies and all. The only thing standing in for hardware is the socket: `fetch`
// is replaced by a function that hands the `Request` straight to `handle()`. The
// relay's own storage is an in-memory `Store`, which is the same interface the
// Cloudflare KV adapter implements.
//
// So a bug anywhere in that chain fails this test, which is the point. It was
// written after two defects — one in event identity, one in the ingestion model
// — got past 567 passing tests, because every one of those tests checked a layer
// against a fake, and neither defect lived inside a layer. They lived in what the
// layers assumed about each other.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { handle, type Store } from '../src/relay.ts';
import { MemoryLogStore } from '../src/log-store.ts';
import { openSession, captureEvent, type Session, type SessionStore } from '../src/ui/session.ts';
import { acceptPairing, beginPairing, currentPairing } from '../src/ui/pairing.ts';
import { eraseEverything } from '../src/purge.ts';
import { MARK_KV } from '../src/sync-keys.ts';
import { runExchange } from '../src/ui/sync-run.ts';
import { heldNodes } from '../src/gate.ts';

const HOST = 'https://relay.example';

/** The relay's storage, in memory. Deliberately dumb: the relay's correctness is
 *  its own suite's job, and a clever fake here would only prove the fake. */
function relayStore(): Store {
  const kv = new Map<string, string>();
  return {
    put: async (k, body) => { kv.set(k, body); },
    get: async k => kv.get(k) ?? null,
    list: async prefix => [...kv.keys()].filter(k => k.startsWith(prefix)).sort(),
  };
}

/** A `fetch` that is the relay. No socket, everything else real — the Request
 *  and Response objects are the platform's, so routes, methods, status codes and
 *  JSON bodies are all exercised exactly as they would be over the wire. */
function relayFetch(store: Store, now = () => Date.parse('2026-07-30T12:00:00Z')): typeof fetch {
  // Chunk names must be unique, and the relay takes its randomness injected so
  // its own tests are not about entropy. A counter is enough here and makes the
  // mailbox contents deterministic, which a failing run has to be readable in.
  let n = 0;
  const token = (): string => (n++).toString(16).padStart(16, '0');
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(typeof input === 'string' ? input : String(input), init);
    return handle(req, { store, now, token });
  }) as typeof fetch;
}

/** A device: a store, a session, and the clock the session stamps with. */
async function makeDevice(name: string, at = Date.parse('2026-07-30T12:00:00Z')): Promise<Session> {
  let t = at;
  const store = new MemoryLogStore() as unknown as SessionStore;
  const session = await openSession(() => (t += 1000), 'personal', name, store, 'America/Denver');
  return session;
}

const capture = async (s: Session, text: string): Promise<void> => {
  await s.commit(ctx => captureEvent(ctx, text, 'quick'));
};

/** The titles this device is holding, which is what somebody would actually see. */
const titles = (s: Session): string[] =>
  heldNodes(s.state()).map(n => n.title).filter((t): t is string => !!t).sort();

test('a thought captured on one device comes back on the other', async () => {
  const store = relayStore();
  const fetchImpl = relayFetch(store);
  const now = (): string => new Date('2026-07-30T12:00:00Z').toISOString();

  const a = await makeDevice('device-a');
  const b = await makeDevice('device-b');

  // Pair by file, exactly as the surface does it: A creates the pair and hands
  // over the file; B opens it. Nothing else is shared between them.
  const file = await beginPairing(a.store, HOST, now());
  await acceptPairing(b.store, JSON.parse(JSON.stringify(file)));

  const pa = await currentPairing(a.store);
  const pb = await currentPairing(b.store);
  assert.equal(pa!.id, pb!.id, 'both devices show the same pairing name');

  await capture(a, 'buy milk on the way home');
  assert.deepEqual(titles(b), [], 'B has not heard of it yet');

  // A opens: uploads. Then B opens: collects. Neither is ever awake with the
  // other, which is the whole point of store-and-forward.
  const up = await runExchangeWith(a, fetchImpl, now);
  assert.equal(up.result!.outcome, 'ok');
  assert.ok(up.result!.sent > 0, 'A sent something');

  const down = await runExchangeWith(b, fetchImpl, now);
  assert.equal(down.result!.outcome, 'ok');
  assert.ok(down.landed! > 0, 'B took something in');

  assert.deepEqual(titles(b), ['buy milk on the way home'],
    'the thought came back on the other device');

  // And law 1 holds on B without the gate having run there: the node arrived
  // with the clock that keeps it from being silent, because that clock is an
  // event in A's log.
  const node = heldNodes(b.state())[0]!;
  assert.ok(Object.keys(node.clocks).length > 0, 'it arrived under a clock, not silent');
});

test('both devices end up holding everything, whoever wrote it', async () => {
  const store = relayStore();
  const fetchImpl = relayFetch(store);
  const now = (): string => new Date('2026-07-30T12:00:00Z').toISOString();

  const a = await makeDevice('device-a');
  const b = await makeDevice('device-b');
  const file = await beginPairing(a.store, HOST, now());
  await acceptPairing(b.store, JSON.parse(JSON.stringify(file)));

  await capture(a, 'from A');
  await capture(b, 'from B');

  // Two rounds each: the first carries their own work out, the second collects
  // what the other left. This is what two app-opens apiece looks like.
  for (const d of [a, b, a, b]) await runExchangeWith(d, fetchImpl, now);

  assert.deepEqual(titles(a), ['from A', 'from B']);
  assert.deepEqual(titles(b), ['from A', 'from B']);
});

test('exchanging again when nothing has changed moves nothing and breaks nothing', async () => {
  // Idempotence, which is what makes exchange-on-open safe to run every time the
  // app is opened. A second run that re-uploaded, or re-took-in, would grow the
  // log forever and would have been invisible until somebody's store was huge.
  const store = relayStore();
  const fetchImpl = relayFetch(store);
  const now = (): string => new Date('2026-07-30T12:00:00Z').toISOString();

  const a = await makeDevice('device-a');
  const b = await makeDevice('device-b');
  const file = await beginPairing(a.store, HOST, now());
  await acceptPairing(b.store, JSON.parse(JSON.stringify(file)));

  await capture(a, 'only thing');
  await runExchangeWith(a, fetchImpl, now);
  await runExchangeWith(b, fetchImpl, now);

  const before = (await b.store.all()).length;
  const second = await runExchangeWith(b, fetchImpl, now);
  const after = (await b.store.all()).length;

  assert.equal(second.landed, 0, 'nothing new arrived');
  assert.equal(before, after, 'and the log did not grow');
  assert.deepEqual(titles(b), ['only thing']);
});

test('a device with the wrong key takes nothing in, and says so rather than crashing', async () => {
  // The failure somebody will actually hit: two devices each paired, but not to
  // each other. It must not look like success, and it must not look like a bug.
  const store = relayStore();
  const fetchImpl = relayFetch(store);
  const now = (): string => new Date('2026-07-30T12:00:00Z').toISOString();

  const a = await makeDevice('device-a');
  const c = await makeDevice('device-c');

  await beginPairing(a.store, HOST, now());
  await beginPairing(c.store, HOST, now());   // its OWN pair, not A's

  await capture(a, 'private to A');
  await runExchangeWith(a, fetchImpl, now);

  const r = await runExchangeWith(c, fetchImpl, now);
  assert.equal(r.landed, 0, 'nothing crossed between two different pairs');
  assert.deepEqual(titles(c), []);
  // Different sync ids means different mailboxes, so C sees an empty one rather
  // than an unreadable chunk — the seal is never even reached.
  assert.equal(r.result!.unopened, 0);
});

/** `runExchange` dials the host in the pairing, through `httpWire`'s real
 *  `fetch`. Swapping the global for the duration is the smallest possible seam,
 *  and it keeps `runExchange` under test rather than a copy of it. */
async function runExchangeWith(
  session: Session,
  fetchImpl: typeof fetch,
  now: () => string,
): ReturnType<typeof runExchange> {
  const real = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  try {
    return await runExchange(session, now);
  } finally {
    globalThis.fetch = real;
  }
}

// --- erasing, while paired --------------------------------------------------
//
// The audit's finding, and the nastiest shape a bug can have: an operation whose
// whole purpose is to destroy data, quietly undone by an honest peer doing its
// job. `replaceAll([])` empties the events and snapshots tables and nothing else,
// so an erased device stayed PAIRED — and the next exchange pulled its own
// history back out of a relay that still held thirty days of it.
//
// Nobody would have noticed until they erased something they truly wanted gone.

test('erasing while paired empties the device and keeps it empty', async () => {
  const store = relayStore();
  const fetchImpl = relayFetch(store);
  const now = (): string => new Date('2026-07-30T12:00:00Z').toISOString();

  const a = await makeDevice('device-a');
  const b = await makeDevice('device-b');
  const file = await beginPairing(a.store, HOST, now());
  await acceptPairing(b.store, JSON.parse(JSON.stringify(file)));

  await capture(a, 'something private');
  await runExchangeWith(a, fetchImpl, now);
  await runExchangeWith(b, fetchImpl, now);
  assert.deepEqual(titles(b), ['something private'], 'it reached the other device');

  // The relay is still holding it — which is the whole point. Erasing has to
  // survive that, not depend on it having expired.
  await eraseEverything(a.store);

  // Reopen: a fresh session over the same store, exactly as the reload does.
  const a2 = await openSession(() => Date.parse('2026-07-30T13:00:00Z'),
    'personal', 'device-a', a.store as unknown as SessionStore, 'America/Denver');
  const after = await runExchangeWith(a2, fetchImpl, now);

  // THE OUTCOME FIRST, deliberately. These are what somebody actually cares
  // about, and asserting the mechanism ahead of them would make a regression
  // report "the key was still set" rather than "the thing you erased came back".
  assert.deepEqual(titles(a2), [], 'nothing came back');
  assert.equal((await a2.store.all()).length, 0, 'and the log is still empty');
  // Then the mechanism that achieves it.
  assert.equal(after.ran, false, 'it does not exchange, because it is not paired');
  assert.equal(await currentPairing(a.store), null, 'erasing unpaired this device');

  // The other device is untouched. Erasing one device is not a remote wipe, and
  // the confirmation says so.
  assert.deepEqual(titles(b), ['something private'], 'the other device keeps its copy');
});

test('erasing clears the mark too, so a later pairing cannot skip events', async () => {
  // A mark left behind would tell a NEW pairing that chunks it has never seen
  // were already taken in — a silent, permanent hole with no error anywhere.
  const store = relayStore();
  const fetchImpl = relayFetch(store);
  const now = (): string => new Date('2026-07-30T12:00:00Z').toISOString();

  const a = await makeDevice('device-a');
  await beginPairing(a.store, HOST, now());
  await capture(a, 'first life');
  await runExchangeWith(a, fetchImpl, now);
  assert.notEqual(await a.store.getKv(MARK_KV), null, 'a mark was written');

  await eraseEverything(a.store);
  assert.equal(await a.store.getKv(MARK_KV), null, 'and erasing took it with the key');
});
