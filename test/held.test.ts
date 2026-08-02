// Phase 3.5: the held list as a todo list, and rename.
//
// The load-bearing property is TOTALITY: every held node lands in exactly one
// group, and the groups sum to the same number the coverage gauge claims. A list
// that quietly drops an item is the worst failure this surface can have — it
// would mean something you are holding is not shown anywhere.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fold, emptyState, isAppClock, type State, type NodeState } from '../src/fold.ts';
import { heldNodes, coverageGauge, admit, gateOptionsFor } from '../src/gate.ts';
import { heldGroups, heldStatus, undatedCount, SOON_DAYS, liveChildCounts, parentTitleOf, placeWords } from '../src/held.ts';
import { nextUpQueue } from '../src/nextup.ts';
import { serialiseState, deserialiseState } from '../src/snapshot.ts';
import { renameEvents, TITLE_MAX } from '../src/ui/detail-intents.ts';
import type { AppEvent } from '../src/events.ts';
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

const clockAt = (id: string, days: number): AppEvent => {
  const at = new Date(Date.parse(NOW) + days * 86_400_000).toISOString();
  return ev('clock.set', id, { clockKind: 'review', at, source: 'test' });
};

// --- where a node sits: telling a filed item from a loose one ---------------

test('a child says which project it is in; a container says how many it holds; a loose item says neither', () => {
  const s = st(
    ev('node.created', 'PROJ', { nodeKind: 'project', title: 'Boy Scouts' }), clockAt('PROJ', 5),
    ev('node.created', 'A1', { nodeKind: 'action', title: 'youth protection training', parent: 'PROJ' }),
    ev('node.created', 'A2', { nodeKind: 'action', title: 'merit badges', parent: 'PROJ' }),
    ev('node.created', 'LOOSE', { nodeKind: 'action', title: 'a loose thought' }), clockAt('LOOSE', 2),
  );
  const counts = liveChildCounts(s);
  assert.equal(counts.get('PROJ'), 2, 'the project holds two live children');
  assert.equal(parentTitleOf(s.nodes.get('A1')!, s), 'Boy Scouts', 'the child names its container');
  assert.equal(parentTitleOf(s.nodes.get('LOOSE')!, s), null, 'a loose item has no container');
  assert.equal(placeWords(s.nodes.get('A1')!, s, counts), 'in Boy Scouts', 'the filed action reads as filed');
  assert.equal(placeWords(s.nodes.get('PROJ')!, s, counts), '2 under it', 'the container reads as a container');
  assert.equal(placeWords(s.nodes.get('LOOSE')!, s, counts), null,
    'the loose item shows nothing — it IS loose, which is the whole distinction');
});

test('a trashed parent or child confers and counts no home', () => {
  const s = st(
    ev('node.created', 'PROJ', { nodeKind: 'project', title: 'Old project' }), clockAt('PROJ', 5),
    ev('node.created', 'A1', { nodeKind: 'action', title: 'kept', parent: 'PROJ' }),
    ev('node.created', 'A2', { nodeKind: 'action', title: 'gone', parent: 'PROJ' }),
    ev('node.trashed', 'A2', { reason: 'test' }),
  );
  assert.equal(liveChildCounts(s).get('PROJ'), 1, 'a trashed child is not something the project holds');
  // Trash the parent: its remaining child is loose again, not filed under a ghost.
  const s2 = fold([ev('node.trashed', 'PROJ', { reason: 'test' })], s);
  assert.equal(parentTitleOf(s2.nodes.get('A1')!, s2), null,
    'a trashed container is no home — the child really is loose again');
  assert.equal(placeWords(s2.nodes.get('A1')!, s2, liveChildCounts(s2)), null, 'so it shows nothing');
});

// --- totality: the property that matters most ------------------------------

