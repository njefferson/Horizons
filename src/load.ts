// Load, not work — the other half of ADR-0014, built at last (1.15.0, ADR-0065).
//
// ## What this is, and why it took until now
//
// ADR-0014 has said since the design phase what a pebble is for, in terms:
//
//   "A pebble is LOAD, not work — the small ongoing weight of a thing that is
//    unresolved… the pebble exists so the app can account for the weight you are
//    already carrying, and depress capacity accordingly."
//
//   "Pebbles link to affected nodes and may DEPRESS CAPACITY / WIP WHILE ACTIVE.
//    This is the mechanism by which unresolved weight shows up in what the app
//    asks of you — without ever becoming a task."
//
// The nouns were declared in Phase 0. The node kind existed, and `pebble` was in
// `DEMAND_FREE_KINDS`, so the write gate had refused to clock one for a year.
// Everything was ready except the thing that reads it. **Nothing here is a new
// decision**; it is the consumer those consequences describe.
//
// ## What "depress capacity" is, concretely
//
// `offerNow` is literally "what the app asks of you" — up to `OFFER_CAP` pieces
// of work, chosen so that picking is a preference rather than a comparison
// (ADR-0060). So weight narrows THE OFFER, and nothing else:
//
//   - Not the gauge. It proves law 1 over every node and must never move.
//   - Not the held list. Hiding what you hold is the opposite of this app.
//   - Not Composed Today. That is what YOU chose; the app does not get to
//     shorten your own answer.
//   - Never below one. Next up's whole promise is that there is always a
//     single thing, and a heavy day is exactly when that matters most.
//
// The wish still rides along. A Menu item is demand-free by law 6, and on a
// heavy day the thing you actually wanted is the most appropriate offer in the
// set, not the least.
//
// ## Co-occurrence, never causation (law 7)
//
// ADR-0014: pebbles "annotate the timeline, so a stretch of low capacity has a
// visible reason — co-occurrence only, never causation", and the data
// constitution repeats it: "the app will show you that a pebble and a
// low-capacity week overlapped. It will never tell you one caused the other."
//
// That binds the WORDS in this file. Nothing here says a pebble caused
// anything, and nothing computes a reason. The surface may show the weight and
// the shorter offer at the same time; it may not join them with "because".
// `affects` is a plain list for you to read — nothing derives from it, and that
// is deliberate.
//
// PURE. No clock, no storage, no DOM.

import { MAGNITUDES, type Capacity, type Magnitude } from './events.ts';
import type { NodeState, State } from './fold.ts';
import { isHeld } from './fold.ts';

/** Lightest first. The ORDER is the scale, so adding a heavier word later means
 *  appending to `MAGNITUDES` and nothing else. */
const weightOf = (m: Magnitude): number => MAGNITUDES.indexOf(m) + 1;

/**
 * Total weight at which the app asks for less, however you said you were.
 *
 * Three: one boulder, or a rock and a pebble, or three pebbles. Chosen so that a
 * single small unresolved thing does NOT change what you are offered — a pebble
 * is meant to be sayable without consequence, and an app that reacts to every
 * one of them teaches you not to write them down. That is the same failure the
 * Menu exists to avoid (ADR-0014's own argument, from the other direction).
 */
export const HEAVY_AT = 3;

export interface Load {
  /** What you said, or null if you have never said. Never inferred. */
  capacity: Capacity | null;
  /** Live, unsettled pebbles, heaviest first then by title for a total order. */
  pebbles: NodeState[];
  /** Sum of the weights above. A working number, never shown. */
  weight: number;
  /** Is the app asking for less right now? */
  heavy: boolean;
}

/**
 * What is on you, as the app understands it — which is only what you told it.
 *
 * A pebble counts while it has an unsettled weight and has not been trashed or
 * folded away. Nothing here reads a date, because a pebble cannot carry one.
 */
