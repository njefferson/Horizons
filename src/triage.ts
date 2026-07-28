// Triage projections (Phase 2). Pure functions of state + the rules for what
// still needs a human's two taps. Computed, never stored (build-plan §2).
//
// "Unclarified" is the whole inbox premise: a captured item sits under an
// aggressive same-day clock (the gate's cure) so it is never silent, but it has
// not yet been ROUTED. Clarify turns it into an action/waiting-for/Menu item/
// trash. Heat is an even lighter first pass — hot or cold — that can run before
// clarify to make clarify faster.

import type { State, NodeState } from './fold.ts';
import type { Heat } from './events.ts';

/** Capture order is the only order the inbox claims, and ULIDs sort by time. */
const byCaptureOrder = (a: NodeState, b: NodeState): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** A live captured item that has not been routed yet. Trashed and merged nodes
 *  are gone; a routed node has left the inbox by definition. */
const isInboxItem = (n: NodeState): boolean =>
  !n.trashed && !n.mergedInto && n.route === null;

/**
 * The clarify queue: everything still unrouted, oldest first — but an item whose
 * capture carried the `boss` tag runs one step hotter, because a thing the boss
 * asked for that is sitting unclarified is the most expensive kind to lose
 * (build-plan item 16). "One step hotter" = it sorts ahead of same-age items,
 * not ahead of everything, so the queue still drains in roughly capture order.
 */
export function unclarified(state: State): NodeState[] {
  const items = [...state.nodes.values()].filter(isInboxItem);
  const boss = (n: NodeState): number => (n.sourceTags.includes('boss') ? 0 : 1);
  return items.sort((a, b) => boss(a) - boss(b) || byCaptureOrder(a, b));
}

/** The heat-pass queue: unrouted items with no heat yet. The heat pass is
 *  optional and runs first; skipping it just means clarify has less to lean on. */
export function needsHeat(state: State): NodeState[] {
  return [...state.nodes.values()]
    .filter(n => isInboxItem(n) && n.heat === null)
    .sort(byCaptureOrder);
}

/** The head of the clarify queue, or null when the inbox is clear. The clarify
 *  surface shows exactly one card, so this is what it shows. */
export const nextToClarify = (state: State): NodeState | null => unclarified(state)[0] ?? null;

/** The head of the heat queue, or null. */
export const nextToHeat = (state: State): NodeState | null => needsHeat(state)[0] ?? null;

export interface InboxGauge { unclarified: number; unheated: number }

/** For a surface header: how much triage is waiting. Zero unclarified is the
 *  inbox-clear state. */
export const inboxGauge = (state: State): InboxGauge => ({
  unclarified: unclarified(state).length,
  unheated: needsHeat(state).length,
});

export type { Heat };
