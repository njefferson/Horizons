// The exchange protocol: what a device has, what it needs, what it sends.
//
// Stage 1 of sync (ADR-0037), and deliberately the whole of the correctness.
// **There is no server in this file and no network call.** It is pure arithmetic
// over what two logs hold, so the hard part is testable before any transport
// exists — and it stays testable when the transport changes.
//
// ## Why a maximum is not enough, which is what this module exists to fix
//
// `State.seqByDevice` folds the HIGHEST seq seen per device, and its comment in
// `fold.ts` claimed that "lets a shard prove it is complete". **It does not, and
// the difference is silent permanent data loss.**
//
// Suppose this device holds device `d1`'s events with seq 1, 2 and 5 — because 3
// and 4 were in a transfer that failed halfway. The maximum is 5, so this device
// announces *"I have d1 up to 5"*. The other side, which holds 1 through 5
// properly, believes it and sends nothing. **Events 3 and 4 are never recovered
// by anybody.** No error, no warning, and the coverage gauge still reads zero
// because both events belonged to nodes that already exist.
//
// Within a single device's own writing seq is contiguous (ADR-0027). Gaps arrive
// the moment a *partial* transfer exists — which is precisely what ranged
// exchange introduces. So the summary a device publishes must be a set of
// **contiguous ranges held**, not a high-water mark. For an ordinary device that
// is one range per device id and costs nothing; when something has gone wrong it
// is the only representation that can describe the truth.
//
// PURE.

import type { AppEvent, DeviceId } from './events.ts';

/** A closed, inclusive range of seq values held for one device. */
export type Range = readonly [number, number];

/**
 * What a device holds, exactly: per device id, the contiguous ranges of seq it
 * has. Sorted and coalesced, so two summaries of the same set are identical and
 * can be compared directly.
 */
export type Held = Record<DeviceId, Range[]>;

/** Coalesce a sorted list of seqs into inclusive ranges. */
function toRanges(seqs: number[]): Range[] {
  if (seqs.length === 0) return [];
  const sorted = [...new Set(seqs)].sort((a, b) => a - b);
  const out: Range[] = [];
  let start = sorted[0]!;
  let prev = start;
  for (const n of sorted.slice(1)) {
    if (n === prev + 1) { prev = n; continue; }
    out.push([start, prev]);
    start = n;
    prev = n;
  }
  out.push([start, prev]);
  return out;
}

/**
 * What this log holds.
 *
 * Non-integer and negative seqs are DROPPED rather than described. A summary is
 * a promise about what can be produced on request; describing a value that the
 * store cannot actually yield is the same lie in a different place.
 */
export function heldRanges(events: readonly AppEvent[]): Held {
  const byDevice = new Map<DeviceId, number[]>();
  for (const e of events) {
    if (!e.device) continue;
    if (!Number.isInteger(e.seq) || e.seq < 0) continue;
    if (!byDevice.has(e.device)) byDevice.set(e.device, []);
    byDevice.get(e.device)!.push(e.seq);
  }
  const out: Held = {};
  // Device ids in sorted order, so two identical sets serialise identically —
  // which is what lets a caller compare or hash a summary.
  for (const d of [...byDevice.keys()].sort()) out[d] = toRanges(byDevice.get(d)!);
  return out;
}

/** Every seq in a range list, as a set. Bounded by what it is asked about. */
const expand = (ranges: readonly Range[]): Set<number> => {
  const s = new Set<number>();
  for (const [from, to] of ranges) for (let i = from; i <= to; i++) s.add(i);
  return s;
};

/**
 * What `theirs` has that `mine` does not — the request one device makes of the
 * other.
 *
 * A device id absent from `mine` yields all of their ranges, which is the
 * first-contact case and needs no special handling.
 */
