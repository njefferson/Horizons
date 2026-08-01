// Wholesale acts (1.5.0, ADR-0049): byte-parity with the single intents, the
// preview's honesty, the per-chunk fresh check, and undo that restores what it
// can and says what it cannot.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  bulkItemEvents, eligible, planBulk, runBulk, undoBulk, verbsFor, rangeActedEvent,
  CHUNK_EVENT_TARGET,
} from '../src/ui/bulk-intents.ts';
import { parentEvents, toMenuEvents, promoteFromMenuEvents } from '../src/ui/detail-intents.ts';
import { demandClocksOf, routeEvents } from '../src/ui/triage-intents.ts';
import { openSession } from '../src/ui/session.ts';
import { MemoryLogStore } from '../src/log-store.ts';
import { fold, emptyState, type State } from '../src/fold.ts';
import { admit, gateOptionsFor, silentNodes, trashedNodes } from '../src/gate.ts';
import type { AppEvent } from '../src/events.ts';
import type { Session, StampContext } from '../src/ui/session.ts';

const TZ = 'America/Denver';
const NOW = '2026-07-29T18:00:00.000Z';
const OPTS = gateOptionsFor(TZ);

let seq = 0;
const ev = (kind: string, node: string | null, payload: unknown): AppEvent =>
  ({ id: `e${seq}`, vault: 'personal', at: NOW, device: 'd0', seq: seq++, kind, node, payload } as AppEvent);
const ctx = (): StampContext => ({
  at: NOW, device: 'd0', vault: 'personal', zone: TZ,
  seq: () => seq++, id: () => `i${seq}`,
});
const write = (prior: State, offered: AppEvent[]): State =>
  fold(admit(offered, prior, OPTS), prior);

const imported = (prior: State, id: string, title: string, parent?: string): State =>
  write(prior, [ev('node.created', id, {
    nodeKind: 'action', title, provenance: { for: 'self' }, ...(parent ? { parent } : {}),
  })]);

/** Strip the stamps that legitimately differ between two builders. */
const facts = (events: AppEvent[]): unknown[] =>
  events.map(e => ({ kind: e.kind, node: e.node, payload: e.payload }));

const tick = (() => { let t = 1_753_000_000_000; return () => t += 7; })();

async function seededSession(rows: number): Promise<{ session: Session; ids: string[] }> {
  const store = new MemoryLogStore();
  const session = await openSession(tick, 'personal', 'test', store, TZ);
  const ids: string[] = [];
  await session.commit(c => {
    const out: AppEvent[] = [];
    for (let i = 0; i < rows; i++) {
      const id = c.id();
      ids.push(id);
      out.push({
        id, vault: c.vault, at: c.at, device: c.device, seq: c.seq(),
        kind: 'node.created', node: id,
        payload: { nodeKind: 'action', title: `row ${i}`, provenance: { for: 'self' } },
      } as AppEvent);
    }
    return out;
  });
  return { session, ids };
}

// --- byte-parity with the single intents -------------------------------------

test('PARITY: put-under writes exactly what the single filing writes', () => {
  let s = emptyState();
  s = write(s, [ev('node.created', 'P', { nodeKind: 'project', title: 'p' })]);
  s = imported(s, 'A', 'a thing');
  s = write(s, [ev('node.parented', 'A', { parent: 'OLD-NOPE' })].slice(0, 0)); // no-op keeps s
  const n = s.nodes.get('A')!;
  assert.deepEqual(
    facts(bulkItemEvents(ctx(), 'put-under', n, { parent: 'P' })),
    facts(parentEvents(ctx(), 'A', 'P', n.parent)),
    'the bulk filing is the single filing, once per item');
});

