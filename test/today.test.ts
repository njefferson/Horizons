// The printable today-card (v1.5).
//
// Paper cannot update, cannot be ticked off into the log, and cannot know you
// finished something an hour after printing. So the two properties that matter
// are that it is BOUNDED — a page you print is one you read when already short
// of attention — and that it says, on the page, that it stopped being true the
// moment it left the printer.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fold, type State } from '../src/fold.ts';
import {
  todayCard, snapshotWords, moreWords, EMPTY_WORDS,
  TODAY_CAP, AHEAD_CAP, WITH_OTHERS_CAP,
} from '../src/today.ts';
import { nextUp } from '../src/nextup.ts';
import type { AppEvent } from '../src/events.ts';

const TZ = 'America/Denver';
const NOW = '2026-07-29T18:00:00.000Z';
const ON = (d: number): string => new Date(Date.parse(NOW) + d * 86_400_000).toISOString();
const AGO = (d: number): string => new Date(Date.parse(NOW) - d * 86_400_000).toISOString();

let seq = 0;
const ev = (kind: string, node: string | null, payload: unknown): AppEvent =>
  ({ id: `e${seq}`, vault: 'personal', at: NOW, device: 'd0', seq: seq++, kind, node, payload } as AppEvent);
const mk = (id: string, kind: string, title = id): AppEvent =>
  ev('node.created', id, { nodeKind: kind, title });
const ready = (id: string, title = id): AppEvent[] => [
  mk(id, 'action', title),
  ev('clock.set', id, { clockKind: 'review', at: NOW, source: 't' }),
  ev('clarify.routed', id, { route: 'next-action' }),
];

test('the card is built from the SAME projections the screen uses', () => {
  // A second definition of "what matters today" would eventually disagree with
  // the first, and then the paper and the app would tell you different things
  // while both looked authoritative.
  const s = fold([...ready('a', 'the first thing'), ...ready('b'), ...ready('c')]);
  const c = todayCard(s, NOW, TZ);
  const up = nextUp(s, NOW, TZ);
  assert.equal(c.head!.title, up.head!.node.title);
  assert.equal(c.head!.why, up.head!.words);
  assert.deepEqual(c.also, up.behind.map(i => i.node.title));
});

test('THE ONE THAT MATTERS: it is bounded, and states what it held back', () => {
  // A page you print is one you read when already short of attention. Printing
  // the whole list produces the pile in a form you cannot even collapse.
  const events: AppEvent[] = [];
  for (let i = 0; i < 40; i++) events.push(...ready(`n${i}`, `thing ${i}`));
  const c = todayCard(fold(events), NOW, TZ);
  assert.equal(c.also.length <= TODAY_CAP, true, `at most ${TODAY_CAP}`);
  assert.equal(TODAY_CAP, 7, 'and the cap is a real number, not whatever fitted');
  // The TRUE total, from `nextUp.total`. Counting `behind` instead reported
  // "nothing held back" while thirty-three things were, because `behind` is
  // itself capped at five — a page claiming a true total and stating a cap.
  assert.equal(c.alsoTotal, 39, 'forty ready, one of them printed as the head');
  assert.equal(moreWords(c.alsoTotal, c.also.length), 'and 34 more',
    'and the page says how many it did not print');
});

test('the caps are stated, never hidden, and silent when nothing is held back', () => {
  assert.equal(moreWords(9, 3), 'and 6 more');
  assert.equal(moreWords(3, 3), null, '"and 0 more" is a number pretending to be information');
  assert.equal(moreWords(0, 0), null);
});

