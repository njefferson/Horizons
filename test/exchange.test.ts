// The exchange protocol (sync stage 1, ADR-0037).
//
// No server, no network, no transport. All the correctness lives here, which is
// the point: it is testable before any of that exists and stays testable when it
// changes.
//
// The load-bearing test is the GAP one. Everything else is arithmetic; that one
// is the reason this module exists instead of reusing the high-water mark that
// was already in `State`.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  heldRanges, summarise, missing, eventsIn, converged, countIn, malformed,
  exchangeWords, type Held,
} from '../src/exchange.ts';
import { fold } from '../src/fold.ts';
import { highWaterMark } from '../src/snapshot.ts';
import type { AppEvent } from '../src/events.ts';

const NOW = '2026-07-29T18:00:00.000Z';
/** An event stamped explicitly — device and seq are the whole subject here. */
const ev = (device: string, seq: number, title = `${device}#${seq}`): AppEvent =>
  ({ id: `${device}-${seq}`, vault: 'personal', at: NOW, device, seq,
     kind: 'node.created', node: `${device}-${seq}`,
     payload: { nodeKind: 'action', title } } as AppEvent);

// --- what a device holds ----------------------------------------------------

test('a contiguous run is one range', () => {
  assert.deepEqual(heldRanges([ev('d1', 1), ev('d1', 2), ev('d1', 3)]), { d1: [[1, 3]] });
});

test('a gap is TWO ranges, and that is the entire point', () => {
  assert.deepEqual(heldRanges([ev('d1', 1), ev('d1', 2), ev('d1', 5)]),
    { d1: [[1, 2], [5, 5]] });
});

test('order of arrival does not change the summary', () => {
  const a = heldRanges([ev('d1', 3), ev('d1', 1), ev('d1', 2)]);
  const b = heldRanges([ev('d1', 1), ev('d1', 2), ev('d1', 3)]);
  assert.deepEqual(a, b);
});

test('duplicates collapse', () => {
  assert.deepEqual(heldRanges([ev('d1', 1), ev('d1', 1), ev('d1', 2)]), { d1: [[1, 2]] });
});

test('several devices, each summarised separately and in a stable order', () => {
  const h = heldRanges([ev('d2', 1), ev('d1', 1), ev('d1', 2)]);
  assert.deepEqual(Object.keys(h), ['d1', 'd2'], 'sorted, so two summaries compare directly');
});

test('a seq that could never be produced is not described', () => {
  // A summary is a promise about what can be handed over on request. Describing
  // something the store cannot yield is the same lie in a different place.
  const bad = [
    { ...ev('d1', 1), seq: -1 } as AppEvent,
    { ...ev('d1', 1), seq: 1.5 } as AppEvent,
    ev('d1', 4),
  ];
  assert.deepEqual(heldRanges(bad), { d1: [[4, 4]] });
});

// --- THE ONE THAT MATTERS ---------------------------------------------------

test('THE ONE THAT MATTERS: a gap cannot hide behind a maximum', () => {
  // This device lost d1's 3 and 4 in a transfer that failed halfway. The
  // high-water mark says 5 — so it would announce "I have d1 up to 5", the other
  // side would believe it and send nothing, and 3 and 4 would be lost by
  // everybody. Silently: both belonged to nodes that already exist, so the
  // coverage gauge still reads zero.
  const broken = [ev('d1', 1), ev('d1', 2), ev('d1', 5)];
  const whole = [ev('d1', 1), ev('d1', 2), ev('d1', 3), ev('d1', 4), ev('d1', 5)];

  // The old summary, and the lie it tells.
  assert.equal(highWaterMark(fold(broken))['d1'], 5,
    'the maximum genuinely is 5, which is why it is not a completeness claim');

  // The new summary, and the truth.
  const want = missing(summarise(broken), summarise(whole));
  assert.deepEqual(want, { d1: [[3, 4]] }, 'it asks for exactly what it is missing');
  assert.equal(countIn(want), 2);

  const sent = eventsIn(whole, want);
  assert.deepEqual(sent.map(e => e.seq), [3, 4], 'and exactly that is handed over');
  assert.equal(converged(summarise([...broken, ...sent]), summarise(whole)), true,
    'after which the two sides genuinely match');
});

// --- requesting and sending -------------------------------------------------

test('first contact asks for everything the other side has', () => {
  const theirs = summarise([ev('d2', 1), ev('d2', 2)]);
  assert.deepEqual(missing({}, theirs), { d2: [[1, 2]] });
});

test('nothing to ask for when you already have it all', () => {
  const log = [ev('d1', 1), ev('d2', 1)];
  assert.deepEqual(missing(summarise(log), summarise(log)), {});
  assert.equal(converged(summarise(log), summarise(log)), true);
});

test('only what was asked for is sent, and the count is exact', () => {
  // A transport that sends more than requested works fine and hides a bug in the
  // summary — so this is exact, and asserted.
  const theirs = [ev('d1', 1), ev('d1', 2), ev('d1', 3), ev('d2', 9)];
  const want: Held = { d1: [[2, 3]] };
  const sent = eventsIn(theirs, want);
  assert.equal(sent.length, 2);
  assert.deepEqual(sent.map(e => `${e.device}#${e.seq}`), ['d1#2', 'd1#3']);
  assert.equal(countIn(want), sent.length, 'the promised count is the delivered count');
});

