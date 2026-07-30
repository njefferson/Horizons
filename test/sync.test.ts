// Exchange when it opens (sync stage 3b, ADR-0037).
//
// The correctness here is almost entirely ORDERING, so the wire can be made to
// die at a chosen step and the assertion is about what survives. The rule being
// tested, over and over: **a failed exchange leaves the device with strictly more
// than it had, never less.**
//
// Two tests carry the weight. One kills the wire between persisting arrivals and
// recording them, and asserts the events are still there. The other holds the
// line that an unopenable chunk is never marked as taken in — because a chunk
// from a newer version is a device that is ahead, not garbage, and discarding it
// would be permanent.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  exchangeOnce, gapsIn, gapWords, emptyMark, malformedChunk, MailboxFull,
  CHUNK_EVENTS, MAX_FULFIL, SEQ_FLOOR,
  type ChunkBody, type ExchangeDeps, type SyncMark, type Wire,
} from '../src/sync.ts';
import { newKey, seal, syncId, open, type Sealed } from '../src/seal.ts';
import { countIn, heldRanges } from '../src/exchange.ts';
import type { AppEvent } from '../src/events.ts';

const NOW = '2026-07-29T18:00:00.000Z';
const ev = (device: string, seq: number, title = `${device}#${seq}`): AppEvent =>
  ({ id: `${device}-${seq}`, vault: 'personal', at: NOW, device, seq,
     kind: 'node.created', node: `${device}-${seq}`,
     payload: { nodeKind: 'action', title } } as AppEvent);

const key = await newKey();
const ID = await syncId(key);

/** A mailbox in memory, with a switch for making any call fail. */
function fakeWire() {
  const box = new Map<string, Sealed>();
  let n = 0;
  const failures: { on: 'chunks' | 'get' | 'post'; after?: number; full?: boolean } [] = [];
  const calls: string[] = [];
  const wire: Wire = {
    chunks: async id => {
      calls.push('chunks');
      if (failures.some(f => f.on === 'chunks')) throw new Error('offline');
      return [...box.keys()].filter(k => k.startsWith(`${id}/`)).map(k => k.slice(id.length + 1)).sort();
    },
    get: async (id, chunk) => {
      calls.push('get');
      if (failures.some(f => f.on === 'get')) throw new Error('offline');
      return box.get(`${id}/${chunk}`) ?? null;
    },
    post: async (id, sealed) => {
      calls.push('post');
      const f = failures.find(x => x.on === 'post');
      if (f && (f.after === undefined || calls.filter(c => c === 'post').length > f.after)) {
        throw f.full ? new MailboxFull('full') : new Error('refused');
      }
      const name = `${String(n++).padStart(3, '0')}-aaaaaaaaaaaaaaaa`;
      box.set(`${id}/${name}`, sealed);
      return name;
    },
    purge: async id => {
      calls.push('purge');
      for (const k of [...box.keys()]) if (k.startsWith(`${id}/`)) box.delete(k);
    },
  };
  return { wire, box, failures, calls };
}

/** A device: its log, its mark, and a record of what it was asked to persist. */
function device(name: string, events: AppEvent[] = [], mark: SyncMark = emptyMark()) {
  const log = [...events];
  const persisted: AppEvent[][] = [];
  const remembered: SyncMark[] = [];
  let dieOnRemember = 0;
  const deps = (wire: Wire): ExchangeDeps => ({
    key, wire, ownDevice: name, localEvents: log, mark,
    persist: async es => { persisted.push([...es]); log.push(...es); },
    remember: async m => {
      remembered.push(m);
      if (dieOnRemember > 0 && remembered.length === dieOnRemember) throw new Error('the tab closed');
      mark = m;
    },
  });
  return {
    deps, log, persisted, remembered,
    get mark() { return mark; },
    dieAtRemember(i: number) { dieOnRemember = i; },
  };
}

const drop = async (box: Map<string, Sealed>, body: ChunkBody, name = 'zzz-aaaaaaaaaaaaaaaa') => {
  box.set(`${ID}/${name}`, await seal(key, body));
  return name;
};

