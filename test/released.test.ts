// Putting a thing down — the exit that is neither done nor deleted.
//
// The verb exists because law 1's guarantee has a cost: nothing goes quiet, so
// everything you hold comes back for ever until you finish it or bin it. For
// work that mattered and no longer does, both are wrong — Done is a lie in an
// append-only log, and Let it go reads as destroying something you cared about.
// So people carry it, and the reset they actually reach for is deleting the app.
//
// Most of what is pinned here is what it must NOT become: no collection, no
// count, no reason, and a way back that costs nothing.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fold, emptyState, type State } from '../src/fold.ts';
import { admit, gateOptionsFor, isSilent, silentNodes, heldNodes, releasedNodes } from '../src/gate.ts';
import { nextUpQueue } from '../src/nextup.ts';
import { searchHeld, searchReleased } from '../src/search.ts';
import { rangeChoices } from '../src/range.ts';
import { releaseEvents, reclaimEvents } from '../src/ui/detail-intents.ts';
import type { AppEvent } from '../src/events.ts';
import type { StampContext } from '../src/ui/session.ts';

const TZ = 'America/Denver';
const AGO = '2026-07-01T15:00:00.000Z';
const NOW = '2026-08-07T15:00:00.000Z';

let seq = 9000;
const ev = (kind: string, node: string | null, payload: unknown): AppEvent =>
  ({ id: `e${seq}`, vault: 'personal', at: AGO, device: 'd0', seq: seq++, kind, node, payload } as AppEvent);
const ctx = (): StampContext =>
  ({ at: AGO, device: 'd0', vault: 'personal', zone: TZ, seq: () => seq++, id: () => `s${seq++}` } as StampContext);
const write = (prior: State, offered: AppEvent[]): State =>
  fold(admit(offered, prior, gateOptionsFor(TZ)), prior);

/** One routed action with a real due date, carried and asking. */
function carried(): State {
  let s = write(emptyState(), [ev('capture.recorded', 'A', { text: 'learn the tenor recorder' })]);
  s = write(s, [ev('clarify.routed', 'A', { route: 'next-action' })]);
  return write(s, [ev('clock.set', 'A', { clockKind: 'due', at: '2026-08-06T12:00:00.000Z', source: 'detail:due' })]);
}

test('a thing put down stops coming back, and is not silent', () => {
  let s = carried();
  assert.equal(nextUpQueue(s, NOW, TZ).some(i => i.node.id === 'A'), true, 'fixture: it is being offered');

  s = write(s, releaseEvents(ctx(), 'A'));
  assert.ok(s.nodes.get('A')!.released, 'it is put down');
  assert.equal(nextUpQueue(s, NOW, TZ).some(i => i.node.id === 'A'), false, 'and no longer offered');
  // Law 1 promises nothing goes quiet BY ACCIDENT. An explicit decision is not
  // an accident, which is the same exemption a trashed node has always had.
  assert.equal(isSilent(s.nodes.get('A')!, s), false);
  assert.equal(silentNodes(s).length, 0);
});

test('it is not done and it is not deleted — the two things it must not be', () => {
  const s = write(carried(), releaseEvents(ctx(), 'A'));
  const n = s.nodes.get('A')!;
  assert.equal(n.lastDone, null, 'nothing was marked done — that would be a lie in an append-only log');
  assert.equal(n.trashed, false, 'and nothing was binned');
  assert.equal(n.onMenu, null, 'nor quietly turned into a wish, which is a different decision');
  assert.ok(n.clocks['due'], 'its date is untouched — putting a thing down edits nothing about it');
});

test('there is no collection and no count anywhere', () => {
  // The whole shape of the verb. `heldNodes` excluding these is the one
  // mechanism: every surface, range and gauge reads through it.
  let s = carried();
  s = write(s, [ev('capture.recorded', 'B', { text: 'still carrying this one' })]);
  s = write(s, [ev('clarify.routed', 'B', { route: 'next-action' })]);
  s = write(s, releaseEvents(ctx(), 'A'));

  assert.deepEqual(heldNodes(s).map(n => n.id).sort(), ['B'],
    'what you are holding does not include it');
  assert.equal(rangeChoices(() => s, () => NOW, TZ).some(c => c.items().some(n => n.id === 'A')), false,
    'and no range can reach it — a range is a way to act on a batch, and this is not in any batch');
  assert.equal(searchHeld(s, 'recorder').total, 0,
    'search over what you are HOLDING does not answer with it');
});

test('but it is reachable by name, which is what makes putting it down cheap', () => {
  // An exit people will not use is not an exit. The reversibility is the
  // mechanism, not a courtesy.
  const s = write(carried(), releaseEvents(ctx(), 'A'));
  const found = searchReleased(s, 'recorder');
  assert.equal(found.total, 1);
  assert.equal(found.items[0]?.id, 'A');
  // It answers a query you TYPED. A blank query returns nothing, so nothing
  // volunteers a list of what you stopped carrying.
  assert.equal(searchReleased(s, '').total, 0,
    'a blank query lists nothing — there is no browsing this');
});