test('a request is answered identically every time', () => {
  const theirs = [ev('d2', 2), ev('d1', 1), ev('d2', 1)];
  const want: Held = { d1: [[1, 1]], d2: [[1, 2]] };
  const once = eventsIn(theirs, want).map(e => e.id);
  assert.deepEqual(once, eventsIn(theirs, want).map(e => e.id));
  assert.deepEqual(once, ['d1-1', 'd2-1', 'd2-2'], 'a total order, so the bytes are comparable');
});

test('a device asked about that the other side does not have yields nothing', () => {
  assert.deepEqual(eventsIn([ev('d1', 1)], { d9: [[1, 5]] }), []);
});

// --- convergence ------------------------------------------------------------

test('two rounds, one each way, and both sides match', () => {
  const a = [ev('a', 1), ev('a', 2), ev('shared', 1)];
  const b = [ev('b', 1), ev('shared', 1)];

  const aWants = missing(summarise(a), summarise(b));
  const bWants = missing(summarise(b), summarise(a));
  const aAfter = [...a, ...eventsIn(b, aWants)];
  const bAfter = [...b, ...eventsIn(a, bWants)];

  assert.equal(converged(summarise(aAfter), summarise(bAfter)), true);
  assert.equal(aAfter.length, 4);
  assert.equal(bAfter.length, 4, 'the union, both sides, nothing duplicated');
});

test('exchanging again moves nothing', () => {
  const log = [ev('a', 1), ev('b', 1)];
  assert.equal(countIn(missing(summarise(log), summarise(log))), 0);
});

test('convergence is symmetric — neither side is the authority', () => {
  const a = summarise([ev('a', 1)]);
  const b = summarise([ev('b', 1)]);
  assert.equal(converged(a, b), false);
  assert.equal(converged(b, a), false, 'and it says so from either side');
});

test('a half-finished transfer converges on the next attempt', () => {
  // The failure that makes ranges necessary, played out. The transport dies
  // after one of two events; nothing is lost and the next exchange finishes it.
  const a = [ev('a', 1)];
  const b = [ev('b', 1), ev('b', 2)];
  const want = missing(summarise(a), summarise(b));
  const halfDelivered = eventsIn(b, want).slice(0, 1);
  const aMid = [...a, ...halfDelivered];
  assert.equal(converged(summarise(aMid), summarise(b)), false, 'it knows it is not done');
  const rest = missing(summarise(aMid), summarise(b));
  assert.deepEqual(rest, { b: [[2, 2]] }, 'and asks only for the part that did not arrive');

  // BOTH DIRECTIONS. The first version of this asserted convergence after
  // finishing A's side only — and failed, correctly, because B had never
  // received A's own event. Convergence is a claim about two logs, and half an
  // exchange cannot make it true. The code was right and the assertion was not.
  const aDone = [...aMid, ...eventsIn(b, rest)];
  const bDone = [...b, ...eventsIn(aDone, missing(summarise(b), summarise(aDone)))];
  assert.equal(converged(summarise(aDone), summarise(bDone)), true);
  assert.equal(aDone.length, 3);
  assert.equal(bDone.length, 3, 'and nothing was duplicated getting there');
});

// --- a summary is input, and gets checked like any other --------------------

test('a malformed summary is refused, not reasoned about', () => {
  // It arrives from another device over a transport. Every function here would
  // otherwise produce a plausible answer from a nonsense claim — the worst
  // outcome for a protocol whose job is deciding what NOT to send.
  assert.equal(malformed({ d1: [[1, 3]] }), null, 'a good one passes');
  assert.notEqual(malformed(null), null);
  assert.notEqual(malformed([]), null);
  assert.notEqual(malformed({ d1: 'nope' }), null);
  assert.notEqual(malformed({ d1: [[1]] }), null, 'a range is two numbers');
  assert.notEqual(malformed({ d1: [[3, 1]] }), null, 'a range runs forwards');
  assert.notEqual(malformed({ d1: [[-1, 2]] }), null, 'seq is never negative');
  assert.notEqual(malformed({ d1: [[1.5, 2]] }), null, 'whole numbers');
  assert.notEqual(malformed({ '': [[1, 2]] }), null, 'an unnamed device');
  assert.notEqual(malformed({ d1: [[5, 6], [1, 2]] }), null, 'must be sorted');
  assert.notEqual(malformed({ d1: [[1, 4], [5, 6]] }), null,
    'adjacent ranges describe one range, and would make two equal sets compare unequal');
  assert.notEqual(malformed({ d1: [[1, 4], [3, 6]] }), null, 'overlapping');
});

test('every summary this module produces passes its own check', () => {
  for (const log of [
    [], [ev('d1', 0)], [ev('d1', 1), ev('d1', 2), ev('d1', 5)],
    [ev('d2', 7), ev('d1', 1)], [ev('d1', 1), ev('d1', 1)],
  ]) {
    assert.equal(malformed(summarise(log)), null, JSON.stringify(log.map(e => e.seq)));
  }
});

// --- words ------------------------------------------------------------------

test('what it says is a number of things, never a percentage or a duration', () => {
  assert.equal(exchangeWords(0, 0), 'Already the same on both.');
  assert.equal(exchangeWords(0, 1), 'Took in one thing.');
  assert.equal(exchangeWords(3, 0), 'Sent 3.');
  assert.equal(exchangeWords(2, 5), 'Took in 5 things, sent 2.');
  for (const [s, r] of [[0, 0], [0, 1], [3, 0], [2, 5], [40, 90]] as [number, number][]) {
    const w = exchangeWords(s, r);
    for (const bad of ['%', 'percent', 'syncing', 'failed', 'error', 'behind', 'out of date']) {
      assert.doesNotMatch(w, new RegExp(bad, 'i'), `"${w}" contains "${bad}"`);
    }
  }
});
