// What a fold MEANS at read time (1.9.2, ADR-0058).
//
// The governing rule this file is half of: **a fold carries STATE by writing,
// and carries RECORDS by reading.**
//
// State is what a thing currently IS or currently DEMANDS — dates, a rhythm,
// the note, people, children. The survivor is the thing that stays, so the
// survivor must hold it, and the merge intent writes it across through the
// ordinary noun for that fact.
//
// A RECORD is what HAPPENED — a decision logged, a decline standing. Those are
// attributed to a moment and to a thing, and re-emitting one mints a second
// occurrence of something that occurred once. Three consequences make copying
// them wrong rather than merely inelegant:
//
//   1. Copies carry fresh event ids, and the decision fold is idempotent BY
//      ID. Merge, split back out, fold again, and the survivor holds two
//      identical decision rows — which NO verb in this app can remove, because
//      ADR-0057 forbids removing a decision at all.
//   2. `delta.ts` computes "what was decided" as a set difference on decision
//      ids. Copies are new ids, so a fold would re-report decisions in the one
//      artefact that leaves the device, dated to a period in which nothing was
//      decided.
//   3. A copy asserts the decision was made about the survivor. After a split
//      it asserts that about both nodes.
//
// So records are read THROUGH the fold, here, and nothing is written. Which is
// also why this is reversible for free: an unmerge un-writes nothing, because
// nothing was written.
//
// PURE, and it imports `fold.ts` ONLY. It must never import `gate.ts` (the
// gate imports this) nor anything under `src/ui/` (the projections below are
// read by `delta.ts`, which is core).

import type { DecisionEntry, NodeState, State } from './fold.ts';
import type { NodeId } from './events.ts';

/**
 * Follow a merge chain to its living end.
 *
 * Null when the chain leaves the known world (a missing target), ends in the
 * trash, or loops. Lived in `gate.ts` as a private `mergeTarget` until 1.9.2;
 * it is one concept and it now has one home, because law 1's merge exemption
 * and the ledger's "where does this live now" are the same question asked by
 * two callers.
 */
export function survivorOf(state: State, node: NodeState): NodeState | null {
  const seen = new Set<NodeId>([node.id]);
  let cur: NodeState | undefined = node;
  while (cur?.mergedInto) {
    if (seen.has(cur.mergedInto)) return null;             // cycle
    seen.add(cur.mergedInto);
    cur = state.nodes.get(cur.mergedInto);
  }
  return cur && !cur.trashed ? cur : null;
}

/**
 * Everything folded DIRECTLY into this node — one hop. The survivor's sheet
 * lists them, each with the way back, so the promise outlives the sitting
 * (the trash-view lesson, ADR-0053).
 *
 * Newest fold first: ids are ULIDs, so descending id IS descending time.
 */
export const foldedInto = (state: State, id: NodeId): NodeState[] =>
  [...state.nodes.values()]
    .filter(n => n.mergedInto === id && !n.trashed)
    .sort((a, b) => (a.id < b.id ? 1 : -1));

/**
 * Everything whose chain TERMINATES at this node, however deep.
 *
 * A fold of a fold is reachable — `legalMergeTargets` offers held nodes, and a
 * survivor is held — so in a chain A → B → C, one hop would leave A's "split
 * it back out" reachable from no surface at all. The way back must outlive the
 * sitting for every node in the chain, not only the last one.
 */
export function foldedIntoDeep(state: State, id: NodeId): NodeState[] {
  const out: NodeState[] = [];
  for (const n of state.nodes.values()) {
    if (n.trashed || !n.mergedInto || n.id === id) continue;
    // Walk this node's own chain, cycle-guarded, and keep it if it ends here.
    const seen = new Set<NodeId>([n.id]);
    let cur: NodeState | undefined = n;
    while (cur?.mergedInto) {
      if (seen.has(cur.mergedInto)) { cur = undefined; break; }   // cycle: keeps nothing
      seen.add(cur.mergedInto);
      cur = state.nodes.get(cur.mergedInto);
    }
    if (cur && cur.id === id) out.push(n);
  }
  return out.sort((a, b) => (a.id < b.id ? 1 : -1));
}

/** A decision, plus where it was logged when that is not the node being asked. */
export type FoldedDecision = DecisionEntry & { from: NodeId | null };

/**
 * Everything decided about this node, including everything decided about the
 * things folded into it. Newest first, tie-broken to a TOTAL order so two
 * renders of one state cannot reshuffle what they just showed.
 *
 * `from` names the folded-in node when the decision is not the survivor's own.
 * The sheet already lists what folded in, so an unattributed row would invite
 * the reader to reconcile two lists that do not line up.
 */
export function decisionsFor(state: State, node: NodeState): FoldedDecision[] {
  const out: FoldedDecision[] = node.decisions.map(d => ({ ...d, from: null }));
  for (const src of foldedIntoDeep(state, node.id)) {
    for (const d of src.decisions) out.push({ ...d, from: src.id });
  }
  return out.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : a.id < b.id ? -1 : 1));
}
