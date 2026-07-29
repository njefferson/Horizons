// Phase 3: the decay primitive and Next-up.
//
// The load-bearing properties: pressure is continuous and has no stored
// threshold; the precedence is a fixed order that nothing computed can jump;
// "not this" changes no state at all; and nothing that belongs to another
// surface (the inbox, the Menu, a waiting-for) is ever offered as work.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fold, emptyState, type State, type NodeState } from '../src/fold.ts';
import { pressureOf, isReadyAgain, pressureWords } from '../src/pressure.ts';
import { nextUp, nextUpQueue, upkeepChips, BEHIND_CAP } from '../src/nextup.ts';
import { serialiseState } from '../src/snapshot.ts';
import type { AppEvent } from '../src/events.ts';

const TZ = 'America/Denver';                     // never UTC (V-13)
const NOW = '2026-07-29T18:00:00.000Z';          // 12:00 on the 29th, Denver

let seq = 0;
const ev = (kind: string, node: string, payload: unknown, at = '2026-07-01T12:00:00.000Z'): AppEvent =>
  ({ id: `e${seq}`, vault: 'personal', at, device: 'd0', seq: seq++, kind, node, payload } as AppEvent);

/** Build state directly from events — no gate, because these are projections. */
const st = (...events: AppEvent[]): State => fold(events);

const upkeep = (id: string, intervalDays: number, comfortWindowDays: number, lastDone: string | null): AppEvent[] => [
  ev('node.created', id, { nodeKind: 'upkeep', title: id }),
  ev('upkeep.interval.set', id, { intervalDays, comfortWindowDays }),
  ...(lastDone ? [ev('done.marked', id, { at: lastDone })] : []),
];

// --- the decay primitive ---------------------------------------------------

test('pressure is continuous, signed, and unbounded — no stored threshold', () => {
  // interval 7, comfort window 2. Pressure = (elapsed - 7) / 2.
  const at = (lastDone: string): number =>
    pressureOf(st(...upkeep('U', 7, 2, lastDone)).nodes.get('U')!, NOW, TZ)!;
  assert.equal(at('2026-07-27T18:00:00.000Z'), -2.5, 'two days in: comfortably settled');
  assert.equal(at('2026-07-22T18:00:00.000Z'), 0, 'exactly seven days: ready again, pressure 0');
  assert.equal(at('2026-07-20T18:00:00.000Z'), 1, 'one comfort window past ready');
  assert.equal(at('2026-06-20T18:00:00.000Z'), 16, 'and it keeps going — nothing clamps');
});

test('the comfort window is per item — the same lateness is not the same pressure', () => {
  // Both nine days since done; the plant minds, your mother does not.
  const plant = st(...upkeep('plant', 7, 1, '2026-07-20T18:00:00.000Z')).nodes.get('plant')!;
  const call = st(...upkeep('call', 7, 14, '2026-07-20T18:00:00.000Z')).nodes.get('call')!;
  assert.equal(pressureOf(plant, NOW, TZ), 2, 'a one-day tolerance: two windows past');
  assert.ok(pressureOf(call, NOW, TZ)! < 0.2, 'a fortnight of tolerance: barely anything');
});

test('never done is READY, not infinitely late — no shame surface for a new item', () => {
  const n = st(...upkeep('U', 7, 2, null)).nodes.get('U')!;
  assert.equal(pressureOf(n, NOW, TZ), 0, 'a brand-new upkeep is simply available');
  assert.equal(isReadyAgain(pressureOf(n, NOW, TZ)), true);
});

test('pressure is null — not zero — for an item with no cadence', () => {
  const n = st(ev('node.created', 'A', { nodeKind: 'action', title: 'a one-off' })).nodes.get('A')!;
  assert.equal(pressureOf(n, NOW, TZ), null, 'asking for a number would invent one');
  assert.equal(isReadyAgain(null), false, 'and null is never "ready again"');
});

test('the words never accuse, and there is no "overdue" among them', () => {
  const words = [-1, -0.2, 0, 0.5, 2, 10].map(p => pressureWords(p));
  assert.deepEqual(words, ['settled', 'coming round', 'ready again', 'ready again', 'been a while', 'been a good while']);
  for (const w of words) {
    assert.doesNotMatch(w, /overdue|late|missed|behind|fail/i, `"${w}" carries no rebuke`);
  }
});