test('PARITY: to-menu writes the someday route\'s Menu-first-then-shed shape', () => {
  let s = emptyState();
  s = imported(s, 'A', 'a dated thing');
  s = write(s, [ev('clock.set', 'A', { clockKind: 'due', at: '2026-08-09T12:00:00.000Z', source: 't' })]);
  const n = s.nodes.get('A')!;
  const bulk = facts(bulkItemEvents(ctx(), 'to-menu', n, { category: 'read' }));
  const single = facts([
    ...toMenuEvents(ctx(), 'A', 'read'),
    ...demandClocksOf(n).map(k => ev('clock.cleared', 'A', { clockKind: k })),
  ]);
  assert.deepEqual(bulk, single, 'Menu first, then every demand clock shed — the belt shape');
  // And the same facts the someday ROUTE writes, minus its clarify.routed:
  const route = facts(routeEvents(ctx(), 'A', 'someday', n.kind, demandClocksOf(n)))
    .filter(f => (f as { kind: string }).kind !== 'clarify.routed');
  assert.deepEqual(bulk, route, 'one dialect, not two');
});

test('PARITY: bring-back writes exactly what the single promotion writes', () => {
  let s = emptyState();
  s = imported(s, 'A', 'a wish');
  s = write(s, [ev('menu.item.added', 'A', { category: 'read' })]);
  const n = s.nodes.get('A')!;
  assert.deepEqual(
    facts(bulkItemEvents(ctx(), 'bring-back', n, {})),
    facts(promoteFromMenuEvents(ctx(), 'A')),
    'the bulk promotion is the single promotion');
});

// --- eligibility and the preview's honesty -----------------------------------

test('eligibility refuses what the gate would refuse — cycles, self, the already-there', () => {
  let s = emptyState();
  s = write(s, [ev('node.created', 'P', { nodeKind: 'project', title: 'p' })]);
  s = write(s, [ev('node.created', 'SUB', { nodeKind: 'project', title: 'sub', parent: 'P' })]);
  s = imported(s, 'A', 'already filed', 'P');
  assert.equal(eligible('put-under', s.nodes.get('P'), s, { parent: 'SUB' }), false,
    'a container cannot go under its own child (cycle)');
  assert.equal(eligible('put-under', s.nodes.get('A'), s, { parent: 'P' }), false,
    'already there — an event would be a claim about a change that did not happen');
  assert.equal(eligible('put-under', s.nodes.get('A'), s, { parent: 'A' }), false, 'never itself');
  assert.equal(eligible('bring-back', s.nodes.get('A'), s, {}), false,
    'bring-back needs a Menu item');
});

test('the preview counts equal the plan, and the plan admits clean (preview == admitted == written)', async () => {
  const { session, ids } = await seededSession(7);
  const st = session.state();
  const items = ids.map(id => st.nodes.get(id)!);
  await session.commit(c => [{
    id: c.id(), vault: c.vault, at: c.at, device: c.device, seq: c.seq(),
    kind: 'node.created', node: 'TARGET',
    payload: { nodeKind: 'project', title: 'the pile', provenance: { for: 'self' } },
  } as AppEvent]);
  const plan = planBulk(session.state(), items, 'put-under', { parent: 'TARGET' }, 'seven rows under the pile');
  assert.equal(plan.eligibleNow, 7);
  assert.equal(plan.ineligibleNow, 0);
  const receipt = await runBulk(session, plan);
  assert.equal(receipt.done, 7, 'written = planned');
  assert.equal(receipt.skipped, 0);
  assert.equal(receipt.failed, null);
  const after = session.state();
  for (const id of ids) assert.equal(after.nodes.get(id)!.parent, 'TARGET');
  assert.equal(silentNodes(after).length, 0, 'the gate held throughout');
  // The receipt noun landed FIRST in the chunk, with the sentence verbatim.
  const all = await session.store.all();
  const acted = all.filter(e => e.kind === 'range.acted');
  assert.equal(acted.length, 1);
  assert.equal((acted[0]!.payload as { scope: string }).scope, 'seven rows under the pile');
  assert.equal((acted[0]!.payload as { count: number }).count, 7);
  const actedAt = all.findIndex(e => e.kind === 'range.acted');
  const firstParented = all.findIndex(e => e.kind === 'node.parented');
  assert.ok(actedAt < firstParented, 'the receipt precedes what it explains');
});