test('what is with other people, and what is coming, are capped too', () => {
  const events: AppEvent[] = [];
  for (let i = 0; i < 12; i++) {
    events.push(mk(`w${i}`, 'waiting-for', `owed ${i}`),
      ev('clock.set', `w${i}`, { clockKind: 'review', at: NOW, source: 't' }),
      ev('waiting.opened', `w${i}`, { person: null, forWhat: 'x', since: AGO(i + 1) }));
    events.push(mk(`d${i}`, 'action', `dated ${i}`),
      ev('clock.set', `d${i}`, { clockKind: 'due', at: ON(i % 6), source: 't' }));
  }
  const c = todayCard(fold(events), NOW, TZ);
  assert.equal(c.withOthers.length, WITH_OTHERS_CAP);
  assert.equal(c.withOthersTotal, 12);
  assert.equal(c.ahead.length, AHEAD_CAP);
  assert.equal(c.aheadTotal > AHEAD_CAP, true);
});

test('nothing asking is said plainly, not left as a blank page', () => {
  const c = todayCard(fold([]), NOW, TZ);
  assert.equal(c.head, null);
  assert.equal(EMPTY_WORDS, 'Nothing is asking today.');
  assert.deepEqual(c.also, []);
});

test('the page says it stopped being true when it left the printer', () => {
  const w = snapshotWords('2026-07-29');
  assert.match(w, /snapshot/i);
  assert.match(w, /does not update/i);
  // The half people actually need: ticking the paper does not reach the app.
  assert.match(w, /does not reach Quietkeep/i);
});

test('coming up is soonest first, and only looks a week ahead', () => {
  const s = fold([
    mk('far', 'action', 'next month'), ev('clock.set', 'far', { clockKind: 'due', at: ON(30), source: 't' }),
    mk('soon', 'action', 'Thursday'), ev('clock.set', 'soon', { clockKind: 'due', at: ON(2), source: 't' }),
    mk('today', 'action', 'today'), ev('clock.set', 'today', { clockKind: 'due', at: ON(0), source: 't' }),
  ]);
  const c = todayCard(s, NOW, TZ);
  assert.deepEqual(c.ahead.map(a => a.title), ['today', 'Thursday'],
    'a month away is not a thing to carry on today’s page');
});

test('a suspense counts as a date coming up, like a due date', () => {
  const s = fold([
    mk('P', 'project', 'the review'),
    ev('suspense.set', 'P', { at: ON(3) }),
  ]);
  assert.deepEqual(todayCard(s, NOW, TZ).ahead.map(a => a.title), ['the review'],
    'a date you owe somebody an answer belongs on the page you carry');
});

test('finished work is not printed as something to do', () => {
  const s = fold([...ready('a', 'done thing'), ev('done.marked', 'a', { at: NOW })]);
  const c = todayCard(s, NOW, TZ);
  assert.equal(c.also.includes('done thing'), false);
  assert.equal(c.head?.title === 'done thing', false);
});

test('the order is total, so two prints of one state are the same page', () => {
  const events: AppEvent[] = [];
  for (const id of ['c', 'a', 'b']) {
    events.push(mk(id, 'action', id), ev('clock.set', id, { clockKind: 'due', at: ON(1), source: 't' }));
  }
  const s = fold(events);
  assert.deepEqual(todayCard(s, NOW, TZ).ahead, todayCard(s, NOW, TZ).ahead);
  assert.deepEqual(todayCard(s, NOW, TZ).ahead.map(a => a.title), ['a', 'b', 'c']);
});

test('a stored date that will not parse is skipped, not thrown on', () => {
  const s = fold([
    ...ready('ok', 'fine'),
    mk('bad', 'action', 'broken'), ev('clock.set', 'bad', { clockKind: 'due', at: 'not a date', source: 't' }),
  ]);
  assert.doesNotThrow(() => todayCard(s, NOW, TZ));
  assert.equal(todayCard(s, NOW, TZ).ahead.some(a => a.title === 'broken'), false);
});

test('the card carries the moment it was made', () => {
  const c = todayCard(fold([]), NOW, TZ);
  assert.equal(c.at, NOW, 'paper must be datable, because it cannot update');
  assert.equal(c.day, '2026-07-29', 'in the user’s zone, not UTC’s');
});
