// Sort mode's foundations (1.3.0): named ranges, range hygiene, route parity,
// the defer verb's cure, and the inbox boundary.
//
// The four load-bearing claims, each with teeth:
//  - HYGIENE: no person, bother, container, demand-free kind, Menu item, or
//    finished thing can enter a sort range — an over-broad predicate offers
//    routes the gate must then refuse, the recorded anti-pattern.
//  - PARITY: routing an imported (never-captured) item writes the same facts
//    the daily triage writes for a captured one — sort mode is the same
//    conveyor, not a second dialect.
//  - THE INBOX BOUNDARY: sort mode changes NOTHING about what daily triage
//    counts. The gauge stays captures-only, or law 8 acquires a permanent
//    1,222 headline by omission.
//  - THE CURE: clearing the only clock (a start) through the gate re-covers
//    the node in the same transaction.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fold, emptyState, type State } from '../src/fold.ts';
import { admit, silentNodes, gateOptionsFor } from '../src/gate.ts';
import {
  sortable, looseFromImport, underContainer, parkedAndBack, matchingQuery, rangeChoices,
} from '../src/range.ts';
import { unclarified, needsHeat, inboxGauge } from '../src/triage.ts';
import { demandClocksOf, routeEvents, undoRouteEvents } from '../src/ui/triage-intents.ts';
import { setStartEvents, clearStartEvents, setDueEvents } from '../src/ui/detail-intents.ts';
import { heldStatus } from '../src/held.ts';
import type { AppEvent, ClarifyRoute } from '../src/events.ts';
import type { StampContext } from '../src/ui/session.ts';

const TZ = 'America/Denver';                     // never UTC (V-13)
const NOW = '2026-07-29T18:00:00.000Z';
const OPTS = gateOptionsFor(TZ);

let seq = 0;
const ev = (kind: string, node: string | null, payload: unknown, at = NOW): AppEvent =>
  ({ id: `e${seq}`, vault: 'personal', at, device: 'd0', seq: seq++, kind, node, payload } as AppEvent);
const ctx = (): StampContext => ({
  at: NOW, device: 'd0', vault: 'personal', zone: TZ,
  seq: () => seq++, id: () => `i${seq}`,
});
const write = (prior: State, offered: AppEvent[]): State =>
  fold(admit(offered, prior, OPTS), prior);

/** An IMPORTED row: node.created, cured by the gate — never captured. */
const imported = (prior: State, id: string, title: string, parent?: string): State =>
  write(prior, [ev('node.created', id, {
    nodeKind: 'action', title, provenance: { for: 'self' }, ...(parent ? { parent } : {}),
  })]);

const captured = (prior: State, id: string, text: string): State =>
  write(prior, [ev('capture.recorded', id, { text, source: 'quick', sourceTags: [] })]);

/** A state holding one of everything a range must and must not reach. */
function menagerie(): State {
  let s = emptyState();
  s = write(s, [ev('node.created', 'PROJ', { nodeKind: 'project', title: 'Boy Scouts' })]);
  s = imported(s, 'LOOSE1', 'loose imported one');
  s = imported(s, 'LOOSE2', 'loose imported two');
  s = imported(s, 'FILED', 'filed imported', 'PROJ');
  s = captured(s, 'CAP', 'a typed capture');
  s = write(s, [ev('person.created', 'PER', { name: 'Ada' })]);
  s = write(s, [ev('bother.received', 'BOTH', { text: 'the thing with the roof' })]);
  s = write(s, [ev('node.created', 'ASP', { nodeKind: 'aspiration', title: 'a wish' }),
    ev('menu.item.added', 'ASP', { category: 'try' })]);
  s = write(s, [ev('node.created', 'ONMENU', { nodeKind: 'action', title: 'somedayed' }),
    ev('menu.item.added', 'ONMENU', { category: 'read' })]);
  s = write(s, [ev('node.created', 'DONE', { nodeKind: 'action', title: 'finished' }),
    ev('done.marked', 'DONE', { at: NOW })]);
  s = write(s, [ev('node.created', 'GONE', { nodeKind: 'action', title: 'let go' }),
    ev('node.trashed', 'GONE', { reason: 't' })]);
  return s;
}

