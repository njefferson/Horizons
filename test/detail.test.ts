// Phase 3.5: editing an item — dates, repeats, undo.
//
// The load-bearing properties: every edit terminates legally through the REAL
// gate (law 1); a date from a date input means the end of THAT day in the user's
// zone, in every zone including the far-east ones where a naive UTC probe lands
// on the wrong date; and "make it repeat" actually reaches the decay primitive,
// which until now had no path into it at all.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { admit, silentNodes, gateOptionsFor } from '../src/gate.ts';
import { fold, emptyState, type State } from '../src/fold.ts';
import { pressureOf } from '../src/pressure.ts';
import { upkeepChips, nextUpQueue } from '../src/nextup.ts';
import { localDayKey, calendarDaysBetween } from '../src/time.ts';
import {
  endOfDayKey, setDueEvents, clearDueEvents, makeRepeatEvents, stopRepeatEvents,
  undoneEvents, untrashEvents, promoteFromMenuEvents, toMenuEvents,
} from '../src/ui/detail-intents.ts';
import type { AppEvent } from '../src/events.ts';
import type { StampContext } from '../src/ui/session.ts';

const TZ = 'America/Denver';                    // never UTC (V-13)
const AT = '2026-07-29T18:00:00.000Z';          // 12:00 on the 29th, Denver

let seq = 0;
const ctx = (zone = TZ): StampContext => ({
  at: AT, device: 'd0', vault: 'personal', zone,
  seq: () => seq++, id: () => `d${seq}`,
});

const opts = gateOptionsFor(TZ);
const write = (prior: State, offered: AppEvent[]): State => fold(admit(offered, prior, opts), prior);

/** A real, triaged item — the thing a detail sheet is actually opened on. A raw
 *  unrouted capture is deliberately NOT this: it still belongs to triage, and
 *  Next-up refuses to offer it, which is correct and not what these tests are
 *  about. */
const captured = (id: string, text = 'a thing'): State => {
  let s = write(emptyState(), [{
    id: `c${seq++}`, vault: 'personal', at: AT, device: 'd0', seq: seq++,
    kind: 'capture.recorded', node: id, payload: { text, source: 'quick', sourceTags: [] },
  } as AppEvent]);
  return write(s, [{
    id: `r${seq++}`, vault: 'personal', at: AT, device: 'd0', seq: seq++,
    kind: 'clarify.routed', node: id, payload: { route: 'next-action' },
  } as AppEvent]);
};

// --- dates -----------------------------------------------------------------

test('a date from a date input means the END of that day, in the user’s zone', () => {
  const iso = endOfDayKey('2026-08-13', TZ);
  assert.equal(localDayKey(iso, TZ), '2026-08-13', 'it is that day where the user is');
  assert.equal(iso, '2026-08-14T05:59:59.000Z', '23:59:59 Denver = 05:59:59Z the next morning');
});

test('the date key resolves correctly in zones a naive UTC probe would get wrong', () => {
  // Kiritimati is UTC+14: noon UTC on the key date is already the NEXT day there,
  // so a probe taken at face value would land a day late. Chatham is +12:45.
  for (const [tz, key] of [
    ['Pacific/Kiritimati', '2026-08-13'],
    ['Pacific/Chatham', '2026-08-13'],
    ['Asia/Kolkata', '2026-08-13'],
    ['America/Denver', '2026-08-13'],
    ['UTC', '2026-08-13'],
    ['Pacific/Midway', '2026-08-13'],          // UTC-11, the other extreme
  ] as [string, string][]) {
    assert.equal(localDayKey(endOfDayKey(key, tz), tz), key, `${tz} lands on ${key}`);
  }
});

