// Review, done as EXCEPTIONS ONLY (v1 Must: stalled/orphan detection).
//
// The classic weekly review asks you to look at everything. That is precisely
// the thing this audience cannot do, and the reason most review habits die: the
// cost is paid up front, every time, whether or not anything is wrong.
//
// So this surface never shows you your work. It shows you the four things that
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
// **Quiet area** (`dormant` in ADR-0013's vocabulary, 1.6.0) — an area that
// HOLDS live work where nothing has finished in a month. Distinct from
// stalled: stalled has nothing that could move, a quiet area has plenty and
// none of it is moving. The words are shame-free by design — a dormant
// perennial has not failed (ADR-0020); rest is legitimate, and the question
// is only whether it is rest.
//
// **Unfed goal** (`unsupported goal` in ADR-0013's vocabulary, 1.6.0) — a goal
// with nothing live beneath it feeding it. A goal is a stated direction, and a
// direction nothing serves is a decision waiting: feed it, or let it be a wish
// on the Menu. (Named "unfed" in code and copy — "unsupported" is a banned
// token in the update-copy gate, and one word with two meanings in one
// codebase is a collision waiting.)
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
  /** Goals with nothing live feeding them (1.6.0). */
  unfed: ReviewException[];
  /** Areas holding live work where nothing has finished in a month (1.6.0). */
  quiet: ReviewException[];
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
    // A goal with nothing under it is the UNFED class (1.6.0), with its own
    // words — the classes partition by kind so a node is never listed twice.
    if (n.kind === 'goal') continue;
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
 * Goals with nothing live feeding them (1.6.0 — ADR-0013's "unsupported
 * goal", named UNFED here: "unsupported" is a banned token in the update-copy
 * gate, and one word carrying two meanings in one codebase is a collision).
 * A goal is a stated direction; a direction nothing serves is a decision
 * waiting — feed it, or let it be a wish on the Menu.
 */
export function unfedGoals(state: State): ReviewException[] {
  const childrenOf = new Map<string, NodeState[]>();
  for (const n of heldNodes(state)) {
    if (!n.parent) continue;
    if (!childrenOf.has(n.parent)) childrenOf.set(n.parent, []);
    childrenOf.get(n.parent)!.push(n);
  }
  // TRANSITIVE, unlike stalled's direct check: a goal is normally fed through
  // a project, and a project is a container, not live work — asking only the
  // direct children would call every properly-structured goal unfed. Explicit
  // stack, cycle-guarded, like every walk here.
  const fedBeneath = (id: string): boolean => {
    const stack = [...(childrenOf.get(id) ?? [])];
    const seen = new Set<string>();
    while (stack.length > 0) {
      const c = stack.pop()!;
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      if (isLiveWork(c)) return true;
      stack.push(...(childrenOf.get(c.id) ?? []));
    }
    return false;
  };
  const out: ReviewException[] = [];
  for (const n of heldNodes(state)) {
    if (n.kind !== 'goal' || n.lastDone) continue;
    if (fedBeneath(n.id)) continue;
    out.push({ node: n, words: 'nothing is feeding it' });
  }
  return out.sort((a, b) => (a.node.id < b.node.id ? -1 : 1));
}

/** How long an area may hold live work with nothing finishing before Review
 *  asks. A month: long enough that rest is plausibly over, short enough that
 *  a season cannot slip by unnoticed. */
export const QUIET_DAYS = 30;

/**
 * Areas holding live work where nothing has finished in a month (1.6.0 —
 * ADR-0013's "dormant"). DISTINCT from stalled: stalled has nothing that
 * could move; a quiet area has plenty, and none of it is moving. Only
 * KNOWABLE rest counts — an area where nothing has ever finished reports
 * null idleDays and stays out, because a number derived from nothing is not
 * a fact (the idleDays rule). The words are shame-free: a dormant perennial
 * has not failed (ADR-0020), and the question is only whether it is rest.
 */
export function quietAreas(state: State, nowIso: string, zone: string): ReviewException[] {
  const childrenOf = new Map<string, NodeState[]>();
  for (const n of heldNodes(state)) {
    if (!n.parent) continue;
    if (!childrenOf.has(n.parent)) childrenOf.set(n.parent, []);
    childrenOf.get(n.parent)!.push(n);
  }
  const out: ReviewException[] = [];
  for (const n of heldNodes(state)) {
    if (n.kind !== 'area' || n.lastDone) continue;
    const kids = childrenOf.get(n.id) ?? [];
    if (!kids.some(isLiveWork)) continue;     // that is stalled's case, not this
    const idle = idleDays(state, n, nowIso, zone);
    if (idle === null || idle < QUIET_DAYS) continue;
    out.push({ node: n, words: 'holding work, and nothing has finished in a month' });
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
 * The whole surface — the four exceptions (item 36), ranked: structural
 * breaks first (orphans), then decisions waiting (stalled, unfed goals),
 * then rhythm (quiet areas). REVIEW_CAP is unchanged; a lower-ranked class
 * waiting its turn is law 8 working, and the total states everything.
 */
export function reviewExceptions(state: State, nowIso: string, zone: string): ReviewView {
  const orph = orphaned(state);
  const stall = stalled(state);
  const unfed = unfedGoals(state);
  const quiet = quietAreas(state, nowIso, zone);
  const all = [...orph, ...stall, ...unfed, ...quiet];
  return {
    stalled: stall, orphaned: orph, unfed, quiet,
    shown: all.slice(0, REVIEW_CAP), total: all.length,
  };
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
