// Replan cards — product law 3, "no past bucket" (ADR-0012).
//
// **There is no list of things you failed to do.** No "missed", no "overdue"
// list, no archive of what slipped. A passed hard date becomes a LIVE CARD with
// its context already assembled and three forward-facing options.
//
// The reasoning is ADR-0012's and it is worth restating, because the easy
// implementation is the forbidden one: a list of failures is a shame surface,
// and this audience usually has one already. Worse, it is useless — by the time
// something is on it, the real question is "should I still do this, and by
// when?", and a bucket answers neither half. Assembling the context is the
// expensive part and exactly the part someone with temporal myopia cannot
// reconstruct on demand.
//
// ONLY HARD CLOCKS RAISE A CARD. A passed `due` or `suspense` is a real date that
// went by. A passed `review` is the app's own "bring this back" — the gate writes
// those constantly as cures, and treating them as lapses would manufacture the
// exact shame surface law 3 forbids, at a rate of one per capture.
//
// COMPUTED, never stored. ADR-0012 says a replan is "a computed consequence of a
// clock and a current time, so it cannot be missed and cannot go stale". It also
// says "the fold generates replan.raised" — which `fold` structurally cannot do,
// being pure and having no clock. The computed reading is the one that survives;
// ADR-0034 records why.
//
// PURE. `now` and `zone` are arguments.

import type { NodeState, State } from './fold.ts';
import { heldNodes } from './gate.ts';
import { calendarDaysBetween, isValidIso } from './time.ts';
import type { ClockKind } from './events.ts';

/** Law 8 bounds what re-entry may show. Returning after a fortnight could raise
 *  many at once, and a wall of them is the pile in a new costume. The rest are
 *  not lost — the gauge still counts them, and they surface as these are dealt
 *  with (ADR-0012). */
export const REPLAN_CAP = 3;

export interface ReplanCard {
  node: NodeState;
  /** Which hard clock went by. */
  clockKind: ClockKind;
  at: string;
  /** How long ago, in whole local days. Stated plainly, never as a rebuke. */
  daysAgo: number;
  /** What this fed — assembled context, per ADR-0012. Empty until dependencies
   *  exist (build-plan item 27); the surface says so rather than implying none. */
  fed: NodeState[];
  /** A downstream commitment this was feeding, if one is known. */
  suspense: string | null;
  /** Days left before that commitment. Null when there is no suspense. */
  daysLeft: number | null;
}

/** `due` and `suspense` are real dates someone agreed to. `review` is the app's
 *  own soft return and passing one is ordinary operation, not a lapse. */
const HARD: ClockKind[] = ['due', 'suspense'];

/** Did a hard clock go by? Returns the soonest one that did. */
function passedHardClock(n: NodeState, nowIso: string, zone: string): { kind: ClockKind; at: string; daysAgo: number } | null {
  let worst: { kind: ClockKind; at: string; daysAgo: number } | null = null;
  for (const kind of HARD) {
    const c = n.clocks[kind];
    if (!c || !isValidIso(c.at)) continue;
    const days = calendarDaysBetween(nowIso, c.at, zone);
    if (days >= 0) continue;                      // not passed yet
    const daysAgo = -days;
    if (!worst || daysAgo > worst.daysAgo) worst = { kind, at: c.at, daysAgo };
  }
  return worst;
}

/**
 * Did a hard date go by on this node? The single predicate every surface asks,
 * so the list, the work surface and the replan surface cannot disagree about
 * what a passed date means. `heldStatus` needs it per-node and cannot afford to
 * build the whole projection to ask about one item.
 */
export const hasPassedHardClock = (n: NodeState, nowIso: string, zone: string): boolean =>
  passedHardClock(n, nowIso, zone) !== null;

/** Something that has already been dealt with raises nothing. A completed item,
 *  a trashed one, one on the Menu (demand-free, law 6) and one still in triage
 *  are all somebody else's business. */
function eligible(n: NodeState): boolean {
  if (n.trashed || n.mergedInto) return false;
  // Completed. This also carves out RECURRING work, deliberately: once an upkeep
  // has been done once it is running on the decay primitive, and law 5 says an
  // upkeep is never a failure to have not done yet. Raising a card because the
  // plants wanted water on Tuesday would file a rhythm as a lapse — law 3's
  // forbidden surface arriving through law 5's back door. It comes round again
  // as a chip instead, which is the honest reading.
  if (n.lastDone) return false;
  if (n.onMenu) return false;
  if (n.captured && n.route === null) return false;
  return true;
}

/**
 * Every passed hard date, worst first — the full set, uncapped, so a caller can
 * both show a few and say honestly how many there are.
 */
export function replanAll(state: State, nowIso: string, zone: string): ReplanCard[] {
  const cards: ReplanCard[] = [];
  for (const n of heldNodes(state)) {
    if (!eligible(n)) continue;
    const passed = passedHardClock(n, nowIso, zone);
    if (!passed) continue;

    // Context assembly. `fed` stays empty until `dependency.declared` exists
    // (build-plan item 27) — the surface says "nothing recorded" rather than
    // implying this feeds nothing, because those are different claims.
    const suspense = n.clocks.suspense && isValidIso(n.clocks.suspense.at) ? n.clocks.suspense.at : null;
    cards.push({
      node: n,
      clockKind: passed.kind,
      at: passed.at,
      daysAgo: passed.daysAgo,
      fed: [],
      suspense,
      daysLeft: suspense ? calendarDaysBetween(nowIso, suspense, zone) : null,
    });
  }
  // Longest-passed first, then by id so the order is total and a render never
  // reshuffles what it showed a moment ago.
  return cards.sort((a, b) => b.daysAgo - a.daysAgo || (a.node.id < b.node.id ? -1 : 1));
}

export interface ReplanView {
  /** At most REPLAN_CAP, because a wall of them is the pile in a new costume. */
  cards: ReplanCard[];
  /** How many there are in total — stated, so the cap is never a lie by omission. */
  total: number;
}

export const replanCards = (state: State, nowIso: string, zone: string): ReplanView => {
  const all = replanAll(state, nowIso, zone);
  return { cards: all.slice(0, REPLAN_CAP), total: all.length };
};

/** Ids with a live replan card. Other surfaces exclude these so one item is
 *  never shown twice with two different questions attached to it. */
export const replanIds = (state: State, nowIso: string, zone: string): Set<string> =>
  new Set(replanAll(state, nowIso, zone).map(c => c.node.id));

/** Plain words for how long ago, never a countdown and never a rebuke. The date
 *  went by; that is a fact, and the card exists to ask what to do now. */
export function replanWords(daysAgo: number): string {
  if (daysAgo <= 1) return 'that date was yesterday';
  if (daysAgo < 7) return `that date was ${daysAgo} days ago`;
  if (daysAgo < 14) return 'that date was last week';
  if (daysAgo < 60) return 'that date has been by for a while';
  return 'that date was some time ago';
}