test('setting a date leaves a hard clock and nothing silent, and Next-up ranks it first', () => {
  let s = captured('N');
  s = write(s, setDueEvents(ctx(), 'N', '2026-07-29'));       // today, Denver
  assert.equal(silentNodes(s).length, 0, 'nothing silent');
  const due = s.nodes.get('N')!.clocks.due;
  assert.ok(due, 'a due clock — the immovable kind');
  assert.equal(localDayKey(due!.at, TZ), '2026-07-29', 'on the day asked for');
  const q = nextUpQueue(s, AT, TZ);
  assert.equal(q[0]!.node.id, 'N');
  assert.equal(q[0]!.reason, 'hard-date', 'a real date outranks everything computed');
});

test('clearing a date cannot lose the item — the gate hands it back today', () => {
  let s = captured('N');
  s = write(s, setDueEvents(ctx(), 'N', '2026-08-20'));
  // Strip the capture's review clock too, so `due` is the ONLY coverage left and
  // clearing it genuinely risks silence.
  const c = ctx();
  s = write(s, [{
    id: c.id(), vault: 'personal', at: AT, device: 'd0', seq: c.seq(),
    kind: 'clock.cleared', node: 'N', payload: { clockKind: 'review' },
  } as AppEvent]);
  const admitted = admit(clearDueEvents(ctx(), 'N'), s, opts);
  s = fold(admitted, s);
  assert.equal(s.nodes.get('N')!.clocks.due, undefined, 'the date is gone');
  assert.equal(silentNodes(s).length, 0, 'but the item is not');
  assert.ok(admitted.some(e => e.id.includes('~cure~')), 'the gate cured it, which is the right answer here');
});

// --- repeats: the path to the decay primitive ------------------------------

test('"make it repeat" reaches the decay primitive, which had no UI path before', () => {
  let s = captured('N', 'water the plant');
  const before = s.nodes.get('N')!;
  assert.equal(pressureOf(before, AT, TZ), null, 'no cadence yet, so no pressure');

  s = write(s, makeRepeatEvents(ctx(), 'N', before.kind, 7, 2));
  const n = s.nodes.get('N')!;
  assert.equal(n.kind, 'upkeep', 'it is an upkeep now');
  assert.equal(n.intervalDays, 7);
  assert.equal(n.comfortWindowDays, 2);
  assert.equal(silentNodes(s).length, 0, 'and it is covered');
  assert.equal(pressureOf(n, AT, TZ), 0, 'never done = ready, not late');
});

test('a repeat comes back on ITS interval, not the gate’s same-day default', () => {
  // The gate would cure a bare kind change with a same-day clock, bringing a
  // monthly thing back this evening. The intent sets its own clock instead.
  let s = captured('M', 'monthly filing');
  s = write(s, makeRepeatEvents(ctx(), 'M', s.nodes.get('M')!.kind, 30, 5));
  const review = s.nodes.get('M')!.clocks.review!;
  assert.equal(calendarDaysBetween(AT, review.at, TZ), 30, 'thirty days out, as asked');
});

test('a repeat appears among the Upkeep chips once it comes round — and not before', () => {
  let s = captured('U', 'water the plant');
  s = write(s, makeRepeatEvents(ctx(), 'U', s.nodes.get('U')!.kind, 7, 2));
  // Done today: settled, so it should be quiet.
  const c = ctx();
  s = write(s, [{
    id: c.id(), vault: 'personal', at: AT, device: 'd0', seq: c.seq(),
    kind: 'done.marked', node: 'U', payload: { at: AT },
  } as AppEvent]);
  assert.equal(upkeepChips(s, AT, TZ).length, 0, 'just done: quiet');
  // Ten days later it is a full comfort window past ready.
  const later = '2026-08-08T18:00:00.000Z';
  const chips = upkeepChips(s, later, TZ);
  assert.deepEqual(chips.map(x => x.node.id), ['U'], 'and it comes back on its own');
  assert.ok(chips[0]!.pressure! > 0);
});

