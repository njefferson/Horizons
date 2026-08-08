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
import { localDayKey } from '../src/time.ts';
import { admit, gateOptionsFor, silentNodes, trashedNodes, heldNodes } from '../src/gate.ts';
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
  assert.deepEqual(verbsFor('runway'), ['new-date', 'put-under', 'to-menu', 'park', 'put-down', 'let-go']);
  assert.deepEqual(verbsFor('menu'), ['bring-back', 'let-go'],
    'no park, no date, no filing on a wish — Menu-plus-demand-clock is the state the belt refuses');
  // `new-date` is a RUNWAY verb and must never reach the Menu family. It writes
  // a due date, and a wish carrying one is the state the belt refuses.
  assert.equal(verbsFor('menu').includes('new-date'), false,
    'giving a wish a date would mint Menu-plus-demand-clock');
});

test('a new date in bulk is the same resolution a person makes by hand', () => {
  // Through `replanEvents`, never a bare `clock.set`. The amnesty learned this
  // the hard way in 1.30.1: a bulk path that reimplements a single act is a
  // second implementation, and it drifted in exactly the arguments that make the
  // act legal.
  let s = write(emptyState(), [
    ev('node.created', 'A', { nodeKind: 'action', title: 'renew the insurance' }),
    ev('node.created', 'B', { nodeKind: 'action', title: 'ring the plumber' }),
  ]);
  s = write(s, [ev('clock.set', 'A', { clockKind: 'due', at: '2026-07-01T12:00:00.000Z', source: 'detail:due' })]);
  s = write(s, [ev('suspense.set', 'A', { at: '2026-07-05T12:00:00.000Z' })]);
  s = write(s, [ev('clock.set', 'B', { clockKind: 'due', at: '2026-09-01T12:00:00.000Z', source: 'detail:due' })]);

  const params = { dayKey: '2026-08-20', nowIso: NOW, zone: TZ };
  // B's date has NOT gone by, so it is not eligible. Setting a new date on
  // something whose date is still ahead is an edit, not a resolution, and doing
  // it to a whole range because those items happened to be in it would overwrite
  // decisions nobody asked the app to touch.
  assert.equal(eligible('new-date', s.nodes.get('A'), s, params), true);
  assert.equal(eligible('new-date', s.nodes.get('B'), s, params), false,
    'a date still ahead is not something to resolve');

  const out = bulkItemEvents(ctx(), 'new-date', s.nodes.get('A')!, params);
  assert.equal(out.some(e => e.kind === 'replan.resolved'), true,
    'it is a recorded resolution, not a silent overwrite');
  const after = write(s, out);
  const n = after.nodes.get('A')!;
  // Asked in the READER'S day, not by slicing the UTC string. End of the local
  // 20th in a UTC-6 zone is the 21st in UTC, and a substring assertion would have
  // called correct behaviour a defect — the exact class V-13 exists for.
  assert.equal(localDayKey(n.clocks['due']!.at, TZ), '2026-08-20', 'the new date landed');
  assert.equal(n.clocks['suspense'], undefined,
    'and the OTHER date that had gone by was retired too — resolving one of two resolves nothing');
  assert.equal(silentNodes(after).length, 0);
});

test('a whole place goes down in one act, and comes back in one', () => {
  // V2 stage 3's last item. ADR-0082 says putting a PLACE down does not sweep
  // its contents, and this completes that rather than contradicting it: the app
  // must never decide what you have stopped caring about, and a person may
  // decide it once, out loud, about a range they named. That is the amnesty's
  // own recorded resolution — the cap governs what a surface may SHOW, and a
  // named range is legitimate to act on.
  let s = write(emptyState(), [
    ev('node.created', 'P', { nodeKind: 'project', title: 'the loft' }),
  ]);
  s = write(s, [ev('clock.set', 'P', { clockKind: 'review', at: NOW, source: 't' })]);
  const kids = ['K1', 'K2', 'K3'];
  for (const k of kids) {
    s = write(s, [ev('node.created', k, { nodeKind: 'action', title: `job ${k}`, parent: 'P' })]);
  }
  const items = kids.map(k => s.nodes.get(k)!);
  for (const n of items) {
    assert.equal(eligible('put-down', n, s, {}), true, `${n.id} can be put down`);
  }
  // AND THE PLACE ITSELF IS NOT ELIGIBLE. `sortable` excludes containers, which
  // is what stops "everything under the loft" quietly taking the loft with it.
  // Without this assertion the exclusion was untested and a plant that removed
  // it stayed green — the range would then have swept the container as a side
  // effect of a verb aimed at its contents, which is the app deciding rather
  // than the person.
  assert.equal(eligible('put-down', s.nodes.get('P'), s, {}), false,
    'the place is not swept by a verb aimed at what is inside it');

  const out = items.flatMap(n => bulkItemEvents(ctx(), 'put-down', n, {}));
  assert.equal(out.every(e => e.kind === 'node.released'), true,
    'the same single event the sheet writes — one path, not a second dialect');
  assert.equal(out.every(e => !('reason' in (e.payload as object))), true,
    'and no reason is collected in bulk that the single act never asks for once');

  const down = write(s, out);
  for (const k of kids) assert.ok(down.nodes.get(k)!.released, `${k} is down`);
  assert.equal(down.nodes.get('P')!.released, null,
    'the PLACE itself is untouched — putting its contents down is not a decision about it');
  assert.equal(silentNodes(down).length, 0);

  // And back in one act. Unlike `to-menu`, nothing was shed on the way down, so
  // this undo restores everything it took.
  const back = write(down, kids.map(k => ({
    id: `u${k}`, vault: 'personal', at: NOW, device: 'd0', seq: seq++,
    kind: 'node.reclaimed', node: k, payload: {},
  } as AppEvent)));
  for (const k of kids) {
    assert.equal(back.nodes.get(k)!.released, null, `${k} is back`);
  }
  // COVERED, not necessarily CLOCKED. These ride their parent's clock through
  // law 1 clause (d), so the gate correctly mints nothing for them — asserting
  // "it has a clock of its own" would have called correct behaviour a defect,
  // which is what the first version of this line did.
  assert.equal(silentNodes(back).length, 0, 'nothing came back silent');
  assert.deepEqual(
    kids.filter(k => !heldNodes(back).some(n => n.id === k)), [],
    'and all three are among what you are holding again');
});

