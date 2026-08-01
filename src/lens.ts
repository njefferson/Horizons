// The lens (1.7.0, ADR-0054) — Q-10's recorded shape, built on Noah's word.
//
// A lens is a FILTER YOU SWITCH ON AND OFF over what you are LOOKING at, and
// never a partition of what the app holds. Q-10's closure is the law here:
// "law 1 does not bend for it. A thing filtered out of view still has its
// clock and still comes back — a filter may change what you are looking at
// and may never change what the app is holding. Anything else is an archive
// with a friendlier name (law 3)."
//
// LINEAGE-BASED: a lens is one live top-level container (a "Home" or "Work"
// area — containment 0.13.0 is what makes this expressible), and membership
// is sitting anywhere beneath it. Loose things belong to no lens and step
// aside while one is active — they are still held, still clocked, and the
// lens line SAYS so.
//
// WHAT A LENS NEVER TOUCHES, by construction (each reads whole state and
// takes no lens argument — the type system is the fence): the coverage gauge,
// replan, re-entry, Next up ("one thing, chosen for you, across the WHOLE of
// someone's life is the app's central promise" — a lensed Next up is two
// queues, which is the vault Q-10 refused), search, the calendar export, and
// the record. The lens filters the held LIST's rows, and that is all.
//
// PURE. The persisted choice is a DEVICE VIEW PREFERENCE (kv, the badge
// pattern), never an event — what you are looking at is not history.

import type { NodeId } from './events.ts';
import type { NodeState, State } from './fold.ts';
import { roots } from './tree-view.ts';

/** The kv key. A view preference, not sync state — it does not travel. */
export const LENS_KEY = 'lens.root';

/** What may be a lens: the tree's own roots — live top-level containers. */
export const lensChoices = (state: State): NodeState[] => roots(state);

/**
 * Every id beneath the lens root, root included — one BFS over a parent
 * index, cycle-guarded. A Set, because the caller filters rows with it.
 */
export function underLensIds(state: State, rootId: NodeId): Set<NodeId> {
  const ids = new Set<NodeId>([rootId]);
  const byParent = new Map<NodeId, NodeId[]>();
  for (const n of state.nodes.values()) {
    if (!n.parent || n.trashed || n.mergedInto) continue;
    let arr = byParent.get(n.parent);
    if (!arr) byParent.set(n.parent, arr = []);
    arr.push(n.id);
  }
  const queue: NodeId[] = [rootId];
  while (queue.length > 0) {
    const cur = queue.pop()!;
    for (const kid of byParent.get(cur) ?? []) {
      if (!ids.has(kid)) { ids.add(kid); queue.push(kid); }
    }
  }
  return ids;
}

/** The honest line shown whenever a lens is active — law 1, stated where the
 *  filtering happens, every time. No count: a number here would be a headline
 *  about everything else (law 8). */
export const lensWords = (rootTitle: string): string =>
  `Looking at ${rootTitle || '(untitled)'}. Everything else is still held and still comes back — a lens changes what you see, never what Quietkeep holds.`;