test('"stop repeating" removes the cadence without inventing a new event', () => {
  let s = captured('U');
  s = write(s, makeRepeatEvents(ctx(), 'U', s.nodes.get('U')!.kind, 7, 2));
  s = write(s, stopRepeatEvents(ctx(), 'U'));
  const n = s.nodes.get('U')!;
  assert.equal(n.kind, 'action', 'no longer an upkeep');
  assert.equal(pressureOf(n, AT, TZ), null, 'and no longer carries a cadence');
  assert.equal(upkeepChips(s, '2026-09-30T18:00:00.000Z', TZ).length, 0, 'never returns as a chip');
  assert.equal(silentNodes(s).length, 0, 'still covered');
});

// --- undo ------------------------------------------------------------------

test('a done can be taken back, and the item is offered again', () => {
  let s = captured('N');
  s = write(s, setDueEvents(ctx(), 'N', '2026-07-29'));
  const c = ctx();
  s = write(s, [{
    id: c.id(), vault: 'personal', at: AT, device: 'd0', seq: c.seq(),
    kind: 'done.marked', node: 'N', payload: { at: AT },
  } as AppEvent]);
  assert.deepEqual(nextUpQueue(s, AT, TZ).map(i => i.node.id), [], 'finished work is not offered');

  s = write(s, undoneEvents(ctx(), 'N'));
  assert.equal(s.nodes.get('N')!.lastDone, null, 'the completion is withdrawn');
  assert.deepEqual(nextUpQueue(s, AT, TZ).map(i => i.node.id), ['N'], 'and it is back');
  assert.equal(silentNodes(s).length, 0);
});

test('an untrash cannot resurrect something into silence', () => {
  let s = captured('N');
  const c = ctx();
  s = write(s, [{
    id: c.id(), vault: 'personal', at: AT, device: 'd0', seq: c.seq(),
    kind: 'node.trashed', node: 'N', payload: { reason: 'test' },
  } as AppEvent]);
  s = write(s, untrashEvents(ctx(), 'N'));
  assert.equal(s.nodes.get('N')!.trashed, false, 'it is back');
  assert.equal(silentNodes(s).length, 0, 'and it has somewhere to be');
});

// --- the Menu --------------------------------------------------------------

test('the Menu holds things without demanding them, and promotion is deliberate', () => {
  let s = captured('N');
  s = write(s, toMenuEvents(ctx(), 'N', 'read'));
  assert.equal(s.nodes.get('N')!.onMenu, 'read', 'on the Menu');
  assert.deepEqual(nextUpQueue(s, AT, TZ).map(i => i.node.id), [],
    'a Menu item is a surface, not a demand (law 6) — never volunteered as work');

  s = write(s, promoteFromMenuEvents(ctx(), 'N', 'action'));
  const n = s.nodes.get('N')!;
  assert.equal(n.onMenu, null, 'off the Menu');
  assert.equal(n.kind, 'action', 'and real work now');
  assert.equal(silentNodes(s).length, 0, 'the gate gave it somewhere to be');
  assert.deepEqual(nextUpQueue(s, AT, TZ).map(i => i.node.id), ['N'],
    'it becomes a demand only because it was CHOSEN');
});

// --- the whole point -------------------------------------------------------

test('every edit intent leaves nothing silent (law 1, across all of them)', () => {
  const build: [string, (s: State) => AppEvent[]][] = [
    ['setDue', () => setDueEvents(ctx(), 'N', '2026-08-13')],
    ['clearDue', () => clearDueEvents(ctx(), 'N')],
    ['makeRepeat', s => makeRepeatEvents(ctx(), 'N', s.nodes.get('N')!.kind, 14, 3)],
    ['stopRepeat', () => stopRepeatEvents(ctx(), 'N')],
    ['undone', () => undoneEvents(ctx(), 'N')],
    ['toMenu', () => toMenuEvents(ctx(), 'N')],
    ['promote', () => promoteFromMenuEvents(ctx(), 'N')],
  ];
  for (const [name, make] of build) {
    let s = captured('N');
    s = write(s, make(s));
    assert.equal(silentNodes(s).length, 0, `${name} leaves nothing silent`);
  }
});