test('every held node lands in exactly one group, and the groups sum to the gauge', () => {
  const s = st(
    ev('capture.recorded', 'INBOX', { text: 'unrouted', source: 'quick', sourceTags: [] }),
    ev('node.created', 'READY', { nodeKind: 'action', title: 'ready' }), clockAt('READY', 0),
    ev('node.created', 'SOON', { nodeKind: 'action', title: 'soon' }), clockAt('SOON', 3),
    ev('node.created', 'LATER', { nodeKind: 'action', title: 'later' }), clockAt('LATER', 40),
    ev('node.created', 'MENU', { nodeKind: 'action', title: 'menu' }),
    ev('menu.item.added', 'MENU', { category: 'read' }),
    ev('node.created', 'DONE', { nodeKind: 'action', title: 'done' }), clockAt('DONE', 0),
    ev('done.marked', 'DONE', { at: NOW }),
    ev('node.created', 'GONE', { nodeKind: 'action', title: 'trashed' }),
    ev('node.trashed', 'GONE', {}),
  );
  const groups = heldGroups(s, NOW, TZ);
  const all = groups.flatMap(g => g.items.map(n => n.id));

  assert.equal(new Set(all).size, all.length, 'no node appears in two groups');
  assert.equal(all.length, heldNodes(s).length, 'nothing held is dropped from the list');
  assert.equal(all.length, coverageGauge(s).total, 'and the list agrees with the gauge exactly');
  assert.equal(all.includes('GONE'), false, 'a trashed node is not held');

  const where = (id: string): string => groups.find(g => g.items.some(n => n.id === id))!.key;
  assert.equal(where('INBOX'), 'unsorted');
  assert.equal(where('READY'), 'ready');
  assert.equal(where('SOON'), 'soon');
  assert.equal(where('LATER'), 'later');
  assert.equal(where('MENU'), 'menu');
  assert.equal(where('DONE'), 'done');
});

test('totality holds under a fuzz of mixed states', () => {
  const events: AppEvent[] = [];
  for (let i = 0; i < 60; i++) {
    const id = `n${i}`;
    events.push(ev('node.created', id, { nodeKind: 'action', title: id }));
    if (i % 5 !== 0) events.push(clockAt(id, (i % 11) - 3));
    if (i % 7 === 0) events.push(ev('menu.item.added', id, { category: 'read' }));
    if (i % 6 === 0) events.push(ev('done.marked', id, { at: NOW }));
    if (i % 13 === 0) events.push(ev('node.trashed', id, {}));
  }
  const s = st(...events);
  const all = heldGroups(s, NOW, TZ).flatMap(g => g.items.map(n => n.id));
  assert.equal(new Set(all).size, all.length, 'still no duplicates');
  assert.equal(all.length, heldNodes(s).length, 'still nothing dropped');
});

test('an empty group is never rendered as a heading', () => {
  const s = st(ev('node.created', 'A', { nodeKind: 'action', title: 'a' }), clockAt('A', 0));
  const groups = heldGroups(s, NOW, TZ);
  assert.deepEqual(groups.map(g => g.key), ['ready'], 'one item, one group, no empty headings');
  assert.equal(heldGroups(emptyState(), NOW, TZ).length, 0, 'and nothing held means no headings at all');
});

// --- the honesty fix -------------------------------------------------------

test('a finished thing says "done", not "returns today" (Doctrine §5)', () => {
  // The gate re-clocks done.marked to keep the node non-silent, so a completed
  // item genuinely carries a clock for today. Reporting that as "returns today"
  // was a claim the data does not support.
  const s = st(
    ev('node.created', 'D', { nodeKind: 'action', title: 'finished' }),
    clockAt('D', 0),
    ev('done.marked', 'D', { at: NOW }),
    clockAt('D', 0),                                   // the gate's cure
  );
  const n = s.nodes.get('D')!;
  assert.ok(Object.keys(n.clocks).length > 0, 'it really does still carry a clock');
  assert.equal(heldStatus(n, NOW, TZ), 'done', 'but it says what is true');
  assert.equal(heldGroups(s, NOW, TZ).find(g => g.key === 'ready'), undefined,
    'and it is not filed under Ready now');
});