export function loadNow(state: State): Load {
  const pebbles = [...state.nodes.values()]
    .filter(n => n.kind === 'pebble' && n.pebble !== null && isHeld(n))
    .sort((a, b) => {
      const d = weightOf(b.pebble!.magnitude) - weightOf(a.pebble!.magnitude);
      if (d !== 0) return d;
      const t = (a.title || '').localeCompare(b.title || '');
      return t !== 0 ? t : (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    });
  const weight = pebbles.reduce((sum, n) => sum + weightOf(n.pebble!.magnitude), 0);
  // TWO INDEPENDENT FACTS, either of which is enough. Saying "low" is you
  // telling the app directly, and it is believed on its own — needing to also
  // justify it with pebbles would make the declaration decorative.
  const heavy = state.capacity === 'low' || weight >= HEAVY_AT;
  return { capacity: state.capacity, pebbles, weight, heavy };
}

/**
 * How many pieces of work to offer, given the load.
 *
 * `cap` is passed in rather than imported so this module stays free of
 * `offer.ts` — the dependency runs one way, and a pure function that already
 * knows the answer it is adjusting is easier to test at both ends.
 */
/**
 * CAPACITY CHANGES WHICH THINGS ARE OFFERED, NEVER HOW MANY (1.34.0).
 *
 * This used to be `load.heavy ? cap - 1 : cap` — a low day got a SHORTER list.
 * That is wrong twice, and the second reason is the serious one.
 *
 * **It is the wrong lever.** A good day should buy a harder thing, not a longer
 * list; a low day should buy an easier one, not a shorter list. Length is not
 * what changes with capacity, and changing it makes the surface say "you can
 * manage less today", which is a statement about the person.
 *
 * **And narrowing on a low day is a PACING mechanism**, which two of the served
 * populations need opposite things from. For post-exertional conditions,
 * offering less is correct and offering the usual amount is harmful. For
 * depression, behavioural activation says offer anyway, and withdrawing the
 * offer is the harm. The same declaration, two correct and opposite responses —
 * the sharpest of the conflicts in the synthesis.
 *
 * **Changing WHICH dissolves it.** The same number of offers arrive; the lighter
 * ones are chosen. Nothing is withdrawn, so activation is served; nothing
 * demanding is put in front of you, so pacing is served. No standing preference
 * is needed, and no question has to be asked, which is the better outcome on its
 * own terms: the app that does not ask cannot ask wrong.
 *
 * So the cap is now CONSTANT. Kept as a function rather than deleted, because
 * the call site is where somebody would reach to reintroduce the old behaviour,
 * and this is where the argument against it belongs.
 */
export const offerCapFor = (_load: Load, cap: number): number => cap;

/**
 * The order weight is consulted in, given how heavy the day is.
 *
 * A LIST rather than a comparison, so the rule reads as what it is: on a low
 * stretch, lighter things first; on an ordinary or sharp day, the heavier thing
 * is allowed to lead. Anything nobody has weighed sorts as `ordinary`, because
 * that is what "nobody has said" honestly means — a missing declaration is never
 * read as either extreme.
 *
 * It only ever REORDERS. Nothing is filtered out by weight, ever: a heavy thing
 * with a real date that has arrived still leads on a low day, because a promise
 * to somebody else is not something the app may quietly withhold.
 */
export const weightOrderFor = (load: Load): readonly string[] =>
  load.heavy ? ['light', 'ordinary', 'heavy'] : ['heavy', 'ordinary', 'light'];

/**
 * What the surface says about the load, or '' when there is nothing to say.
 *
 * **Co-occurrence, never causation.** This names two facts that are both true
 * right now; it does not join them. "Fewer, while…" is a statement about the
 * same period. "Fewer, because…" would be the app explaining you to yourself,
 * which is the thing law 7 forbids and the reason there is no sentiment field
 * anywhere in this vocabulary.
 *
 * No count of pebbles, and no number for the weight. The ledger's rule applies:
 * a name and a state, never a tally.
 */
export function loadWords(load: Load): string {
  if (!load.heavy) return '';
  return load.capacity === 'low'
    ? 'Fewer things, while you have said this is a low stretch.'
    : 'Fewer things, while you have this much on.';
}

/** How a capacity reads on screen. Your own word, given back to you. */
export const CAPACITY_WORDS: Readonly<Record<Capacity, string>> = {
  low: 'a low stretch',
  steady: 'steady',
  sharp: 'sharp',
  unsure: 'not sure',
};

/** How a magnitude reads on screen. The vocabulary's own three words, which are
 *  concrete and carry no judgement — a boulder is not a failure. */
export const MAGNITUDE_WORDS: Readonly<Record<Magnitude, string>> = {
  pebble: 'a pebble',
  rock: 'a rock',
  boulder: 'a boulder',
};

/** One pebble as a row: what it is, how heavy, and what it sits on — by NAME,
 *  never by count, and never with a claim about what it is doing to them. */
export function pebbleWords(state: State, n: NodeState): string {
  const mag = n.pebble ? MAGNITUDE_WORDS[n.pebble.magnitude] : 'a pebble';
  const names = (n.pebble?.affects ?? [])
    .map(id => state.nodes.get(id))
    .filter((x): x is NodeState => Boolean(x) && !x!.trashed)
    .map(x => x.title || '(untitled)');
  if (names.length === 0) return mag;
  if (names.length === 1) return `${mag} · on ${names[0]}`;
  if (names.length === 2) return `${mag} · on ${names[0]} and ${names[1]}`;
  return `${mag} · on ${names[0]}, ${names[1]} and ${names.length - 2} more`;
}