// --- the per-chunk fresh check ----------------------------------------------

test('FRESH CHECK: an item that changed between plan and run is skipped and counted, never re-acted on', async () => {
  const { session, ids } = await seededSession(4);
  await session.commit(c => [{
    id: c.id(), vault: c.vault, at: c.at, device: c.device, seq: c.seq(),
    kind: 'node.created', node: 'TARGET',
    payload: { nodeKind: 'project', title: 'pile', provenance: { for: 'self' } },
  } as AppEvent]);
  const st = session.state();
  const items = ids.map(id => st.nodes.get(id)!);
  const plan = planBulk(st, items, 'put-under', { parent: 'TARGET' }, 'four rows');
  // The world moves after the plan: one row is trashed from another surface.
  await session.commit(c => [{
    id: c.id(), vault: c.vault, at: c.at, device: c.device, seq: c.seq(),
    kind: 'node.trashed', node: ids[1]!, payload: { reason: 'detail' },
  } as AppEvent]);
  const receipt = await runBulk(session, plan);
  assert.equal(receipt.done, 3, 'the three still eligible landed');
  assert.equal(receipt.skipped, 1, 'the moved-on one was skipped AND counted');
  assert.equal(session.state().nodes.get(ids[1]!)!.parent, null,
    'and it was not filed — a stale write is worse than a smaller count');
});

// --- chunking ----------------------------------------------------------------

test('a big act chunks, each chunk led by its own receipt, all of it landing', async () => {
  const rows = 260;                     // > CHUNK_EVENT_TARGET/2 puts this at 2+ chunks
  const { session, ids } = await seededSession(rows);
  await session.commit(c => [{
    id: c.id(), vault: c.vault, at: c.at, device: c.device, seq: c.seq(),
    kind: 'node.created', node: 'TARGET',
    payload: { nodeKind: 'project', title: 'pile', provenance: { for: 'self' } },
  } as AppEvent]);
  const st = session.state();
  const plan = planBulk(st, ids.map(id => st.nodes.get(id)!), 'put-under', { parent: 'TARGET' }, 'the big pile');
  const progress: number[] = [];
  const receipt = await runBulk(session, plan, done => progress.push(done));
  assert.equal(receipt.done, rows);
  assert.ok(receipt.chunks >= 2, `chunked (${receipt.chunks} chunks)`);
  assert.equal(progress[progress.length - 1], rows, 'progress reported the receipt-truth');
  const all = await session.store.all();
  const acted = all.filter(e => e.kind === 'range.acted');
  assert.equal(acted.length, receipt.chunks, 'one receipt per chunk');
  assert.equal(acted.reduce((n, e) => n + (e.payload as { count: number }).count, 0), rows,
    'the receipts sum to the act');
  assert.ok(CHUNK_EVENT_TARGET >= 100, 'the target stays a real chunk, not a degenerate one');
});

// --- undo ---------------------------------------------------------------------

test('UNDO: filing is reversed to the EXACT prior parent, not merely unparented', async () => {
  const { session, ids } = await seededSession(2);
  await session.commit(c => ['OLD', 'TARGET'].map(id => ({
    id: c.id(), vault: c.vault, at: c.at, device: c.device, seq: c.seq(),
    kind: 'node.created', node: id,
    payload: { nodeKind: 'project', title: id, provenance: { for: 'self' } },
  } as AppEvent)));
  // One row already lives somewhere; the other is loose.
  await session.commit(c => [{
    id: c.id(), vault: c.vault, at: c.at, device: c.device, seq: c.seq(),
    kind: 'node.parented', node: ids[0]!, payload: { parent: 'OLD' },
  } as AppEvent]);
  const st = session.state();
  const plan = planBulk(st, ids.map(id => st.nodes.get(id)!), 'put-under', { parent: 'TARGET' }, 'two rows');
  const receipt = await runBulk(session, plan);
  assert.equal(receipt.done, 2);
  const undone = await undoBulk(session, receipt);
  assert.equal(undone.done, 2);
  const after = session.state();
  assert.equal(after.nodes.get(ids[0]!)!.parent, 'OLD', 'restored to where it really was');
  assert.equal(after.nodes.get(ids[1]!)!.parent, null, 'and the loose one is loose again');
  assert.equal(silentNodes(after).length, 0);
});

