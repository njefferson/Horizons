// Product law 3 — no past bucket (ADR-0012).
//
// The load-bearing property is NOT "a passed date raises a card". It is that a
// passed SOFT clock does not. The gate writes a `review` cure clock for every
// capture, so treating those as lapses would manufacture one shame surface per
// captured thought — precisely the thing law 3 forbids, built by the mechanism
// meant to prevent it.
//
// Second: every resolution must terminate legally through the real gate. There is
// no option that leaves the item silent, and none that files it as a failure.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fold, emptyState, type State } from '../src/fold.ts';
import { admit, silentNodes, gateOptionsFor, heldNodes } from '../src/gate.ts';
import { replanAll, replanCards, replanIds, replanWords, REPLAN_CAP } from '../src/replan.ts';
import { replanEvents, REPLAN_CHOICES } from '../src/ui/replan-intents.ts';
import { heldGroups, heldStatus } from '../src/held.ts';
import { workSurface } from '../src/nextup.ts';
import type { AppEvent, ReplanChoice } from '../src/events.ts';
import type { StampContext } from '../src/ui/session.ts';

const TZ = 'America/Denver';                    // never UTC (V-13)
const NOW = '2026-07-29T18:00:00.000Z';         // 12:00 on the 29th, Denver

let seq = 0;
const ev = (kind: string, node: string, payload: unknown, at = '2026-07-01T12:00:00.000Z'): AppEvent =>
  ({ id: `e${seq}`, vault: 'personal', at, device: 'd0', seq: seq++, kind, node, payload } as AppEvent);
const st = (...events: AppEvent[]): State => fold(events);
const ctx = (): StampContext => ({
  at: NOW, device: 'd0', vault: 'personal', zone: TZ,
  seq: () => seq++, id: () => `r${seq}`,
});
const opts = gateOptionsFor(TZ);
const write = (prior: State, offered: AppEvent[]): State => fold(admit(offered, prior, opts), prior);

const clock = (id: string, kind: string, days: number): AppEvent =>
  ev('clock.set', id, { clockKind: kind, at: new Date(Date.parse(NOW) + days * 86_400_000).toISOString(), source: 't' });

const node = (id: string, title = id): AppEvent => ev('node.created', id, { nodeKind: 'action', title });

// --- what raises a card, and what must never ------------------------------

test('a passed SOFT clock raises nothing — or the app builds the shame surface itself', () => {
  // The gate writes a review clock for every single capture. If those counted,
  // every thought captured a week ago would be a "failure" today.
  const s = st(node('R'), clock('R', 'review', -30));
  assert.deepEqual(replanAll(s, NOW, TZ), [], 'a passed review clock is ordinary operation');
  assert.equal(replanCards(s, NOW, TZ).total, 0);
});

test('a passed HARD date raises a card, with its context assembled', () => {
  const s = st(node('D', 'file the return'), clock('D', 'due', -3));
  const view = replanCards(s, NOW, TZ);
  assert.equal(view.total, 1);
  const card = view.cards[0]!;
  assert.equal(card.node.id, 'D');
  assert.equal(card.clockKind, 'due');
  assert.equal(card.daysAgo, 3, 'counted in whole local days');
  assert.deepEqual(card.fed, [], 'nothing recorded as fed — dependencies do not exist yet');
});

test('a suspense clock carries days-left, which is the expensive part to reconstruct', () => {
  const s = st(node('S'), clock('S', 'due', -2), clock('S', 'suspense', 5));
  const card = replanCards(s, NOW, TZ).cards[0]!;
  assert.equal(card.suspense !== null, true, 'the downstream commitment is named');
  assert.equal(card.daysLeft, 5, 'and how long is left before it');
});

