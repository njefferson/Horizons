// Named periods — the staff call (1.17.0, ADR-0068).
//
// An anchor is a period you name, so a report can say "since the last staff
// call" instead of "since 29 July". It is not work: nothing is ever done to it,
// it carries no clock (the gate refuses one — `anchor` is demand-free), and
// nothing here can produce a demand.
//
// ## It reads the LOG, not state
//
// The `copies.ts` precedent (1.14.0) and `journalSeal`'s (1.13.0), for the same
// reason both of those give: a firing is an EVENT — a thing that happened at a
// moment, carrying the watermark that was current then — and folding it into
// `NodeState` would mean two new fields, a `MERGE_DISPOSITION` ruling, a
// genesis default, a copy-on-write clone and a deserialise backfill, to store
// something the log already says perfectly well.
//
// ## Nothing derives from the recurrence
//
// `anchor.defined` carries a recurrence and it is rendered for a person to
// read. **Nothing computes from it.** There is no scheduler, no next-occurrence,
// no "you have not fired this in three weeks" — an anchor that fires itself is a
// nag with a calendar, and a tally of the ones you did not mark is the shape law
// 5 exists to forbid. It is the `affects` rule from ADR-0065, restated: a plain
// fact for a reader.

import type { AppEvent } from './events.ts';
import { compareEvents } from './fold.ts';
import type { NodeState, State } from './fold.ts';
import { heldNodes } from './gate.ts';

/** Every anchor you have named, oldest first — ids are ULIDs, so id order is
 *  the order they were made. Trashed and merged ones are gone, like everywhere
 *  else that asks what you are holding. */
export const anchors = (state: State): NodeState[] =>
  heldNodes(state)
    .filter(n => n.kind === 'anchor')
    .sort((a, b) => (a.id < b.id ? -1 : 1));

/** What one firing recorded: when it happened, and the per-device high-water
 *  mark the app had seen at that moment. */
export interface Firing {
  at: string;
  /** Null for a firing written before watermarks, and for one written on a
   *  device that somehow had none. `reportedBefore` falls back to `at`, which
   *  is the degraded cut — honest, and stated rather than hidden. */
  mark: Record<string, number> | null;
}

/**
 * The newest firing of one anchor, or null if it has never been fired.
 *
 * Ordered on the event's own instant with the id as a total tie-break — the
 * ordering every other list in this app uses, so two readers of one log cannot
 * disagree about which firing was last.
 */
export function lastFiring(log: readonly AppEvent[], anchor: string): Firing | null {
  let best: AppEvent | null = null;
  for (const e of log) {
    if (e.kind !== 'anchor.fired') continue;
    if ((e.payload as { anchor?: string }).anchor !== anchor) continue;
    if (best === null || compareEvents(e, best) > 0) best = e;
  }
  if (!best) return null;
  const p = best.payload as { at?: string; upToSeqByDevice?: Record<string, number> };
  return {
    at: typeof p.at === 'string' ? p.at : best.at,
    mark: p.upToSeqByDevice && Object.keys(p.upToSeqByDevice).length > 0
      ? { ...p.upToSeqByDevice } : null,
  };
}

/**
 * How many times an anchor has been fired.
 *
 * Used ONLY to answer "has this ever been fired" at a call site that needs a
 * boolean. It is deliberately not rendered: a number of firings is a count of
 * meetings you did or did not hold, which is the shape law 5 forbids and which
 * no surface in this app has any business showing.
 */
export const firingCount = (log: readonly AppEvent[], anchor: string): number =>
  log.filter(e => e.kind === 'anchor.fired' && (e.payload as { anchor?: string }).anchor === anchor).length;

/**
 * The recurrence somebody typed, as they typed it.
 *
 * A string for a reader. `anchor.defined` calls it an RRULE and this does not
 * parse one — if it ever needs to, that is a decision about scheduling and it
 * comes with an ADR, not with a regex added quietly here.
 */
export function recurrenceOf(log: readonly AppEvent[], anchor: string): string {
  let best: AppEvent | null = null;
  for (const e of log) {
    if (e.kind !== 'anchor.defined' || e.node !== anchor) continue;
    if (best === null || compareEvents(e, best) > 0) best = e;
  }
  const r = best ? (best.payload as { recurrence?: unknown }).recurrence : null;
  return typeof r === 'string' ? r : '';
}

/**
 * What an anchor says about itself, in words.
 *
 * A name, a rhythm if one was given, and when it last came round. **A date, never
 * a count** — the law-5 rule this app applies to every record surface.
 */
export function anchorWords(n: NodeState, firing: Firing | null, recurrence: string, zone: string): string {
  const parts: string[] = [];
  if (recurrence.trim()) parts.push(recurrence.trim());
  parts.push(firing
    ? `last one ${new Intl.DateTimeFormat('en-GB', { timeZone: zone, day: 'numeric', month: 'short' }).format(new Date(firing.at))}`
    : 'not marked yet');
  return parts.join(' · ');
}

/**
 * The period line for a report cut at an anchor.
 *
 * Says the NAME, because that is the entire point of anchors: "Since the last
 * staff call" is a sentence somebody understands without doing arithmetic
 * against a date. When it has never been fired the honest answer is the same one
 * the export path gives on its first run.
 */
export const anchorPeriodWords = (name: string, firing: Firing | null): string =>
  firing ? `Since the last ${name}` : 'Everything so far';