test('a Menu item is never filed under a heading that implies it is asking (law 6)', () => {
  const s = st(
    ev('node.created', 'M', { nodeKind: 'action', title: 'someday' }),
    clockAt('M', -5),                                   // a clock that has passed
    ev('menu.item.added', 'M', { category: 'read' }),
  );
  assert.equal(heldGroups(s, NOW, TZ)[0]!.key, 'menu', 'the Menu wins over any clock');
  assert.equal(heldStatus(s.nodes.get('M')!, NOW, TZ), 'on the Menu');
});

test('the group boundary is calendar days in the reader’s zone', () => {
  const s = st(
    ev('node.created', 'EDGE', { nodeKind: 'action', title: 'edge' }), clockAt('EDGE', SOON_DAYS),
    ev('node.created', 'OVER', { nodeKind: 'action', title: 'over' }), clockAt('OVER', SOON_DAYS + 1),
  );
  const where = (id: string): string =>
    heldGroups(s, NOW, TZ).find(g => g.items.some(n => n.id === id))!.key;
  assert.equal(where('EDGE'), 'soon', 'exactly a week out is still Coming up');
  assert.equal(where('OVER'), 'later', 'a day past that is Later');
});

test('a held item with no clock at all is Later, not lost', () => {
  // A `person`, not a pebble. This used a pebble as its clockless vehicle
  // because that was the handiest demand-free kind with no surface of its own —
  // and in 1.15.0 a pebble got one, so the held list excludes it the way it
  // excludes a journal entry (ADR-0065). The INVARIANT here is unchanged and is
  // not about pebbles: a held thing with no clock is filed, never dropped.
  const s = st(
    ev('node.created', 'P', { nodeKind: 'person', title: 'Ada' }),   // demand-free, legal with no clock
  );
  assert.equal(heldGroups(s, NOW, TZ)[0]!.key, 'later');
  assert.equal(heldStatus(s.nodes.get('P')!, NOW, TZ), 'held');
});

test('a malformed stored date does not throw out of the list (audit class)', () => {
  const s = st(
    ev('node.created', 'BAD', { nodeKind: 'action', title: 'corrupt' }),
    ev('clock.set', 'BAD', { clockKind: 'due', at: '2026-08-32T00:00:00.000Z', source: 'import' }),
  );
  assert.doesNotThrow(() => heldGroups(s, NOW, TZ));
  assert.doesNotThrow(() => heldStatus(s.nodes.get('BAD')!, NOW, TZ));
  assert.equal(heldGroups(s, NOW, TZ).flatMap(g => g.items).length, 1, 'and it is still shown');
});

// --- rename ----------------------------------------------------------------

test('rename changes the title, through the real gate, leaving nothing silent', () => {
  const opts = gateOptionsFor(TZ);
  let s = fold(admit([{
    id: 'c0', vault: 'personal', at: NOW, device: 'd0', seq: seq++,
    kind: 'capture.recorded', node: 'N', payload: { text: 'call dentst', source: 'quick', sourceTags: [] },
  } as AppEvent], emptyState(), opts));
  assert.equal(s.nodes.get('N')!.title, 'call dentst');

  s = fold(admit(renameEvents(ctx(), 'N', 'call the dentist'), s, opts), s);
  assert.equal(s.nodes.get('N')!.title, 'call the dentist', 'the typo is fixed');
  assert.equal(s.nodes.get('N')!.captured, true, 'and it is still the same captured item');
});

