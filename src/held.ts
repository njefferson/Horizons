// What you are holding, grouped — the todo list (Phase 3.5).
//
// The held surface was a flat, newest-first list of everything not trashed:
// unrouted inbox items, Menu items and completed work all mixed together with no
// way to tell them apart. At twenty items that is the pile this app exists to
// stand between you and. Worse, a completed item keeps the gate's cure clock, so
// it rendered as "returns today" while being finished — copy the data does not
// support.
//
// Groups are COMPUTED, never stored, in a fixed order. Nothing here is a score:
// there are no counts of things you did not do, no streaks, and Done sits last
// and quiet because it is a record, not a reward (law 5).
//
// PURE. `now` and `zone` are arguments, like everywhere else.

import type { NodeState, State } from './fold.ts';
import { heldNodes } from './gate.ts';
import { calendarDaysBetween, isValidIso } from './time.ts';

export type HeldGroupKey = 'unsorted' | 'ready' | 'soon' | 'later' | 'menu' | 'done';

export interface HeldGroup {
  key: HeldGroupKey;
  /** Plain words, and the only channel the grouping depends on (B-01). */
  title: string;
  items: NodeState[];
}

/** How far out "Coming up" reaches before something is simply "Later". A week is
 *  the horizon a person can actually hold in their head. */
export const SOON_DAYS = 7;

/** The soonest instant any demanding clock will bring this back, or null.
 *  `park` is excluded: a parked thing is being held away from you on purpose. */
function soonestDemand(n: NodeState, zone: string, nowIso: string): number | null {
  let best: number | null = null;
  for (const c of Object.values(n.clocks)) {
    if (!c || c.kind === 'park' || !isValidIso(c.at)) continue;
    const days = calendarDaysBetween(nowIso, c.at, zone);
    if (best === null || days < best) best = days;
  }
  return best;
}

/**
 * Exactly one group per held node — the grouping is TOTAL, so the sum of the
 * groups always equals `heldNodes(state).length`, which is the same definition
 * the coverage gauge counts. The number and the list cannot drift apart.
 *
 * Order of the tests matters and is the design:
 *  - **Done first**, so a completed thing stops claiming it is coming back
 *    whatever clock the gate left on it.
 *  - **Menu next**, because a Menu item is demand-free by law and must never be
 *    filed under a heading that implies it is asking for something (law 6).
 *  - **Unsorted next**, because triage owns those and the list should say so
 *    rather than quietly mixing them in with decided work.
 *  - Then by when it comes back.
 */
export function heldGroups(state: State, nowIso: string, zone: string): HeldGroup[] {
  const buckets: Record<HeldGroupKey, NodeState[]> = {
    unsorted: [], ready: [], soon: [], later: [], menu: [], done: [],
  };

  for (const n of heldNodes(state)) {
    if (n.lastDone) { buckets.done.push(n); continue; }
    if (n.onMenu) { buckets.menu.push(n); continue; }
    if (n.captured && n.route === null) { buckets.unsorted.push(n); continue; }
    const days = soonestDemand(n, zone, nowIso);
    if (days === null) { buckets.later.push(n); continue; }   // held, but nothing asking
    if (days <= 0) { buckets.ready.push(n); continue; }
    if (days <= SOON_DAYS) { buckets.soon.push(n); continue; }
    buckets.later.push(n);
  }

  // Newest first within a group — capture order is the only order this surface
  // claims, and ULIDs sort by time.
  const newestFirst = (a: NodeState, b: NodeState): number => (a.id < b.id ? 1 : -1);

  const ORDER: [HeldGroupKey, string][] = [
    ['unsorted', 'Not sorted yet'],
    ['ready', 'Ready now'],
    ['soon', 'Coming up'],
    ['later', 'Later'],
    ['menu', 'On the Menu'],
    ['done', 'Done'],
  ];
  return ORDER
    .map(([key, title]) => ({ key, title, items: buckets[key].sort(newestFirst) }))
    .filter(g => g.items.length > 0);   // an empty group is not a heading
}

/** The status line for one card, in words. Never a countdown, never a rebuke,
 *  and never a claim the data does not support — a finished thing says so
 *  instead of reporting the cure clock it happens to carry. */
export function heldStatus(n: NodeState, nowIso: string, zone: string): string {
  if (n.lastDone) return 'done';
  if (n.onMenu) return 'on the Menu';
  if (n.captured && n.route === null) return 'not sorted yet';
  const days = soonestDemand(n, zone, nowIso);
  if (days === null) return 'held';
  if (days < 0) return 'ready now';
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days < SOON_DAYS) return `in ${days} days`;
  const clock = Object.values(n.clocks).find(c => c && c.kind !== 'park' && isValidIso(c.at));
  return clock
    ? new Date(clock.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: zone })
    : 'held';
}
