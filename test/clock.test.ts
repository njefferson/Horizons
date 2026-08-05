// The header clock (1.22.0).
//
// The dial is the easy half. These tests are about the half that can lie: a
// remainder computed across a midnight boundary, a day that has ended, and
// words that could turn a quiet day into a verdict on the person having it.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fold, type State } from '../src/fold.ts';
import { admit } from '../src/gate.ts';
import {
  clockFace, clockIsOn, datedTodayCount, datedWords, handAngles,
  minutesLeftOfDay, remainderWords, timeWords, CLOCK_MODULE,
} from '../src/clock.ts';
import { enableModuleEvents, disableModuleEvents } from '../src/ui/detail-intents.ts';
import type { AppEvent } from '../src/events.ts';

const TZ = 'America/Denver';
// 14:20 local on 2026-08-05 (Denver is UTC-6 in August).
const NOW = '2026-08-05T20:20:00.000Z';

let seq = 0;
const ev = (kind: string, node: string | null, payload: unknown, at = NOW): AppEvent =>
  ({ id: `e${seq}`, vault: 'personal', at, device: 'd0', seq: seq++, kind, node, payload } as AppEvent);
const ctx = { id: () => `c${seq}`, vault: 'personal', at: NOW, device: 'd0', seq: () => seq++, zone: TZ };
const apply = (state: State, events: AppEvent[]): State =>
  events.length === 0 ? state : fold(admit(events, state), state);

// --- off until asked for -----------------------------------------------------

test('the clock is off until somebody turns it on', () => {
  // Chrome that arrives switched on has made a decision about somebody's screen
  // that it was not asked to make.
  const s = fold([]);
  assert.equal(clockIsOn(s), false);
  const on = apply(s, enableModuleEvents(ctx, CLOCK_MODULE));
  assert.equal(clockIsOn(on), true);
  assert.equal(clockIsOn(apply(on, disableModuleEvents(ctx, CLOCK_MODULE))), false);
});

// --- the dial ----------------------------------------------------------------

test('the hands sit where the time says, and the hour hand moves within the hour', () => {
  const f = { hour: 14, minute: 20, minutesLeft: 0, datedToday: 0 };
  const a = handAngles(f);
  assert.equal(a.minute, 120, '20 minutes is a third of the way round');
  // 2:20, not 2:00 — an hour hand pinned to the hour is a clock that lies for
  // 59 minutes out of every 60.
  assert.ok(a.hour > 60 && a.hour < 90, `hour hand at ${a.hour}° should be past 2 and before 3`);
});

test('the dial reads the same at 2am and 2pm, and the words do not', () => {
  assert.deepEqual(handAngles({ hour: 2, minute: 0, minutesLeft: 0, datedToday: 0 }),
                   handAngles({ hour: 14, minute: 0, minutesLeft: 0, datedToday: 0 }));
  assert.equal(timeWords({ hour: 2, minute: 5, minutesLeft: 0, datedToday: 0 }), '02:05');
  assert.equal(timeWords({ hour: 14, minute: 5, minutesLeft: 0, datedToday: 0 }), '14:05');
});

// --- the remainder, which is the part that fights the thing -------------------

test('the remainder is real minutes to the end of the LOCAL day', () => {
  // 14:20 local leaves 9h 40m. Computed against the zone, not UTC — the whole
  // feature is wrong by six hours otherwise.
  // endOfLocalDay is 23:59:59, so the remainder FLOORS to 9h 39m. Flooring is
  // the honest direction: you do not have forty minutes, you have 39m59s.
  assert.equal(minutesLeftOfDay(NOW, TZ), 9 * 60 + 39);
});

test('the last minute of the local day reads zero, and a finished day states no quantity', () => {
  // 23:59:30 local. `endOfLocalDay` is 23:59:59, so the remainder floors to 0 —
  // the reachable end of the day, not a contrived one.
  assert.equal(minutesLeftOfDay('2026-08-06T05:59:30.000Z', TZ), 0);
  // THE RULE, NOT THE SENTENCE (hub LESSONS §59). "The day is done." is one
  // correct wording of many; what must hold is that a day with nothing left
  // reports NO NUMBER. "0m left today" is arithmetically true and reads as a
  // score on somebody's evening. An assertion pinned to the sentence would go
  // red on a reword that was never wrong, and would stay green on "0m left".
  for (const m of [0, -1, -30]) {
    const w = remainderWords(m);
    assert.ok(w.length > 0, 'a finished day still says something');
    assert.doesNotMatch(w, /\d/, `"${w}" puts a number on a day that is over`);
  }
});