test('rename is last-writer-wins against the capture that named it', () => {
  // A stale rename arriving after a newer one must not win — the same total
  // ordering every other field uses, on the same stamped key.
  const early = ev('node.renamed', 'N', { title: 'early' }, '2026-07-01T00:00:00.000Z');
  const late = ev('node.renamed', 'N', { title: 'late' }, '2026-07-20T00:00:00.000Z');
  const create = ev('capture.recorded', 'N', { text: 'original', source: 'quick', sourceTags: [] });
  assert.equal(fold([create, early, late]).nodes.get('N')!.title, 'late', 'newest wins');
  assert.equal(fold([late, early, create]).nodes.get('N')!.title, 'late', 'in any arrival order');
  assert.equal(fold([create, late, early]).nodes.get('N')!.title, 'late', 'a stale rename never wins');
});

test('rename survives a snapshot round-trip', () => {
  let s = st(ev('capture.recorded', 'N', { text: 'typo', source: 'quick', sourceTags: [] }));
  s = fold(renameEvents(ctx(), 'N', 'fixed'), s);
  const round = deserialiseState(JSON.parse(JSON.stringify(serialiseState(s))));
  assert.equal(round.nodes.get('N')!.title, 'fixed');
});

test('an empty rename is refused rather than written', () => {
  assert.deepEqual(renameEvents(ctx(), 'N', '   '), [], 'whitespace is not a name');
  assert.deepEqual(renameEvents(ctx(), 'N', ''), [], 'and neither is nothing');
  const kept = renameEvents(ctx(), 'N', '  kept  ')[0]!;
  assert.equal((kept.payload as { title: string }).title, 'kept', 'but it trims');
});

test('node.renamed is NOT silent-risk — a title carries no coverage', async () => {
  const { isSilentRisk } = await import('../src/events.ts');
  assert.equal(isSilentRisk('node.renamed'), false,
    'declared in the vocabulary as Silent? = no, and the code agrees');
});


// --- audit fixes (Phase 3.5 adversarial pass) -------------------------------

/** The one-line property that would have caught the status/group disagreement.
 *  A card's words and the heading it sits under must describe the same thing. */
const GROUP_ALLOWS: Record<string, RegExp> = {
  unsorted: /^not sorted yet$/,
  ready: /^(ready now|today)$/,
  // Its own heading, and the row says the same words. Under "Ready now" these
  // read as ordinary work, which is the one answer a passed date has already
  // ruled out — and the replan surface directly above is asking something else
  // about the very same items (law 3).
  replan: /^needs a new plan$/,
  soon: /^(tomorrow|in \d+ days)$/,
  later: /^(held|parked until .+|back now|\w{3} \d+(, \d{4})?)$/,
  menu: /^on the Menu$/,
  done: /^done$/,
};

const at = (days: number): string => new Date(Date.parse(NOW) + days * 86_400_000).toISOString();
const clockKind = (id: string, kind: string, days: number): AppEvent =>
  ev('clock.set', id, { clockKind: kind, at: at(days), source: 't' });

test('the status a card prints always agrees with the group it is filed under', () => {
  // Two clocks on one node is what broke this: heldGroups grouped on the soonest
  // while heldStatus printed the FIRST in insertion order, so a card grouped on a
  // due date nine days out printed a review date four hundred days out.
  const cases: [string, AppEvent[]][] = [
    ['review-far + due-soon', [ev('node.created', 'A', { nodeKind: 'action', title: 'a' }),
      clockKind('A', 'review', 40), clockKind('A', 'due', 7)]],
    ['review-farther + due-nine', [ev('node.created', 'B', { nodeKind: 'action', title: 'b' }),
      clockKind('B', 'review', 400), clockKind('B', 'due', 9)]],
    ['start-passed + due-far', [ev('node.created', 'C', { nodeKind: 'action', title: 'c' }),
      clockKind('C', 'start', -5), clockKind('C', 'due', 60)]],
    ['exactly the boundary', [ev('node.created', 'D', { nodeKind: 'action', title: 'd' }),
      clockKind('D', 'due', SOON_DAYS)]],
    ['park only', [ev('node.created', 'E', { nodeKind: 'action', title: 'e' }),
      clockKind('E', 'park', 3)]],
    ['park plus a real demand', [ev('node.created', 'F', { nodeKind: 'action', title: 'f' }),
      clockKind('F', 'park', 1), clockKind('F', 'due', 2)]],
    // The invariant must cover the replan status too, or it silently stops
    // covering the one case where the group and the words are most likely to
    // disagree: a live item whose date is behind it.
    ['a hard date that went by', [ev('node.created', 'G', { nodeKind: 'action', title: 'g' }),
      clockKind('G', 'due', -4)]],
    ['a passed suspense under a far review', [ev('node.created', 'H', { nodeKind: 'action', title: 'h' }),
      clockKind('H', 'suspense', -1), clockKind('H', 'review', 30)]],
  ];
  for (const [label, events] of cases) {
    const s = st(...events);
    for (const g of heldGroups(s, NOW, TZ)) {
      for (const n of g.items) {
        const words = heldStatus(n, NOW, TZ);
        assert.match(words, GROUP_ALLOWS[g.key]!,
          `${label}: filed under "${g.title}" but the card says "${words}"`);
      }
    }
  }
});