// --- the ordinary case ------------------------------------------------------

test('a first exchange uploads what this device holds and takes in nothing', async () => {
  const { wire, box } = fakeWire();
  const a = device('a', [ev('a', 0), ev('a', 1)]);
  const r = await exchangeOnce(a.deps(wire));
  assert.equal(r.sent, 2);
  assert.equal(r.received, 0);
  assert.equal(r.outcome, 'ok');
  assert.equal(box.size, 1, 'one chunk');
  assert.deepEqual(a.mark.uploaded, { a: [[0, 1]] }, 'a SET of ranges, never a maximum');
});

test('two devices converge, each opening in turn, neither ever awake together', async () => {
  // The whole point of store-and-forward: B is shut while A drops off, and A is
  // shut while B collects. This is what "just works" has to mean.
  const { wire, box } = fakeWire();
  const a = device('a', [ev('a', 0), ev('a', 1)]);
  await exchangeOnce(a.deps(wire));

  const b = device('b', [ev('b', 0)]);
  const rb = await exchangeOnce(b.deps(wire));
  assert.equal(rb.received, 2, "B took in A's two");
  assert.equal(rb.sent, 1, 'and left its own');

  const ra2 = await exchangeOnce(a.deps(wire));
  assert.equal(ra2.received, 1, "A took in B's one");
  assert.equal(ra2.sent, 0, 'and had nothing new to send');

  assert.deepEqual(heldRanges(a.log), heldRanges(b.log), 'both hold the same set');
  assert.equal(a.log.length, 3);
  assert.equal(box.size, 2, 'and nobody re-uploaded anything');
});

test('exchanging again moves nothing at all', async () => {
  const { wire } = fakeWire();
  const a = device('a', [ev('a', 0)]);
  await exchangeOnce(a.deps(wire));
  const again = await exchangeOnce(a.deps(wire));
  assert.equal(again.sent, 0);
  assert.equal(again.received, 0);
  assert.equal(again.words, 'Already the same on both.');
});

test('a device never takes in its own chunk as new work', async () => {
  const { wire } = fakeWire();
  const a = device('a', [ev('a', 0)]);
  await exchangeOnce(a.deps(wire));
  const again = await exchangeOnce(a.deps(wire));
  assert.equal(again.received, 0, 'it already holds every one of them');
  assert.equal(a.log.length, 1, 'and nothing was duplicated into the log');
});

// --- THE ONE THAT MATTERS: a death mid-exchange loses nothing ----------------

test('THE ONE THAT MATTERS: dying between persisting and recording loses no event', async () => {
  // Events are persisted BEFORE the mark that records them advances. A death in
  // between costs one repeated download. The reverse order costs a chunk
  // forever, with no error afterwards to notice — the shape of every data-loss
  // bug this project has found.
  const { wire, box } = fakeWire();
  await drop(box, { kind: 'events', events: [ev('b', 0), ev('b', 1)] });

  const a = device('a', [ev('a', 0)]);
  a.dieAtRemember(1);
  await assert.rejects(() => exchangeOnce(a.deps(wire)), /tab closed/);

  assert.equal(a.persisted.length, 1, 'the arrivals were persisted first');
  assert.deepEqual(a.persisted[0]!.map(e => e.id), ['b-0', 'b-1']);
  assert.deepEqual(a.mark.ingested, [], 'and the mark never advanced');

  // Next open: it downloads the same chunk again and is no worse off.
  const b = device('a', [...a.log]);
  const r = await exchangeOnce(b.deps(wire));
  assert.equal(r.received, 0, 'it already has them, so nothing is gained');
  assert.deepEqual(heldRanges(b.log), { a: [[0, 0]], b: [[0, 1]] }, 'and nothing was lost');
});

