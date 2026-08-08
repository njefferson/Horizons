// Arrangements — the thing that is supposed to run without you.
//
// A whole class of what people carry is not a task and never becomes one. It is
// an arrangement already made: a supply that reorders itself, a service on a
// schedule, a renewal, a subscription, a delivery. The work was done once, when
// it was set up. After that it is meant to happen on its own.
//
// **Its failure mode is SILENCE**, and that is why it needs a shape of its own.
// A task that does not get done sits there looking undone. An arrangement that
// stops simply produces nothing — no delivery, no reminder, no error — and the
// first signal is running out. For a reader whose future carries no weight
// until it is now (docs/nd-collisions.md entry 4), a signal that arrives only at
// the moment of failure is the worst possible signal, because by then it is an
// emergency and the emergency is the only thing that ever felt real.
//
// So the app holds the QUESTION the arrangement cannot answer for itself:
// *when did I last confirm this is still happening?*
//
// ## Why this is a field, not a new kind
//
// Exactly ADR-0042's reasoning for the comms sweep. An arrangement
// decays, completes, renders as a card and can be turned off — every projection
// in this app already knows how to handle all four. A new kind would mean
// teaching each of them about something they can already hold, and it would open
// the closed event vocabulary for no gain (docs/event-vocabulary.md).
//
// ## What differs, and it is only the question
//
// `lastDone` on an ordinary upkeep means *last time I did this*. On an
// arrangement it means *last time I confirmed this is still arranged*. Same
// field, same decay primitive, same `done.marked` to satisfy it. The difference
// lives in the words, because the difference is what is being asked.
//
// ## The dependency flag
//
// The arrangements that fail hardest are the ones waiting on somebody else who
// will not tell you they have stopped — an approval nobody chased, a lapsed
// authorisation, a card that expired at a company that does not write. Marking
// that is not a category for its own sake: it changes what confirming MEANS,
// because you cannot confirm it from here. The words say so rather than
// pretending a glance is enough.
//
// PURE. `now` and `zone` are arguments.

import type { NodeState, State } from './fold.ts';
import { heldNodes } from './gate.ts';
import { pressureOf } from './pressure.ts';
import { calendarDaysBetween, isValidIso } from './time.ts';
import { isHeld } from './fold.ts';

/** Marks an upkeep node as an arrangement that runs without you. A field and
 *  not a kind, for ADR-0042's reasons — it decays, completes and renders like
 *  an upkeep because it IS one, asking a different question. */
export const ARRANGEMENT_FIELD = 'arrangement';

/** Marks an arrangement whose continuation depends on somebody else. Separate
 *  from ARRANGEMENT_FIELD because it is orthogonal: plenty of arrangements run on
 *  a machine you own, and those you can actually check. */
export const DEPENDS_FIELD = 'arrangement-depends';

/** A marker field is never REMOVED — `node.field.set` is the only field event
 *  the closed vocabulary has, and the fold keeps the last value per field. So
 *  these read the VALUE rather than mere presence: turning a marker off writes
 *  `false`, which is a fact the log keeps, and is why unmarking does not have to
 *  trash a node that still exists and still has a rhythm. */
const flagged = (n: NodeState, field: string): boolean =>
  Object.hasOwn(n.fields, field) && n.fields[field]!.value === true;

export const isArrangement = (n: NodeState): boolean =>
  isHeld(n) && flagged(n, ARRANGEMENT_FIELD);

export const dependsOnOthers = (n: NodeState): boolean => flagged(n, DEPENDS_FIELD);

/** Every arrangement currently held. Empty is the ordinary state for
 *  somebody who has never made one, and it must stay usable — nothing here is
 *  set up, and the app is complete without it. */
export function arrangementNodes(state: State): readonly NodeState[] {
  return heldNodes(state).filter(isArrangement);
}

export interface ArrangementCard {
  node: NodeState;
  /** Rising pressure from the one decay primitive. Null when it cannot be
   *  computed, which is silence rather than a zero (ADR-0010). */
  pressure: number | null;
  /** Whole days since it was last confirmed, or null if it never has been. */
  days: number | null;
  /** Whether confirming means asking somebody else. */
  depends: boolean;
  words: string;
}

/** Whole days since this was last confirmed still running. Null when it never
 *  has been — a fact about a new arrangement, not a lapse, and the words say
 *  so. */
export function confirmedDaysAgo(n: NodeState, nowIso: string, zone: string): number | null {
  const at = n.lastDone;
  if (!at || !isValidIso(at)) return null;
  return calendarDaysBetween(at, nowIso, zone);
}

/**
 * What an arrangement's card says.
 *
 * Three rules, and each exists to keep a shape out:
 *
 *   · It asks about the ARRANGEMENT, never about you. "Still arranged?" and
 *     never "you haven't checked this since Tuesday", which is the same
 *     sentence with a finger pointed (ADR-0010, and law 7).
 *   · Never having confirmed is stated as a plain fact. A new arrangement has
 *     not lapsed; it has simply never been checked, and those are different.
 *   · Where it depends on somebody else, the words say that confirming means
 *     asking them — because "check this" is useless advice when checking is not
 *     a thing you can do from here, and useless advice is how a surface teaches
 *     somebody to skip it.
 */
export function arrangementWords(days: number | null, depends: boolean): string {
  const ask = depends
    ? 'Still arranged? Confirming this one means asking whoever runs it.'
    : 'Still arranged?';
  if (days === null) {
    return depends
      ? 'Not confirmed yet — confirming this one means asking whoever runs it.'
      : 'Not confirmed yet.';
  }
  if (days === 0) return ask;
  if (days === 1) return `Last confirmed yesterday. ${ask}`;
  return `Last confirmed ${days} days ago. ${ask}`;
}

/**
 * Every arrangement that has something to say, most-pressured first.
 *
 * This is a LIST SOMEBODY READS, not an offer the app pushes, and that decides
 * the one subtle thing here: a negative pressure — not due yet — stays in. The
 * comms chip drops those because a chip that appears when nothing is due is an
 * interruption; a list of what you are trusting to run without you is worthless
 * if it hides everything currently fine. Hiding the healthy ones would leave a
 * surface that only ever shows problems, which is a red wall by omission.
 *
 * An arrangement with no valid cadence produces a null pressure and IS left
 * out — an item shouting without a rhythm behind it is what ADR-0010 refuses.
 */
export function arrangementCards(
  state: State, nowIso: string, zone: string,
): readonly ArrangementCard[] {
  const cards: ArrangementCard[] = [];
  for (const n of arrangementNodes(state)) {
    const pressure = pressureOf(n, nowIso, zone);
    if (pressure === null || !Number.isFinite(pressure)) continue;
    const days = confirmedDaysAgo(n, nowIso, zone);
    const depends = dependsOnOthers(n);
    cards.push({ node: n, pressure, days, depends, words: arrangementWords(days, depends) });
  }
  return cards.sort((a, b) => (b.pressure ?? 0) - (a.pressure ?? 0));
}
