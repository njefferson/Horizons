// Review, done as EXCEPTIONS ONLY (v1 Must: stalled/orphan detection).
//
// The classic weekly review asks you to look at everything. That is precisely
// the thing this audience cannot do, and the reason most review habits die: the
// cost is paid up front, every time, whether or not anything is wrong.
//
// So this surface never shows you your work. It shows you the two things that
// are structurally broken and nothing else — and when nothing is broken it is
// not there at all. An empty review is the normal state and it says so by its
// absence, not by a congratulation (law 5: nothing here is a score).
//
// **Stalled** — something that contains work, with no live piece of work under
// it. A project with no next action is the single most expensive silent failure
// in any planner: it looks fine on every surface, and nothing happens.
//
// **Orphaned** — a node whose parent is gone. The gate refuses to CREATE one
// (law 1), but a parent can be trashed later by a path that cured the children
// differently, and a shard exchange can deliver a child whose parent never
// arrived. So it is detected as well as prevented — the invariant is checked,
// not assumed.
//
// PURE. `now` and `zone` are arguments.

import type { NodeState, State } from './fold.ts';
import { heldNodes } from './gate.ts';
import { NOT_ACTIONABLE } from './kinds.ts';
import { calendarDaysBetween, isValidIso } from './time.ts';
import { CONTAINER_KINDS } from './tree.ts';
import type { NodeKind } from './events.ts';

/** Kinds that CONTAIN work rather than being work. These are the ones that can
 *  stall, because stalling means "nothing underneath is moving".
 *
 *  Imported, never redeclared: `src/tree.ts` decides what may HOLD something and
 *  this decides what may STALL, and if those two lists ever disagreed the app
 *  would offer a parent it then refused to review. */
const CONTAINERS = CONTAINER_KINDS;

export interface ReviewException {
  node: NodeState;
  /** Why it is here, in words the surface shows. Never a rebuke. */
  words: string;
}

export interface ReviewView {
  /** Containers with nothing live underneath them. */
  stalled: ReviewException[];
  /** Nodes whose parent is gone. */
  orphaned: ReviewException[];
  /** Everything, capped for the surface — law 8 bounds what re-entry may show. */
  shown: ReviewException[];
  /** How many there are altogether, so the cap is never a lie by omission. */
  total: number;
}

/** Law 8 again. Returning after a fortnight could surface many at once, and a
 *  wall of them is the pile this app exists to stand between you and. */
export const REVIEW_CAP = 3;

/** Is this node a live piece of work — something that could actually move? */
function isLiveWork(n: NodeState): boolean {
  if (n.trashed || n.mergedInto) return false;
  if (n.lastDone) return false;
  if (n.onMenu) return false;                 // demand-free by law 6
  // A SPENT resume card is residue, not work. The thread was picked back up or
  // let go; either way nothing is moving because of it.
  //
  // Without this, a project whose only remaining child was a dead card read as
  // healthy — the precise failure this whole surface exists to catch, hidden by
  // the leftovers of a feature. `held.ts` learned the same lesson in 0.14.0 and
  // this file was not told: one concept, two places, one of them checking
  // (audit, 2026-07-29).
  if (n.kind === 'resume-card' && n.resumeSpent) return false;
  if (NOT_ACTIONABLE.has(n.kind as NodeKind)) return false;
  return true;
}

/**
 * Containers with no live work under them.
 *
 * An unrouted capture DOES count as live work here, deliberately: it is in the
 * inbox and triage will get to it, so the container is not stalled — it is
 * waiting on a step the app already has a surface for. Counting it as stalled
 * would send someone to Review for something triage was about to solve.
 */
export function stalled(state: State): ReviewException[] {
  const childrenOf = new Map<string, NodeState[]>();
  for (const n of heldNodes(state)) {
    if (!n.parent) continue;
    if (!childrenOf.has(n.parent)) childrenOf.set(n.parent, []);
    childrenOf.get(n.parent)!.push(n);
  }
  const out: ReviewException[] = [];
  for (const n of heldNodes(state)) {
    if (!CONTAINERS.has(n.kind as NodeKind)) continue;
    if (n.lastDone) continue;                 // a finished outcome is not stalled
    const kids = childrenOf.get(n.id) ?? [];
    if (kids.some(isLiveWork)) continue;
    out.push({
      node: n,
      words: kids.length === 0
        ? 'nothing under it yet'
        : 'nothing under it is moving',
    });
  }
  return out.sort((a, b) => (a.node.id < b.node.id ? -1 : 1));
}

/**
 * Nodes whose parent is gone.
 *
 * The gate refuses to create one, so finding any is a real signal rather than
 * routine — which is exactly why it is checked. An invariant nobody verifies is
 * a belief.
 */
export function orphaned(state: State): ReviewException[] {
  const out: ReviewException[] = [];
  for (const n of heldNodes(state)) {
    if (!n.parent) continue;
    const parent = state.nodes.get(n.parent);
    if (parent && !parent.trashed && !parent.mergedInto) continue;
    out.push({
      node: n,
      words: parent ? 'what it belonged to was let go' : 'what it belonged to is not here',
    });
  }
  return out.sort((a, b) => (a.node.id < b.node.id ? -1 : 1));
}

/**
 * The whole surface. Orphans lead: a node with no home is a structural break,
 * while a stalled container is a decision waiting to be made.
 */
export function reviewExceptions(state: State): ReviewView {
  const orph = orphaned(state);
  const stall = stalled(state);
  const all = [...orph, ...stall];
  return { stalled: stall, orphaned: orph, shown: all.slice(0, REVIEW_CAP), total: all.length };
}

/** How many there are, in words. A number, never a score — it counts things
 *  that need a decision, not things anyone failed to do. */
export function reviewWords(total: number, shown: number): string {
  if (total === 1) return 'One thing needs a look.';
  if (total <= shown) return `${total} things need a look.`;
  return `${total} things need a look. These ${shown} first.`;
}

/** How long since a container last had anything happen under it. Reported only
 *  where it is knowable — silence beats a number derived from nothing. */
export function idleDays(state: State, n: NodeState, nowIso: string, zone: string): number | null {
  let newest: string | null = null;
  for (const child of heldNodes(state)) {
    if (child.parent !== n.id) continue;
    const at = child.lastDone;
    if (at && isValidIso(at) && (!newest || at > newest)) newest = at;
  }
  return newest ? calendarDaysBetween(newest, nowIso, zone) : null;
}