test('a wish is not offered a verb that would do nothing to it', () => {
  // The omission is an argument, not an oversight: a Menu item already makes no
  // demand and already does not come back at you, so putting one down would
  // change nothing a reader could notice — and a control that appears to act and
  // does not is the shape this app spends most of its care avoiding.
  assert.equal(verbsFor('menu').includes('put-down'), false);
  assert.equal(verbsFor('menu').includes('let-go'), true,
    'the verb for a wish you no longer want is let-go, and it is there');
});

test('undoing a bulk put-down really puts them back — END TO END', () => {
  // THE DEFECT THIS PINS, AND IT SHIPPED. `undoBulk`'s reversal check was a
  // hand-written disjunction of four verbs, so a verb added later fell through
  // to `false` and EVERY item was skipped: a working Undo button reporting
  // "0 things restored" and putting nothing back. `new-date` went out in that
  // state in 1.31.0 and nothing caught it, because the tests exercised
  // `undoItemEvents` — the half that was correct.
  //
  // So this runs the REAL pair, `runBulk` then `undoBulk`, which is the seam
  // the unit-level tests could not see. `STILL_REVERSIBLE` is now a Record over
  // BulkVerb, so a new verb cannot compile until its reversal condition is
  // written down; this is the runtime half of the same claim.
  return (async () => {
    const { session, ids } = await seededSession(4);
    const items = ids.map(i => session.state().nodes.get(i)!);
    const plan = planBulk(session.state(), items, 'put-down', {}, 'four rows');
    assert.equal(plan.eligibleNow, 4);

    const receipt = await runBulk(session, plan);
    assert.equal(receipt.done, 4, 'four went down');
    for (const i of ids) assert.ok(session.state().nodes.get(i)!.released, `${i} is down`);
    assert.equal(heldNodes(session.state()).filter(n => ids.includes(n.id)).length, 0,
      'and none of them is among what you are holding');

    const undone = await undoBulk(session, receipt);
    assert.equal(undone.skipped, 0,
      'NOTHING was skipped — a skipped item is the defect this test exists for');
    assert.equal(undone.done, 4, 'and all four came back');
    for (const i of ids) assert.equal(session.state().nodes.get(i)!.released, null, `${i} is back`);
    assert.equal(silentNodes(session.state()).length, 0);
  })();
});

test('the same holds for a bulk new date — the verb that shipped broken', () => {
  return (async () => {
    const { session, ids } = await seededSession(3);
    await session.commit(c => ids.map(id => ({
      id: c.id(), vault: c.vault, at: c.at, device: c.device, seq: c.seq(),
      kind: 'clock.set', node: id,
      payload: { clockKind: 'due', at: '2026-07-01T12:00:00.000Z', source: 'detail:due' },
    } as AppEvent)));
    const items = ids.map(i => session.state().nodes.get(i)!);
    const params = { dayKey: '2026-08-20', nowIso: NOW, zone: TZ };
    const plan = planBulk(session.state(), items, 'new-date', params, 'three passed dates');
    assert.equal(plan.eligibleNow, 3);

    const receipt = await runBulk(session, plan);
    assert.equal(receipt.done, 3);
    const undone = await undoBulk(session, receipt);
    assert.equal(undone.skipped, 0,
      'this is the one that shipped skipping everything — Undo said 0 restored and meant it');
    assert.equal(undone.done, 3);
    for (const i of ids) {
      assert.equal(localDayKey(session.state().nodes.get(i)!.clocks['due']!.at, TZ), '2026-07-01',
        'and the date it retired is back, exactly as it was');
    }
    assert.equal(silentNodes(session.state()).length, 0);
  })();
});

test('the receipt noun is well-formed and admits', () => {
  const e = rangeActedEvent(ctx(), 'the sentence shown', 'put-under', 12);
  assert.equal(e.kind, 'range.acted');
  assert.equal(e.node, null);
  const out = admit([e], emptyState(), OPTS);
  assert.equal(out.length, 1, 'a receipt needs no cure and takes no refusal');
});
