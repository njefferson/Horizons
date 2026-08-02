// How long a timer runs, and how it is said out loud (1.10.0, ADR-0059).
//
// ## Why there is no shape here, only a number and words
//
// The two-minute timer used to render `Two minutes: 1:47 left`. A countdown is
// a DEADLINE: it says you are constrained, and it shrinks toward a moment where
// something is either done or not. Sirois & Pychyl is the finding that makes
// this a defect rather than a style — procrastination is mood repair, so
// anything that raises aversion raises delay, and a shrinking deadline on a
// task you are already avoiding raises it at the exact moment of approach. It
// is the same argument that forbids "overdue" (thesis §2).
//
// The obvious repair — a circle that FILLS instead of drains — does not
// survive, and this is the part worth writing down because it is easy to get
// wrong twice. **Anything that renders progress toward a chosen end is a
// fraction.** Three of eight glyphs lit, or a ring 40% round, both say *you
// were this far along and you stopped*. That is a score (law 5), and `menu.ts`
// already refuses the same shape for save-for gauges: "a progress bar is a
// machine for implying you are behind."
//
// A growth metaphor is worse still. A plant that stops growing is a plant you
// stunted; the stake is the point of it. "Do not let it die" is "do not break
// the chain" in warmer clothes — the pattern this app refuses outright (law 5,
// thesis §2), whose real design purpose is the moment it breaks.
//
// So the timer shows **presence, not progress**: that it is running, and
// nothing about how far through it you are. The commitment lives in a SENTENCE
// — "Twenty minutes, running" — because a sentence can hold something you are
// allowed to walk away from. A shape cannot: it either completes or it visibly
// does not.
//
// PURE.

import type { State } from './fold.ts';

/**
 * The lengths on offer. A closed, short list — a free-text minutes box is a
 * decision to make at the worst possible moment, and this is set calmly in
 * Extras rather than at the point of starting (thesis §4: showing options to
 * someone stuck at activation is choice overload where it costs most).
 */
export const TIMER_CHOICES: readonly number[] = [2, 5, 10, 20, 30];

/** What runs when nobody has chosen. Two minutes, because the whole value of
 *  the original is that it is a CHEAP decision (thesis §4) — the default has to
 *  stay the one nobody has to think about. */
export const DEFAULT_TIMER_MINUTES = 2;

/** The chosen length, or the cheap default. An unrecognised stored value reads
 *  as the default — refused, never guessed, the `parseSlot` rule. */
export function timerMinutesOf(state: State): number {
  const m = state.timerMinutes;
  if (!Number.isFinite(m) || (m ?? 0) <= 0) return DEFAULT_TIMER_MINUTES;
  return TIMER_CHOICES.includes(m as number) ? (m as number) : DEFAULT_TIMER_MINUTES;
}

const WORDS: Record<number, string> = {
  2: 'Two minutes', 5: 'Five minutes', 10: 'Ten minutes',
  20: 'Twenty minutes', 30: 'Thirty minutes',
};

/** "Twenty minutes" — the commitment, in words, because that is where a
 *  commitment you may abandon belongs. Falls back to digits for a length not in
 *  the closed list, which cannot happen through the surface but can through a
 *  shard from a newer build. */
export const timerWords = (minutes: number): string =>
  WORDS[minutes] ?? `${minutes} minutes`;

/** The same, lower-case, for mid-sentence use ("start twenty minutes"). */
export const timerWordsLower = (minutes: number): string =>
  timerWords(minutes).toLowerCase();
