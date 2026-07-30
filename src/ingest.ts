// Taking somebody else's events in — through the gate, and without wedging.
//
// `sync.ts` says events arriving over a wire go through the SAME write boundary a
// keystroke goes through. That is right, and it has a consequence that only shows
// up once a real relay is attached: **the gate refuses whole batches.** `admit`
// throws `GateRejection` on the first event it cannot accept, and refusal is not
// an exotic case here —
//
//   - a chunk holds a child whose parent is in a chunk that has not arrived yet,
//     so `node.created` names a parent the gate cannot see;
//   - a chunk holds a `node.renamed` for a node still in flight;
//   - a dependency names a target that has not landed.
//
// All three are TRANSIENT. The events are legal; this device just does not have
// the rest of the sentence yet. And the naive wiring turns each of them into a
// permanent fault: `exchangeOnce` admits before it advances the mark, so a throw
// means the chunk is re-fetched and re-refused on every open, forever, and no
// event ever lands. Sync would look broken and be broken.
//
// So arrivals are filed in three moves:
//   1. the whole batch, in log order — which is the ordinary path, because `admit`
//      folds incrementally and a parent that arrived in the same batch is already
//      visible to its child;
//   2. on refusal, one at a time, repeated until a pass files nothing new — which
//      resolves any order the batch happened to be in;
//   3. whatever still will not go is DEFERRED, kept, and tried again next
//      exchange, when the missing half may have arrived.
//
// Nothing is discarded and nothing is written around the gate. The cost of a
// genuinely illegal event is that it sits in the deferred buffer instead of
// stopping every other event from landing — and it is counted, so it can be said
// out loud rather than hidden.

import type { AppEvent } from './events.ts';
import { GateRejection } from './gate.ts';

/** The buffer is bounded. An event that will never be admissible would otherwise
 *  accumulate silently, and a store that grows forever because of a bug is worse
 *  than one that says it has stopped keeping something. */
export const MAX_DEFERRED = 5000;

/** Log order: the order the events would have been written in had they all been
 *  written here. Ties broken by device then seq so the sort is total — an
 *  unstable order would make the batch path succeed or fail at random. */
export const logOrder = (a: AppEvent, b: AppEvent): number =>
  a.at < b.at ? -1 : a.at > b.at ? 1
    : a.device < b.device ? -1 : a.device > b.device ? 1
      : a.seq - b.seq;

export interface Ingested {
  /** Events that went through the gate and landed. */
  landed: number;
  /** Events the gate would not take yet. Kept, not dropped. */
  deferred: AppEvent[];
  /** True when the deferred buffer hit its cap and stopped keeping more. */
  overflowed: boolean;
}

/**
 * File foreign events through `land`, which must be the app's real write path.
 *
 * `land` is given a batch and is expected to admit it and persist it in one
 * transaction. A `GateRejection` means "not this one, not yet" and is handled. Any
 * other error is a genuine fault — a full disk, a closed database — and propagates
 * untouched, because a surface that swallows one lies about somebody's data.
 */
export async function ingestForeign(
  events: readonly AppEvent[],
  land: (batch: readonly AppEvent[]) => Promise<void>,
): Promise<Ingested> {
  const ordered = [...events].sort(logOrder);
  if (ordered.length === 0) return { landed: 0, deferred: [], overflowed: false };

  // Move 1: the whole batch. This is the path taken almost every time, and it is
  // the only one that is fast — a first sync is thousands of events and thousands
  // of separate transactions would take minutes.
  try {
    await land(ordered);
    return { landed: ordered.length, deferred: [], overflowed: false };
  } catch (err) {
    if (!(err instanceof GateRejection)) throw err;
  }

  // Move 2: one at a time, repeatedly. Each pass that files anything may have
  // made a later event admissible — the parent landing is what lets its child in
  // — so passes continue while progress is being made and stop the moment one
  // achieves nothing, which is the definition of "as far as this can get".
  let waiting = ordered;
  let landed = 0;
  for (;;) {
    const stuck: AppEvent[] = [];
    for (const e of waiting) {
      try {
        await land([e]);
        landed++;
      } catch (err) {
        if (!(err instanceof GateRejection)) throw err;
        stuck.push(e);
      }
    }
    if (stuck.length === waiting.length) break;   // a pass achieved nothing
    if (stuck.length === 0) return { landed, deferred: [], overflowed: false };
    waiting = stuck;
  }

  // Move 3: what is left waits for the rest of its sentence.
  return {
    landed,
    deferred: waiting.slice(0, MAX_DEFERRED),
    overflowed: waiting.length > MAX_DEFERRED,
  };
}

/** What the surface says about a deferred buffer. Never a scold and never a
 *  shrug: it is a real state, it is usually temporary, and the honest thing is to
 *  say it is being kept. */
export function deferredWords(n: number, overflowed = false): string | null {
  if (n === 0) return null;
  const head = n === 1
    ? 'One thing from another device is waiting for the rest of what it belongs to.'
    : `${n} things from another device are waiting for the rest of what they belong to.`;
  return overflowed
    ? `${head} That is as many as this will hold at once; the rest will come round again.`
    : `${head} They are kept, and they go in as soon as the rest arrives.`;
}