test('nothing already dealt with raises a card', () => {
  const cases: [string, AppEvent[]][] = [
    ['done', [ev('done.marked', 'X', { at: NOW })]],
    ['trashed', [ev('node.trashed', 'X', {})]],
    ['on the Menu', [ev('menu.item.added', 'X', { category: 'read' })]],
  ];
  for (const [name, extra] of cases) {
    const s = st(node('X'), clock('X', 'due', -5), ...extra);
    assert.deepEqual(replanAll(s, NOW, TZ), [], `${name} raises nothing`);
  }
  // An unrouted capture belongs to triage, whatever clock it carries.
  const inbox = st(
    ev('capture.recorded', 'C', { text: 'unrouted', source: 'quick', sourceTags: [] }),
    clock('C', 'due', -5),
  );
  assert.deepEqual(replanAll(inbox, NOW, TZ), [], 'triage owns it, not this surface');
});

test('a date today or in the future raises nothing', () => {
  const s = st(node('T'), clock('T', 'due', 0), node('F'), clock('F', 'due', 3));
  assert.deepEqual(replanAll(s, NOW, TZ), [], 'a date that has not gone by has not gone by');
});

// --- the cap, which law 8 requires -----------------------------------------

test('the surface is capped, and says how many there really are', () => {
  const events: AppEvent[] = [];
  for (let i = 0; i < 9; i++) events.push(node(`n${i}`), clock(`n${i}`, 'due', -(i + 1)));
  const view = replanCards(st(...events), NOW, TZ);
  assert.equal(view.cards.length, REPLAN_CAP, 'at most three — a wall of them is the pile again');
  assert.equal(view.total, 9, 'and the count is stated, so the cap is not a lie by omission');
  assert.equal(view.cards[0]!.daysAgo, 9, 'longest-passed first');
});

test('the order is total, so a render never reshuffles what it just showed', () => {
  const events: AppEvent[] = [];
  for (let i = 0; i < 6; i++) events.push(node(`n${i}`), clock(`n${i}`, 'due', -4));
  const s = st(...events);
  assert.deepEqual(replanAll(s, NOW, TZ).map(c => c.node.id),
    replanAll(s, NOW, TZ).map(c => c.node.id), 'identical ages do not reorder between calls');
});

// --- resolutions: forward-facing, and every one legal ----------------------

test('every resolution terminates legally through the real gate (law 1)', () => {
  for (const { choice } of REPLAN_CHOICES) {
    let s = write(emptyState(), [node('N'), clock('N', 'due', -4)]);
    const events = replanEvents(ctx(), 'N', choice, 'due', '2026-09-01');
    assert.ok(events.length > 0, `${choice} produces events`);
    s = write(s, events);
    assert.equal(silentNodes(s).length, 0, `${choice} leaves nothing silent`);
    assert.deepEqual(replanAll(s, NOW, TZ), [], `${choice} clears the card`);
  }
});

test('there is no "mark as missed" — every option is forward-facing', () => {
  const labels = REPLAN_CHOICES.map(c => `${c.label} ${c.hint}`).join(' ').toLowerCase();
  for (const shame of ['missed', 'fail', 'late', 'overdue', 'behind', 'should have']) {
    assert.doesNotMatch(labels, new RegExp(shame), `no option says "${shame}"`);
  }
  const choices = REPLAN_CHOICES.map(c => c.choice).sort();
  assert.deepEqual(choices, ['compress', 'escalate', 'new-date', 'renegotiate', 'to-menu'],
    'the five the vocabulary defines, and nothing that files a failure');
});

test('"not now" is unremarkable and lands on the Menu, clock and all (ADR-0012)', () => {
  let s = write(emptyState(), [node('N'), clock('N', 'due', -6)]);
  s = write(s, replanEvents(ctx(), 'N', 'to-menu'));
  const n = s.nodes.get('N')!;
  assert.equal(n.onMenu, 'try', 'it is on the Menu');
  assert.equal(n.clocks.due, undefined, 'and the passed date went with it — a Menu item carries no clock');
  assert.equal(silentNodes(s).length, 0);
  assert.equal(heldGroups(s, NOW, TZ)[0]!.key, 'menu', 'and the list files it as such');
});

