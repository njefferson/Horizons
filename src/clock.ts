// The header clock (1.22.0) — three facts, none of them invented.
//
// Requested as an analog clock in the chrome, to fight time blindness. A dial
// on its own reads NOW, and time blindness is not ignorance of the current time
// — docs/nd-collisions.md entry 4: the future carries no weight until it
// becomes now, so a thing at four o'clock is weightless at two and an emergency
// at ten past four, with nothing in between.
//
// What gives the day weight is watching it drain. So the clock carries the
// REMAINDER as well as the time: how much of today is left, as a plain number
// of hours and minutes. A shrinking remainder is the gradient the decay
// primitive gives to everything else, applied to the day itself.
//
// ## What it deliberately does NOT say
//
// It does not count down to an appointment, because this app does not know when
// anything happens. Every clock here is DAY-GRANULAR: `clock.set` takes a
// datetime, and every writer builds it with `endOfLocalDay`. There is no time
// input anywhere in the app. "Your nine o'clock is in 1h 40m" would therefore
// be a fabricated number, which is exactly what ADR-0010 refuses — and the
// export path is one-way, so nothing can be read back from a calendar either.
//
// A count of what is dated today is honest and is included. A LIST is not: the
// header is chrome, and a list in it would be a second work surface competing
// with the one below it.
//
// PURE. `now` and `zone` are arguments.

import type { State } from './fold.ts';
import { heldNodes } from './gate.ts';
import { localParts, endOfLocalDay, localDayKey } from './time.ts';
import { CALENDAR_KINDS, exportsToCalendar } from './ics.ts';

/** The opt-in Extra's id. `state.modules`, exactly like the Composed Today
 *  module — no new event kind for a thing `module.enabled` already expresses. */
export const CLOCK_MODULE = 'clock';

export const clockIsOn = (state: State): boolean => state.modules.has(CLOCK_MODULE);

export interface ClockFace {
  /** 0–23, local. The dial uses it modulo 12; the text uses it whole. */
  hour: number;
  /** 0–59, local. */
  minute: number;
  /** Whole minutes between now and the end of the local day. Never negative:
   *  the last minute of the day reads 0, not a negative remainder, because a
   *  day cannot owe you time. */
  minutesLeft: number;
  /** Open things whose clock lands today. A count, never a list. */
  datedToday: number;
}

/** Hand angles in degrees, clockwise from twelve. Minute granularity on purpose:
 *  a sweeping second hand is motion nobody asked for in a surface that is always
 *  on screen, and there is nothing here for prefers-reduced-motion to suppress
 *  because nothing moves faster than once a minute. */
export const handAngles = (f: ClockFace): { hour: number; minute: number } => ({
  hour: ((f.hour % 12) + f.minute / 60) * 30,
  minute: f.minute * 6,
});

/**
 * How much of the local day is left, in whole minutes.
 *
 * It is the day THE ZONE says, not twenty-four hours minus the time. On the day
 * the clocks go forward the local day is 23 hours long and on the day they go
 * back it is 25, and both are asserted — `now + 86_400_000` would be wrong by an
 * hour twice a year, in the one part of the chrome whose whole job is to be
 * believable about time.
 *
 * TOTAL, and floored at zero. `endOfLocalDay` derives from `nowIso`, so a
 * negative remainder cannot arise from an ordinary tick — the honest statement
 * of what the floor is for is BAD INPUT, not a midnight crossing. That case is
 * real: `endOfLocalDay` throws a RangeError on an unparseable instant, and this
 * runs inside the refresh chain that repaints every other surface, so a throw
 * here would take the card list down with it. It returns a number or nothing.
 */
export function minutesLeftOfDay(nowIso: string, zone: string): number {
  let end = NaN;
  try {
    end = Date.parse(endOfLocalDay(nowIso, zone));
  } catch {
    return 0;
  }
  const now = Date.parse(nowIso);
  if (!Number.isFinite(end) || !Number.isFinite(now)) return 0;
  return Math.max(0, Math.floor((end - now) / 60_000));
}

