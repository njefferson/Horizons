// The alignment tree (1.6.0, ADR-0013/item 39): roots, the flattened rows,
// the per-branch cap with a true total, and survival of hostile data.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fold, type State } from '../src/fold.ts';
import { BRANCH_CAP, roots, treeRows } from '../src/tree-view.ts';
import type { AppEvent } from '../src/events.ts';

const NOW = '2026-07-29T18:00:00.000Z';
let seq = 0;
const ev = (kind: string, node: string | null, payload: unknown): AppEvent =>
  ({ id: `e${seq}`, vault: 'personal', at: NOW, device: 'd0', seq: seq++, kind, node, payload } as AppEvent);
const mk = (id: string, kind: string, title = id, parent?: string): AppEvent =>
  ev('node.created', id, { nodeKind: kind, title, ...(parent ? { parent } : {}) });
const st = (...e: AppEvent[]): State => fold(e);

test('roots are live containers not inside another live container', () => {
  const s = st(
    mk('AREA', 'area'),
    mk('P', 'project', 'p', 'AREA'),
    mk('LOOSE-P', 'project'),
    mk('W', 'action', 'w', 'P'),
    mk('GONE', 'project'), ev('node.trashed', 'GONE', {}),
  );
  assert.deepEqual(roots(s).map(n => n.id).sort(), ['AREA', 'LOOSE-P'],
    'the nested project is not a root; the trashed one is not in the tree at all');
});

test('rows flatten depth-first with depth by indentation, work under its container', () => {
  const s = st(
    mk('AREA', 'area', 'An area'),
    mk('P', 'project', 'A project', 'AREA'),
    mk('W', 'action', 'a step', 'P'),
  );
  const rows = treeRows(s);
  assert.deepEqual(
    rows.map(r => r.kind === 'node' ? `${r.depth}:${r.node.id}` : 'more'),
    ['0:AREA', '1:P', '2:W'],
  );
});

test('the per-branch cap states its true remainder, and revealing lifts exactly that branch', () => {
  const events: AppEvent[] = [mk('P', 'project')];
  for (let i = 0; i < BRANCH_CAP + 7; i++) events.push(mk(`c${String(i).padStart(2, '0')}`, 'action', `c${i}`, 'P'));
  const s = st(...events);
  const rows = treeRows(s);
  const more = rows.find(r => r.kind === 'more');
  assert.ok(more && more.kind === 'more');
  assert.equal(more.hidden, 7, 'the true remainder, never a vague "more"');
  assert.equal(rows.filter(r => r.kind === 'node').length, 1 + BRANCH_CAP, 'the cap held');
  const revealed = treeRows(s, new Set(['P']));
  assert.equal(revealed.filter(r => r.kind === 'node').length, 1 + BRANCH_CAP + 7,
    'revealing produces exactly the stated remainder');
  assert.ok(!revealed.some(r => r.kind === 'more'), 'and the marker is gone');
});

test('the "more" marker comes AFTER the shown children, not between parent and child', () => {
  const events: AppEvent[] = [mk('P', 'project')];
  for (let i = 0; i < BRANCH_CAP + 1; i++) events.push(mk(`c${String(i).padStart(2, '0')}`, 'action', `c${i}`, 'P'));
  const rows = treeRows(st(...events));
  const last = rows[rows.length - 1]!;
  assert.equal(last.kind, 'more', 'the remainder closes the branch');
});

test('half a loop from a shard is bounded, never a hang or a stack overflow', () => {
  // Raw fold, around the gate — the gate refuses cycles, which is exactly why
  // the walk must survive data that arrived around it.
  const s = fold([
    mk('A', 'project'), mk('B', 'project', 'b', 'A'),
    ev('node.parented', 'A', { parent: 'B' }),
  ]);
  assert.doesNotThrow(() => treeRows(s));
});

test('a 10,000-deep chain returns a view, not a RangeError — the walk is a stack, not recursion', () => {
  const events: AppEvent[] = [mk('N0', 'project', 'root')];
  for (let i = 1; i < 10_000; i++) events.push(mk(`N${i}`, 'project', `n${i}`, `N${i - 1}`));
  const rows = treeRows(fold(events));
  assert.equal(rows.length, 10_000, 'every level came back');
});