test('UNDO: let-go comes back untrashed and covered; to-menu comes back off the Menu', async () => {
  const { session, ids } = await seededSession(3);
  const st = session.state();
  const plan = planBulk(st, ids.map(id => st.nodes.get(id)!), 'let-go', {}, 'three rows let go');
  const receipt = await runBulk(session, plan);
  assert.equal(receipt.done, 3);
  assert.equal(trashedNodes(session.state()).length, 3, 'the trash view sees them');
  const undone = await undoBulk(session, receipt);
  assert.equal(undone.done, 3);
  const after = session.state();
  for (const id of ids) {
    const n = after.nodes.get(id)!;
    assert.equal(n.trashed, false);
    assert.ok(Object.keys(n.clocks).length > 0, `${id} came back covered — the gate re-cured`);
  }

  // to-menu round trip, on the same store.
  const st2 = session.state();
  const plan2 = planBulk(st2, ids.map(id => st2.nodes.get(id)!), 'to-menu', { category: 'read' }, 'three to the Menu');
  const r2 = await runBulk(session, plan2);
  assert.equal(r2.done, 3);
  for (const id of ids) assert.equal(session.state().nodes.get(id)!.onMenu, 'read');
  const u2 = await undoBulk(session, r2);
  assert.equal(u2.done, 3);
  for (const id of ids) {
    const n = session.state().nodes.get(id)!;
    assert.equal(n.onMenu, null, 'off the Menu again');
    assert.ok(Object.keys(n.clocks).length > 0, 'and covered');
  }
  assert.equal(silentNodes(session.state()).length, 0);
});

test('UNDO: an item that moved on since the act is left as it is, and counted', async () => {
  const { session, ids } = await seededSession(2);
  const st = session.state();
  const plan = planBulk(st, ids.map(id => st.nodes.get(id)!), 'let-go', {}, 'two let go');
  const receipt = await runBulk(session, plan);
  // Somebody rescues one by hand before the bulk undo runs.
  await session.commit(c => [{
    id: c.id(), vault: c.vault, at: c.at, device: c.device, seq: c.seq(),
    kind: 'node.untrashed', node: ids[0]!, payload: {},
  } as AppEvent]);
  const undone = await undoBulk(session, receipt);
  assert.equal(undone.done, 1, 'only the still-trashed one is restored by the undo');
  assert.equal(undone.skipped, 1, 'the rescued one is counted, not double-written');
});

// --- the verbs a family may face ---------------------------------------------

test('verb legality is computed per family — Menu ranges get promote semantics, never a clock', () => {
  assert.deepEqual(verbsFor('runway'), ['put-under', 'to-menu', 'park', 'let-go']);
  assert.deepEqual(verbsFor('menu'), ['bring-back', 'let-go'],
    'no park, no date, no filing on a wish — Menu-plus-demand-clock is the state the belt refuses');
});

test('the receipt noun is well-formed and admits', () => {
  const e = rangeActedEvent(ctx(), 'the sentence shown', 'put-under', 12);
  assert.equal(e.kind, 'range.acted');
  assert.equal(e.node, null);
  const out = admit([e], emptyState(), OPTS);
  assert.equal(out.length, 1, 'a receipt needs no cure and takes no refusal');
});
