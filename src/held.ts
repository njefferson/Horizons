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

import { isAppClock, type NodeState, type State } from './fold.ts';
import { heldNodes } from './gate.ts';
import { isReadyAgain, pressureOf } from './pressure.ts';
import { raisesReplanCard } from './replan.ts';
import { calendarDaysBetween, isValidIso } from './time.ts';

export type HeldGroupKey = 'unsorted' | 'replan' | 'ready' | 'soon' | 'later' | 'menu' | 'done';

export interface HeldGroup {
  key: HeldGroupKey;
  /** Plain words, and the only channel the grouping depends on (B-01). */
  title: string;
  items: NodeState[];
}

/** How far out "Coming up" reaches before something is simply "Later". A week is
 *  the horizon a person can actually hold in their head. */
export const SOON_DAYS = 7;

/**
 * The soonest demanding clock — the CLOCK, not just its distance.
 *
 * Returning only a day count was a real defect: the status line then picked a
 * clock of its own (the first in insertion order) and printed ITS date, so a card
 * grouped on a due date nine days out could print the review date four hundred
 * days out. Grouping and words must name the same clock or the card states a
 * date the data does not support (Doctrine §5) — the exact class ADR-0032 exists
 * to have fixed.
 *
 * `park` is excluded from DEMAND: a parked thing is being held away from you on
 * purpose, so it must not make something "Ready now". It is reported separately.
 */
function soonestDemand(n: NodeState, zone: string, nowIso: string): { days: number; at: string } | null {
  // App clocks excluded too, and for the same reason `park` is: a gate cure is not
  // a demand. It exists so nothing goes silent, and reading it as "ready" made
  // every undated thing claim a place in today.
  return soonestClock(n, zone, nowIso, false, false);
}

/**
 * The soonest clock that will bring this node back, compared as INSTANTS.
 *
 * `includePark` is why this is one function rather than two. A park is not a
 * DEMAND — it is held away from you on purpose, so it must never make something
 * "Ready now" — but it IS a return date, and anything asking "when does this come
 * back" (the calendar) must count it. `src/ics.ts` had its own copy that excluded
 * park, so an item the list displayed as "parked until Aug 1" was silently
 * missing from the calendar: the app contradicting itself, which is precisely
 * what ADR-0032 claims one definition prevents.
 *
 * `Date.parse`, never a string compare. That duplicate sorted `c.at`
 * LEXICOGRAPHICALLY, which matches instant order only while every stored
 * timestamp is a Z-suffixed ISO string of identical shape — and nothing enforces
 * that, since `isValidIso` accepts any format `Date.parse` handles and import
 * validates none. An offset-form timestamp made the card and the calendar name
 * different days for the same node (audit).
 */
export function soonestClock(
  n: NodeState, zone: string, nowIso: string, includePark: boolean,
  /**
   * Count clocks the APP set (gate cures)?
   *
   * `false` when deciding whether something is ready or coming up, because a cure
   * says "this will come back to you", not "this is due". With cures counted, every
   * dateless thing sat in "Ready now" — Noah imported 1,429 items and the heading
   * claimed 1,055 were ready today, which was arithmetically true and completely
   * false as a statement about his day.
   *
   * `true` when the question is "does this have any clock at all", which is what
   * law 1 and the parked-until line are about.
   */
  includeAppClocks = true,
): { days: number; at: string } | null {
  let best: { days: number; at: string; ms: number } | null = null;
  for (const c of Object.values(n.clocks)) {
    if (!c || !isValidIso(c.at)) continue;
    if (!includePark && c.kind === 'park') continue;
    if (!includeAppClocks && isAppClock(c)) continue;
    const ms = Date.parse(c.at);
    if (best === null || ms < best.ms) {
      best = { days: calendarDaysBetween(nowIso, c.at, zone), at: c.at, ms };
    }
  }
  return best ? { days: best.days, at: best.at } : null;
}

/** A park is not a demand, but it is still a return, and the surface should be
 *  able to say so rather than calling a thing coming back tomorrow "held". */
function parkedUntil(n: NodeState): string | null {
  const p = n.clocks.park;
  return p && isValidIso(p.at) ? p.at : null;
}

