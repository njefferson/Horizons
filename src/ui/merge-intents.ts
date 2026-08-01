// Folding a duplicate (1.7.0, ADR-0053) — the UI for the vocabulary's
// seventh capability that was complete and unreachable: `node.merged` has
// folded and gated since Phase 0 with nothing able to emit it.
//
// A bare `node.merged` is a data-loss verb (scouted, verified): the source's
// children orphan into Review with the words "what it belonged to was let go"
// — a lie, nothing was let go — and its note, demand clocks, and people links
// vanish from every surface, because every projection excludes merged nodes
// and none follows the chain to combine. So the merge INTENT is a batch:
// carried facts first, children re-homed, then the merge. Folding a duplicate
// must never swallow a date (law 3), a note, a person, or a child.
//
// The way back is `node.unmerged` — split back out, gate-cured like untrashed.
// It restores the node's own STANDING, not the world before the merge:
// carried facts and re-homed children stay where the merge put them, and the
// words say so. (Un-carrying would mean deleting facts from the target, and
// this log does not delete.)
//
// These build events; they never touch the store.

import type { AppEvent, ClockKind, NodeId } from '../events.ts';
import { noteOf, type NodeState, type State } from '../fold.ts';
import { heldNodes } from '../gate.ts';
import type { StampContext } from './session.ts';

const base = (ctx: StampContext, kind: string, node: string | null, payload: unknown): AppEvent => ({
  id: ctx.id(), vault: ctx.vault, at: ctx.at, device: ctx.device, seq: ctx.seq(),
  kind, node, payload,
} as AppEvent);

/** The demand kinds a merge carries when the survivor lacks them — losing a
 *  hard date to a dedup is the exact class the 1.3.1 belt exists for. */
const CARRY_CLOCKS: readonly ClockKind[] = ['due', 'start', 'suspense', 'park'];

/**
 * Where may this node be folded INTO? Held, not itself, not its own
 * descendant (the re-homed children would cycle, and a thing cannot be the
 * same as a part of itself) — and people fold only into people, everything
 * else never into a person: "this task is the same as Ada" is not a sentence.
 */
export function legalMergeTargets(state: State, n: NodeState): NodeState[] {
  const beneath = new Set<NodeId>([n.id]);
  // Explicit queue over the parent index, cycle-safe like every walk.
  const queue: NodeId[] = [n.id];
  const byParent = new Map<NodeId, NodeId[]>();
  for (const x of state.nodes.values()) {
    if (!x.parent) continue;
    let arr = byParent.get(x.parent);
    if (!arr) byParent.set(x.parent, arr = []);
    arr.push(x.id);
  }
  while (queue.length > 0) {
    const cur = queue.pop()!;
    for (const kid of byParent.get(cur) ?? []) {
      if (!beneath.has(kid)) { beneath.add(kid); queue.push(kid); }
    }
  }
  return heldNodes(state)
    .filter(t => !beneath.has(t.id))
    .filter(t => (n.kind === 'person' ? t.kind === 'person' : t.kind !== 'person'))
    .sort((a, b) => (a.title || '').localeCompare(b.title || ''));
}

/**
 * The whole fold, one gated commit: carry what the survivor lacks, re-home
 * the children, then merge. Order matters — the carries and re-homes must
 * land while the source is still an ordinary node, and the Menu-belt sees
 * only the final state either way.
 */
export function mergeEvents(
  ctx: StampContext, state: State, source: NodeState, target: NodeState,
): AppEvent[] {
  const out: AppEvent[] = [];

  // Demand clocks the survivor lacks — each through its own canonical noun.
  for (const k of CARRY_CLOCKS) {
    const c = source.clocks[k];
    if (!c || target.clocks[k]) continue;
    if (k === 'park') {
      out.push(base(ctx, 'park.set', target.id, { returnAt: c.at, reason: 'merge:carried' }));
    } else if (k === 'suspense') {
      out.push(base(ctx, 'suspense.set', target.id, { at: c.at }));
    } else {
      out.push(base(ctx, 'clock.set', target.id, { clockKind: k, at: c.at, source: 'merge:carried' }));
    }
  }

  // The note: copied when the survivor has none, joined when both speak —
  // overwriting either would be the merge deciding whose words mattered.
  const srcNote = noteOf(source);
  const tgtNote = noteOf(target);
  if (srcNote && srcNote !== tgtNote) {
    out.push(base(ctx, 'node.field.set', target.id, {
      field: 'note', value: tgtNote ? `${tgtNote}\n\n${srcNote}` : srcNote,
    }));
  }

  // People links the survivor lacks — additive by design, so this is safe.
  for (const link of source.people) {
    if (target.people.some(x => x.person === link.person && x.relation === link.relation)) continue;
    out.push(base(ctx, 'person.linked', target.id, {
      node: target.id, person: link.person, relation: link.relation,
    }));
  }

  // Children re-home to the survivor — a bare merge orphans them into Review
  // with words that call a fold a trashing.
  for (const child of state.nodes.values()) {
    if (child.parent !== source.id || child.trashed || child.mergedInto) continue;
    out.push(base(ctx, 'node.parented', child.id, {
      parent: target.id, priorParent: source.id,
    }));
  }

  out.push(base(ctx, 'node.merged', source.id, { into: target.id }));
  return out;
}

/** Split back out. One event; the gate re-covers it in the same transaction. */
export const unmergeEvents = (ctx: StampContext, node: string): AppEvent[] =>
  [base(ctx, 'node.unmerged', node, {})];

/** Everything folded into this node — the survivor's sheet lists them, each
 *  with the way back, so the promise outlives the sitting (the trash-view
 *  lesson). Newest fold first. */
export const foldedInto = (state: State, id: NodeId): NodeState[] =>
  [...state.nodes.values()]
    .filter(n => n.mergedInto === id && !n.trashed)
    .sort((a, b) => (a.id < b.id ? 1 : -1));