/**
 * Open things whose clock lands on today's local day.
 *
 * Only the clocks a PERSON set — `CALENDAR_KINDS`, the same set the calendar
 * export uses. A `review` clock is the app talking to itself: the write gate
 * cures every newly created node with one, so counting them would report a
 * thing filed for next Friday as dated today, purely because it was made this
 * afternoon. That exact confusion is already on the record in this repo, found
 * on a real device when a review clock won the soonest-clock contest and named
 * the wrong day.
 *
 * Completed things are excluded: a thing done today is not still ahead of you.
 *
 * AND SO IS ANYTHING THE CALENDAR REFUSES TO CARRY. `exportsToCalendar` exists,
 * in its own words, as ONE predicate read by the file and the count so the (i)
 * panel can never state a number the file does not hold — and this is a third
 * reader of the same question, so it uses the same predicate rather than a
 * private version that agrees today.
 *
 * Its two exclusions matter more here than they do in an export, because this
 * number sits in the chrome of every screen:
 *
 *   - A worry never counts. A bother's only clocks are the flow's own, and
 *     "keep an eye on this" is not a thing dated today.
 *   - A standing decline never counts. ADR-0056's whole relief is that a park
 *     never demands — "no notification, no banner, no badge" — and a header
 *     number that ticks up on the day a declined request's park lands is a
 *     badge, about the very thing you said no to. That is the exact nag the
 *     ledger exists to remove, rebuilt in the one place nobody can look away
 *     from.
 *
 * TOTAL, for the same reason the remainder is: one unparseable instant in the
 * store — a shard folded in from another device, a hand-edited export — would
 * otherwise throw out of the refresh chain and take every other surface with
 * it. A clock that cannot be read is skipped and the count carries on.
 */
export function datedTodayCount(state: State, nowIso: string, zone: string): number {
  let today: string;
  try {
    today = localDayKey(nowIso, zone);
  } catch {
    return 0;
  }
  let n = 0;
  for (const node of heldNodes(state)) {
    if (node.lastDone) continue;
    if (!exportsToCalendar(node)) continue;
    for (const [kind, clock] of Object.entries(node.clocks)) {
      if (!clock || !CALENDAR_KINDS.has(kind)) continue;
      let key: string;
      try { key = localDayKey(clock.at, zone); } catch { continue; }
      if (key === today) { n++; break; }
    }
  }
  return n;
}

export function clockFace(state: State, nowIso: string, zone: string): ClockFace {
  const p = localParts(nowIso, zone);
  return {
    hour: p.hour,
    minute: p.minute,
    minutesLeft: minutesLeftOfDay(nowIso, zone),
    datedToday: datedTodayCount(state, nowIso, zone),
  };
}

/** The time, spoken. The dial is decorative to a screen reader; this is what it
 *  actually reads, so it must stand alone as a sentence. */
export function timeWords(f: ClockFace): string {
  const h = String(f.hour).padStart(2, '0');
  const m = String(f.minute).padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * What is left of the day.
 *
 * Stated as a remainder and never as a deadline. "4h 20m left today" is a fact
 * about the day; "only 4h 20m left" is a nudge, and a nudge that arrives every
 * thirty seconds in the chrome is a nag with a clock face on it.
 *
 * The end of the day is said plainly rather than dressed up. Nothing here calls
 * a finished day a failure — law 7, and rest is legitimate (law 8).
 */
export function remainderWords(minutesLeft: number): string {
  if (minutesLeft <= 0) return 'The day is done.';
  const h = Math.floor(minutesLeft / 60);
  const m = minutesLeft % 60;
  if (h === 0) return `${m}m left today.`;
  if (m === 0) return `${h}h left today.`;
  return `${h}h ${m}m left today.`;
}

/**
 * What is dated today, as a count.
 *
 * Zero is stated as the ordinary fact it is. An empty day is not an achievement
 * and not a reproach — a header that said "nothing planned!" would be cheerful
 * at somebody having a hard week, and one that said "0 today" reads as a score.
 */
export function datedWords(n: number): string {
  if (n === 0) return 'Nothing is dated today.';
  if (n === 1) return '1 thing is dated today.';
  return `${n} things are dated today.`;
}
