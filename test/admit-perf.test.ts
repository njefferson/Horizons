// The perf gate on the write path (1.3.0).
//
// Bulk acts are gated batches of the same events single acts write — which
// means the gate's own cost IS the ceiling on every wholesale feature. The old
// admit refolded the accumulated batch per offered event: 500 silent-risk
// events against a 10k-node state measured at ~6,250 ms on this hardware,
// which is a frozen UI and an unshippable bulk path. The rework was measured
// at ~55 ms on the same fixture.
//
// The bound below is deliberately loose against CI variance (slow shared
// runners) while staying far below the defect it guards against: a return of
// the quadratic shape lands 8-100x over it, not fractionally. DELIBERATE-
// FAILURE PROOF: substituting `admitReference` (the old control flow, kept in
// test/admit-reference.ts) for `admit` here reds this test by an order of
// magnitude — run once before this gate was trusted, per Doctrine §6.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { admit, gateOptionsFor } from '../src/gate.ts';
import { fold } from '../src/fold.ts';
import type { AppEvent } from '../src/events.ts';

const OPTS = gateOptionsFor('America/Denver');
const AT = '2026-07-01T12:00:00.000Z';
const BUDGET_MS = 800;

test(`admit of 500 silent-risk events at a 10k-node state stays under ${BUDGET_MS}ms`, () => {
  let seq = 0;
  const ev = (kind: string, node: string, payload: unknown): AppEvent =>
    ({ id: `e${seq}`, vault: 'personal', at: AT, device: 'd0', seq: seq++, kind, node, payload } as AppEvent);

  const events: AppEvent[] = [];
  for (let i = 0; i < 5000; i++) {
    events.push(ev('node.created', `P${i}`, { nodeKind: 'project', title: `proj ${i}` }));
    events.push(ev('clock.set', `P${i}`, { clockKind: 'review', at: '2026-08-01T12:00:00.000Z', source: 't' }));
    events.push(ev('node.created', `C${i}`, { nodeKind: 'action', title: `child ${i}`, parent: `P${i}` }));
  }
  const state = fold(events);
  assert.equal(state.nodes.size, 10_000, 'the fixture is the size it claims');

  // Re-parenting is silent-risk (coverage can move at a distance), so every one
  // of these 500 exercises the dirty-set check — the worst realistic shape.
  const batch: AppEvent[] = [];
  for (let i = 0; i < 500; i++) {
    batch.push(ev('node.parented', `C${i}`, { parent: `P${(i + 1) % 5000}`, priorParent: `P${i}` }));
  }

  const t0 = performance.now();
  const out = admit(batch, state, OPTS);
  const elapsed = performance.now() - t0;
  assert.equal(out.length >= 500, true, 'the batch was admitted');
  assert.ok(elapsed < BUDGET_MS,
    `admit took ${Math.round(elapsed)}ms — over the ${BUDGET_MS}ms budget; the quadratic shape is back`);
});