test('THE EDGE THAT BREAKS CLOCKS: the day is the ZONE’s, not 24 hours minus the time', () => {
  // Both at 00:30 local, in the same zone, on the two days of the year that are
  // not 24 hours long. `now + 86_400_000` passes every other day of the year and
  // is wrong by an hour on these two — in the one piece of chrome whose entire
  // job is to be believable about time.
  const springForward = minutesLeftOfDay('2026-03-08T07:30:00.000Z', TZ);  // 23-hour day
  const fallBack = minutesLeftOfDay('2026-11-01T06:30:00.000Z', TZ);       // 25-hour day
  const ordinary = minutesLeftOfDay('2026-08-05T06:30:00.000Z', TZ);       // 24-hour day
  assert.equal(ordinary, 23 * 60 + 29);
  assert.equal(springForward, ordinary - 60, 'the short day is an hour shorter');
  assert.equal(fallBack, ordinary + 60, 'the long day is an hour longer');
});

test('an instant nothing can parse costs the clock, never the app', () => {
  // `endOfLocalDay` throws a RangeError on an unparseable instant, and this runs
  // inside the refresh chain that repaints every other surface — so a throw here
  // would take somebody's card list down with it. Both readers are total.
  assert.equal(minutesLeftOfDay('not-a-date', TZ), 0);
  assert.equal(datedTodayCount(fold([]), 'not-a-date', TZ), 0);

  // And one bad clock in the store does not stop the count. A shard folded in
  // from another device is the realistic source of one.
  const s = fold(admit([
    ev('node.created', 'a', { nodeKind: 'action', title: 'today' }),
    ev('clock.set', 'a', { clockKind: 'due', at: NOW, source: 't' }),
  ], fold([])));
  const broken = s.nodes.get('a')!;
  // Reach past the gate deliberately: the gate would refuse this, which is why
  // the only way it arrives is from somewhere the gate did not run.
  (broken.clocks as Record<string, { at: string }>)['start'] = { at: 'rubbish' };
  assert.equal(datedTodayCount(s, NOW, TZ), 1);
});

test('the remainder is a fact about the day, never a nudge about the person', () => {
  for (const m of [1, 45, 60, 61, 580, 1439]) {
    const w = remainderWords(m);
    // Word boundaries matter here: a bare 'left to' matches inside "left
    // today", which is the phrase itself. A banned-words test that fails on the
    // correct output is a test that gets deleted rather than obeyed.
    for (const bad of ['only', 'hurry', 'left to do', 'still', 'you have not', 'running out']) {
      assert.doesNotMatch(w, new RegExp(`\\b${bad}\\b`, 'i'), `"${w}" says "${bad}"`);
    }
  }
  // The RULE is the decomposition, not the sentence around it (LESSONS §59):
  // minutes become hours and minutes, a whole hour drops the minutes, and under
  // an hour drops the hours. A raw "579m left" is the failure this holds off.
  assert.match(remainderWords(579), /\b9h\b/);
  assert.match(remainderWords(579), /\b39m\b/);
  assert.doesNotMatch(remainderWords(579), /579/);
  assert.match(remainderWords(60), /\b1h\b/);
  assert.doesNotMatch(remainderWords(60), /\b0m\b/, 'a whole hour does not trail a zero');
  assert.match(remainderWords(45), /\b45m\b/);
  assert.doesNotMatch(remainderWords(45), /\b0h\b/, 'under an hour does not lead with a zero');
});

// --- what is dated today ------------------------------------------------------