// --- Next-up ---------------------------------------------------------------

test('a hard date that has arrived outranks any amount of pressure', () => {
  const s = st(
    ...upkeep('U', 7, 1, '2026-06-01T18:00:00.000Z'),                       // enormous pressure
    ev('node.created', 'D', { nodeKind: 'action', title: 'the appointment' }),
    ev('clock.set', 'D', { clockKind: 'due', at: NOW, source: 'test' }),
  );
  const up = nextUp(s, NOW, TZ);
  assert.equal(up.head!.node.id, 'D', 'the appointment leads');
  assert.equal(up.head!.reason, 'hard-date');
  assert.ok(pressureOf(s.nodes.get('U')!, NOW, TZ)! > 50, 'even against a very insistent upkeep');
});

test('a resume card outranks pressure but not a hard date', () => {
  const s = st(
    ...upkeep('U', 7, 1, '2026-06-01T18:00:00.000Z'),
    ev('resume.card.created', 'R', { cue: 'the paragraph about ferries' }),
    ev('clock.set', 'R', { clockKind: 'review', at: NOW, source: 'test' }),
  );
  assert.equal(nextUp(s, NOW, TZ).head!.node.id, 'R', 'pick up the thread first');
  const withDate = st(
    ev('resume.card.created', 'R', { cue: 'x' }),
    ev('clock.set', 'R', { clockKind: 'review', at: NOW, source: 'test' }),
    ev('node.created', 'D', { nodeKind: 'action', title: 'appointment' }),
    ev('clock.set', 'D', { clockKind: 'due', at: NOW, source: 'test' }),
  );
  assert.equal(nextUp(withDate, NOW, TZ).head!.node.id, 'D', 'but a real date still wins');
});

test('within pressure, the most insistent leads', () => {
  const s = st(
    ...upkeep('mild', 7, 10, '2026-07-20T18:00:00.000Z'),
    ...upkeep('loud', 7, 1, '2026-07-10T18:00:00.000Z'),
  );
  const q = nextUpQueue(s, NOW, TZ);
  assert.equal(q[0]!.node.id, 'loud');
  assert.ok(q[0]!.pressure! > q[1]!.pressure!);
});

test('nothing belonging to another surface is ever offered as work', () => {
  const s = st(
    ev('capture.recorded', 'INBOX', { text: 'unrouted', source: 'quick', sourceTags: [] }),
    ev('node.created', 'W', { nodeKind: 'waiting-for', title: 'they owe me' }),
    ev('clock.set', 'W', { clockKind: 'review', at: NOW, source: 'test' }),
    ev('node.created', 'M', { nodeKind: 'action', title: 'someday thing' }),
    ev('menu.item.added', 'M', { category: 'read' }),
    ev('node.created', 'P', { nodeKind: 'pebble', title: 'a pebble' }),
    ev('node.created', 'T', { nodeKind: 'action', title: 'trashed' }),
    ev('clock.set', 'T', { clockKind: 'due', at: NOW, source: 'test' }),
    ev('node.trashed', 'T', {}),
  );
  assert.deepEqual(nextUpQueue(s, NOW, TZ).map(i => i.node.id), [],
    'inbox, waiting-for, Menu, pebble and trashed are all somebody else’s business');
});

test('a completed one-off stops being offered; a completed upkeep comes back on its own schedule', () => {
  // The gate re-clocks done.marked to keep the node non-silent, so "has a clock
  // that has arrived" is NOT enough to stop offering it. Found by the smoke walk.
  const oneOff = st(
    ev('node.created', 'A', { nodeKind: 'action', title: 'a one-off' }),
    ev('clock.set', 'A', { clockKind: 'review', at: NOW, source: 'test' }),
    ev('done.marked', 'A', { at: NOW }),
    ev('clock.set', 'A', { clockKind: 'review', at: NOW, source: 'gate:done.marked' }),
  );
  assert.deepEqual(nextUpQueue(oneOff, NOW, TZ).map(i => i.node.id), [],
    'finished work is finished, even though the gate kept it clocked');

  // An upkeep done today is settled; the same upkeep done long ago is asking.
  const fresh = st(...upkeep('U', 7, 2, '2026-07-29T12:00:00.000Z'));
  assert.deepEqual(nextUpQueue(fresh, NOW, TZ).map(i => i.node.id), [], 'just done: quiet');
  const stale = st(...upkeep('U', 7, 2, '2026-07-01T12:00:00.000Z'));
  assert.deepEqual(nextUpQueue(stale, NOW, TZ).map(i => i.node.id), ['U'],
    'a recurring thing returns — that is what recurring means');
});