test('escalate genuinely changes the kind rather than tagging it', () => {
  let s = write(emptyState(), [node('N'), clock('N', 'due', -2)]);
  s = write(s, replanEvents(ctx(), 'N', 'escalate'));
  assert.equal(s.nodes.get('N')!.kind, 'waiting-for', 'someone else owes it now');
  assert.equal(silentNodes(s).length, 0);
});

test('a new date without a date is refused rather than invented', () => {
  assert.deepEqual(replanEvents(ctx(), 'N', 'new-date', 'due'), [], 'no date, no resolution');
  assert.deepEqual(replanEvents(ctx(), 'N', 'new-date', 'due', 'soon'), [], 'and not a shape it cannot use');
  assert.ok(replanEvents(ctx(), 'N', 'new-date', 'due', '2026-09-01').length > 0, 'a real date resolves it');
});

test('a resolved card does not come straight back', () => {
  let s = write(emptyState(), [node('N'), clock('N', 'due', -10)]);
  assert.equal(replanAll(s, NOW, TZ).length, 1, 'it was raised');
  s = write(s, replanEvents(ctx(), 'N', 'compress'));
  assert.deepEqual(replanAll(s, NOW, TZ), [], 'and resolving it actually resolved it');
});

// --- the words -------------------------------------------------------------

test('the words state a fact and never accuse', () => {
  for (const d of [1, 3, 9, 30, 400]) {
    const w = replanWords(d);
    assert.ok(w.length > 0);
    for (const shame of ['late', 'missed', 'overdue', 'fail', 'should']) {
      assert.doesNotMatch(w, new RegExp(shame, 'i'), `"${w}" carries no rebuke`);
    }
  }
});

// --- no surface shows the same thing twice ---------------------------------

test('an item with a live card is excluded from the other surfaces', () => {
  const s = st(node('D', 'the thing'), clock('D', 'due', -4));
  assert.deepEqual([...replanIds(s, NOW, TZ)], ['D'], 'the id is published for others to exclude');
});

test('the work surface does not also offer it — one item, one question', () => {
  // Detection power first: with the date TODAY the same item IS offered, so the
  // exclusion below is doing the work and not some unrelated filter.
  const today = st(node('D', 'the thing'), clock('D', 'due', 0));
  assert.equal(workSurface(today, NOW, TZ).up.head?.node.id, 'D', 'a date today is ordinary work');

  const passed = st(node('D', 'the thing'), clock('D', 'due', -4));
  const w = workSurface(passed, NOW, TZ);
  assert.equal(w.up.head, null, 'once the date has gone by, the decision is the only thing offered');
  assert.equal(w.up.total, 0, 'and the count agrees — it is not offered and quietly counted');
  assert.deepEqual(w.up.behind, [], 'nor hidden in the list behind it');
});

test('an upkeep with a live card is not offered as a chip either', () => {
  const up = ev('node.created', 'U', { nodeKind: 'upkeep', title: 'renew the licence' });
  const every = ev('upkeep.interval.set', 'U', { intervalDays: 365, comfortWindowDays: 14 });
  const ready = st(up, every);
  assert.equal(workSurface(ready, NOW, TZ).chips.length, 1, 'ordinarily a chip');

  const passed = st(up, every, clock('U', 'due', -2));
  assert.deepEqual([...replanIds(passed, NOW, TZ)], ['U'], 'the first date really did go by');
  assert.deepEqual(workSurface(passed, NOW, TZ).chips, [],
    'a second surface exempt from the exclusion is a hole in it, not a second view');
});

