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
import { replanAll, replanCards, replanIds, replanWords, contextWords, REPLAN_CAP } from '../src/replan.ts';
import { replanEvents, canResolve, REPLAN_CHOICES } from '../src/ui/replan-intents.ts';
import { countWords } from '../src/ui/replan.ts';
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
  // `fed` is not asserted here. It is the hardcoded literal `[]` until
  // `dependency.declared` is built, so checking it equals `[]` is a constant
  // compared with itself — it was in this test and it proved nothing (audit).
  // What matters is that no COPY claims a relationship the log does not hold,
  // and that is asserted where the words are built.
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
  // A LITERAL 3, not `REPLAN_CAP`. Asserting against the constant the code uses
  // is self-referential — both sides move together, so raising the cap to five
  // left this green (audit). Law 8's bound is a number, not a variable.
  assert.equal(view.cards.length, 3, 'at most three — a wall of them is the pile again');
  assert.equal(REPLAN_CAP, 3, 'and the constant is that number, stated once');
  assert.equal(view.total, 9, 'and the count is stated, so the cap is not a lie by omission');
  assert.equal(view.cards[0]!.daysAgo, 9, 'longest-passed first');
});

test('the order is total, so a render never reshuffles what it just showed', () => {
  // Asserting `replanAll(s) deepEqual replanAll(s)` was a TAUTOLOGY — true of any
  // pure function, including one that never sorts. Deleting the id tie-break the
  // comment names left it green (audit). So assert the tie-break itself: six
  // items of identical age, inserted in reverse, must come back in id order.
  const events: AppEvent[] = [];
  for (let i = 5; i >= 0; i--) events.push(node(`n${i}`), clock(`n${i}`, 'due', -4));
  const ids = replanAll(st(...events), NOW, TZ).map(c => c.node.id);
  assert.deepEqual(ids, ['n0', 'n1', 'n2', 'n3', 'n4', 'n5'],
    'identical ages break the tie on id, so the order cannot depend on insertion');
});

test('a node with two passed hard clocks says which one it is about', () => {
  // Nothing pinned this, so picking the shortest-passed instead of the longest
  // went unnoticed — and the card names one clock while the resolution has to
  // retire both.
  const s = st(node('N'), clock('N', 'due', -9), clock('N', 'suspense', -2));
  const card = replanCards(s, NOW, TZ).cards[0]!;
  assert.equal(card.clockKind, 'due', 'the longest-passed leads, and it is the one the words describe');
  assert.equal(card.daysAgo, 9);
  assert.deepEqual([...card.passedKinds].sort(), ['due', 'suspense'],
    'but BOTH are published, because a resolution has to retire every one of them');
});

// --- resolutions: forward-facing, and every one legal ----------------------

test('every resolution clears the card, whichever hard clocks went by', () => {
  // FIFTEEN cases, and fourteen of them were untested. Every call in the old
  // suite passed `'due'`, so the code retired one clock of two and four of the
  // five options left the card raised — buttons that did nothing while
  // announcing that they had. Two independent audits found it; no gate did.
  //
  // The resolution takes its passed clocks from the CARD, so the card is what
  // this asks, rather than a hand-written list that could quietly disagree.
  const shapes: [string, AppEvent[]][] = [
    ['due only', [clock('N', 'due', -4)]],
    ['suspense only', [clock('N', 'suspense', -4)]],
    ['both passed', [clock('N', 'due', -9), clock('N', 'suspense', -2)]],
  ];
  for (const [shape, clocks] of shapes) {
    for (const { choice } of REPLAN_CHOICES) {
      let s = write(emptyState(), [node('N'), ...clocks]);
      const card = replanAll(s, NOW, TZ)[0]!;
      assert.ok(card, `${shape}: the card is raised to begin with`);
      const events = replanEvents(ctx(), 'N', choice, card.passedKinds, '2026-09-01', card.node.kind);
      assert.ok(events.length > 0, `${shape} / ${choice}: produces events`);
      s = write(s, events);
      assert.equal(silentNodes(s).length, 0, `${shape} / ${choice}: leaves nothing silent`);
      assert.deepEqual(replanAll(s, NOW, TZ), [],
        `${shape} / ${choice}: a resolution that leaves the card raised resolved nothing`);
    }
  }
});

test('the recorded kind change is the one that actually happened', () => {
  // `from` is never read by the fold, which is exactly why it went wrong: it was
  // hard-coded to 'action', so escalating an upkeep wrote a transition that never
  // happened into an append-only log — permanent, and unfixable by folding.
  let s = write(emptyState(), [
    ev('node.created', 'U', { nodeKind: 'upkeep', title: 'renew it' }),
    clock('U', 'due', -3),
  ]);
  const card = replanAll(s, NOW, TZ)[0]!;
  assert.equal(card.node.kind, 'upkeep', 'it really is an upkeep before we start');
  const events = replanEvents(ctx(), 'U', 'escalate', card.passedKinds, undefined, card.node.kind);
  const changed = events.find(e => e.kind === 'node.kind.changed')!;
  assert.equal((changed.payload as { from: string }).from, 'upkeep',
    'the log records what it changed FROM, not a guess');
  assert.equal((changed.payload as { to: string }).to, 'waiting-for');
});