test('a failed upload is offered again next time, not marked as sent', async () => {
  const { wire, failures } = fakeWire();
  const a = device('a', [ev('a', 0), ev('a', 1)]);
  failures.push({ on: 'post' });
  const first = await exchangeOnce(a.deps(wire));
  assert.equal(first.sent, 0);
  assert.equal(first.outcome, 'refused');
  assert.deepEqual(a.mark.uploaded, {}, 'nothing was recorded as uploaded');

  failures.length = 0;
  const second = await exchangeOnce(a.deps(wire));
  assert.equal(second.sent, 2, 'offered again in full');
});

test('THE THIRD ONE: what has been uploaded is a SET, so recovered events go out too', async () => {
  // The header of `sync.ts` claims a maximum here would re-introduce the stage-1
  // bug one layer up. That claim was untested: swapping `uploaded` for a
  // high-water number left all twenty-two tests passing, which is exactly the
  // kind of unguarded assertion this session keeps finding.
  //
  // The divergence is reachable, and gap repair is what creates it. A device
  // holding only a#5..a#9 — its own early events lost to a half-finished
  // restore — uploads those five and records the maximum 9. Later it recovers
  // a#0..a#4 through a request. A maximum says "sent up to 9" and it NEVER
  // uploads them, so a third device can never learn them from here: silent,
  // permanent, and invisible because every count looks right.
  const { wire, box } = fakeWire();
  const recovered = Array.from({ length: 10 }, (_, i) => ev('a', i));
  const a = device('a', recovered, { ingested: [], uploaded: { a: [[5, 9]] } });

  const r = await exchangeOnce(a.deps(wire));
  assert.equal(r.sent, 5, 'the five recovered events, which a maximum would have skipped');
  const bodies = await Promise.all([...box.values()].map(s => open(key, s)));
  const events = bodies.flatMap(b => (b as ChunkBody).kind === 'events' ? (b as { events: AppEvent[] }).events : []);
  assert.deepEqual(events.map(e => e.seq).sort((x, y) => x - y), [0, 1, 2, 3, 4]);
  assert.deepEqual(a.mark.uploaded, { a: [[0, 9]] }, 'and now the whole run is recorded as sent');
});

test('an unreachable mailbox changes nothing and is not a fault', async () => {
  const { wire, failures } = fakeWire();
  failures.push({ on: 'chunks' });
  const a = device('a', [ev('a', 0)]);
  const r = await exchangeOnce(a.deps(wire));
  assert.equal(r.outcome, 'unreachable');
  assert.equal(r.sent, 0);
  assert.equal(r.received, 0);
  assert.deepEqual(a.remembered, [], 'nothing was even written down');
});

test('a mailbox that fills mid-upload keeps what did land and reports it plainly', async () => {
  const { wire, failures } = fakeWire();
  const many = Array.from({ length: CHUNK_EVENTS * 2 }, (_, i) => ev('a', i));
  const a = device('a', many);
  failures.push({ on: 'post', after: 1, full: true });
  const r = await exchangeOnce(a.deps(wire));
  assert.equal(r.outcome, 'full');
  assert.equal(r.sent, CHUNK_EVENTS, 'the first batch landed');
  assert.deepEqual(a.mark.uploaded, { a: [[0, CHUNK_EVENTS - 1]] },
    'and exactly that much is recorded — the rest is offered again');
});

// --- THE OTHER ONE: an unopenable chunk is left alone ------------------------

test('THE OTHER ONE: a chunk that will not open is NOT marked as taken in', async () => {
  // A chunk sealed by a newer format is a device that is ahead, not garbage.
  // Recording it as ingested would discard it permanently at the exact moment
  // an update would have made it readable.
  const { wire, box } = fakeWire();
  const stranger = await newKey();
  box.set(`${ID}/001-aaaaaaaaaaaaaaaa`, await seal(stranger, { kind: 'events', events: [ev('x', 0)] }));
  box.set(`${ID}/002-aaaaaaaaaaaaaaaa`, { v: 99, iv: 'AAAAAAAAAAAAAAAA', ct: 'AAAAAAAAAAAAAAAAAAAAAA==' });

  const a = device('a', [ev('a', 0)]);
  const r = await exchangeOnce(a.deps(wire));
  assert.equal(r.unopened, 2);
  assert.equal(r.received, 0);
  assert.deepEqual(a.mark.ingested, [], 'neither is written off');

  // And it stays retryable: a second open tries them both again.
  const second = await exchangeOnce(a.deps(wire));
  assert.equal(second.unopened, 2, 'still offered, still not discarded');
});

