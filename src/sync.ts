// Exchange when it opens (sync stage 3b, ADR-0037).
//
// The driver: what a device actually does when it comes up. It is the seam where
// the three tested pieces meet — `exchange.ts` for what is held and what is
// missing, `seal.ts` so nothing legible leaves, `relay.ts` for the mailbox — and
// it deliberately adds no new correctness of its own beyond the ordering.
//
// **No UI, no timers, no network primitives.** The transport is injected as three
// methods, so this is testable with a fake wire and stays testable when the
// transport changes. PURE apart from what is injected.
//
// ## What it must never do
//
// **Never lose an event to a failed exchange.** Every step is ordered so that a
// crash leaves the device with strictly more than it had, never less: events are
// admitted and persisted BEFORE the mark that records them is advanced, so a
// death in between costs one repeated download and nothing else. The reverse
// order would silently drop a chunk forever, and there is no error to notice
// afterwards — the shape of every data-loss bug this project has found.
//
// **Never mark an unopenable chunk as taken in.** A chunk sealed by a newer
// format is not garbage; it is a device that is ahead. Recording it as ingested
// would discard it permanently at the exact moment an update would have made it
// readable. It is left alone, retried on every open, and expires on its own.
//
// **Never announce a maximum as completeness.** The mark carries a `Held` — the
// same coalesced ranges `exchange.ts` publishes — and not a high-water number.
// A number here would re-introduce the bug stage 1 exists to prevent, one layer
// up, where it would be even harder to see.

import { type Held, countIn, eventsIn, heldRanges, malformed, missing, exchangeWords } from './exchange.ts';
import type { AppEvent, DeviceId } from './events.ts';
import { type Sealed, malformedSeal, open, seal, syncId } from './seal.ts';

/** The lowest seq any device ever writes. `nextSeq` returns 0 for a device with
 *  no events, so a hole below a device's first range is a PROVABLE gap rather
 *  than a guess — which is what makes gap repair possible from the local log
 *  alone, with no summary exchange at all. */
export const SEQ_FLOOR = 0;

/** Events per uploaded chunk. Bounded so one enormous log becomes several
 *  mailbox drops rather than one refusal at the size cap. */
export const CHUNK_EVENTS = 400;

/** The most a single request will make this device hand over. A peer holding the
 *  key can already read everything, so this is not confidentiality — it is a
 *  bound on work, so a malformed or looping request cannot make a device upload
 *  its whole log on every open forever. */
export const MAX_FULFIL = 2000;

/** What a chunk contains, once opened. Two shapes and no third. */
export type ChunkBody =
  | { kind: 'events'; events: AppEvent[] }
  | { kind: 'request'; want: Held };

/**
 * What this device remembers about exchanging. Persisted locally, never sent.
 *
 * `uploaded` is a `Held`, NOT a number — see the header. `ingested` is the set of
 * chunk names already taken in, which is what makes collection idempotent under
 * a store with eventual consistency: a chunk that becomes visible late is simply
 * a name not yet in this set.
 */
export interface SyncMark {
  ingested: string[];
  uploaded: Held;
}

export const emptyMark = (): SyncMark => ({ ingested: [], uploaded: {} });

/** The transport, as three methods. Anything satisfying this works. */
export interface Wire {
  chunks(id: string): Promise<string[]>;
  get(id: string, chunk: string): Promise<unknown>;
  post(id: string, sealed: Sealed): Promise<string>;
}

export class MailboxFull extends Error {}

export interface ExchangeDeps {
  key: CryptoKey;
  wire: Wire;
  ownDevice: DeviceId;
  /** Everything this device holds. */
  localEvents: readonly AppEvent[];
  mark: SyncMark;
  /** The write boundary — the SAME `admit` the rest of the app uses. Events that
   *  arrive over a wire get no special treatment; law 1 is enforced on them
   *  exactly as it is on a keystroke. */
  admit: (events: readonly AppEvent[]) => AppEvent[];
  /** Persist admitted events, and only then may the mark advance. */
  persist: (events: readonly AppEvent[]) => Promise<void>;
  /** Persist the mark. Called after `persist`, never before. */
  remember: (mark: SyncMark) => Promise<void>;
}

