// Which node kinds a surface may offer, and why.
//
// This lives in its own module for a dull but load-bearing reason: `nextup.ts`
// imports `replan.ts` (the work surface excludes anything with a live card), so
// `replan.ts` cannot import back without a cycle — and a cycle over a `const`
// export is a TDZ `undefined` at module-evaluation time, which is a silent wrong
// answer rather than a loud failure. One neutral home, imported by both.
//
// The two sets are DIFFERENT, and the difference is the point. "Can this be
// offered as the next thing to do?" and "can a date have gone by on this?" are
// not the same question, and answering them with one list would be wrong in one
// direction or the other.

import type { NodeKind } from './events.ts';

/**
 * Kinds that can never be "the next thing to do" (`nextup.ts`).
 *
 * A waiting-for is someone else's move; the demand-free kinds refuse clocks by
 * law and must not be dressed up as demands; a person/anchor/journal is not an
 * action. The altitude nodes are excluded by product law 4 — "levels push down;
 * the user never climbs — the runway is the only workspace" — and ADR-0013,
 * which makes altitude views inspection modes rather than destinations. Offering
 * an AREA called "Health" as the single next thing to do, with a Done button
 * that writes `done.marked` on it, is the climbing law 4 forbids; a goal or an
 * area cannot be "done" at all.
 */
export const NOT_ACTIONABLE: ReadonlySet<NodeKind> = new Set<NodeKind>([
  'waiting-for', 'aspiration', 'pebble', 'person', 'anchor', 'journal',
  'goal', 'area', 'outcome', 'project',
  // `bother` joined in 1.17.3 (the seam audit). A worry is "not a task, has no
  // next action" by its own module's header, and its surface is the bother
  // flow, which asks "whose is this?" FIRST. Before this, an unanswered worry
  // was offered on the landing surface with a Done button — and Done never
  // answers the flow's question, so the same node read as done in the todo
  // list and open in the bother box at once.
  'bother',
]);

/**
 * Kinds that cannot carry a lapsed commitment, so no replan card is ever raised
 * for them (`replan.ts`).
 *
 * This is `NOT_ACTIONABLE` with **one deliberate exception and one addition**.
 *
 * `waiting-for` is KEPT eligible. A date going by on something someone else owes
 * you is a real decision — arguably the one most worth making — and three of the
 * five options (move the date, pick a new one, not now) are exactly right for
 * it. Excluding it because Next-up excludes it would be copying a rule without
 * its reason: Next-up excludes it because *you* cannot act on it, which says
 * nothing about whether the date matters.
 *
 * `resume-card` is ADDED. It is the app's own artifact rather than a commitment
 * a person made, and "this needs someone else" is meaningless about one.
 *
 * Without this set an Area with a due date was refused by Next-up under law 4
 * and simultaneously offered five buttons here, one of which converted it into a
 * waiting-for (audit).
 */
export const NO_REPLAN_CARD: ReadonlySet<NodeKind> = new Set<NodeKind>([
  ...[...NOT_ACTIONABLE].filter(k => k !== 'waiting-for'),
  'resume-card',
]);