// --- hygiene -----------------------------------------------------------------

test('HYGIENE: no RUNWAY range can hold a person, bother, container, Menu item, or finished thing', () => {
  const s = menagerie();
  const runway = [
    ...looseFromImport(s),
    ...underContainer(s, 'PROJ'),
    ...parkedAndBack(s, NOW),
    ...matchingQuery(s, 'a'),           // matches almost every title above
    ...rangeChoices(() => s, () => NOW)
      .filter(c => c.family === 'runway').flatMap(c => c.items()),
  ];
  for (const n of runway) {
    assert.ok(sortable(n), `${n.id} entered a range without being sortable`);
    assert.ok(!['person', 'bother', 'project', 'aspiration', 'pebble'].includes(n.kind),
      `${n.id} (${n.kind}) must never see a route button`);
    assert.equal(n.onMenu, null, `${n.id} is on the Menu — a route would mint Menu-plus-clock`);
    assert.equal(n.lastDone, null, `${n.id} is finished — sorting it re-opens a record`);
    assert.ok(!n.trashed && !n.mergedInto, `${n.id} is gone and must stay gone`);
  }
  // The proof has teeth only if the menagerie actually contains the dangers:
  assert.ok(s.nodes.get('PER') && s.nodes.get('BOTH') && s.nodes.get('ASP')?.onMenu
    && s.nodes.get('ONMENU')?.onMenu && s.nodes.get('DONE')?.lastDone, 'fixture intact');
});

test('HYGIENE: a MENU range holds only live Menu items of its own category — and only menu ranges hold them (1.5.0)', () => {
  const s = menagerie();
  const choices = rangeChoices(() => s, () => NOW);
  const menu = choices.filter(c => c.family === 'menu');
  assert.ok(menu.length >= 2, 'the menagerie holds two categories (read, try)');
  for (const c of menu) {
    const cat = c.key.replace(/^menu:/, '');
    for (const n of c.items()) {
      assert.equal(n.onMenu, cat, `${n.id} is not on the Menu as ${cat}`);
      assert.ok(!n.trashed && !n.mergedInto && !n.lastDone,
        `${n.id} is gone or finished and must not be offered`);
    }
  }
  // The family split is total: every choice declares one, and no runway
  // choice leaks a Menu item (the belt above already proves the converse).
  for (const c of choices) assert.ok(c.family === 'runway' || c.family === 'menu');
});

test('the loose-import range holds exactly the unfiled, unrouted, never-captured rows', () => {
  const s = menagerie();
  assert.deepEqual(looseFromImport(s).map(n => n.id).sort(), ['LOOSE1', 'LOOSE2'],
    'not the filed one, not the capture, not the menagerie');
});

test('under-a-container is transitive and survives a cycle in bad data', () => {
  let s = menagerie();
  s = write(s, [ev('node.created', 'SUB', { nodeKind: 'project', title: 'a sub-project', parent: 'PROJ' })]);
  s = imported(s, 'DEEP', 'deep child', 'SUB');
  assert.deepEqual(underContainer(s, 'PROJ').map(n => n.id).sort(), ['DEEP', 'FILED'],
    'the grandchild is found; the sub-container itself is not offered for routing');
  // A cycle folded from a hostile shard must not hang the walk. Raw fold, not
  // the gate — the gate refuses cycles, which is exactly why the walk must
  // still survive data that arrived around it.
  const cyclic = fold([
    ev('node.parented', 'PROJ', { parent: 'SUB' }),
  ], s);
  assert.ok(Array.isArray(underContainer(cyclic, 'PROJ')), 'bounded, no hang');
});