test('an altitude node is never offered a replan card (law 4)', () => {
  // Next-up refuses to offer a goal or an area as the next thing to do. Offering
  // one five action-shaped buttons here — one of which converts it into a
  // waiting-for — is the same climbing law 4 forbids, through another door.
  for (const kind of ['goal', 'area', 'outcome', 'project', 'resume-card']) {
    const s = st(ev('node.created', 'A', { nodeKind: kind, title: kind }), clock('A', 'due', -5));
    assert.deepEqual(replanAll(s, NOW, TZ), [], `a ${kind} cannot have lapsed`);
  }
  // But a waiting-for CAN. A date going by on something someone else owes you is
  // a real decision, and refusing it would be copying Next-up's rule without its
  // reason — Next-up excludes it because YOU cannot act on it, which says nothing
  // about whether the date matters.
  const w = st(ev('node.created', 'W', { nodeKind: 'waiting-for', title: 'their reply' }), clock('W', 'due', -5));
  assert.equal(replanAll(w, NOW, TZ).length, 1, 'a waiting-for whose date went by is still a decision');
});

test('there is no "mark as missed" — every option is forward-facing', () => {
  const labels = REPLAN_CHOICES.map(c => `${c.label} ${c.hint}`).join(' ').toLowerCase();
  for (const shame of ['missed', 'fail', 'late', 'overdue', 'behind', 'should have']) {
    assert.doesNotMatch(labels, new RegExp(shame), `no option says "${shame}"`);
  }
  // NOT sorted. Sorting discarded the order, so reversing ADR-0012's order left
  // this green — and the order is the decision: the three forward options, then
  // a new date, then the Menu, last by position and equal in weight (audit).
  assert.deepEqual(REPLAN_CHOICES.map(c => c.choice),
    ['compress', 'escalate', 'renegotiate', 'new-date', 'to-menu'],
    'ADR-0012\'s order, which is itself a design decision');
  for (const c of REPLAN_CHOICES) {
    // The shame scan above passes trivially on empty strings, so emptying every
    // hint left it green. The hints are load-bearing: these consequences are not
    // guessable from the labels.
    assert.ok(c.label.trim().length > 0 && c.hint.trim().length > 0,
      `${c.choice} says what it is and what it does`);
  }
});

test('"not now" is unremarkable and lands on the Menu (ADR-0012)', () => {
  let s = write(emptyState(), [node('N'), clock('N', 'due', -6)]);
  s = write(s, replanEvents(ctx(), 'N', 'to-menu'));
  const n = s.nodes.get('N')!;
  assert.equal(n.onMenu, 'try', 'it is on the Menu');
  assert.equal(n.clocks.due, undefined, 'and the date that went by went with it');
  // NOT "a Menu item carries no clock" — it demonstrably does. `clock.cleared` is
  // silent-risk, so the gate covers it with a review cure, and law 6/ADR-0014
  // govern clocks on demand-free KINDS rather than on Menu membership. The old
  // message cited a law that says no such thing, about a state the code does not
  // produce (audit). Pinned here so the copy cannot drift back.
  assert.ok(Object.keys(n.clocks).length > 0,
    'it is still covered — nothing in this app is ever left silent, Menu included');
  assert.equal(silentNodes(s).length, 0);
  assert.equal(heldGroups(s, NOW, TZ)[0]!.key, 'menu', 'and the list files it as such');
  const hints = REPLAN_CHOICES.map(c => c.hint).join(' ');
  assert.doesNotMatch(hints, /no clock/, 'and no option promises a state the gate will not leave it in');
});