test('a chunk that opens but is not a chunk is refused, not folded in', async () => {
  const { wire, box } = fakeWire();
  box.set(`${ID}/001-aaaaaaaaaaaaaaaa`, await seal(key, { kind: 'nonsense' }));
  box.set(`${ID}/002-aaaaaaaaaaaaaaaa`, await seal(key, 'a plain string'));
  box.set(`${ID}/003-aaaaaaaaaaaaaaaa`, await seal(key, { kind: 'request', want: { d: [[3, 1]] } }));
  const a = device('a');
  const r = await exchangeOnce(a.deps(wire));
  assert.equal(r.unopened, 3);
  assert.equal(a.log.length, 0, 'nothing reached the log');
});

test('malformedChunk names what it refused', () => {
  assert.equal(malformedChunk({ kind: 'events', events: [] }), null);
  assert.equal(malformedChunk({ kind: 'request', want: { d: [[0, 2]] } }), null);
  assert.notEqual(malformedChunk(null), null);
  assert.notEqual(malformedChunk([]), null);
  assert.notEqual(malformedChunk({ kind: 'events' }), null);
  assert.notEqual(malformedChunk({ kind: 'request', want: 'nope' }), null);
  // A request is INPUT, and gets the same range check any summary gets — one
  // definition of well-formed, imported rather than restated.
  assert.notEqual(malformedChunk({ kind: 'request', want: { d: [[1, 2], [3, 4]] } }), null);
});

// --- gaps -------------------------------------------------------------------

test('a hole between two ranges is a provable gap and is asked for', async () => {
  const held = [ev('b', 0), ev('b', 1), ev('b', 4)];
  assert.deepEqual(gapsIn(held), { b: [[2, 3]] });
});

test('a hole BELOW the first range is provable too, because seq starts at zero', async () => {
  // `nextSeq` returns 0 for a device with no events, so holding [[5,9]] proves
  // 0 through 4 are missing. That is what makes gap repair possible from the
  // local log alone, with no summary exchange at all.
  assert.equal(SEQ_FLOOR, 0);
  assert.deepEqual(gapsIn([ev('b', 5), ev('b', 6)]), { b: [[0, 4]] });
});

test('nothing ABOVE the last range is asked for, because nothing proves it exists', async () => {
  // Asking would post a request that can never be satisfied, on every open,
  // until it filled the mailbox.
  assert.deepEqual(gapsIn([ev('b', 0), ev('b', 1)]), {});
  assert.deepEqual(gapsIn([]), {});
});

test('a gap is posted as a request, and another device answers it', async () => {
  const { wire, box } = fakeWire();
  // A is missing b#2 and b#3 — a transfer that died halfway.
  const a = device('a', [ev('a', 0), ev('b', 0), ev('b', 1), ev('b', 4)]);
  const ra = await exchangeOnce(a.deps(wire));
  assert.deepEqual(ra.requested, { b: [[2, 3]] });
  assert.match(String(gapWords(ra.requested)), /2 things/);

  // B opens later, sees the request, and hands over exactly those two.
  const b = device('b', Array.from({ length: 5 }, (_, i) => ev('b', i)));
  const rb = await exchangeOnce(b.deps(wire));
  assert.equal(rb.fulfilled, 2, 'exactly the gap, not the whole log');

  // A opens again and the hole is closed.
  const a2 = device('a', [...a.log], a.mark);
  const ra2 = await exchangeOnce(a2.deps(wire));
  assert.equal(ra2.received, 2);
  assert.deepEqual(gapsIn(a2.log), {}, 'and it has no holes left to ask about');
  void box;
});