test('"not this" cycles freely and changes NO state', () => {
  const s = st(
    ...upkeep('a', 7, 1, '2026-07-10T18:00:00.000Z'),
    ...upkeep('b', 7, 2, '2026-07-12T18:00:00.000Z'),
    ...upkeep('c', 7, 3, '2026-07-14T18:00:00.000Z'),
  );
  // A deep snapshot of the whole state, so a mutation anywhere is caught — not
  // just a change in the set of node ids.
  const before = JSON.stringify(serialiseState(s));
  const countBefore = s.eventCount;
  const seen = [0, 1, 2, 3].map(c => nextUp(s, NOW, TZ, c).head!.node.id);
  assert.equal(seen[3], seen[0], 'it wraps around rather than running out');
  assert.equal(new Set(seen).size, 3, 'and cycles through every candidate');
  assert.equal(JSON.stringify(serialiseState(s)), before, 'state is byte-identical — nothing recorded');
  assert.equal(s.eventCount, countBefore, 'and no event was appended by cycling');
});

test('the list behind the head is capped at five', () => {
  const events: AppEvent[] = [];
  for (let i = 0; i < 12; i++) events.push(...upkeep(`u${i}`, 7, 1, '2026-07-10T18:00:00.000Z'));
  const up = nextUp(st(...events), NOW, TZ);
  assert.equal(up.behind.length, BEHIND_CAP, 'five behind, not twelve');
  assert.equal(up.total, 12, 'but the count tells the truth about how many are asking');
  assert.ok(!up.behind.some(i => i.node.id === up.head!.node.id), 'the head is not repeated behind itself');
});

test('an empty morning says so, rather than inventing work', () => {
  const up = nextUp(st(...upkeep('U', 7, 2, '2026-07-29T12:00:00.000Z')), NOW, TZ);
  assert.equal(up.head, null, 'nothing is asking');
  assert.equal(up.total, 0);
});

test('the queue order is total — the same state always produces the same list', () => {
  const events: AppEvent[] = [];
  for (let i = 0; i < 6; i++) events.push(...upkeep(`u${i}`, 7, 2, '2026-07-15T18:00:00.000Z'));
  const s = st(...events);
  const once = nextUpQueue(s, NOW, TZ).map(i => i.node.id);
  const twice = nextUpQueue(s, NOW, TZ).map(i => i.node.id);
  assert.deepEqual(once, twice, 'identical pressures do not reshuffle between renders');
});

test('upkeep chips surface only what has come round, most insistent first', () => {
  const s = st(
    ...upkeep('ready', 7, 2, '2026-07-20T18:00:00.000Z'),
    ...upkeep('loud', 7, 1, '2026-07-05T18:00:00.000Z'),
    ...upkeep('settled', 30, 5, '2026-07-28T18:00:00.000Z'),
  );
  const chips = upkeepChips(s, NOW, TZ);
  assert.deepEqual(chips.map(c => c.node.id), ['loud', 'ready'], 'settled stays quiet');
  assert.ok(chips.every(c => c.pressure! >= 0));
});

test('the display threshold is a presentation choice, not storage (ADR-0010)', () => {
  const s = st(...upkeep('mild', 7, 4, '2026-07-21T18:00:00.000Z'));   // pressure 0.25
  assert.equal(upkeepChips(s, NOW, TZ, 0).length, 1, 'shown at threshold 0');
  assert.equal(upkeepChips(s, NOW, TZ, 1).length, 0, 'hidden at threshold 1 — same stored data');
  const n: NodeState = s.nodes.get('mild')!;
  assert.equal(Object.hasOwn(n, 'pressure'), false, 'and pressure is nowhere on the node');
});