export function missing(mine: Held, theirs: Held): Held {
  const out: Held = {};
  for (const d of Object.keys(theirs).sort()) {
    const have = expand(mine[d] ?? []);
    const want: number[] = [];
    for (const [from, to] of theirs[d]!) {
      for (let i = from; i <= to; i++) if (!have.has(i)) want.push(i);
    }
    if (want.length > 0) out[d] = toRanges(want);
  }
  return out;
}

/**
 * The events to hand over, given a request.
 *
 * Only what was asked for. A transport that sends more than was requested works
 * fine and hides a bug in the summary, so this is exact — and the test asserts
 * the count.
 */
export function eventsIn(events: readonly AppEvent[], want: Held): AppEvent[] {
  const sets = new Map<DeviceId, Set<number>>();
  for (const d of Object.keys(want)) sets.set(d, expand(want[d]!));
  return events
    .filter(e => sets.get(e.device)?.has(e.seq) ?? false)
    // A TOTAL order, so the same request always produces the same bytes — which
    // is what makes a transfer comparable, cacheable and diffable.
    .sort((a, b) => (a.device < b.device ? -1 : a.device > b.device ? 1 : a.seq - b.seq));
}

/** Do two devices hold exactly the same set? */
export function converged(a: Held, b: Held): boolean {
  return Object.keys(missing(a, b)).length === 0
    && Object.keys(missing(b, a)).length === 0;
}

/** How many events a request covers, without expanding it into a list. Used to
 *  tell someone what an exchange is about to move. */
export function countIn(want: Held): number {
  let n = 0;
  for (const ranges of Object.values(want)) for (const [from, to] of ranges) n += to - from + 1;
  return n;
}

/**
 * Is this summary self-consistent — no overlaps, no touching ranges left
 * uncoalesced, nothing out of order?
 *
 * A summary arrives from another device across a transport, so it is INPUT and
 * gets checked like any other. A malformed one is refused rather than reasoned
 * about: every function here would otherwise produce a plausible answer from a
 * nonsense claim, which is the worst available outcome for a protocol whose job
 * is deciding what not to send.
 */
export function malformed(h: unknown): string | null {
  if (h === null || typeof h !== 'object' || Array.isArray(h)) return 'a summary is an object';
  for (const [device, ranges] of Object.entries(h as Record<string, unknown>)) {
    if (!device) return 'a summary cannot describe an unnamed device';
    if (!Array.isArray(ranges)) return `${device}: ranges must be a list`;
    let prevTo = -Infinity;
    for (const r of ranges) {
      if (!Array.isArray(r) || r.length !== 2) return `${device}: a range is two numbers`;
      const [from, to] = r as [unknown, unknown];
      if (!Number.isInteger(from) || !Number.isInteger(to)) return `${device}: a range is two whole numbers`;
      if ((from as number) < 0) return `${device}: seq is never negative`;
      if ((to as number) < (from as number)) return `${device}: a range runs forwards`;
      // Ranges must be sorted AND separated by a real gap. Adjacent ranges
      // (…,4],[5,… describe one range and would make two summaries of the same
      // set compare unequal, which breaks `converged`.
      if ((from as number) <= prevTo + 1) return `${device}: ranges must be sorted and coalesced`;
      prevTo = to as number;
    }
  }
  return null;
}

/**
 * The summary to publish, from the log this device holds.
 *
 * Named for what it is rather than "watermark", because the word invites the
 * maximum-is-enough mistake this module exists to prevent.
 */
export const summarise = (events: readonly AppEvent[]): Held => heldRanges(events);

/** In words, for a surface that has to say what an exchange did. Never a
 *  percentage and never a duration — it moved a number of things or it did not. */
export function exchangeWords(sent: number, received: number): string {
  if (sent === 0 && received === 0) return 'Already the same on both.';
  const bits: string[] = [];
  if (received > 0) bits.push(received === 1 ? 'took in one thing' : `took in ${received} things`);
  if (sent > 0) bits.push(sent === 1 ? 'sent one' : `sent ${sent}`);
  return `${bits.join(', ').replace(/^./, c => c.toUpperCase())}.`;
}
