// The comms sweep on the focus-exit ramp (v1 Must, build-plan item 22).
//
// Deferred out of Phase 3 with the reason written down at the time — "needs
// focus ramps, which are Phase 4". This is the thing that reason was waiting
// for, and the tests are about the two properties that make it worth having
// rather than being one more thing that interrupts you:
//
//   it appears ONLY on the way out of a session, and declining costs nothing.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fold, type State } from '../src/fold.ts';
import { admit } from '../src/gate.ts';
import {
  commsChip, commsNode, commsWords, sweptDaysAgo, isCommsSweep,
  COMMS_INTERVAL_DAYS, COMMS_COMFORT_DAYS, COMMS_FIELD,
} from '../src/comms.ts';
import { startCommsSweepEvents, stopCommsSweepEvents } from '../src/ui/focus-intents.ts';
import { doneEvents } from '../src/ui/work.ts';
import type { AppEvent } from '../src/events.ts';

const TZ = 'America/Denver';
const NOW = '2026-07-29T18:00:00.000Z';
const AGO = (d: number): string => new Date(Date.parse(NOW) - d * 86_400_000).toISOString();

let seq = 0;
const ev = (kind: string, node: string | null, payload: unknown, at = NOW): AppEvent =>
  ({ id: `e${seq}`, vault: 'personal', at, device: 'd0', seq: seq++, kind, node, payload } as AppEvent);
const ctxAt = (at: string) => ({
  id: () => 'sweep', vault: 'personal', at, device: 'd0', seq: () => seq++, zone: TZ,
});
const apply = (state: State, events: AppEvent[]): State =>
  events.length === 0 ? state : fold(admit(events, state), state);

/** A sweep turned on some days ago, so it has come round. */
const readySweep = (daysAgo = 4): State => {
  const s = apply(fold([]), startCommsSweepEvents(ctxAt(AGO(daysAgo)), 'sweep'));
  return s;
};

// --- off until asked for ----------------------------------------------------

test('there is no sweep until someone asks for one', () => {
  // A planner that arrives having decided you should check your messages twice
  // a day has made a decision about your working life it was not asked to make.
  const s = fold([]);
  assert.equal(commsNode(s), null);
  assert.equal(commsChip(s, NOW, TZ, true), null, 'and no chip, even on the ramp');
});

test('turning it on makes an ordinary upkeep with a marker field', () => {
  const s = readySweep();
  const n = commsNode(s)!;
  assert.equal(n.kind, 'upkeep', 'it decays and completes like any other repeating thing');
  assert.equal(isCommsSweep(n), true);
  assert.equal(Object.hasOwn(n.fields, COMMS_FIELD), true, 'a field, not a whole new kind');
  assert.equal(n.intervalDays, COMMS_INTERVAL_DAYS);
  assert.equal(n.comfortWindowDays, COMMS_COMFORT_DAYS);
});

test('it is not due the evening you turn it on', () => {
  // The gate would otherwise cure the creation with a same-day clock — legal,
  // and wrong: asking for a rhythm is not asking to start it this minute.
  const s = apply(fold([]), startCommsSweepEvents(ctxAt(NOW), 'sweep'));
  const clock = commsNode(s)!.clocks.review!;
  assert.equal(clock.at > NOW, true, 'it comes round when the interval says');
});

test('turning it off stops it being offered, and the log still says it happened', () => {
  let s = readySweep();
  assert.notEqual(commsChip(s, NOW, TZ, true), null);
  s = apply(s, stopCommsSweepEvents(ctxAt(NOW), 'sweep'));
  assert.equal(commsNode(s), null);
  assert.equal(commsChip(s, NOW, TZ, true), null);
  assert.equal(s.nodes.get('sweep')!.trashed, true, 'trashed, not deleted');
});

// --- the ramp, which is the whole point -------------------------------------

test('THE ONE THAT MATTERS: it appears ONLY on the way out of a session', () => {
  // A chip that can arrive at any moment is a notification wearing different
  // clothes, and it would be the exact interruption it exists to consolidate.
  const s = readySweep();
  assert.equal(commsChip(s, NOW, TZ, false), null, 'not while you are working');
  assert.notEqual(commsChip(s, NOW, TZ, true), null, 'only as you surface');
});