test('parked-and-back holds only a PASSED park', () => {
  let s = menagerie();
  s = write(s, [ev('park.set', 'LOOSE1', { returnAt: '2026-07-28T12:00:00.000Z' })]);   // passed
  s = write(s, [ev('park.set', 'LOOSE2', { returnAt: '2026-08-09T12:00:00.000Z' })]);   // future
  assert.deepEqual(parkedAndBack(s, NOW).map(n => n.id), ['LOOSE1'],
    'the future park stays held away — that is what a park is');
});

// --- parity ------------------------------------------------------------------

const ROUTES: ClarifyRoute[] = ['do-now', 'next-action', 'waiting-for', 'someday', 'reference', 'trash'];

for (const route of ROUTES) {
  test(`PARITY: routing an imported item via "${route}" writes the same facts as a captured one`, () => {
    let s = emptyState();
    s = imported(s, 'IMP', 'imported row');
    s = captured(s, 'CAPT', 'typed row');
    const impKind = s.nodes.get('IMP')!.kind;
    const capKind = s.nodes.get('CAPT')!.kind;
    s = write(s, routeEvents(ctx(), 'IMP', route, impKind));
    s = write(s, routeEvents(ctx(), 'CAPT', route, capKind));
    const a = s.nodes.get('IMP')!, b = s.nodes.get('CAPT')!;
    assert.equal(a.route, b.route, 'same recorded route');
    assert.equal(a.kind, b.kind, 'same resulting kind');
    assert.equal(a.onMenu, b.onMenu, 'same Menu placement');
    assert.equal(a.trashed, b.trashed, 'same trash outcome');
    if (route === 'do-now' || route === 'next-action' || route === 'waiting-for') {
      // These routes WRITE a clock, and it must be the same clock from either
      // door — the conveyor is the same conveyor.
      assert.equal(a.clocks.review?.source, b.clocks.review?.source,
        `same route clock source (got ${a.clocks.review?.source} vs ${b.clocks.review?.source})`);
      assert.match(a.clocks.review?.source ?? '', /^clarify:/, 'and it is the route speaking, not a cure');
    } else {
      // someday/reference/trash write no clock; what remains is each item's
      // GENESIS cure, and those honestly differ by origin — an import was
      // cured at node.created, a capture at capture.recorded. Same route
      // facts, truthful provenance: asserted so the difference stays a
      // decision rather than drifting into an accident.
      assert.equal(a.clocks.review?.source, 'gate:node.created');
      assert.equal(b.clocks.review?.source, 'gate:capture.recorded');
    }
    assert.equal(silentNodes(s).length, 0, 'and nothing is silent either way');
  });
}

test('undo works identically on an imported item: back to the range, not the inbox', () => {
  let s = emptyState();
  s = imported(s, 'IMP', 'imported row');
  const kind = s.nodes.get('IMP')!.kind;
  s = write(s, routeEvents(ctx(), 'IMP', 'next-action', kind));
  assert.equal(looseFromImport(s).length, 0, 'routed away, the range shrank');
  s = write(s, undoRouteEvents(ctx(), 'IMP', 'next-action', kind));
  assert.deepEqual(looseFromImport(s).map(n => n.id), ['IMP'],
    'undo returns it to the named range it came from');
  assert.equal(unclarified(s).length, 0,
    'and NOT to the daily inbox — it was never captured, and undo does not forge that');
});

// --- the inbox boundary ------------------------------------------------------

test('THE BOUNDARY: imported rows never appear in daily triage, its gauge, or the heat queue', () => {
  const s = menagerie();
  assert.deepEqual(unclarified(s).map(n => n.id), ['CAP'], 'the one capture, nothing imported');
  assert.deepEqual(needsHeat(s).map(n => n.id), ['CAP']);
  assert.equal(inboxGauge(s).unclarified, 1,
    'the gauge counts captures only — a 1,222-row import must never become a daily headline (law 8)');
});

// --- the defer verb ----------------------------------------------------------

