// The decay primitive — the one temporal mechanism (ADR-0010, product law 5).
//
//     (last_done, comfort_window, rising pressure)
//
// Everything temporal in this app is the same shape: something was last touched
// at T, it is comfortable for a while, and after that it comes back with
// increasing insistence. Modelling an Upkeep interval, an area's review clock
// and a parked bother's return separately would produce four subtly different
// notions of "late" that drift apart, and four places to fix a bug.
//
// PRESSURE IS COMPUTED, NEVER STORED. It cannot go stale and it cannot disagree
// with the log. It is continuous and unbounded above, with NO thresholds baked
// into storage — what a surface chooses to show at what value is a presentation
// decision that can change without a migration.
//
// **There is no "overdue" here, and there will not be one.** Not a state, not a
// boolean, not a variable name. A binary late/not-late is a cliff, and cliffs
// print their own geometry into the interface instead of the data's. Worse, for
// this audience that word is a shame surface, shame produces avoidance, and
// avoidance is what made the thing late in the first place — an app that marks
// work that way is participating in the loop it exists to interrupt. The name
// for pressure >= 0 is **"ready again"**. No red walls. No streaks, ever.
//
// PURE. `now` is an argument, like everywhere else.

import type { NodeState } from './fold.ts';
import { calendarDaysBetween, isValidIso } from './time.ts';

/**
 * Continuous pressure for an item that carries the primitive, or `null` for one
 * that does not (pressure is meaningless without a cadence — those items rank by
 * their clock instead, and asking for a number here would invent one).
 *
 * The scale, which is the whole point of it being one primitive:
 *
 * ```
 *   < 0   still comfortable — nothing is being asked of you
 *  === 0   ready again
 *   > 0   rising insistence, measured in comfort windows past ready
 * ```
 *
 * `1` means a full comfort window past ready, `2` two of them, and it keeps
 * going — unbounded, so nothing has to be clamped into a worst state and no
 * cliff exists to render.
 *
 * A comfort window is PER ITEM (ADR-0010): watering a plant and calling your
 * mother do not share a tolerance, so the same lateness in days is not the same
 * pressure. That is exactly what dividing by the item's own window expresses.
 */
export function pressureOf(n: NodeState, nowIso: string, zone: string): number | null {
  // `Number.isFinite`, not `<= 0`: NaN passes every comparison (`NaN <= 0` is
  // false), so a malformed payload used to sail through the guard and produce a
  // NaN pressure — which then poisoned the sort comparators and fell through
  // every branch of pressureWords to the LOUDEST phrase in the app. An item with
  // no valid cadence shouting "been a good while" is precisely the shame surface
  // ADR-0010 exists to refuse. Infinity is excluded for the same reason.
  if (!Number.isFinite(n.intervalDays) || !Number.isFinite(n.comfortWindowDays)) return null;
  if (n.intervalDays! <= 0 || n.comfortWindowDays! <= 0) return null;
  // A stored date that is not a real instant must not throw out of a projection
  // and take the app down with it.
  if (n.lastDone != null && !isValidIso(n.lastDone)) return null;
  if (!isValidIso(nowIso)) return null;

  // Never done is READY, not infinitely late. An item you have not got to yet
  // has not accumulated insistence — it is simply available. Anything else would
  // greet a new Upkeep with the loudest number in the app, which is the shame
  // surface wearing a different hat.
  if (n.lastDone == null) return 0;

  // Calendar days, not elapsed milliseconds: "every 7 days" means seven of the
  // user's days, and a DST changeover must not add an hour of pressure (V-13).
  const elapsed = calendarDaysBetween(n.lastDone, nowIso, zone);
  return (elapsed - n.intervalDays!) / n.comfortWindowDays!;
}

/** True once an item has come round again. The ONLY name this state has. */
export const isReadyAgain = (p: number | null): boolean => p !== null && p >= 0;

/**
 * Words for a pressure, for the text channel of B-01 — because nothing in this
 * app may depend on seeing a colour, and pressure least of all.
 *
 * Deliberately gentle and deliberately vague at the top end: past a point the
 * exact number is not information a person can act on, and naming it precisely
 * ("11 days late") only reads as an accusation.
 */
export function pressureWords(p: number | null): string {
  // `null` AND non-finite: a NaN used to fall through every comparison below to
  // the last line — the loudest phrase — for an item with no valid cadence.
  if (p === null || !Number.isFinite(p)) return '';
  if (p < -0.5) return 'settled';
  if (p < 0) return 'coming round';
  if (p < 1) return 'ready again';
  if (p < 3) return 'been a while';
  return 'been a good while';
}
