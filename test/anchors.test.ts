// Named periods — the staff call (1.17.0, ADR-0068).
//
// ADR-0057 deferred anchors with three reasons written down. Two of them are
// what these tests are about, because both were real and both are now answered:
//
//  1. An anchor node was a SILENT node — `anchor` had no exemption and no cure
//     branch, so defining one made the coverage gauge stop reading zero. The
//     gauge is what proves law 1, and a proof that contradicts itself proves
//     nothing.
//  2. `anchor.fired` carried no per-device watermark, so a delta cut on it
//     would be the degraded at-only cut that `reportedBefore` exists to avoid —
//     a shard can deliver work stamped before your last meeting that you had
//     never seen. That was an audit finding on the export path.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { admit, coverageGauge, gateOptionsFor, heldNodes, heldWork, silentNodes } from '../src/gate.ts';
import { fold, emptyState, type State } from '../src/fold.ts';
import { heldGroups } from '../src/held.ts';
import { anchors, anchorPeriodWords, anchorWords, firingCount, lastFiring, recurrenceOf } from '../src/anchors.ts';
import { defineAnchorEvents, fireAnchorEvents } from '../src/ui/anchor-intents.ts';
import { reportedBefore } from '../src/delta.ts';
import { searchHeld } from '../src/search.ts';
import type { AppEvent } from '../src/events.ts';
import type { StampContext } from '../src/ui/session.ts';

const TZ = 'America/Denver';
const NOW = '2026-08-03T18:00:00.000Z';

let n = 0;
const ev = (kind: string, node: string | null, payload: unknown, over: Partial<AppEvent> = {}): AppEvent => ({
  id: (over.id as string) ?? `k${n++}`, vault: 'personal',
  at: (over.at as string) ?? '2026-08-03T12:00:00.000Z',
  device: (over.device as string) ?? 'd0', seq: (over.seq as number) ?? n,
  kind, node, payload,
} as AppEvent);
const write = (prior: State, offered: AppEvent[]): State => fold(admit(offered, prior, gateOptionsFor(TZ)), prior);
const ctx = (at = NOW, device = 'd0'): StampContext => {
  let s = 0;
  return { at, device, vault: 'personal', zone: TZ, seq: () => s++, id: () => `c${n++}` };
};

const withAnchor = (): { state: State; log: AppEvent[] } => {
  const offered = defineAnchorEvents(ctx(), 'A', 'the staff call', 'Thursdays');
  const admitted = admit(offered, emptyState(), gateOptionsFor(TZ));
  return { state: fold(admitted), log: [...admitted] };
};

// --- blocker 1: it is not a silent node any more -----------------------------

test('anchors: defining one leaves NOTHING silent, and takes no cure', () => {
  const offered = defineAnchorEvents(ctx(), 'A', 'the staff call', 'Thursdays');
  const admitted = admit(offered, emptyState(), gateOptionsFor(TZ));
  // Exactly what was offered — no cure clock was attached, because `anchor` is
  // demand-free now and law 1 is satisfied without one.
  assert.equal(admitted.length, offered.length, 'the gate had to cure it');
  const s = fold(admitted);
  assert.deepEqual(silentNodes(s).map(x => x.title), []);
  assert.equal(coverageGauge(s).silent, 0);
});

test('anchors: a date on one is refused outright (law 6)', () => {
  const { state } = withAnchor();
  assert.throws(
    () => admit([ev('clock.set', 'A', { clockKind: 'due', at: '2026-08-10T12:00:00.000Z', source: 'me' })], state, gateOptionsFor(TZ)),
    /cannot carry a clock/i,
    'an anchor took a date — it is a named period, not a thing to do',
  );
});

test('anchors: a named period is NOT work — no row, no count, still held', () => {
  const { state } = withAnchor();
  assert.ok(heldNodes(state).some(x => x.id === 'A'), 'nothing is hidden — it is still a node you hold');
  assert.ok(!heldWork(state).some(x => x.id === 'A'), 'but it is not work');
  assert.equal(coverageGauge(state).total, 0, 'and the gauge does not count it as something to do');
  assert.equal(heldGroups(state, NOW, TZ).flatMap(g => g.items).length, 0, 'no row in the todo list');
  // Search still finds it: it has a real title, and its row is a door to a
  // detail sheet, not an offer the gate must then refuse. (The pebble exclusion
  // in 1.15.1 was about a sheet full of verbs that cannot apply; naming a
  // period you can then open is not that shape.)
  assert.equal(searchHeld(state, 'staff').total, 1);
});

// --- blocker 2: the watermark, which is what made this shippable -------------

test('anchors: a firing carries the same watermark a report does', () => {
  const events = fireAnchorEvents(ctx(), 'A', { d0: 12, d1: 4 });
  assert.equal(events.length, 1);
  const p = events[0]!.payload as { anchor: string; at: string; upToSeqByDevice: Record<string, number> };
  assert.equal(p.anchor, 'A');
  assert.deepEqual(p.upToSeqByDevice, { d0: 12, d1: 4 });
  // A COPY, not the caller's object: a payload that aliases live state is a
  // payload that changes after it was written.
  const mark = { d0: 1 };
  const e = fireAnchorEvents(ctx(), 'A', mark)[0]!;
  mark.d0 = 99;
  assert.deepEqual((e.payload as { upToSeqByDevice: Record<string, number> }).upToSeqByDevice, { d0: 1 });
});

