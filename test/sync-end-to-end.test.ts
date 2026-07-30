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
import { acceptKeyText, acceptPairing, beginPairing, currentKeyText, currentPairing } from '../src/ui/pairing.ts';
import { eraseEverything } from '../src/purge.ts';
import { MARK_KV } from '../src/sync-keys.ts';
import { revokeMailbox, runExchange } from '../src/ui/sync-run.ts';
import { heldNodes } from '../src/gate.ts';
import type { AppEvent } from '../src/events.ts';

const HOST = 'https://relay.example';

/** The relay's storage, in memory. Deliberately dumb: the relay's correctness is
 *  its own suite's job, and a clever fake here would only prove the fake. */
function relayStore(): Store {
  const kv = new Map<string, string>();
  return {
    put: async (k, body) => { kv.set(k, body); },
    get: async k => kv.get(k) ?? null,
    list: async prefix => [...kv.keys()].filter(k => k.startsWith(prefix)).sort(),
    remove: async k => { kv.delete(k); },
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

// --- a planner that arrived by import must still sync ------------------------
//
// Noah, from his iPad and phone: "Pairing works although no data syncs."
//
// His exports told the whole story. The iPad held 2900 events and sent ZERO; the
// phone held one event it had written itself, and that one crossed. The cause:
// `exchangeOnce` offered only events THIS DEVICE AUTHORED, and every one of the
// iPad's 2900 was authored by the plain Quietkeep app and had arrived in the Sync
// edition by import — so the Sync edition considered none of it its own to share.
//
// The reasoning behind the old rule was that each device is a single-writer shard
// and the device that wrote an event will publish it. True in a closed sync
// world; false the moment a shard arrives by IMPORT, because the device that
// wrote it is not in the pair and never will be. Moving between the editions is
// an export and an import — the documented, expected route — so this was on the
// main road, not an edge of it.

test('a planner that arrived by import is uploaded, not just what this device wrote', async () => {
  const store = relayStore();
  const fetchImpl = relayFetch(store);
  const now = (): string => new Date('2026-07-30T12:00:00Z').toISOString();

  const a = await makeDevice('device-a');
  const b = await makeDevice('device-b');

  // Exactly the iPad's situation: a full planner authored somewhere else,
  // brought in by import, plus nothing of this device's own.
  const imported: AppEvent[] = [
    { id: 'far-0', vault: 'personal', at: '2026-07-29T09:00:00.000Z', device: 'a-different-app', seq: 0,
      kind: 'capture.recorded', node: 'n0', payload: { text: 'written before the move', source: 'quick' } } as AppEvent,
    { id: 'far-0~cure~n0', vault: 'personal', at: '2026-07-29T09:00:00.000Z', device: 'a-different-app', seq: 0,
      kind: 'clock.set', node: 'n0',
      payload: { clockKind: 'review', at: '2026-07-29T09:00:00.000Z', source: 'gate:capture.recorded' } } as AppEvent,
  ];
  await a.store.append(imported);
  await a.refresh();
  assert.deepEqual(titles(a), ['written before the move'], 'A is holding an imported planner');

  const file = await beginPairing(a.store, HOST, now());
  await acceptKeyText(b.store, (await currentKeyText(a.store))!, HOST);

  const up = await runExchangeWith(a, fetchImpl, now);
  assert.ok(up.result!.sent > 0, 'A offered what it holds, not only what it wrote');

  const down = await runExchangeWith(b, fetchImpl, now);
  assert.ok(down.landed! > 0, 'and B took it in');
  assert.deepEqual(titles(b), ['written before the move'],
    'the imported planner reached the other device');
});

test('an event is offered once, not on every exchange', async () => {
  // Uploading what this device HOLDS rather than only what it WROTE is correct,
  // and it must not become a device re-posting the same events forever. The mark
  // records what has been offered, whoever originally wrote it.
  const store = relayStore();
  const fetchImpl = relayFetch(store);
  const now = (): string => new Date('2026-07-30T12:00:00Z').toISOString();

  const a = await makeDevice('device-a');
  await a.store.append([
    { id: 'far-1', vault: 'personal', at: '2026-07-29T09:00:00.000Z', device: 'elsewhere', seq: 0,
      kind: 'capture.recorded', node: 'm0', payload: { text: 'from elsewhere', source: 'quick' } } as AppEvent,
    { id: 'far-1~cure~m0', vault: 'personal', at: '2026-07-29T09:00:00.000Z', device: 'elsewhere', seq: 0,
      kind: 'clock.set', node: 'm0',
      payload: { clockKind: 'review', at: '2026-07-29T09:00:00.000Z', source: 'gate:capture.recorded' } } as AppEvent,
  ]);
  await a.refresh();
  await beginPairing(a.store, HOST, now());

  const first = await runExchangeWith(a, fetchImpl, now);
  const second = await runExchangeWith(a, fetchImpl, now);

  assert.ok(first.result!.sent > 0, 'offered the first time');
  assert.equal(second.result!.sent, 0, 'and not again');
});

// --- re-pairing resets the upload bookkeeping (audit finding) ----------------
//
// A security audit found that `beginPairing` set a new key but left the old
// sync mark in place. A fresh key is a fresh, empty mailbox — so a device that
// had synced, then replaced its key, believed it had already uploaded everything
// and offered NOTHING to the new mailbox until the next keystroke. Worse, it made
// the "a survivor can republish a lost device's work" promise false: the survivor
// would sit on that work rather than send it to a replacement.

test('a survivor republishes a lost device\'s work to a replacement, after re-pairing', async () => {
  const store = relayStore();
  const fetchImpl = relayFetch(store);
  const now = (): string => new Date('2026-07-30T12:00:00Z').toISOString();

  // A and B are a pair. A writes; both converge, so B now HOLDS A's work.
  const a = await makeDevice('device-a');
  const b = await makeDevice('device-b');
  const file = await beginPairing(a.store, HOST, now());
  await acceptKeyText(b.store, (await currentKeyText(a.store))!, HOST);
  await capture(a, 'a thought only device A ever typed');
  await runExchangeWith(a, fetchImpl, now);
  await runExchangeWith(b, fetchImpl, now);
  assert.deepEqual(titles(b), ['a thought only device A ever typed'], 'B holds A\'s work');

  // A is lost. B re-pairs with a NEW device C, on a fresh key. B has synced
  // before, so it carries a mark — the exact condition the bug lived in.
  const c = await makeDevice('device-c');
  const fresh = await beginPairing(b.store, HOST, now());        // B mints a new key
  await acceptKeyText(c.store, (await currentKeyText(b.store))!, HOST);

  await runExchangeWith(b, fetchImpl, now);
  await runExchangeWith(c, fetchImpl, now);

  assert.deepEqual(titles(c), ['a thought only device A ever typed'],
    'the lost device\'s work reached the replacement through the survivor');
});

test('replacing the key on a device makes it re-offer everything to the new mailbox', async () => {
  const store = relayStore();
  const fetchImpl = relayFetch(store);
  const now = (): string => new Date('2026-07-30T12:00:00Z').toISOString();

  const a = await makeDevice('device-a');
  await beginPairing(a.store, HOST, now());
  await capture(a, 'written before the re-key');
  await runExchangeWith(a, fetchImpl, now);       // uploaded to the first mailbox

  // Replace the key: fresh mailbox, and the mark must not claim the new one
  // already has these events.
  await beginPairing(a.store, HOST, now());
  const after = await runExchangeWith(a, fetchImpl, now);
  assert.ok(after.result!.sent > 0, 'it re-offered its work to the new mailbox');
});

// --- revocation actually deletes (Noah's decision) --------------------------
//
// Noah: "Revocation needs to delete." The audit found "Replace the key" only
// gave forward secrecy — a dropped device could still collect up to a month of
// backlog from the old mailbox. Replacing the key now EMPTIES that mailbox, so
// there is nothing left for the old key to fetch.

test('replacing the key empties the old mailbox, so a dropped device gets nothing', async () => {
  const store = relayStore();
  const fetchImpl = relayFetch(store);
  const now = (): string => new Date('2026-07-30T12:00:00Z').toISOString();

  // A pairs and uploads. A "dropped" device D holds the same (old) key but has
  // NOT yet collected — the exact window revocation has to close.
  const a = await makeDevice('device-a');
  const dropped = await makeDevice('device-dropped');
  const file = await beginPairing(a.store, HOST, now());
  await acceptKeyText(dropped.store, (await currentKeyText(a.store))!, HOST);
  await capture(a, 'something the dropped device must never get');
  await runExchangeWith(a, fetchImpl, now);

  // A replaces its key — which mints a new mailbox AND empties the old one.
  const old = await currentPairing(a.store);
  await beginPairing(a.store, HOST, now());
  const purged = await revokeMailboxWith(old!.host, old!.id, fetchImpl);
  assert.equal(purged, true, 'the old mailbox was emptied');

  // The dropped device, still on the old key, now finds nothing waiting.
  const d = await runExchangeWith(dropped, fetchImpl, now);
  assert.equal(d.landed ?? 0, 0, 'the backlog is gone');
  assert.deepEqual(titles(dropped), [], 'the dropped device collected nothing');
});

test('after re-keying, the legitimate other device still catches up on the new key', async () => {
  // Deleting the old mailbox must not orphan a GOOD device: re-pairing it on the
  // new key, this device re-uploads everything it holds (mark was cleared), so
  // the good device gets it all through the new mailbox.
  const store = relayStore();
  const fetchImpl = relayFetch(store);
  const now = (): string => new Date('2026-07-30T12:00:00Z').toISOString();

  const a = await makeDevice('device-a');
  await beginPairing(a.store, HOST, now());
  await capture(a, 'kept across a re-key');
  await runExchangeWith(a, fetchImpl, now);

  // Re-key (drops a lost device), then bring a fresh good device onto the new key.
  const old = await currentPairing(a.store);
  await beginPairing(a.store, HOST, now());
  await revokeMailboxWith(old!.host, old!.id, fetchImpl);

  const good = await makeDevice('device-good');
  await acceptKeyText(good.store, (await currentKeyText(a.store))!, HOST);
  await runExchangeWith(a, fetchImpl, now);
  await runExchangeWith(good, fetchImpl, now);

  assert.deepEqual(titles(good), ['kept across a re-key'],
    'the good device caught up through the new mailbox');
});

/** revokeMailbox dials the real host through httpWire's fetch, so the test swaps
 *  the global for the duration exactly as runExchangeWith does. */
async function revokeMailboxWith(host: string, id: string, fetchImpl: typeof fetch): Promise<boolean> {
  const real = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  try { return await revokeMailbox(host, id); }
  finally { globalThis.fetch = real; }
}
