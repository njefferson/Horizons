// Coming back after being away (product law 8: **rest is legitimate**).
//
// `lapse.migration.ran`, `reentry.greeted`, `amnesty.offered` and
// `amnesty.accepted` have been in the vocabulary from the first draft, with the
// bound written into the schema itself: *"`reentry.greeted.shown` has room for
// exactly Next-up, at most three triage items, and the gauge. There is no shape
// it could take that shows the backlog."* None of them was folded and nothing
// could emit one — the fifth capability in this app defined completely and
// reachable from nowhere.
//
// This matters more than the count of features suggests. Law 8 calls re-entry
// **the primary designed path**, not an edge case, and NOTES.md defines v1 done
// as thirty consecutive working days. A bad week is not a risk to that gate; it
// is a certainty. What decides whether the gate survives it is what the app does
// on the morning you come back.
//
// So the greeting shows a bounded, fixed set and **cannot be made to show the
// pile**. Not by configuration, not by a long absence, not by having a thousand
// items. The shape is the guarantee.
//
// PURE. `now` and `zone` are arguments.

import type { State } from './fold.ts';
import { calendarDaysBetween, isValidIso } from './time.ts';
import { raisesReplanCard } from './replan.ts';
import { heldNodes } from './gate.ts';

/** How long away counts as having been away. Seven days by default (NOTES.md,
 *  v1.5 scope). Under this, nothing is shown at all — a weekend is not a lapse
 *  and greeting someone for one would teach them to dismiss the greeting. */
export const LAPSE_DAYS = 7;

/** Law 8's bound, and it is the same number as every other capped surface in
 *  this app. Returning should never be the one screen that shows more. */
export const REENTRY_TRIAGE_CAP = 3;

export interface ReentryView {
  /** Whole days since anything happened. Null when nothing ever has. */
  absenceDays: number | null;
  /** Is this a re-entry at all? */
  lapsed: boolean;
  /** How many unrouted captures are waiting — the TRUE number, stated, while
   *  only three are ever shown. */
  waitingToTriage: number;
  /** How many dates went by while away. Stated, never listed. */
  passedDates: number;
  /** Is there anything an amnesty could forgive? */
  amnestyAvailable: boolean;
}

/**
 * When did anything last happen?
 *
 * The maximum `at` across the whole log. Taken from state rather than from a
 * stored preference, because a preference would survive an import that replaced
 * the very history it claims to describe.
 */
export function lastActivity(state: State): string | null {
  return state.lastActivityAt;
}

export function absenceDays(state: State, nowIso: string, zone: string): number | null {
  const at = state.lastActivityAt;
  if (!at || !isValidIso(at) || !isValidIso(nowIso)) return null;
  // Never negative. A device whose clock moved backwards is not "away for -3
  // days", and a negative here would silently make `lapsed` false for ever.
  return Math.max(0, calendarDaysBetween(at, nowIso, zone));
}

/**
 * The greeting, or the fact that there isn't one.
 *
 * Returns counts and nothing else. **It deliberately does not return the items**
 * — the surface renders Next-up and triage from their own projections, which are
 * already capped, so there is no path by which this function could hand a
 * caller the backlog even if a caller asked for it. Law 8 enforced by what the
 * type makes impossible, not by a promise in a comment.
 */
export function reentryView(state: State, nowIso: string, zone: string): ReentryView {
  const days = absenceDays(state, nowIso, zone);
  const lapsed = days !== null && days >= LAPSE_DAYS;

  let waiting = 0;
  let passed = 0;
  for (const n of heldNodes(state)) {
    if (n.captured && n.route === null) waiting++;
    if (raisesReplanCard(n, nowIso, zone)) passed++;
  }
  return {
    absenceDays: days,
    lapsed,
    waitingToTriage: waiting,
    passedDates: passed,
    amnestyAvailable: lapsed && passed > 0,
  };
}

/**
 * The greeting, in words.
 *
 * It says how long, states what is waiting, and **does not apologise for you or
 * on your behalf**. "Welcome back, you have 47 things" is a bill. "You were away
 * a fortnight" is a fact, and the difference is the whole of law 8.
 */
export function reentryWords(v: ReentryView): string {
  if (!v.lapsed || v.absenceDays === null) return '';
  const d = v.absenceDays;
  const away = d >= 28 ? `${Math.floor(d / 7)} weeks`
    : d >= 14 ? 'a fortnight'
    : d >= 7 ? `${d} days`
    : `${d} days`;
  return `You were away ${away}. Everything you put down is still here.`;
}

/** What is waiting, stated as a count and never as a list. Silence when nothing
 *  is — an empty return is a good morning, not an achievement to announce. */
export function waitingWords(v: ReentryView): string | null {
  const bits: string[] = [];
  if (v.waitingToTriage === 1) bits.push('one thing to sort');
  else if (v.waitingToTriage > 1) bits.push(`${v.waitingToTriage} things to sort`);
  if (v.passedDates === 1) bits.push('one date has gone by');
  else if (v.passedDates > 1) bits.push(`${v.passedDates} dates have gone by`);
  if (bits.length === 0) return null;
  const joined = bits.length === 1 ? bits[0]! : `${bits[0]} and ${bits[1]}`;
  // Sentence case, and it stops there. No "let's get you caught up", no
  // exclamation mark, and nothing that frames the count as a backlog to clear.
  return `${joined.charAt(0).toUpperCase()}${joined.slice(1)}. A few at a time.`;
}

/**
 * The amnesty offer.
 *
 * **This is the piece that makes a lapse survivable**, and its honesty is the
 * whole design. It does not mark anything done — that would be a lie written
 * into an append-only log. It does not delete anything. What it does is resolve
 * every passed date forward **in one act instead of twenty decisions**, which is
 * the actual cost of coming back: not the work, the twenty decisions before any
 * work can start.
 *
 * The wording says exactly that, because an amnesty that sounds like absolution
 * is an amnesty that implies there was something to forgive.
 */
export function amnestyWords(passed: number): string {
  if (passed <= 0) return '';
  const n = passed === 1 ? 'One date' : `${passed} dates`;
  return `${n} went by while you were away. You can move them all to the Menu in one go — nothing is deleted, nothing is marked done, and you can bring any of them back whenever you want.`;
}
