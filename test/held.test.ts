// Phase 3.5: the held list as a todo list, and rename.
//
// The load-bearing property is TOTALITY: every held node lands in exactly one
// group, and the groups sum to the same number the coverage gauge claims. A list
// that quietly drops an item is the worst failure this surface can have — it
// would mean something you are holding is not shown anywhere.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fold, emptyState, type State } from '../src/fold.ts';
import { heldNodes, coverageGauge, admit, gateOptionsFor } from '../src/gate.ts';
import { heldGroups, heldStatus, SOON_DAYS } from '../src/held.ts';
import { serialiseState, deserialiseState } from '../src/snapshot.ts';
import { renameEvents } from '../src/ui/detail-intents.ts';
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
  const s = st(
    ev('node.created', 'P', { nodeKind: 'pebble', title: 'a pebble' }),   // demand-free, legal with no clock
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