test('the words name the SOONEST clock, not whichever was written first', () => {
  const s = st(ev('node.created', 'A', { nodeKind: 'action', title: 'a' }),
    clockKind('A', 'review', 400), clockKind('A', 'due', 9));
  const expected = new Date(at(9)).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: TZ });
  assert.equal(heldStatus(s.nodes.get('A')!, NOW, TZ), expected,
    'it names the clock that will actually bring it back');
});

test('a far-future date says which year', () => {
  const s = st(ev('node.created', 'F', { nodeKind: 'action', title: 'f' }),
    ev('clock.set', 'F', { clockKind: 'due', at: '2036-09-02T12:00:00.000Z', source: 't' }));
  assert.match(heldStatus(s.nodes.get('F')!, NOW, TZ), /2036/,
    '"Sep 1" alone is indistinguishable from this September');
});

test('a parked thing says when it comes back, rather than just "held"', () => {
  const s = st(ev('node.created', 'P', { nodeKind: 'action', title: 'p' }), clockKind('P', 'park', 3));
  const words = heldStatus(s.nodes.get('P')!, NOW, TZ);
  assert.match(words, /^parked until /, `says it is parked ("${words}")`);
  assert.equal(heldGroups(s, NOW, TZ)[0]!.key, 'later', 'and a park never makes something Ready now');
});

// --- rename hardening ------------------------------------------------------

test('a title that renders as nothing is refused - zero-width, control, combining', () => {
  // trim() strips ECMAScript whitespace only, so all of these used to sail
  // through and produce a blank, unidentifiable card (audit).
  const unusable = [
    '\u200b\u200b',
    '\u200c\u2060\u00ad',
    '\u0000\u0007',
    '\u202e\u202d',
    '\u0301\u0301',
    '   \t\n  ',
    '',
  ];
  for (const bad of unusable) {
    assert.deepEqual(renameEvents(ctx(), 'N', bad), [], `${JSON.stringify(bad)} is not a name`);
  }
  const ok = renameEvents(ctx(), 'N', '  call​ the dentist  ')[0]!;
  assert.equal((ok.payload as { title: string }).title, 'call the dentist',
    'but a real title gets through, cleaned of the invisible parts');
});

test('a title is capped, so one card cannot bury the list', () => {
  const long = renameEvents(ctx(), 'N', 'x'.repeat(10_000))[0]!;
  assert.equal((long.payload as { title: string }).title.length, TITLE_MAX);
});

test('the gate refuses a rename of a node that does not exist - even batched (audit)', () => {
  const opts = gateOptionsFor(TZ);
  const ghost = { id: 'g0', vault: 'personal', at: NOW, device: 'd0', seq: seq++,
    kind: 'node.renamed', node: 'GHOST', payload: { title: 'I was never created' } } as AppEvent;
  assert.throws(() => admit([ghost], emptyState(), opts), /does not exist/, 'alone');

  // Batched with an unrelated capture, the other event's cure used to adopt the
  // ghost and clock it, landing a node the user never created in "Ready now".
  const real = { id: 'g1', vault: 'personal', at: NOW, device: 'd0', seq: seq++,
    kind: 'capture.recorded', node: 'REAL', payload: { text: 'milk', source: 'quick', sourceTags: [] } } as AppEvent;
  assert.throws(() => admit([ghost, real], emptyState(), opts), /does not exist/, 'and batched');
});

