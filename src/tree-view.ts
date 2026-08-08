// The alignment tree, on request (1.6.0 — build-plan item 39, ADR-0013).
//
// ADR-0013's own consequence, built at last: "The alignment tree exists and is
// reachable on request. It is never the landing view, and nothing requires
// visiting it." It is an INSPECTION MODE, not a workspace — rows carry exactly
// one verb (open the sheet), there is no drag, no reorder, no add-here,
// because a workspace tree is the overturn ADR-0013 answers with "Nothing.
// This is product law 4."
//
// Per-branch cap with the true total (law 8): a branch shows its first
// BRANCH_CAP children and states how many more it holds; revealing is per
// branch and per sitting. ONE parent→children map, then an explicit stack —
// never recursion (a hostile-depth chain must return a view, not a
// RangeError; the gate learned this at 1.3.1) — and cycle-guarded like every
// walk here, because a shard can deliver half a loop.
//
// PURE.

import type { NodeState, State } from './fold.ts';
import { heldNodes } from './gate.ts';
import { isContainer } from './tree.ts';
import { isGone, isHeld } from './fold.ts';

/** Law 8's number for one branch — the same order of magnitude as every other
 *  capped surface. The true total is always stated beside it. */
export const BRANCH_CAP = 25;

export type TreeEntry =
  | { kind: 'node'; node: NodeState; depth: number }
  | { kind: 'more'; parent: NodeState; hidden: number; depth: number };

/** Live containers not sitting inside another live container — where the
 *  tree hangs from. Title order, like every picker. */
export function roots(state: State): NodeState[] {
  const live = heldNodes(state);
  return live
    .filter(isContainer)
    .filter(n => {
      if (!n.parent) return true;
      const p = state.nodes.get(n.parent);
      return !isHeld(p) || !isContainer(p);
    })
    .sort((a, b) => (a.title || '').localeCompare(b.title || ''));
}

/**
 * The whole view, flattened: depth-first, containers with their children
 * indented, each branch capped unless its parent id is in `revealed`.
 */
export function treeRows(state: State, revealed: ReadonlySet<string> = new Set()): TreeEntry[] {
  const live = heldNodes(state);
  const byParent = new Map<string, NodeState[]>();
  for (const n of live) {
    if (!n.parent) continue;
    let arr = byParent.get(n.parent);
    if (!arr) byParent.set(n.parent, arr = []);
    arr.push(n);
  }
  const order = (a: NodeState, b: NodeState): number =>
    (a.title || '').localeCompare(b.title || '');
  for (const arr of byParent.values()) arr.sort(order);

  const out: TreeEntry[] = [];
  const seen = new Set<string>();
  // Explicit stack; entries pushed in reverse so siblings emerge in order,
  // and a branch's "N more" marker pushed FIRST so it pops after them all.
  const stack: TreeEntry[] = roots(state).reverse()
    .map(node => ({ kind: 'node' as const, node, depth: 0 }));
  while (stack.length > 0) {
    const f = stack.pop()!;
    if (f.kind === 'more') { out.push(f); continue; }
    const { node, depth } = f;
    if (seen.has(node.id)) continue;                 // half a loop from a shard
    seen.add(node.id);
    out.push(f);
    const kids = byParent.get(node.id) ?? [];
    const cap = revealed.has(node.id) ? kids.length : BRANCH_CAP;
    if (kids.length > cap) {
      stack.push({ kind: 'more', parent: node, hidden: kids.length - cap, depth: depth + 1 });
    }
    for (let i = Math.min(cap, kids.length) - 1; i >= 0; i--) {
      stack.push({ kind: 'node', node: kids[i]!, depth: depth + 1 });
    }
  }
  return out;
}
