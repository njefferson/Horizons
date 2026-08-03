// The printable today-card (v1.5).
//
// One page, on paper, for when the iPad is not the right object — a meeting
// where a screen is rude, a workshop, a day the battery is going to lose.
//
// **It is a snapshot and it says so.** Paper cannot update, cannot be ticked off
// into the log, and cannot know that you finished something an hour after
// printing it. Every honest thing this app does about the `.ics` export applies
// here in stronger form, so the card carries the moment it was made and says
// plainly that the app is still the place where things are true.
//
// **It is bounded, like every other re-entry-shaped surface.** A page you print
// is a page you will look at when you are already short of attention; printing
// the whole list would produce the pile in a form you cannot even collapse.
//
// PURE. `now` and `zone` are arguments.

import type { NodeState, State } from './fold.ts';
import { heldNodes } from './gate.ts';
import { workSurface } from './nextup.ts';
import { waitingOnAnyone, withWhom, waitingWords } from './people.ts';
import { calendarDaysBetween, isValidIso, localDayKey } from './time.ts';

/** What one page can carry without becoming the pile. Deliberately the same
 *  order of magnitude as every other capped surface in this app. */
export const TODAY_CAP = 7;
export const AHEAD_CAP = 5;
export const WITH_OTHERS_CAP = 5;

export interface TodayCard {
  /** The local day it describes. */
  day: string;
  /** The instant it was made — paper cannot update, so it must be datable. */
  at: string;
  /** The one thing, if anything is asking. */
  head: { title: string; why: string } | null;
  /** What else is ready, capped. */
  also: string[];
  /** The true number ready, so the cap is never a lie by omission. */
  alsoTotal: number;
  /** What is with somebody else, capped. */
  withOthers: { title: string; whom: string | null; how: string | null }[];
  withOthersTotal: number;
  /** Dates coming up, capped. */
  ahead: { day: string; title: string }[];
  aheadTotal: number;
}

const title = (n: NodeState): string => n.title || '(untitled)';

/**
 * Today, on one page.
 *
 * Built from the SAME projections the screen uses — `nextUp` for the one thing
 * and the list behind it, `waitingOnAnyone` for what is with other people. A
 * second definition of "what matters today" would eventually disagree with the
 * first, and then the paper and the app would be telling you different things
 * while both looked authoritative.
 */
export function todayCard(state: State, nowIso: string, zone: string, aheadDays = 7): TodayCard {
  // `workSurface`, NOT `nextUp` — corrected by the seam audit (1.17.3). The
  // docstring above promised "the SAME projections the screen uses" while the
  // code called the raw queue: the screen subtracts upkeep chips (they have
  // their own strip) and everything holding a live replan card (law 3 — a
  // passed date is a DECISION, and printing it as "the one thing" hands you the
  // lapsed commitment as if it were ordinary work). So the paper offered items
  // the screen deliberately does not, and both looked authoritative.
  const up = workSurface(state, nowIso, zone).up;
  const behind = up.behind;

  const owed = waitingOnAnyone(state, nowIso, zone);
  const ahead: { day: string; title: string; days: number }[] = [];
  for (const n of heldNodes(state)) {
    if (n.lastDone) continue;
    const c = n.clocks.due ?? n.clocks.suspense;
    if (!c || !isValidIso(c.at)) continue;
    const days = calendarDaysBetween(nowIso, c.at, zone);
    if (days < 0 || days > aheadDays) continue;
    ahead.push({ day: localDayKey(c.at, zone), title: title(n), days });
  }
  ahead.sort((a, b) => a.days - b.days || (a.title < b.title ? -1 : 1));

  return {
    day: localDayKey(nowIso, zone),
    at: nowIso,
    head: up.head ? { title: title(up.head.node), why: up.head.words } : null,
    also: behind.slice(0, TODAY_CAP).map(i => title(i.node)),
    // `up.total`, NOT `behind.length`. `nextUp.behind` is itself capped at five,
    // so counting it reported "nothing was held back" while thirty-three things
    // were — the page claiming to state a true total and stating a cap instead,
    // which is the exact lie-by-omission every capped surface here exists to
    // avoid. Minus the head, which is printed above it.
    alsoTotal: Math.max(0, up.total - (up.head ? 1 : 0)),
    withOthers: owed.slice(0, WITH_OTHERS_CAP).map(l => ({
      title: title(l.node),
      whom: withWhom(state, l.node),
      how: waitingWords(l.days),
    })),
    withOthersTotal: owed.length,
    ahead: ahead.slice(0, AHEAD_CAP).map(a => ({ day: a.day, title: a.title })),
    aheadTotal: ahead.length,
  };
}

/**
 * The line that keeps the paper honest.
 *
 * Paper cannot update and cannot be ticked off. Somebody holding a printout at
 * four o'clock needs to know it stopped being true at nine, and the app must say
 * that itself rather than relying on them to remember.
 */
export function snapshotWords(day: string): string {
  return `Printed ${day}. This is a snapshot — it does not update, and ticking something off here does not reach Quietkeep.`;
}

/** "and 4 more" — the cap stated, never hidden. Silence when nothing is held
 *  back, because "and 0 more" is a number pretending to be information. */
export function moreWords(total: number, shown: number): string | null {
  const rest = total - shown;
  return rest > 0 ? `and ${rest} more` : null;
}

/** Nothing asking is a real and good state, and it is said plainly rather than
 *  left as an empty page somebody will assume is a bug. */
export const EMPTY_WORDS = 'Nothing is asking today.';