test('a capture newer than a rename wins - the direction the first test never checked', () => {
  // ADR-0031 claimed the suite proved LWW "against the capture that named it";
  // every fold in it was rename-vs-rename. This is the missing direction.
  const ren = ev('node.renamed', 'N', { title: 'RENAME' }, '2026-07-01T00:00:00.000Z');
  const cap = ev('capture.recorded', 'N', { text: 'CAPTURE', source: 'quick', sourceTags: [] }, '2026-07-20T00:00:00.000Z');
  assert.equal(fold([ren, cap]).nodes.get('N')!.title, 'CAPTURE', 'newer capture wins');
  assert.equal(fold([cap, ren]).nodes.get('N')!.title, 'CAPTURE', 'in either arrival order');
});

test('the tick-off control matches the groups exactly — including the Menu', () => {
  // The render guard and heldGroups must agree, or a row shows a control that
  // contradicts the heading it sits under.
  const s = st(
    ev('capture.recorded', 'INBOX', { text: 'unrouted', source: 'quick', sourceTags: [] }),
    ev('node.created', 'READY', { nodeKind: 'action', title: 'ready' }), clockKind('READY', 'due', 0),
    ev('node.created', 'MENU', { nodeKind: 'action', title: 'menu' }),
    ev('menu.item.added', 'MENU', { category: 'read' }),
    ev('node.created', 'DONE', { nodeKind: 'action', title: 'done' }), clockKind('DONE', 'due', 0),
    ev('done.marked', 'DONE', { at: NOW }),
  );
  // Mirrors the guard in app.ts render().
  const tickable = (n: NodeState): boolean =>
    !n.lastDone && !n.onMenu && !(n.captured && n.route === null);
  const NO_TICK = new Set(['unsorted', 'menu', 'done']);
  for (const g of heldGroups(s, NOW, TZ)) {
    for (const n of g.items) {
      assert.equal(tickable(n), !NO_TICK.has(g.key),
        `"${g.title}" rows ${NO_TICK.has(g.key) ? 'must not' : 'must'} offer Done`);
    }
  }
});

// --- a gate cure is not a demand --------------------------------------------
//
// Noah imported 1,429 undated things from OmniFocus. The write boundary cured every
// one so none would be silent (law 1), each cure landing at the end of that day —
// and because "ready" was inferred from any arrived clock, the heading read
// **"Ready now: 1,055"** and the icon badge said 1,012. Arithmetically correct,
// and a complete falsehood about his day: he had not dated a single one.
//
// The fix is the same insight as `CALENDAR_KINDS` and the replan predicate, in a
// third place: the app must not present its own bookkeeping as somebody's
// commitment. What makes it tractable is that a cure records WHICH event it cured,
// and therefore what intent it inherited.

const cured = (id: string, cause: string, at = NOW): AppEvent[] => [
  ev('node.created', id, { nodeKind: 'action', title: id }),
  ev('clock.set', id, { clockKind: 'review', at, source: `gate:${cause}` }),
];

test('THE ONE FROM 1,429 ROWS: an undated thing is not "ready now"', () => {
  const s = st(...cured('A', 'node.created'));
  const groups = heldGroups(s, NOW, TZ);
  const where = groups.find(g => g.items.some(n => n.id === 'A'))?.key;
  assert.equal(where, 'later', `it was filed under "${where}"`);
  assert.equal(nextUpQueue(s, NOW, TZ).some(i => i.node.id === 'A'), false,
    'and it is not offered as work — nobody asked for it by today');
  assert.equal(heldNodes(s).length, 1, 'it is still held');
  assert.equal(coverageGauge(s).silent, 0, 'and still not silent — law 1 is untouched');
});