test('anchors: THE ONE THAT MATTERS — the cut is the watermark, not the clock', () => {
  // The audit's own case, on the anchor path. A second device delivers work
  // stamped BEFORE the meeting, which this device had never seen. A time-only
  // cut buries it for ever; the watermark reports it.
  const fired = fireAnchorEvents(ctx('2026-08-03T18:00:00.000Z'), 'A', { d0: 5 })[0]!;
  const log: AppEvent[] = [
    // Seen before the meeting, on this device.
    ev('node.created', 'X', { nodeKind: 'action', title: 'seen' }, { device: 'd0', seq: 3, at: '2026-08-01T12:00:00.000Z' }),
    fired,
    // Another device's event, stamped a day BEFORE the meeting but never seen
    // here until the shard arrived afterwards.
    ev('node.created', 'Y', { nodeKind: 'action', title: 'late shard' }, { device: 'd1', seq: 1, at: '2026-08-02T12:00:00.000Z' }),
  ];
  const firing = lastFiring(log, 'A');
  assert.ok(firing);
  const already = reportedBefore(log, { at: firing!.at, upToSeqByDevice: firing!.mark });
  assert.ok(already.some(e => e.node === 'X'), 'what this device had already seen is not news');
  assert.ok(!already.some(e => e.node === 'Y'), 'the late shard IS news — a time cut would have buried it');

  // And the degraded mode, stated rather than hidden: a firing with no
  // watermark falls back to the clock, which is exactly the failure above.
  const old = { ...fired, payload: { anchor: 'A', at: '2026-08-03T18:00:00.000Z' } } as AppEvent;
  const legacy = lastFiring([old], 'A');
  assert.equal(legacy!.mark, null, 'an old firing has no mark and says so');
  const degraded = reportedBefore(log, { at: legacy!.at, upToSeqByDevice: legacy!.mark });
  assert.ok(degraded.some(e => e.node === 'Y'), 'the at-only cut buries it — which is why the mark exists');
});

test('anchors: the newest firing wins, in any order', () => {
  const a = fireAnchorEvents(ctx('2026-08-01T18:00:00.000Z'), 'A', { d0: 1 })[0]!;
  const b = fireAnchorEvents(ctx('2026-08-03T18:00:00.000Z'), 'A', { d0: 9 })[0]!;
  for (const log of [[a, b], [b, a]]) {
    assert.deepEqual(lastFiring(log, 'A')!.mark, { d0: 9 }, 'shard order changed the answer');
  }
  assert.equal(lastFiring([a, b], 'OTHER'), null, 'another anchor is not this one');
});

// --- what it says, and what it must never say --------------------------------

test('anchors: it states a date, never a count (law 5)', () => {
  const { state, log } = withAnchor();
  const fired = fireAnchorEvents(ctx(), 'A', { d0: 1 })[0]!;
  const words = anchorWords(anchors(state)[0]!, lastFiring([...log, fired], 'A'), recurrenceOf(log, 'A'), TZ);
  assert.match(words, /Thursdays/);
  assert.match(words, /last one/);
  // Not "3 times", not "2 weeks ago", not "you have missed one". A count of
  // meetings held or not held is a streak wearing a work word.
  assert.doesNotMatch(words, /\b\d+\s*(times?|weeks?|days?|months?)\b/i);
  assert.doesNotMatch(words, /\b(missed|late|streak|overdue|behind)\b/i);
  // The count exists for one boolean question and is deliberately unrendered.
  assert.equal(firingCount([...log, fired], 'A'), 1);
});

test('anchors: never fired reads as "everything so far", like the first report', () => {
  const { state, log } = withAnchor();
  assert.equal(lastFiring(log, 'A'), null);
  assert.equal(anchorPeriodWords('the staff call', null), 'Everything so far');
  assert.equal(anchorPeriodWords('the staff call', { at: NOW, mark: null }), 'Since the last the staff call');
  assert.match(anchorWords(anchors(state)[0]!, null, '', TZ), /not marked yet/);
});

test('anchors: naming refuses an empty name rather than making a blank period', () => {
  assert.deepEqual(defineAnchorEvents(ctx(), 'A', '   ', 'Thursdays'), []);
  const kept = defineAnchorEvents(ctx(), 'A', 'the staff call', '');
  assert.equal((kept[0]!.payload as { recurrence: string }).recurrence, '',
    'an empty rhythm is ordinary — plenty of periods have a name and no pattern');
});

test('anchors: nothing derives from the recurrence', () => {
  // It is a string for a reader (the `affects` rule, ADR-0065). If this ever
  // needs parsing, that is a decision about scheduling and it arrives with an
  // ADR — not with a regex added quietly.
  const events = defineAnchorEvents(ctx(), 'A', 'the staff call', 'FREQ=WEEKLY;BYDAY=TH');
  const admitted = admit(events, emptyState(), gateOptionsFor(TZ));
  assert.equal(recurrenceOf(admitted, 'A'), 'FREQ=WEEKLY;BYDAY=TH');
  const s = fold(admitted);
  assert.deepEqual(Object.keys(s.nodes.get('A')!.clocks), [],
    'a recurrence produced a clock — that is a scheduler, and there is not one');
});

test('anchors: a firing is an event about a period, not a node in the store', () => {
  const { state } = withAnchor();
  const after = write(state, fireAnchorEvents(ctx(), 'A', { d0: 1 }));
  assert.equal(after.nodes.size, state.nodes.size, 'firing created a node');
  assert.equal(silentNodes(after).length, 0);
});
