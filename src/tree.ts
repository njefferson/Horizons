// The containment tree: what a thing belongs to, and what may legally hold it.
//
// The app shipped with a parent FIELD and no way to set one. Every capture was a
// flat action, so law 4 ("levels push down") had nothing to push down through,
// and the stalled half of Review — a container with no live work under it —
// could never fire, because containers could not be made. This module is the
// arithmetic that closes both.
//
// PURE. It reads state and returns facts; it writes nothing.
//
// The one invariant with teeth: **the parent graph is acyclic by construction**.
// A cycle is not a mistake to report afterwards, it is a claim that a thing is
// inside itself — every walk over the tree becomes infinite and no fold, export,
// projection or render can defend against it individually. So the gate refuses
// the write, and the picker never offers the option in the first place. Offering
// an illegal choice and rejecting it afterwards is a control that lies about
// what it does.

import type { NodeState, State } from './fold.ts';
import type { NodeKind } from './events.ts';
import { isHeld } from './fold.ts';

/** Kinds that CONTAIN work rather than being work. The one definition; Review
 *  reads it too, so "what can stall" and "what can hold something" can never
 *  drift apart into two different answers. */
export const CONTAINER_KINDS: ReadonlySet<NodeKind> = new Set<NodeKind>([
  'outcome', 'project', 'area', 'goal',
]);

/** The kind a plain item becomes when someone says "this is bigger than one
 *  step". `project` and not `outcome`: an outcome is a result, and naming the
 *  result is a separate act of thinking that this control must not fake. */
export const CONTAINER_DEFAULT: NodeKind = 'project';

export const isContainer = (n: NodeState): boolean =>
  CONTAINER_KINDS.has(n.kind as NodeKind);

const alive = (n: NodeState | undefined): n is NodeState =>
  isHeld(n);

/**
 * Walk from a node to the root, yielding each ancestor.
 *
 * BOUNDED regardless of the data. The gate keeps the graph acyclic, but this is
 * the module that makes that claim safe to rely on, so it must not itself hang
 * on a log that arrived from somewhere else — a shard exchange (ADR-0035) can
 * deliver two halves of a loop that neither device ever wrote whole.
 */
export function* ancestors(state: State, id: string): Generator<NodeState> {
  const seen = new Set<string>([id]);
  let cur = state.nodes.get(id)?.parent ?? null;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const n = state.nodes.get(cur);
    if (!n) return;
    yield n;
    cur = n.parent;
  }
}

/**
 * Would parenting `child` under `parent` close a loop?
 *
 * True when they are the same node, or when `parent` is already somewhere below
 * `child`. Also true when the existing graph is ALREADY cyclic at `parent` —
 * `ancestors` stops rather than spinning, and a walk that terminated early
 * cannot prove the absence of a loop, so the honest answer is to refuse.
 */
export function wouldParentCycle(state: State, child: string, parent: string): boolean {
  if (child === parent) return true;
  const seen = new Set<string>([parent]);
  let cur = state.nodes.get(parent)?.parent ?? null;
  while (cur) {
    if (cur === child) return true;
    if (seen.has(cur)) return true;      // pre-existing loop: cannot vouch for it
    seen.add(cur);
    cur = state.nodes.get(cur)?.parent ?? null;
  }
  return false;
}

/**
 * The containers `n` could legally be put under, sorted for a picker.
 *
 * Live containers only, never itself, never one that would close a loop, and
 * never the one it is already under — an option that does nothing is noise on
 * the surface where someone is trying to make a structural decision.
 */
export function legalParents(state: State, n: NodeState): NodeState[] {
  return [...state.nodes.values()]
    .filter(t => alive(t) && isContainer(t))
    .filter(t => t.id !== n.id && t.id !== n.parent)
    .filter(t => !wouldParentCycle(state, n.id, t.id))
    .sort((a, b) => (a.title || '').localeCompare(b.title || '') || (a.id < b.id ? -1 : 1));
}

/** Live children of a node. */
export function childrenOf(state: State, id: string): NodeState[] {
  return [...state.nodes.values()]
    .filter(n => n.parent === id && alive(n))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

/**
 * Where a node sits, in words, for the sheet that is about to let someone change
 * it. Silence when it sits nowhere — "no parent" is the ordinary case and
 * announcing it would make the flat majority of items look incomplete.
 */
export function placeWords(state: State, n: NodeState): string | null {
  if (!n.parent) return null;
  const p = state.nodes.get(n.parent);
  if (!p) return 'Part of something that is not here.';
  if (p.trashed || p.mergedInto) return 'Part of something that was let go.';
  return `Part of ${p.title || '(untitled)'}.`;
}