test('and only once it has actually come round', () => {
  // BOTH conditions, not either. Surfacing four times in an hour must not offer
  // four sweeps — the decay primitive is what stops this becoming the very habit
  // it replaces.
  const fresh = apply(fold([]), startCommsSweepEvents(ctxAt(NOW), 'sweep'));
  assert.equal(commsChip(fresh, NOW, TZ, true), null,
    'surfacing does not conjure a sweep that is not due');

  const swept = apply(readySweep(), doneEvents(ctxAt(NOW), 'sweep'));
  assert.equal(commsChip(swept, NOW, TZ, true), null,
    'and having just swept, coming out again offers nothing');
});

test('having a look records it, and it comes round on its own', () => {
  let s = readySweep();
  assert.notEqual(commsChip(s, NOW, TZ, true), null);
  s = apply(s, doneEvents(ctxAt(NOW), 'sweep'));
  assert.equal(commsNode(s)!.lastDone, NOW);
  assert.equal(commsChip(s, NOW, TZ, true), null, 'not offered again straight away');

  // And later, it is back — with no nagging in between.
  const later = new Date(Date.parse(NOW) + 5 * 86_400_000).toISOString();
  assert.notEqual(commsChip(s, later, TZ, true), null);
});

test('declining writes NOTHING', () => {
  // An event is a record, and a record of every time you did not do something is
  // the ledger this app exists to not keep (law 5). "Not now" is a UI state and
  // nothing else — the projection is the proof, because there is no event for it
  // to read.
  const s = readySweep();
  const before = s.eventCount;
  // Nothing in the vocabulary can express a decline, and no intent builds one.
  assert.equal(before, apply(s, []).eventCount, 'the log is untouched by saying no');
  assert.notEqual(commsChip(s, NOW, TZ, true), null,
    'and it is offered again next time you surface, exactly as if never asked');
});

// --- words ------------------------------------------------------------------

test('the words are an offer and a duration — never a count of unread anything', () => {
  assert.equal(commsWords(null), 'Take one pass through your messages?');
  assert.equal(commsWords(0), 'Another pass through your messages?');
  assert.equal(commsWords(1), 'Last pass through your messages was yesterday.');
  assert.equal(commsWords(6), 'Last pass through your messages was 6 days ago.');
  for (const d of [null, 0, 1, 6, 90] as (number | null)[]) {
    const w = commsWords(d);
    // An unread count is the most effective piece of shame-by-arithmetic in
    // software, and this app cannot see your messages anyway.
    for (const bad of ['unread', 'waiting for you', 'you have', 'still not', 'behind', 'overdue', 'inbox zero']) {
      assert.doesNotMatch(w, new RegExp(bad, 'i'), `"${w}" is an offer, not a rebuke`);
    }
    assert.doesNotMatch(w, /\b\d+\s+(messages?|emails?|unread)\b/i, `"${w}" counts nothing it cannot see`);
  }
});

test('the rhythm starts the moment you turn it on', () => {
  // `pressureOf` reads a never-completed upkeep as READY, so without this the
  // sweep was due the instant you said yes — while the clock written in the same
  // transaction said tomorrow. Two facts about one node disagreeing, and the
  // first thing the feature ever did was interrupt you for enabling it.
  const s = readySweep(4);
  assert.equal(sweptDaysAgo(commsNode(s)!, NOW, TZ), 4,
    'turning it on counts as a pass — you are at your desk, you have just looked');
  assert.equal(commsWords(null), 'Take one pass through your messages?',
    'and the never-swept wording is still there for a date that cannot be read');
});

test('a stored date that will not parse is silence, not a crash', () => {
  const s = fold([ev('done.marked', 'sweep', { at: 'not a date' })], readySweep());
  assert.equal(sweptDaysAgo(s.nodes.get('sweep')!, NOW, TZ), null);
});