test('a new date without a date is refused rather than invented', () => {
  assert.deepEqual(replanEvents(ctx(), 'N', 'new-date', ['due']), [], 'no date, no resolution');
  assert.deepEqual(replanEvents(ctx(), 'N', 'new-date', ['due'], 'soon'), [], 'and not a shape it cannot use');
  assert.ok(replanEvents(ctx(), 'N', 'new-date', ['due'], '2026-09-01').length > 0, 'a real date resolves it');
  // The surface asks the same question before committing, so a refused date can
  // never look like a button that does nothing.
  assert.equal(canResolve('new-date', ''), false);
  assert.equal(canResolve('new-date', '2026-09-01'), true);
  assert.equal(canResolve('compress', undefined), true, 'the other four never need one');
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

test('and the words say the RIGHT thing, not merely a non-empty thing', () => {
  // `length > 0` plus a shame denylist was the whole test. A constant string
  // passed it, so a card 400 days behind could read "that date was yesterday" —
  // a claim the data does not support (Doctrine §5), green (audit).
  const expected: [number, string][] = [
    [0, 'that date was yesterday'],
    [1, 'that date was yesterday'],
    [3, 'that date was 3 days ago'],
    [6, 'that date was 6 days ago'],
    [7, 'that date was last week'],
    [13, 'that date was last week'],
    [14, 'that date has been by for a while'],
    [59, 'that date has been by for a while'],
    [60, 'that date was some time ago'],
    [400, 'that date was some time ago'],
  ];
  for (const [days, words] of expected) {
    assert.equal(replanWords(days), words, `${days} days ago`);
  }
});

test('the assembled context never states something the data does not support', () => {
  // Zero coverage before this: replacing the whole function with `null`, or with
  // a fixed false claim about a date, left every gate green (audit).
  const card = (kind: 'due' | 'suspense', daysAgo: number, suspense: string | null, daysLeft: number | null) =>
    ({ node: {} as never, clockKind: kind, passedKinds: [kind], at: NOW, daysAgo, fed: [], suspense, daysLeft });

  assert.equal(contextWords(card('suspense', 3, NOW, -3), TZ), null,
    'when the passed clock IS the commitment, saying it twice is two questions about one item');
  assert.equal(contextWords(card('due', 3, null, null), TZ), null,
    'nothing to say beats a line reading "nothing recorded" on every card');
  // The guard that matters: `daysLeft` is signed, and printing it unguarded would
  // state a FUTURE for a date already behind you.
  assert.equal(contextWords(card('due', 9, '2026-07-20T00:00:00.000Z', -9), TZ),
    'it also carries a commitment, and that date has gone by too');
  assert.equal(contextWords(card('due', 2, '2026-07-29T00:00:00.000Z', 0), TZ),
    'it also carries a commitment, and that is today');
  assert.equal(contextWords(card('due', 2, '2026-07-30T00:00:00.000Z', 1), TZ),
    'it also carries a commitment, and that is tomorrow');
  const far = contextWords(card('due', 2, '2026-08-15T12:00:00.000Z', 17), TZ)!;
  assert.match(far, /^it also carries a commitment on \w+ \d+, 17 days from now$/, far);
  // A year out must say WHICH year — "Aug 15" alone is indistinguishable from
  // this August, in an app whose job is telling you when something comes back.
  assert.match(contextWords(card('due', 2, '2027-08-15T12:00:00.000Z', 382), TZ)!, /2027/);
  // And it must not claim a dependency the log does not contain: `fed` is always
  // empty until `dependency.declared` exists, so nothing here may say "fed".
  for (const d of [-1, 0, 1, 17, 382]) {
    const w = contextWords(card('due', 2, '2026-08-15T12:00:00.000Z', d), TZ);
    if (w) assert.doesNotMatch(w, /\bfed\b/, `"${w}" asserts a relationship the log does not record`);
  }
});

test('the count is honest at every size, and reads as English', () => {
  // Also uncovered anywhere: a constant "One date has gone by." passed every
  // gate, because the browser walk only ever had one lapsed item (audit).
  assert.equal(countWords(1, 1), 'One date has gone by.');
  assert.equal(countWords(2, 2), '2 dates have gone by.');
  assert.equal(countWords(3, 3), '3 dates have gone by.');
  assert.equal(countWords(4, 3), '4 dates have gone by. These 3 first.');
  assert.equal(countWords(9, 3), '9 dates have gone by. These 3 first.');
  // The cap is only honest if the surface says so whenever it is hiding some.
  for (const total of [4, 5, 12, 40]) {
    assert.match(countWords(total, 3), new RegExp(`^${total} dates have gone by\\. These 3 first\\.$`),
      'a surface showing three of many without saying so is a lie by omission');
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
  // ...and the LIST must say the same thing. It filed this under "Done" while
  // the chip offered it as live work — one node, one screen, two contradictory
  // statements, which is the class `held.ts` exists to remove (audit).
  const group = heldGroups(s, NOW, TZ).find(g => g.items.some(n => n.id === 'U'))!;
  assert.notEqual(group.key, 'done',
    'a rhythm that has come round again is not finished, whatever it says in the log');
  assert.notEqual(heldStatus(s.nodes.get('U')!, NOW, TZ), 'done',
    'and the row agrees with the chip beside it');
});

test('but a recurring thing just done IS done, until it comes round', () => {
  // The other side of the same guard: fixing the above must not make a plant
  // watered this morning claim it is asking for something.
  const s = st(
    ev('node.created', 'U', { nodeKind: 'upkeep', title: 'water the plants' }),
    ev('upkeep.interval.set', 'U', { intervalDays: 30, comfortWindowDays: 5 }),
    ev('done.marked', 'U', { at: NOW }),
  );
  assert.equal(heldStatus(s.nodes.get('U')!, NOW, TZ), 'done');
  assert.equal(heldGroups(s, NOW, TZ)[0]!.key, 'done');
  assert.equal(workSurface(s, NOW, TZ).chips.length, 0, 'and it is not asking for anything');
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
