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
import { NO_REPLAN_CARD } from './kinds.ts';
import { calendarDaysBetween, isValidIso } from './time.ts';
import type { ClockKind, NodeKind } from './events.ts';

/** Law 8 bounds what re-entry may show. Returning after a fortnight could raise
 *  many at once, and a wall of them is the pile in a new costume. The rest are
 *  not lost — the gauge still counts them, and they surface as these are dealt
 *  with (ADR-0012). */
export const REPLAN_CAP = 3;

export interface ReplanCard {
  node: NodeState;
  /** Which hard clock the card is ABOUT — the longest-passed one, which is what
   *  the words describe. */
  clockKind: ClockKind;
  /**
   * EVERY hard clock that went by, not just the one named above.
   *
   * A resolution has to retire all of them or it resolves nothing: retiring one
   * of two passed clocks left the card raised, so four of the five options were
   * buttons that did nothing while announcing that they had (audit, two
   * independent reproductions). `clockKind` is for the sentence; this is for the
   * decision.
   */
  passedKinds: ClockKind[];
  at: string;
  /** How long ago, in whole local days. Stated plainly, never as a rebuke. */
  daysAgo: number;
  /** What this fed — assembled context, per ADR-0012. Always empty until
   *  `dependency.declared` exists (build-plan item 27). The surface renders no
   *  line for it rather than printing "nothing recorded" on every card: that
   *  would read as a claim this feeds nothing, which is a different statement
   *  from "the app cannot know yet", and it is not one the data supports. */
  fed: NodeState[];
  /** A downstream commitment this was feeding, if one is known. */
  suspense: string | null;
  /** Days left before that commitment. Null when there is no suspense. */
  daysLeft: number | null;
}

/** `due` and `suspense` are real dates someone agreed to. `review` is the app's
 *  own soft return and passing one is ordinary operation, not a lapse. */
const HARD: ClockKind[] = ['due', 'suspense'];

interface Passed { kind: ClockKind; at: string; daysAgo: number }

/**
 * Every hard clock that went by, LONGEST-passed first.
 *
 * Returning only one was the root of two high-severity defects: the card named
 * one clock and the resolution retired only that one, so a node carrying both a
 * passed `due` and a passed `suspense` came straight back for four of the five
 * options. The caller needs the whole set; which one leads is a display
 * question, answered by taking the head.
 */
function passedHardClocks(n: NodeState, nowIso: string, zone: string): Passed[] {
  const out: Passed[] = [];
  for (const kind of HARD) {
    const c = n.clocks[kind];
    if (!c || !isValidIso(c.at)) continue;
    const days = calendarDaysBetween(nowIso, c.at, zone);
    if (days >= 0) continue;                      // not passed yet
    out.push({ kind, at: c.at, daysAgo: -days });
  }
  // Longest-passed leads, then by kind name so the order is total and the card
  // never renames itself between two renders of the same state.
  return out.sort((a, b) => b.daysAgo - a.daysAgo || (a.kind < b.kind ? -1 : 1));
}

/**
 * Does this node raise a replan card? The single predicate every surface asks.
 *
 * It is the WHOLE question — eligibility and a passed clock — not half of it.
 * `held.ts` previously asked only about the clock and relied on its own earlier
 * branches to have filtered the rest, which made the agreement between the list
 * and this surface a property of branch ORDER rather than of the definition. A
 * later change to that order would have broken it silently.
 */
export const raisesReplanCard = (n: NodeState, nowIso: string, zone: string): boolean =>
  eligible(n) && passedHardClocks(n, nowIso, zone).length > 0;

/** Something that has already been dealt with raises nothing. A completed item,
 *  a trashed one, one on the Menu (demand-free, law 6) and one still in triage
 *  are all somebody else's business. */
function eligible(n: NodeState): boolean {
  if (n.trashed || n.mergedInto) return false;
  // A goal or an area cannot have lapsed — law 4 says levels push down and the
  // runway is the only workspace. Without this an Area with a due date was
  // refused by Next-up under that law and offered five action-shaped buttons
  // here at the same time, one of which turned it into a waiting-for (audit).
  if (NO_REPLAN_CARD.has(n.kind as NodeKind)) return false;
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
    const all = passedHardClocks(n, nowIso, zone);
    const passed = all[0];
    if (!passed) continue;

    // Context assembly. `fed` stays empty until `dependency.declared` exists
    // (build-plan item 27) — the surface renders no line for it rather than
    // claiming this feeds nothing, which is a different statement.
    const suspense = n.clocks.suspense && isValidIso(n.clocks.suspense.at) ? n.clocks.suspense.at : null;
    cards.push({
      node: n,
      passedKinds: all.map(p => p.kind),
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

/**
 * The assembled context, in words — the expensive half of ADR-0012, and the part
 * someone with temporal myopia cannot reconstruct on demand. Null when there is
 * nothing true to say, because a line reading "nothing recorded" on every card
 * is noise, and noise on this surface is what makes it a wall.
 *
 * Every branch is guarded on what the data actually supports (Doctrine §5). A
 * commitment that has ALSO gone by must not be announced as "5 days from now" —
 * `daysLeft` is signed, and printing it unguarded would state a future for a
 * date already behind you.
 *
 * It describes the node's OWN suspense clock, and says so. It used to read "the
 * commitment this **fed**", which asserted a dependency that does not exist in
 * the log at all: `fed` is always empty until `dependency.declared` is built, so
 * there was no recorded feeding relationship to describe (audit). The date and
 * the count were right; the relationship was invented.
 */
export function contextWords(card: ReplanCard, zone: string): string | null {
  // When the passed clock IS the suspense, the card is already about it; saying
  // it twice in two different phrasings is one item asked two questions.
  if (card.clockKind === 'suspense') return null;
  if (card.suspense === null || card.daysLeft === null) return null;
  if (card.daysLeft < 0) return 'it also carries a commitment, and that date has gone by too';
  if (card.daysLeft === 0) return 'it also carries a commitment, and that is today';
  if (card.daysLeft === 1) return 'it also carries a commitment, and that is tomorrow';
  const when = new Date(card.suspense).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric',
    ...(card.daysLeft >= 365 ? { year: 'numeric' } : {}),
    timeZone: zone,
  });
  return `it also carries a commitment on ${when}, ${card.daysLeft} days from now`;
}

/** Plain words for how long ago, never a countdown and never a rebuke. The date
 *  went by; that is a fact, and the card exists to ask what to do now. */
export function replanWords(daysAgo: number): string {
  if (daysAgo <= 1) return 'that date was yesterday';
  if (daysAgo < 7) return `that date was ${daysAgo} days ago`;
  if (daysAgo < 14) return 'that date was last week';
  if (daysAgo < 60) return 'that date has been by for a while';
  return 'that date was some time ago';
}
