// What feeds what, and the dates that follow from it (build-plan item 27).
//
// This is the half of product law 3 that ADR-0012 always described and nothing
// implemented: **the assembled context**. "That date went by" is a fact anyone
// can see. *"It fed the thing you promised for the 14th, and there are four days
// left"* is the part that costs real effort to reconstruct, and it is exactly the
// part someone with temporal myopia cannot do on demand.
//
// The arithmetic is deliberately small:
//
//   latest start  =  the soonest commitment this feeds  −  how long this takes
//   buffer        =  latest start  −  today
//
// A negative buffer is not a failure state and is never called one. It means the
// dates as they stand do not fit, which is information — the whole point of
// working it out in advance is to find that out while there is still room to
// decide (law 3, law 5: no red walls).
//
// PURE. `now` and `zone` are arguments, like every other projection here.

import type { NodeState, State } from './fold.ts';
import { calendarDaysBetween, isValidIso } from './time.ts';

/** A downstream commitment, resolved to something a surface can say. */
export interface Downstream {
  node: NodeState;
  /** The commitment's own date — its `suspense` if it has one, else its `due`. */
  at: string;
  /** Whole local days from now until it. Signed: negative means it has gone by. */
  daysLeft: number;
}

export interface DependencyView {
  /** Everything this node feeds that still has a date. Soonest first. */
  feeds: Downstream[];
  /** The soonest of them, or null. This is the one the arithmetic uses. */
  soonest: Downstream | null;
  /** How long this node takes, per its declaration. Null when nobody has said. */
  leadDays: number | null;
  /**
   * The last day this can start and still land in time, as whole days from now.
   * Null when there is no downstream date or no lead estimate — the honest
   * answer to "when must I start?" is silence when a term is missing, not a
   * number derived from a guess.
   */
  latestStartInDays: number | null;
  /**
   * Days of slack. Negative means the dates do not fit as they stand.
   * Null for the same reasons as `latestStartInDays`.
   */
  bufferDays: number | null;
}

/** The commitment date a downstream node is actually judged against. A
 *  `suspense` is a promise to someone else and outranks a `due`, which is a
 *  promise to yourself. */
function commitmentAt(n: NodeState): string | null {
  for (const kind of ['suspense', 'due'] as const) {
    const c = n.clocks[kind];
    if (c && isValidIso(c.at)) return c.at;
  }
  return null;
}

/**
 * Everything one node feeds, and what that implies about when it must start.
 *
 * Downstream nodes that have been trashed, merged or completed are dropped: a
 * commitment you are no longer under cannot constrain you, and leaving it in
 * would manufacture urgency out of finished work.
 */
export function dependencyView(state: State, n: NodeState, nowIso: string, zone: string): DependencyView {
  const feeds: Downstream[] = [];
  for (const id of n.feeds) {
    const target = state.nodes.get(id);
    if (!target || target.trashed || target.mergedInto || target.lastDone) continue;
    const at = commitmentAt(target);
    if (!at) continue;
    feeds.push({ node: target, at, daysLeft: calendarDaysBetween(nowIso, at, zone) });
  }
  // Soonest first, then by id so the order is total and a render never
  // reshuffles what it just showed.
  feeds.sort((a, b) => a.daysLeft - b.daysLeft || (a.node.id < b.node.id ? -1 : 1));

  const soonest = feeds[0] ?? null;
  const lead = Number.isFinite(n.leadDays) && (n.leadDays ?? 0) > 0 ? n.leadDays! : null;
  const latestStartInDays = soonest && lead !== null ? soonest.daysLeft - lead : null;
  return {
    feeds,
    soonest,
    leadDays: lead,
    latestStartInDays,
    // Buffer IS latest-start expressed from today, which is why they are the
    // same number. Both are exposed because they answer different questions —
    // "when must I start" and "how much room is there" — and a surface should
    // not have to do arithmetic to ask the second.
    bufferDays: latestStartInDays,
  };
}

/** Which nodes feed this one — the reverse edge, computed rather than stored, so
 *  there is one place a dependency can be wrong instead of two. */
export const fedBy = (state: State, id: string): NodeState[] =>
  [...state.nodes.values()]
    .filter(n => !n.trashed && !n.mergedInto && n.feeds.includes(id))
    .sort((a, b) => (a.id < b.id ? -1 : 1));

/**
 * Would declaring `from → to` create a cycle?
 *
 * A cycle is not a user error to be reported after the fact — it is a claim that
 * two things each have to happen before the other, which has no meaning and no
 * fix. The write boundary refuses it, so the graph is acyclic by construction
 * and nothing downstream has to defend against infinite walks.
 */
export function wouldCycle(state: State, from: string, to: string): boolean {
  if (from === to) return true;
  const seen = new Set<string>([from]);
  const stack = [to];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (id === from) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    const n = state.nodes.get(id);
    if (n) stack.push(...n.feeds);
  }
  return false;
}

/** Plain words for the arithmetic. Never a countdown, never a rebuke — it states
 *  what the dates imply and leaves the decision where it belongs. */
export function dependencyWords(v: DependencyView): string | null {
  if (!v.soonest) return null;
  const what = v.soonest.node.title || '(untitled)';
  if (v.latestStartInDays === null) {
    // A commitment with no lead estimate. Say the commitment, say nothing about
    // timing — an invented estimate would be the app deciding how long the
    // user's own work takes.
    return v.soonest.daysLeft < 0
      ? `it feeds "${what}", and that date has gone by`
      : `it feeds "${what}", ${dayPhrase(v.soonest.daysLeft)}`;
  }
  if (v.latestStartInDays < 0) {
    // The honest sentence. Not "you are behind" — the DATES do not fit, which is
    // a fact about the plan and not about the person, and it is fixable by
    // moving either end.
    return `it feeds "${what}", and to make that date it needed starting ` +
      `${Math.abs(v.latestStartInDays)} day${Math.abs(v.latestStartInDays) === 1 ? '' : 's'} ago`;
  }
  if (v.latestStartInDays === 0) return `it feeds "${what}" — today is the last day to start it`;
  return `it feeds "${what}" — start it within ${v.latestStartInDays} day${v.latestStartInDays === 1 ? '' : 's'}`;
}

const dayPhrase = (d: number): string =>
  d === 0 ? 'which is today' : d === 1 ? 'which is tomorrow' : `which is ${d} days away`;