test('a request is answered once, not on every open forever', async () => {
  const { wire, box } = fakeWire();
  await drop(box, { kind: 'request', want: { b: [[0, 1]] } });
  const b = device('b', [ev('b', 0), ev('b', 1)]);
  const first = await exchangeOnce(b.deps(wire));
  assert.equal(first.fulfilled, 2);
  const second = await exchangeOnce(b.deps(wire));
  assert.equal(second.fulfilled, 0, 'the request chunk was taken in and is not re-read');
});

test('a request cannot make a device upload without bound', async () => {
  // A peer with the key can already read everything, so this is a bound on WORK,
  // not on confidentiality — a looping or hostile request must not make a device
  // upload its whole log on every open forever.
  const { wire, box } = fakeWire();
  await drop(box, { kind: 'request', want: { b: [[0, MAX_FULFIL + 500]] } });
  const b = device('b', Array.from({ length: MAX_FULFIL + 500 }, (_, i) => ev('b', i)));
  const r = await exchangeOnce(b.deps(wire));
  assert.equal(r.fulfilled, MAX_FULFIL);
});

test('a device does not ask for a gap it cannot prove after arrivals close it', async () => {
  const { wire, box } = fakeWire();
  await drop(box, { kind: 'events', events: [ev('b', 2), ev('b', 3)] });
  const a = device('a', [ev('b', 0), ev('b', 1), ev('b', 4)]);
  const r = await exchangeOnce(a.deps(wire));
  assert.equal(r.received, 2);
  assert.deepEqual(r.requested, {}, 'the gap closed during this very exchange');
});

// --- what the relay would see -----------------------------------------------

test('nothing legible ever reaches the wire, including the request', async () => {
  const { wire, box } = fakeWire();
  const a = device('a', [ev('a', 0, 'ring the roofer'), ev('a', 3, 'the quarterly report')]);
  await exchangeOnce(a.deps(wire));
  const onTheWire = JSON.stringify([...box.entries()]);
  for (const secret of ['roofer', 'quarterly', 'node.created', 'personal', NOW]) {
    assert.equal(onTheWire.includes(secret), false, `the wire carried "${secret}"`);
  }
  // Including the REQUEST, which names device ids and counts — a per-device
  // write-rate graph in plain text if it went unsealed.
  assert.equal(onTheWire.includes('request'), false);
  assert.equal(onTheWire.includes('"a"'), false, 'not even a device id');
  // And it really did post a request, so the assertion above means something.
  const bodies = await Promise.all([...box.values()].map(s => open(key, s)));
  assert.equal(bodies.some(b => (b as ChunkBody).kind === 'request'), true);
});

test('everything that arrives is handed over whole, and this driver filters nothing', async () => {
  // This test used to assert the OPPOSITE — that arrivals were re-run through
  // `admit` — and that was wrong in a way worth keeping the record of. The gate
  // stamps a cure with its cause's id, so re-admitting an already-cured log
  // mints a duplicate the store refuses; and the gate rejects a child whose
  // parent is in the next chunk, which over a wire is ordinary. Arrivals are a
  // SHARD UNION (`takeInEvents`, ADR-0035), and the only thing this driver may
  // do with them is pass them on complete.
  const { wire, box } = fakeWire();
  await drop(box, { kind: 'events', events: [ev('b', 0), ev('b', 1)] });
  const a = device('a');
  const r = await exchangeOnce(a.deps(wire));
  assert.deepEqual(a.persisted.flat().map(e => e.id), ['b-0', 'b-1'],
    'everything that arrived was handed to persist, in one call, unfiltered');
  assert.equal(r.received, 2);
});

test('a large log becomes several chunks rather than one refusal', async () => {
  const { wire, box } = fakeWire();
  const a = device('a', Array.from({ length: CHUNK_EVENTS * 2 + 1 }, (_, i) => ev('a', i)));
  const r = await exchangeOnce(a.deps(wire));
  assert.equal(r.sent, CHUNK_EVENTS * 2 + 1);
  assert.equal([...box.keys()].filter(k => k.startsWith(ID)).length, 3, 'three chunks, no request');
});