export interface ExchangeResult {
  received: number;
  sent: number;
  /** Chunks that could not be opened and were deliberately left in place. */
  unopened: number;
  /** Gaps this device asked somebody to fill. */
  requested: Held;
  /** Requests from other devices that this device answered. */
  fulfilled: number;
  outcome: 'ok' | 'unreachable' | 'full' | 'refused';
  words: string;
}

/**
 * Every hole in what this device holds, as a request.
 *
 * Two kinds, both provable from the local log with nothing else:
 *   - a hole BETWEEN two ranges — the half-finished transfer stage 1 is about;
 *   - a hole BELOW the first range, because seq starts at `SEQ_FLOOR` for every
 *     device, so holding `[[5, 9]]` proves 0 through 4 are missing.
 *
 * Nothing above the last range is requested, because nothing proves it exists —
 * asking would post a request that can never be satisfied, on every single open,
 * until it filled the mailbox.
 */
export function gapsIn(events: readonly AppEvent[]): Held {
  const out: Held = {};
  const held = heldRanges(events);
  for (const device of Object.keys(held).sort()) {
    const ranges = held[device]!;
    const want: [number, number][] = [];
    const first = ranges[0]!;
    if (first[0] > SEQ_FLOOR) want.push([SEQ_FLOOR, first[0] - 1]);
    for (let i = 1; i < ranges.length; i++) {
      want.push([ranges[i - 1]![1] + 1, ranges[i]![0] - 1]);
    }
    if (want.length > 0) out[device] = want;
  }
  return out;
}

/** Is this an opened chunk, or something else that happened to decrypt? */
export function malformedChunk(x: unknown): string | null {
  if (x === null || typeof x !== 'object' || Array.isArray(x)) return 'a chunk is an object';
  const c = x as Partial<ChunkBody> & { kind?: unknown };
  if (c.kind === 'events') {
    return Array.isArray((c as { events?: unknown }).events) ? null : 'an events chunk carries a list';
  }
  if (c.kind === 'request') {
    // A request arrives from another device, so it is INPUT and gets the same
    // check any summary gets. One definition of "a well-formed range set",
    // imported rather than restated.
    return malformed((c as { want?: unknown }).want) === null ? null : 'a request carries a summary';
  }
  return 'a chunk is events or a request';
}