test('the start clock: set groups it "not before", clearing it is CURED in the same transaction', () => {
  let s = emptyState();
  s = imported(s, 'D', 'deferred thing');
  s = write(s, setStartEvents(ctx(), 'D', '2026-08-04'));
  const n = s.nodes.get('D')!;
  assert.ok(n.clocks.start, 'the start clock landed');
  assert.match(heldStatus(n, NOW, TZ), /^not before /, 'the status names the kind of date it is');

  // Clear it. clock.cleared is silent-risk; if the start was all that covered
  // it beyond the import cure, the gate must re-cover it in the same commit.
  s = write(s, clearStartEvents(ctx(), 'D'));
  const after = s.nodes.get('D')!;
  assert.equal(after.clocks.start, undefined, 'cleared');
  assert.equal(silentNodes(s).length, 0, 'and nothing went silent — the cure fired');
});

// --- a Menu landing sheds every demand clock (1.3.1) -------------------------

for (const route of ['someday', 'reference'] as ClarifyRoute[]) {
  test(`"${route}" on a dated item sheds its demand clocks in the same batch`, () => {
    // The audit's most severe finding: a due-dated item routed to Someday kept
    // its date invisibly forever — the Menu group wins every surface, no
    // replan card raises, the sheet hides temporal controls. A wish carries no
    // demands; the route clears what the node carries, visibly, in the log.
    let s = emptyState();
    s = imported(s, 'DATED', 'a due-dated import');
    s = write(s, setDueEvents(ctx(), 'DATED', '2026-08-09'));
    s = imported(s, 'PARKED', 'a parked import');
    s = write(s, [ev('park.set', 'PARKED', { returnAt: '2026-08-09T12:00:00.000Z' })]);
    for (const id of ['DATED', 'PARKED'] as const) {
      const n = s.nodes.get(id)!;
      s = write(s, routeEvents(ctx(), id, route, n.kind, demandClocksOf(n)));
      const after = s.nodes.get(id)!;
      assert.ok(after.onMenu, `${id} landed on the Menu`);
      for (const k of ['due', 'start', 'suspense', 'park'] as const) {
        assert.equal(after.clocks[k], undefined, `${id} still carries a ${k} clock`);
      }
    }
    assert.equal(silentNodes(s).length, 0, 'covered by the Menu, silent nowhere');
  });
}

test('demandClocksOf names exactly what the node carries — never an unconditional clear', () => {
  let s = emptyState();
  s = imported(s, 'D', 'dated');
  s = write(s, setStartEvents(ctx(), 'D', '2026-08-04'));
  assert.deepEqual(demandClocksOf(s.nodes.get('D')), ['start'],
    'the start it carries, not the due it does not — the log must not claim changes that did not happen');
  assert.deepEqual(demandClocksOf(undefined), [], 'a missing node carries nothing');
});

// --- the wording when both kinds of date share a day (1.3.1) -----------------

test('a due date at the same instant as the start keeps the DEADLINE wording', () => {
  // "Not before" describes a door opening; with a due date on the same day the
  // louder fact is the obligation, and describing it as pure deferral is a
  // claim the data does not support (audit).
  let s = emptyState();
  s = imported(s, 'B', 'both dates, one day');
  s = write(s, setStartEvents(ctx(), 'B', '2026-08-04'));
  s = write(s, setDueEvents(ctx(), 'B', '2026-08-04'));
  const words = heldStatus(s.nodes.get('B')!, NOW, TZ);
  assert.ok(!/^not before /.test(words), `an obligation must not read as a door opening (got "${words}")`);
  assert.match(words, /^in \d+ days$/, 'the generic demand words, naming the due clock');
});

test('a PASSED start raises no replan card and reads ready', () => {
  let s = emptyState();
  s = imported(s, 'D', 'deferred thing');
  s = write(s, setStartEvents(ctx(), 'D', '2026-07-25'));   // four days behind NOW
  const n = s.nodes.get('D')!;
  const words = heldStatus(n, NOW, TZ);
  assert.equal(words, 'ready now', `a passed start OPENS the thing (got "${words}")`);
});