test('it counts open things clocked today, and nothing else', () => {
  const s = fold(admit([
    ev('node.created', 'a', { nodeKind: 'action', title: 'today' }),
    ev('clock.set', 'a', { clockKind: 'due', at: NOW, source: 't' }),
    ev('node.created', 'b', { nodeKind: 'action', title: 'tomorrow' }),
    ev('clock.set', 'b', { clockKind: 'due', at: '2026-08-07T20:00:00.000Z', source: 't' }),
    ev('node.created', 'c', { nodeKind: 'action', title: 'today but done' }),
    ev('clock.set', 'c', { clockKind: 'due', at: NOW, source: 't' }),
    ev('done.marked', 'c', { at: NOW }),
  ], fold([])));
  assert.equal(datedTodayCount(s, NOW, TZ), 1, 'the open one only');
});

test('THE COUNT IS A BADGE, so it obeys what a badge may never be about', () => {
  // ADR-0056's relief is that a park never demands: "no notification, no
  // banner, no badge". A header number that ticks up on the day a declined
  // request's park lands IS a badge, about the very thing you said no to —
  // rebuilt in the one place on the screen nobody can look away from.
  //
  // And a worry is not a thing dated today. Its clocks belong to the bother
  // flow, not to a day.
  //
  // Both come from `exportsToCalendar`, which the export already calls the ONE
  // predicate for this question. A private copy here would agree today.
  const s = fold(admit([
    ev('node.created', 'a', { nodeKind: 'action', title: 'a real one' }),
    ev('clock.set', 'a', { clockKind: 'due', at: NOW, source: 't' }),
    ev('node.created', 'w', { nodeKind: 'bother', title: 'a worry' }),
    ev('clock.set', 'w', { clockKind: 'park', at: NOW, source: 't' }),
    ev('node.created', 'd', { nodeKind: 'action', title: 'something asked of you' }),
    ev('request.declined', 'd', { person: 'someone', what: 'a favour', reason: '' }),
    ev('clock.set', 'd', { clockKind: 'park', at: NOW, source: 't' }),
  ], fold([])));
  assert.equal(datedTodayCount(s, NOW, TZ), 1, 'the worry and the decline are not today');
});

test('a thing with two clocks today is counted once', () => {
  const s = fold(admit([
    ev('node.created', 'a', { nodeKind: 'action', title: 'both' }),
    ev('clock.set', 'a', { clockKind: 'due', at: NOW, source: 't' }),
    ev('clock.set', 'a', { clockKind: 'start', at: NOW, source: 't' }),
  ], fold([])));
  assert.equal(datedTodayCount(s, NOW, TZ), 1);
});

test('an empty day is an ordinary fact, not an achievement and not a reproach', () => {
  // A header that says "nothing planned!" is cheerful at somebody having a hard
  // week; one that says "0 today" reads as a score. Law 7, and law 8.
  // Again the rule rather than the draft (LESSONS §59). An empty day must be
  // said in words with no digit in them — "0 today" is a score — and with none
  // of the vocabulary that turns a fact into a verdict either way.
  const w = datedWords(0);
  assert.ok(w.length > 0, 'an empty day is still stated');
  assert.doesNotMatch(w, /\d/, `"${w}" scores an empty day`);
  for (const bad of ['!', 'free', 'clear', 'well done', 'nice', 'empty']) {
    assert.doesNotMatch(w, new RegExp(bad.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), `it says "${bad}"`);
  }
  // And the one thing a count must get right: the noun agrees with the number.
  assert.match(datedWords(1), /\b1 thing\b/);
  assert.doesNotMatch(datedWords(1), /\bthings\b/);
  assert.match(datedWords(4), /\b4 things\b/);
});

// --- the whole face ------------------------------------------------------------

test('the face is assembled from the fold and the clock, with nothing invented', () => {
  const s = fold(admit([
    ev('node.created', 'a', { nodeKind: 'action', title: 'today' }),
    ev('clock.set', 'a', { clockKind: 'due', at: NOW, source: 't' }),
  ], fold([])));
  const f = clockFace(s, NOW, TZ);
  assert.equal(f.hour, 14);
  assert.equal(f.minute, 20);
  assert.equal(f.minutesLeft, 579);
  assert.equal(f.datedToday, 1);
});