// --- words ------------------------------------------------------------------

test('a gap is described as waiting, never as a fault or a loss', async () => {
  assert.equal(gapWords({}), null, 'silence when there is nothing to say');
  assert.match(String(gapWords({ b: [[0, 0]] })), /^One thing/);
  const w = String(gapWords({ b: [[0, 4]] }));
  assert.equal(countIn({ b: [[0, 4]] }), 5);
  assert.match(w, /5 things/);
  for (const bad of ['fail', 'error', 'was lost', 'missing', 'corrupt', 'behind', '%']) {
    assert.doesNotMatch(w, new RegExp(bad, 'i'), `"${w}" contains "${bad}"`);
  }
});

// --- a cure shares its cause's device AND seq --------------------------------
//
// `gate.ts` stamps every cure with its cause's `at`, `device` and `seq`, on
// purpose, so replaying a log reproduces the same cure with the same derived id
// (`cureFor`). The consequence is one this module got wrong: **`device#seq` is
// not an event identity.** Every capture in the app produces exactly such a
// pair — the `capture.recorded` and the `clock.set` that keeps it from being
// silent — so this is not an edge case, it is the ordinary shape of the data.
//
// Keying identity by `device#seq` collapses the two halves into one. Whichever
// half is lost, the result is a node that violates law 1 or a clock with nothing
// under it, on the OTHER device, permanently, with nothing anywhere reporting a
// fault. Identity is the event id, which is what the store itself keys on.

/** A capture and the cure the gate wrote in the same transaction, stamped the
 *  way `cureFor` really stamps them. */
const causeAndCure = (device: string, seq: number): [AppEvent, AppEvent] => {
  const node = `${device}-n${seq}`;
  const cause = { id: `${device}-${seq}`, vault: 'personal', at: NOW, device, seq,
    kind: 'capture.recorded', node,
    payload: { text: 'milk', source: 'quick' } } as AppEvent;
  const cure = { id: `${device}-${seq}~cure~${node}`, vault: 'personal', at: NOW, device, seq,
    kind: 'clock.set', node,
    payload: { clockKind: 'review', at: NOW, source: 'gate:capture.recorded' } } as AppEvent;
  return [cause, cure];
};

test('a cure and its cause both reach the wire, though they share a device and a seq', async () => {
  const { wire, box } = fakeWire();
  const [cause, cure] = causeAndCure('a', 0);
  const a = device('a', [cause, cure]);

  const r = await exchangeOnce(a.deps(wire));

  assert.equal(r.sent, 2, 'both halves of the capture were sent, not one');
  const sealed = [...box.values()];
  assert.equal(sealed.length, 1);
  const body = await open(key, sealed[0]!) as ChunkBody;
  assert.equal(body.kind, 'events');
  const ids = (body as { events: AppEvent[] }).events.map(e => e.id).sort();
  assert.deepEqual(ids, [cause.id, cure.id],
    'the chunk carries the capture AND the clock that keeps it from being silent');
});

test('a cure still arrives when the device already holds its cause', async () => {
  // The half-finished transfer stage 1 exists for: B took in the capture and
  // died before the clock. The clock is in the mailbox and B must take it, or B
  // holds a node with no clock forever — a law 1 violation delivered by sync.
  const { wire, box } = fakeWire();
  const [cause, cure] = causeAndCure('a', 0);
  await drop(box, { kind: 'events', events: [cause, cure] });

  const b = device('b', [cause]);
  const r = await exchangeOnce(b.deps(wire));

  const landed = b.persisted.flat().map(e => e.id);
  assert.ok(landed.includes(cure.id),
    'the cure was taken in; holding the cause is not holding the pair');
  assert.ok(!landed.includes(cause.id), 'and the cause was not taken in twice');
  assert.equal(r.received, 1);
});