test('picking it back up returns it with a clock of its own', () => {
  let s = write(carried(), releaseEvents(ctx(), 'A'));
  s = write(s, reclaimEvents(ctx(), 'A'));
  const n = s.nodes.get('A')!;
  assert.equal(n.released, null);
  assert.equal(heldNodes(s).some(x => x.id === 'A'), true, 'held again');
  assert.ok(Object.keys(n.clocks).length > 0, 'and it is asking again rather than sitting silent');
  assert.equal(silentNodes(s).length, 0);
});

test('putting a PLACE down does not silently take its contents with it', () => {
  // The reason this is a silent-risk kind at all. A put-down ancestor confers no
  // coverage — it is not coming back on its own — so a child riding only its
  // parent's clock would go silent at a distance, with nothing in the event
  // naming the child.
  let s = write(emptyState(), [ev('node.created', 'P', { nodeKind: 'project', title: 'the loft' })]);
  s = write(s, [ev('clock.set', 'P', { clockKind: 'review', at: AGO, source: 't' })]);
  s = write(s, [ev('node.created', 'C', { nodeKind: 'action', title: 'measure the hatch', parent: 'P' })]);
  for (const kind of Object.keys(s.nodes.get('C')!.clocks)) {
    s = write(s, [ev('clock.cleared', 'C', { clockKind: kind })]);
  }
  assert.deepEqual(Object.keys(s.nodes.get('C')!.clocks), [],
    'fixture: the child rides its parent and nothing else');

  s = write(s, releaseEvents(ctx(), 'P'));
  assert.equal(silentNodes(s).length, 0, 'nothing went quiet');
  assert.ok(Object.keys(s.nodes.get('C')!.clocks).length > 0,
    'the child came back with a clock of its own rather than disappearing with the place');
  assert.equal(s.nodes.get('C')!.released, null,
    'and it was NOT put down itself — that is a decision about each thing, not a sweep');
});

test('two devices converge on whichever act happened later', () => {
  const base = carried();
  const down = { ...ev('node.released', 'A', { at: AGO }), at: '2026-07-02T10:00:00.000Z', device: 'd1', seq: 1 } as AppEvent;
  const up = { ...ev('node.reclaimed', 'A', {}), at: '2026-07-03T10:00:00.000Z', device: 'd2', seq: 1 } as AppEvent;
  assert.equal(fold([down, up], base).nodes.get('A')!.released, null);
  assert.equal(fold([up, down], base).nodes.get('A')!.released, null,
    'arrival order cannot decide it — per-field LWW, the notNow and pebble precedent');
});

test('no reason is asked for, and there is nowhere to record one', () => {
  // Being made to justify stopping is the friction that sends people back to
  // carrying a thing, and a reason field would collect exactly the regret this
  // verb exists to avoid.
  const out = releaseEvents(ctx(), 'A');
  assert.equal(out.length, 1);
  assert.deepEqual(Object.keys(out[0]!.payload as object), ['at'],
    'the payload carries WHEN and nothing else — no reason, no category, no note');
});

test('the exemption itself: a put-down thing with NO other coverage is not silent', () => {
  // ASKED OF `isSilent` DIRECTLY, over a constructed state. The ordinary fixture
  // keeps its due date, so clause (b) covers it and removing the exemption
  // changes nothing — a plant proved exactly that, and a guarantee whose plant
  // stays green is not being tested.
  //
  // This is the state the exemption is FOR: nothing on it at all except the
  // decision to stop carrying it.
  const s = write(carried(), releaseEvents(ctx(), 'A'));
  const bare: State = { ...s, nodes: new Map(s.nodes) };
  bare.nodes.set('A', { ...s.nodes.get('A')!, clocks: {}, onMenu: null, parent: null });
  assert.ok(bare.nodes.get('A')!.released, 'fixture: put down');
  assert.deepEqual(Object.keys(bare.nodes.get('A')!.clocks), [], 'fixture: and nothing else covers it');
  assert.equal(isSilent(bare.nodes.get('A')!, bare), false,
    'an explicit decision is not a silence — the same exemption a trashed node has always had');
  assert.equal(silentNodes(bare).length, 0);
});

test('the released list exists in code and is never a surface', () => {
  // `releasedNodes` is the visible complement of `heldNodes` and is used by
  // search. If a surface ever renders it whole, that is the browsable collection
  // this verb was designed without.
  const s = write(carried(), releaseEvents(ctx(), 'A'));
  assert.deepEqual(releasedNodes(s).map(n => n.id), ['A']);
});