const batches = <T,>(items: readonly T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

/**
 * One exchange. Called when the app opens, and it either works or it changes
 * nothing.
 *
 * The order is the design:
 *   1. ask what is in the mailbox;
 *   2. fetch and open the names not already taken in;
 *   3. admit and PERSIST what arrived — before any mark moves;
 *   4. remember which chunks were taken in;
 *   5. upload what this device holds and has not sent;
 *   6. answer anybody's requests, and ask for this device's own gaps.
 *
 * A crash at any step leaves strictly more than it started with. Nothing here
 * deletes, replaces or reorders a local event.
 */
export async function exchangeOnce(deps: ExchangeDeps): Promise<ExchangeResult> {
  const id = await syncId(deps.key);
  const ingested = new Set(deps.mark.ingested);

  let names: string[];
  try {
    names = await deps.wire.chunks(id);
  } catch {
    // Unreachable is an ordinary condition — a train, a hotel, a shut laptop.
    // Nothing was attempted, so nothing needs undoing.
    return {
      received: 0, sent: 0, unopened: 0, requested: {}, fulfilled: 0,
      outcome: 'unreachable', words: exchangeWords(0, 0),
    };
  }

  const arrived: AppEvent[] = [];
  const requests: Held[] = [];
  const takenIn: string[] = [];
  let unopened = 0;

  for (const name of names) {
    if (ingested.has(name)) continue;
    let body: unknown;
    try {
      const sealed = await deps.wire.get(id, name);
      if (malformedSeal(sealed) !== null) { unopened++; continue; }
      body = await open(deps.key, sealed);
    } catch {
      // Wrong key, tampered, or a format from a newer version. NOT marked as
      // taken in: a newer format is a device that is ahead, and recording it
      // would discard it at the exact moment an update would have read it.
      unopened++;
      continue;
    }
    if (malformedChunk(body) !== null) { unopened++; continue; }
    const chunk = body as ChunkBody;
    if (chunk.kind === 'events') arrived.push(...chunk.events);
    else requests.push(chunk.want);
    takenIn.push(name);
  }

  // Only what is genuinely new, so the number reported is the number gained.
  const have = new Set(deps.localEvents.map(e => `${e.device}#${e.seq}`));
  const fresh = arrived.filter(e => !have.has(`${e.device}#${e.seq}`));

  let received = 0;
  if (fresh.length > 0) {
    // The app's own write boundary. An event over a wire is still an event, and
    // law 1 does not care where it came from. A rejection is not swallowed —
    // it means the other device sent something this one considers illegal, and
    // that is a real disagreement, not a network hiccup.
    const admitted = deps.admit(fresh);
    await deps.persist(admitted);
    received = admitted.length;
  }

  // Only NOW may the mark move. Persist-then-record: a death in between costs
  // one repeated download, where the reverse order costs a chunk forever.
  const withArrivals = [...deps.localEvents, ...fresh];
  let mark: SyncMark = { ingested: [...ingested, ...takenIn].sort(), uploaded: deps.mark.uploaded };
  await deps.remember(mark);

  // --- outbound ---
  const mineHeld = heldRanges(withArrivals.filter(e => e.device === deps.ownDevice));
  const owed = missing(deps.mark.uploaded, mineHeld);

  const forOthers: AppEvent[] = [];
  for (const want of requests) {
    const answer = eventsIn(withArrivals, want);
    for (const e of answer) {
      if (forOthers.length >= MAX_FULFIL) break;
      forOthers.push(e);
    }
  }
  const fulfilled = forOthers.length;

  const toSend = [...eventsIn(withArrivals, owed), ...forOthers];
  const unique = new Map(toSend.map(e => [`${e.device}#${e.seq}`, e]));
  const sending = [...unique.values()];

  let sent = 0;
  let outcome: ExchangeResult['outcome'] = 'ok';
  for (const batch of batches(sending, CHUNK_EVENTS)) {
    try {
      await deps.wire.post(id, await seal(deps.key, { kind: 'events', events: batch } satisfies ChunkBody));
      sent += batch.length;
    } catch (e) {
      outcome = e instanceof MailboxFull ? 'full' : 'refused';
      break;
    }
  }

  // The mark advances by exactly what was ACKNOWLEDGED, so a batch that failed
  // is offered again next time. `heldRanges` over the sent events, unioned with
  // what was already uploaded, keeps this a set and never a maximum.
  if (sent > 0) {
    const acknowledged = sending.slice(0, sent).filter(e => e.device === deps.ownDevice);
    mark = {
      ingested: mark.ingested,
      uploaded: heldRanges([...eventsIn(withArrivals, deps.mark.uploaded), ...acknowledged]),
    };
    await deps.remember(mark);
  }

  // --- ask for this device's own holes ---
  let requested: Held = {};
  if (outcome === 'ok') {
    const gaps = gapsIn(withArrivals);
    if (countIn(gaps) > 0) {
      requested = gaps;
      try {
        await deps.wire.post(id, await seal(deps.key, { kind: 'request', want: gaps } satisfies ChunkBody));
      } catch {
        // A request that could not be posted is not a failure of the exchange —
        // everything that could move, moved. It is asked again next time.
        requested = {};
      }
    }
  }

  return { received, sent, unopened, requested, fulfilled, outcome, words: exchangeWords(sent, received) };
}

/** What a device says about its own holes, if it has any. Never a fault, because
 *  it is not one — the events exist somewhere and the request is already out. */
export function gapWords(gaps: Held): string | null {
  const n = countIn(gaps);
  if (n === 0) return null;
  return n === 1
    ? 'One thing from another device has not arrived yet. It has been asked for.'
    : `${n} things from other devices have not arrived yet. They have been asked for.`;
}
