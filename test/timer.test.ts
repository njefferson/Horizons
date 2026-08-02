// The do-now timer: a length you choose, presence rather than progress, and
// no record of stopping (1.10.0, ADR-0059).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { admit } from '../src/gate.ts';
import { fold, emptyState, type State } from '../src/fold.ts';
import { serialiseState, deserialiseState } from '../src/snapshot.ts';
import {
  DEFAULT_TIMER_MINUTES, TIMER_CHOICES, timerMinutesOf, timerWords, timerWordsLower,
} from '../src/timer.ts';
import { setTimerLengthEvents } from '../src/ui/request-intents.ts';
import type { AppEvent } from '../src/events.ts';

let n = 0;
const ev = (kind: string, node: string | null, payload: unknown, over: Partial<AppEvent> = {}): AppEvent => ({
  id: over.id ?? `t${n++}`, vault: 'personal', at: '2026-08-02T12:00:00.000Z',
  device: (over.device as string) ?? 'd0', seq: (over.seq as number) ?? n, kind, node, payload,
} as AppEvent);
const write = (prior: State, offered: AppEvent[]): State => fold(admit(offered, prior), prior);
const ctx = () => ({
  id: () => `c${n++}`, vault: 'personal', at: '2026-08-02T12:00:00.000Z',
  device: 'd0', seq: () => n++, zone: 'America/Denver',
});

test('nobody has chosen: the cheap default runs, and it is the two minutes', () => {
  // The whole value of the original is that two minutes is a CHEAP decision
  // (thesis §4). Making the length choosable must not make the common path
  // cost a decision — the default stays the one nobody has to think about.
  assert.equal(timerMinutesOf(emptyState()), 2);
  assert.equal(DEFAULT_TIMER_MINUTES, 2);
  assert.equal(TIMER_CHOICES[0], 2, 'and it is offered first');
});

test('a chosen length folds, survives a snapshot, and is said in words', () => {
  let s = write(emptyState(), setTimerLengthEvents(ctx(), 20) as AppEvent[]);
  assert.equal(timerMinutesOf(s), 20);
  assert.equal(timerWords(20), 'Twenty minutes');
  assert.equal(timerWordsLower(20), 'twenty minutes', 'lower-case for mid-sentence use');
  // Third place of the three-place rule.
  const back = deserialiseState(JSON.parse(JSON.stringify(serialiseState(s))));
  assert.equal(timerMinutesOf(back), 20, 'the choice survives a snapshot round-trip');
  // And a pre-1.10.0 snapshot, which stored no length at all.
  const old = JSON.parse(JSON.stringify(serialiseState(s)));
  delete old.timerMinutes; delete old.timerMinutesStamp;
  assert.equal(timerMinutesOf(deserialiseState(old)), 2, 'an older snapshot reads as the default');
});

test('REFUSED, NEVER GUESSED: a length outside the offer writes nothing and reads as the default', () => {
  // The parseSlot rule. A length nobody was offered is a commitment nobody
  // made, and inventing one is worse than having none.
  for (const bad of [0, -5, 7, 1.5, NaN, Infinity]) {
    assert.deepEqual(setTimerLengthEvents(ctx(), bad), [], `${bad} builds no event`);
  }
  // And if one arrives anyway — a shard from a newer or broken build — the
  // reader declines it rather than running a timer for a length nobody chose.
  const s = write(emptyState(), [ev('timer.length.set', null, { minutes: 7 }, { seq: 0 })]);
  assert.equal(timerMinutesOf(s), 2, 'an unoffered length reads as the default');
});

test('the choice converges across devices on the later decision', () => {
  // State-level LWW, the requestSlot shape. Two devices, both orders, one answer.
  const a = ev('timer.length.set', null, { minutes: 5 }, { device: 'A', seq: 1, id: 'a1' });
  const b = ev('timer.length.set', null, { minutes: 30 }, { device: 'B', seq: 2, id: 'b1' });
  const forward = fold([a, b]);
  const backward = fold([b, a]);
  assert.equal(timerMinutesOf(forward), timerMinutesOf(backward), 'shard order cannot matter');
  assert.equal(timerMinutesOf(forward), 30, 'and the later decision is the one that stands');
});

test('NO VERDICT: the timer event carries a span and nothing about how it ended', () => {
  // src/requests.ts and ADR-0056 say the do-now offer's "Not now" is
  // "event-free, forever". Until 1.10.0 the timer beside it wrote
  // `outcome: 'abandoned'` on every stop — the same flow keeping a record the
  // same flow forbids. What remains is the focus.started/ended shape.
  const src = readFileSync('src/ui/clarify.ts', 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/abandoned/.test(code), 'nothing in the timer writes or names an abandonment');
  assert.ok(/kind: 'do-now\.timed'/.test(code), 'it still records that a timer ran');
  assert.ok(!/outcome/.test(code), 'and it records no outcome');

  // The chosen length is deliberately absent from the payload, so a shortfall
  // cannot be reconstructed by subtraction — the arithmetic that got the
  // report's "Started" section deleted in 1.9.0.
  const payload = /payload: \{ startedAt, endedAt: new Date\(\)\.toISOString\(\) \}/.test(code);
  assert.ok(payload, 'the payload is a span and only a span');
});

test('PRESENCE, NOT PROGRESS: nothing in the timer renders an amount', () => {
  // A countdown is a deadline; a filling shape is a fraction; a growing thing
  // is a streak you feel guilty about. None of them may reappear. This reads
  // the surface itself, because the defect is a rendering and a unit test of a
  // projection cannot see one.
  const src = readFileSync('src/ui/clarify.ts', 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/left`|remaining|setInterval/.test(code),
    'no countdown, and no per-second tick to render one with');
  assert.ok(!/padStart\(2, '0'\)/.test(code), 'no clock face');

  const css = readFileSync('public/app.css', 'utf8');
  const mark = css.slice(css.indexOf('.donow-running'), css.indexOf('.donow-running') + 400);
  assert.ok(!/width:\s*calc|transform:\s*scale|stroke-dash/.test(mark),
    'the presence mark has no dimension that could carry an amount');
  assert.ok(/prefers-reduced-motion/.test(css), 'and it has a still fallback');
});

test('the offer names the length it will actually start', () => {
  // A button that says "two minutes" and starts twenty is the class of lie
  // 1.7.2 was spent correcting. The words are built from the same reader the
  // timer uses, so they cannot drift apart.
  const src = readFileSync('src/ui/clarify.ts', 'utf8');
  assert.ok(/Start \$\{timerWordsLower\(timerMinutesOf\(session\.state\(\)\)\)\}/.test(src),
    'the start button is built from the chosen length, read from live state');
  // And it is re-worded if the length changes while the offer is on screen —
  // otherwise a button says "two minutes" and starts twenty.
  assert.ok(/function relabelTimer/.test(src), 'an on-screen offer can be re-worded');
  assert.ok(/data-start-timer|dataset\.startTimer/.test(src), 'and the button it re-words is findable');
});
