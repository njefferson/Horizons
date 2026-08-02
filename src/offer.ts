// A few things you could pick up (1.11.0, ADR-0060) — the menu shape.
//
// ## Why a small SET, when the whole surface exists because of choice overload
//
// Next up has always offered exactly one thing, and the reason is recorded:
// choice overload, thesis §4. That finding is real and it stays. But read the
// thesis's own wording, which is careful for a reason:
//
//   "The effect is context-dependent and its size has been contested — but the
//    DIRECTION holds where options are SIMILAR and stakes are AMBIGUOUS."
//
// So the finding does not condemn a small set of options that are *deliberately
// unalike*. It condemns twenty rows of comparable pending work. The difference
// is not how many things are shown; it is whether choosing requires a
// comparison. Two things that differ in kind — "this has a real date today" and
// "this has been quiet for a month" — are picked between by preference, not by
// weighing. Twenty next-actions are picked between by weighing, which is the
// thing nobody stuck at activation can do.
//
// And law 8 pushes the same way: the bounded surface is "never the backlog".
// A headline counting what is asking is the closest this app comes to one.
//
// ## How the set is made unalike, by construction rather than by taste
//
// `NextUpReason` already partitions the queue by WHY something is being
// offered — a real date, a thread you were pulling, a rhythm come round, a
// thing simply waiting. Those are four genuinely different sentences. So the
// rule is: **at most one offer per reason.** Nothing is scored, nothing is
// balanced; the classes do the work.
//
// The precedence itself is untouched. `work[0]` is still the head of
// `nextUpQueue`, so a real date arriving today still leads, and the app still
// answers "if you only do one thing" the way it always has.
//
// ## The wish, and the line it must not cross
//
// One Menu item rides along, and this is the part that could go wrong. The
// Menu is demand-free BY LAW (law 6): "acting on one is a deliberate
// promotion, never an obligation that accrued." Offering a wish beside work
// must not quietly make it work.
//
// It does not, and the guard is structural rather than a matter of copy: a
// wish is returned as a bare node with no reason, no pressure and no clock —
// there is nothing here for a surface to render as a demand, and it carries no
// `Done`, because the way to act on a wish is to promote it first. It is
// offered as *something you wanted*, which is exactly the home §9 says the
// Menu exists to give interest.
//
// PURE, and `now` is an argument.

import type { NodeState, State } from './fold.ts';
import { heldNodes } from './gate.ts';
import { nextUpQueue, upkeepChips, type NextUpItem } from './nextup.ts';
import { replanIds } from './replan.ts';
import { loadNow, offerCapFor, type Load } from './load.ts';

/**
 * How many pieces of WORK may be offered at once.
 *
 * Two, not five. The set exists so choosing is a preference rather than a
 * comparison, and a preference survives two options in a way it does not
 * survive five. Its own cap with its own justification, per the caps
 * convention.
 */
export const OFFER_CAP = 2;

export interface Offer {
  /** Up to `OFFER_CAP` items, each for a DIFFERENT reason. Best first. */
  work: NextUpItem[];
  /**
   * One thing you said you wanted, or null when the Menu is empty. A bare
   * node: no reason, no pressure, nothing a surface could read as a demand.
   */
  wish: NodeState | null;
  /**
   * What is on you right now (1.15.0, ADR-0065). Returned rather than left for
   * the surface to recompute, so the offer and the sentence beside it can never
   * disagree about whether this is a heavy stretch — the render-contradicts-
   * record shape ADR-0057 was written to kill.
   */
  load: Load;
}

/** Wishes, in a total order so the same state always offers the same one. */
const wishes = (state: State): NodeState[] =>
  heldNodes(state)
    .filter(n => n.onMenu !== null && !n.lastDone)
    .sort((a, b) => (a.id < b.id ? -1 : 1));

/**
 * What is on offer right now.
 *
 * `cycle` rotates BOTH halves — it is the existing "Not this" index, which
 * records nothing and never will. Cycling past a thing is not a decision about
 * it, so there is nothing to write down (thesis §9).
 */
export function offerNow(state: State, nowIso: string, zone: string, cycle = 0): Offer {
  // The same exclusions the single-card surface has always applied: an upkeep
  // chip has its own place, and anything replanning is being asked a different
  // question already.
  const replanning = replanIds(state, nowIso, zone);
  const chipIds = new Set(upkeepChips(state, nowIso, zone).map(c => c.node.id));
  const queue = nextUpQueue(state, nowIso, zone)
    .filter(i => !chipIds.has(i.node.id) && !replanning.has(i.node.id));

  // ADR-0014's consequence, finally consumed: unresolved weight "depresses
  // capacity … the mechanism by which it shows up in what the app asks of you".
  // The offer is exactly that surface, so the cap bends here and nowhere else —
  // never the gauge, never the held list, never Composed Today, and never below
  // one (src/load.ts).
  const load = loadNow(state);
  const cap = offerCapFor(load, OFFER_CAP);

  const work: NextUpItem[] = [];
  if (queue.length > 0) {
    const start = ((cycle % queue.length) + queue.length) % queue.length;
    const rotated = [...queue.slice(start), ...queue.slice(0, start)];
    const taken = new Set<string>();
    for (const item of rotated) {
      if (work.length >= cap) break;
      // ONE PER REASON. This is the whole mechanism: the set cannot become two
      // near-identical next-actions, because the second would share a class
      // with the first and be skipped.
      if (taken.has(item.reason)) continue;
      taken.add(item.reason);
      work.push(item);
    }
  }

  const all = wishes(state);
  const wish = all.length === 0
    ? null
    : all[((cycle % all.length) + all.length) % all.length] ?? null;

  return { work, wish, load };
}

/**
 * The offer's own line. **No number, ever.**
 *
 * "8 things are asking" is a count of pending work on the landing surface,
 * which is the nearest thing this app has to a backlog headline — the one
 * shape law 8 names outright. The honest total already has a home: the
 * coverage gauge states what is held, what is ready and that nothing is
 * silent, a few lines up the same page. Saying it twice, once as a demand,
 * buys nothing.
 */
export function offerWords(offer: Offer): string {
  if (offer.work.length === 0 && !offer.wish) return '';
  if (offer.work.length === 0) return 'Nothing is asking. Something you wanted:';
  return offer.work.length === 1 && !offer.wish
    ? 'Something you could pick up.'
    : 'A few things you could pick up.';
}