/** A date a year or more away must say which year. "Sep 1" for 2036 is
 *  indistinguishable from this September, in an app whose whole job is telling
 *  you when something comes back. */
function dateWords(at: string, zone: string, days: number): string {
  return new Date(at).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric',
    ...(Math.abs(days) >= 365 ? { year: 'numeric' } : {}),
    timeZone: zone,
  });
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
 *  - **Then a passed hard date**, which is a decision rather than a return, and
 *    must not be filed under a heading that says it is ready to be got on with.
 *  - Then by when it comes back.
 */
export function heldGroups(state: State, nowIso: string, zone: string): HeldGroup[] {
  const buckets: Record<HeldGroupKey, NodeState[]> = {
    unsorted: [], replan: [], ready: [], soon: [], later: [], menu: [], done: [],
  };

  for (const n of heldNodes(state)) {
    // A SPENT resume card is not a thing you are holding. It is the residue of a
    // thread you have already picked back up — or let go — and it carries a cure
    // clock like every other node, so without this it sat in "Ready now" for
    // ever, reading "where you left off" about work that was finished. Next up
    // has excluded spent cards since the tier existed; the held list did not,
    // and the two surfaces disagreed (smoke).
    //
    // The card is not trashed and not hidden from an export: it happened, and
    // the log says so. It simply is not work.
    if (n.kind === 'resume-card' && n.resumeSpent) continue;
    // DONE, and not still running on a cadence. The unconditional version filed
    // a recurring upkeep that had come round again under "Done" while
    // `upkeepChips` was offering it as live work — one node, one screen, two
    // contradictory statements, which is the class this file's own header says
    // it exists to remove (audit). Asked of the same predicate `nextup.ts` uses,
    // so the list and the chip cannot disagree about whether a rhythm is over.
    if (n.lastDone && !isReadyAgain(pressureOf(n, nowIso, zone))) { buckets.done.push(n); continue; }
    if (n.onMenu) { buckets.menu.push(n); continue; }
    if (n.captured && n.route === null) { buckets.unsorted.push(n); continue; }
    // A hard date that went by gets its OWN heading, and this is not cosmetic.
    // Filed under "Ready now" the rows read as ordinary work — the same items
    // the replan surface directly above is asking a different question about,
    // so one screen showed one item twice with two questions attached. That is
    // precisely what excluding them from Next-up prevents, relocated. They stay
    // in the list, because the sum of these groups is what the coverage gauge
    // counts; only the heading changes, so the list and the surface agree.
    //
    // `raisesReplanCard` is the WHOLE question — eligibility and a passed clock.
    // Asking only about the clock made this agree with the replan surface by
    // accident of branch order, and the branch above has just changed, which is
    // exactly how that kind of agreement breaks silently.
    if (raisesReplanCard(n, nowIso, zone)) { buckets.replan.push(n); continue; }
    const soon = soonestDemand(n, zone, nowIso);
    if (soon === null) { buckets.later.push(n); continue; }   // held, but nothing asking
    if (soon.days <= 0) { buckets.ready.push(n); continue; }
    if (soon.days <= SOON_DAYS) { buckets.soon.push(n); continue; }
    buckets.later.push(n);
  }

  // Newest first within a group — capture order is the only order this surface
  // claims, and ULIDs sort by time.
  const newestFirst = (a: NodeState, b: NodeState): number => (a.id < b.id ? 1 : -1);

  const ORDER: [HeldGroupKey, string][] = [
    ['unsorted', 'Not sorted yet'],
    // The same words as the surface above and the same words as the row's own
    // status, deliberately. Three different phrasings for one state is three
    // things to learn.
    ['replan', 'Needs a new plan'],
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
  // Same guard, same order, same reasons as `heldGroups` — the two must agree
  // node for node, and a status that disagreed with its own heading is the
  // defect ADR-0032 exists to have fixed.
  if (n.lastDone && !isReadyAgain(pressureOf(n, nowIso, zone))) return 'done';
  if (n.onMenu) return 'on the Menu';
  if (n.captured && n.route === null) return 'not sorted yet';
  // A hard date that went by is not "ready now" — that phrasing invites doing it
  // now, which is the one answer the date already ruled out, and it is the same
  // words the list uses for something simply waiting. It is a DECISION, and the
  // replan surface is where it gets made (law 3). Asked of the identical
  // predicate that raises the card, so the two surfaces cannot describe one item
  // differently — and it asks the WHOLE question rather than relying on the
  // branches above to have filtered first.
  if (raisesReplanCard(n, nowIso, zone)) return 'needs a new plan';
  const soon = soonestDemand(n, zone, nowIso);
  if (soon === null) {
    // Nothing is demanding it — but a park is still a return date, and saying
    // "held" about something coming back tomorrow tells the user less than the
    // app knows.
    const park = parkedUntil(n);
    if (!park) return 'held';
    const d = calendarDaysBetween(nowIso, park, zone);
    if (d <= 0) return 'back now';
    if (d === 1) return 'parked until tomorrow';
    return `parked until ${dateWords(park, zone, d)}`;
  }
  const { days, at } = soon;
  if (days < 0) return 'ready now';
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  // `<=`, matching the group boundary exactly. They disagreed by one, so the last
  // day of "Coming up" printed a date instead of "in 7 days".
  if (days <= SOON_DAYS) return `in ${days} days`;
  return dateWords(at, zone, days);
}

/**
 * How many LIVE things sit directly under each node — computed once, so a card
 * can say what it contains without every card re-scanning the store.
 *
 * The point is disambiguation, not decoration. An OmniFocus import brings a
 * project's actions in parented to it, but the flat list drew them the same as a
 * loose inbox item — so a thing already filed under "Boy Scouts" looked exactly
 * like something still needing a home, and a backlog could not be processed
 * because nothing said which was which (Noah, on device). A trashed or merged
 * child is not something a node holds, so it does not count.
 */
export function liveChildCounts(state: State): Map<string, number> {
  const counts = new Map<string, number>();
  for (const n of state.nodes.values()) {
    if (n.trashed || n.mergedInto || !n.parent) continue;
    counts.set(n.parent, (counts.get(n.parent) ?? 0) + 1);
  }
  return counts;
}

/**
 * The title of the live container a node sits in, or null.
 *
 * A card uses it to say "in <project>", so an imported action that already
 * belongs somewhere does not read like loose work. A trashed or merged-away
 * parent confers no home and returns null — the node really is loose again.
 */
export function parentTitleOf(n: NodeState, state: State): string | null {
  if (!n.parent) return null;
  const p = state.nodes.get(n.parent);
  if (!p || p.trashed || p.mergedInto) return null;
  return p.title || '(untitled)';
}

/**
 * The one line a card shows about where a node sits in the structure: the
 * container it is in, and/or how many things are under it. Either, both, or
 * neither — a loose action with no parent and no children returns null and reads
 * as exactly what it is. One definition, so the list and any test agree.
 */
export function placeWords(n: NodeState, state: State, childCounts: Map<string, number>): string | null {
  const parts: string[] = [];
  const parent = parentTitleOf(n, state);
  if (parent) parts.push(`in ${parent}`);
  const kids = childCounts.get(n.id) ?? 0;
  if (kids > 0) parts.push(kids === 1 ? '1 under it' : `${kids} under it`);
  return parts.length ? parts.join(' · ') : null;
}

/**
 * Held, but carrying no date anybody chose — the honest size of "you have not
 * decided about these yet".
 *
 * Exists because "nothing is asking" is true and unhelpful on its own. Noah
 * imported 1,429 things, none of them dated, and the work surface correctly had
 * nothing to offer — which reads as an empty app rather than as a full one waiting
 * on a decision. This is the number that makes the difference sayable.
 */
export function undatedCount(state: State, nowIso: string, zone: string): number {
  let n = 0;
  for (const node of heldNodes(state)) {
    if (node.lastDone) continue;
    if (node.onMenu) continue;
    if (node.captured && node.route === null) continue;   // the inbox says this already
    if (soonestDemand(node, zone, nowIso) === null) n++;
  }
  return n;
}