test('but a cure that inherited a DECISION still is', () => {
  // The discrimination that matters, and the one I got wrong first: a cure carries
  // the intent of the event it cured. Routing, replanning, promoting off the Menu
  // and capturing are all things somebody DID, and the cure is how that choice
  // becomes "now". Only a bare `node.created` says nothing about when.
  for (const cause of ['clarify.routed', 'replan.resolved', 'menu.item.promoted', 'capture.recorded']) {
    const s = st(...cured(`N-${cause}`, cause));
    const key = heldGroups(s, NOW, TZ).find(g => g.items.length > 0)?.key;
    assert.notEqual(key, 'later', `gate:${cause} was treated as no intent at all`);
  }
});

test('a date somebody set is unaffected', () => {
  const s = st(
    ev('node.created', 'D', { nodeKind: 'action', title: 'D' }),
    ev('clock.set', 'D', { clockKind: 'due', at: NOW, source: 'detail:due' }),
  );
  assert.equal(heldGroups(s, NOW, TZ).find(g => g.items.some(n => n.id === 'D'))?.key, 'ready');
});

test('an undated thing with a real date as well is judged on the real one', () => {
  // Both clocks present: the cure today, a due date next month. The honest reading
  // is "coming up", not "ready" — and it must still be reachable, which is what the
  // severe audit in nextup.test.ts is about.
  const s = st(
    ...cured('B', 'node.created'),
    ev('clock.set', 'B', { clockKind: 'due', at: '2026-08-30T00:00:00.000Z', source: 'detail:due' }),
  );
  const key = heldGroups(s, NOW, TZ).find(g => g.items.some(n => n.id === 'B'))?.key;
  assert.equal(key, 'later', 'filed by the date the reader chose');
  assert.equal(heldGroups(s, NOW, TZ).flatMap(g => g.items).some(n => n.id === 'B'), true,
    'and present in the inventory — work never vanishes');
});

test('the count of undated things is the number the surface can state', () => {
  const s = st(
    ...cured('A', 'node.created'),
    ...cured('B', 'node.created'),
    ev('node.created', 'D', { nodeKind: 'action', title: 'D' }),
    ev('clock.set', 'D', { clockKind: 'due', at: NOW, source: 'detail:due' }),
  );
  assert.equal(undatedCount(s, NOW, TZ), 2, 'the two nobody dated, and not the one somebody did');
});

test('THE ONE THAT WOULD HAVE BEEN MISSED: the clock source survives a snapshot', () => {
  // `state = fold(log)` with a snapshot as a cache. If the source did not round
  // trip, an undated import would read as "Later" on first load and jump to "Ready
  // now" after the next reload — a surface that changes its mind about somebody's
  // day depending on how recently they opened the app. A deliberate-failure proof
  // showed nothing in the suite covered this at all.
  const s = st(...cured('A', 'node.created'));
  const back = deserialiseState(serialiseState(s));
  assert.equal(back.nodes.get('A')!.clocks.review!.source, 'gate:node.created');
  assert.equal(heldGroups(back, NOW, TZ).find(g => g.items.some(n => n.id === 'A'))?.key, 'later',
    'and it is filed the same way after a round trip');
});

test('a log written before the source existed behaves exactly as it did', () => {
  // No source recorded means "somebody's", which errs towards showing work rather
  // than quieting it. Every log already on a device predates this field.
  const s = st(
    ev('node.created', 'O', { nodeKind: 'action', title: 'O' }),
    ev('clock.set', 'O', { clockKind: 'review', at: NOW }),
  );
  assert.equal(isAppClock(s.nodes.get('O')!.clocks.review), false);
  assert.equal(heldGroups(s, NOW, TZ).find(g => g.items.some(n => n.id === 'O'))?.key, 'ready');
});