test('an upkeep already in its rhythm raises nothing, whatever date it carries', () => {
  // Deliberate, and the opposite of the test above. Once an upkeep has been done
  // it is running on the decay primitive, and law 5 says an upkeep is "never a
  // failure to have not done yet". Raising a replan card for a plant that wanted
  // watering on Tuesday would file a recurring rhythm as a lapse — one shame
  // surface per cadence, which is the thing law 3 forbids arriving through law 5.
  const s = st(
    ev('node.created', 'U', { nodeKind: 'upkeep', title: 'water the plants' }),
    ev('upkeep.interval.set', 'U', { intervalDays: 3, comfortWindowDays: 2 }),
    ev('done.marked', 'U', { at: '2026-07-01T12:00:00.000Z' }),
    clock('U', 'due', -2),
  );
  assert.deepEqual(replanAll(s, NOW, TZ), [], 'it comes round again; it did not fail');
  assert.equal(workSurface(s, NOW, TZ).chips.length, 1, 'and it is still offered, as a chip');
});

test('nothing vanishes: the list still holds it, under its own heading', () => {
  const s = st(node('D', 'file the return'), clock('D', 'due', -4));
  const groups = heldGroups(s, NOW, TZ);
  assert.deepEqual(groups.flatMap(g => g.items.map(n => n.id)), ['D'],
    'the complete inventory is still complete');
  assert.equal(groups[0]!.key, 'replan');
  assert.equal(groups[0]!.title, 'Needs a new plan',
    'under "Ready now" it reads as ordinary work, which the passed date has ruled out');
  assert.equal(heldStatus(s.nodes.get('D')!, NOW, TZ), 'needs a new plan',
    'and the row says the same words as its heading — one state, one phrasing');
});

test('the grouping stays TOTAL — a new group is not a way to drop things', () => {
  // The sum of the groups is what the coverage gauge counts. If they can differ,
  // the number and the list are two claims about one thing, and one of them is
  // wrong. A mixed state, every branch of the loop exercised.
  const s = st(
    node('hard'), clock('hard', 'due', -4),
    node('susp'), clock('susp', 'suspense', -1),
    node('soft'), clock('soft', 'review', -4),
    node('today'), clock('today', 'due', 0),
    node('soon'), clock('soon', 'due', 3),
    node('later'), clock('later', 'due', 90),
    node('quiet'),
    node('menu'), ev('menu.item.added', 'menu', { category: 'read' }),
    node('done'), ev('done.marked', 'done', { at: NOW }),
    ev('capture.recorded', 'inbox', { text: 'x', source: 'quick', sourceTags: [] }),
  );
  const grouped = heldGroups(s, NOW, TZ).flatMap(g => g.items.map(n => n.id));
  assert.equal(grouped.length, heldNodes(s).length,
    'every held node is in exactly one group, and none is in two');
  assert.deepEqual([...grouped].sort(), heldNodes(s).map(n => n.id).sort(),
    'and they are the same nodes, not merely the same count');
  const replanGroup = heldGroups(s, NOW, TZ).find(g => g.key === 'replan');
  assert.deepEqual(replanGroup!.items.map(n => n.id).sort(), ['hard', 'susp'],
    'the new group holds exactly what the replan surface raises, and nothing else');
});

test('the list and the replan surface never describe one item differently', () => {
  // A mixed state: passed hard, passed soft, done, on the Menu, unsorted, future.
  const s = st(
    node('hard'), clock('hard', 'due', -4),
    node('soft'), clock('soft', 'review', -4),
    node('done'), clock('done', 'due', -4), ev('done.marked', 'done', { at: NOW }),
    node('menu'), clock('menu', 'due', -4), ev('menu.item.added', 'menu', { category: 'read' }),
    ev('capture.recorded', 'inbox', { text: 'x', source: 'quick', sourceTags: [] }), clock('inbox', 'due', -4),
    node('future'), clock('future', 'due', 5),
    node('susp'), clock('susp', 'suspense', -1),
  );
  const raised = replanIds(s, NOW, TZ);
  assert.deepEqual([...raised].sort(), ['hard', 'susp'], 'the set is what it should be');
  for (const g of heldGroups(s, NOW, TZ)) {
    for (const n of g.items) {
      assert.equal(heldStatus(n, NOW, TZ) === 'needs a new plan', raised.has(n.id),
        `${n.id}: the list and the card surface agree, in both directions`);
    }
  }
});
