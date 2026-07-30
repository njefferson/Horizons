// Running one exchange against a real store and a real relay.
//
// The join between `sync.ts` — which knows the protocol and is tested against
// fakes — and this app's store. It holds the three things that could only be
// decided here: where the mark is persisted, that events arriving over a wire go
// through the SAME `commit` a keystroke does, and what happens to an event the
// gate will not take yet.
//
// Everything about ORDERING lives in `exchangeOnce`. This file must not reorder
// anything, and it does not.
//
// ## Why `admit` here is a pass-through
//
// It reads like a hole and it is not one. `session.commit` already runs `admit`
// against live state inside the serialized commit queue, in the same transaction
// as the append — that IS the write boundary. Running the gate a second time here
// would fold against a snapshot taken before the commit and mint a second copy of
// every cure event, each carrying the same derived `<cause>~cure~<node>` id, which
// the store refuses on its primary key. So the boundary is enforced exactly once,
// in the place that can enforce it atomically, and this hook stays honest about
// doing nothing.

import { deferredWords, ingestForeign } from '../ingest.ts';
import { exchangeOnce, emptyMark, gapWords, type ExchangeResult, type SyncMark } from '../sync.ts';
import { httpWire } from '../wire.ts';
import type { AppEvent } from '../events.ts';
import { currentPairing, MARK_KV, PENDING_KV } from './pairing.ts';
import type { Session } from './session.ts';

/** The mark, or a fresh one. A mark that will not parse is treated as absent,
 *  which costs one repeated exchange and never a lost event — the safe direction. */
async function readMark(session: Session): Promise<SyncMark> {
  const raw = await session.store.getKv<SyncMark>(MARK_KV);
  if (raw === null || raw === undefined) return emptyMark();
  if (typeof raw !== 'object' || !Array.isArray(raw.ingested)) return emptyMark();
  return { ingested: raw.ingested, uploaded: raw.uploaded ?? {} };
}

/** Events that arrived but could not be filed yet (see `ingest.ts`). Kept across
 *  reloads, because the parent they are waiting for may arrive tomorrow. */
async function readPending(session: Session): Promise<AppEvent[]> {
  const raw = await session.store.getKv<AppEvent[]>(PENDING_KV);
  return Array.isArray(raw) ? raw : [];
}

const stamp = (e: AppEvent): string => `${e.device}#${e.seq}`;

export interface SyncOutcome {
  ran: boolean;
  /** Why nothing ran. Only set when `ran` is false. */
  why?: 'not-paired';
  result?: ExchangeResult;
  /** Events that actually LANDED, which is not the same as events that arrived. */
  landed?: number;
  /** Events being kept until the rest of what they belong to shows up. */
  waiting?: number;
}

/**
 * One exchange, if this device is paired.
 *
 * Never throws for an ordinary condition. Unreachable is ordinary — a train, a
 * hotel, a shut laptop — and `exchangeOnce` already reports it as an outcome
 * rather than an error. A genuine fault propagates, because a surface that
 * swallows one is a surface that lies about the state of somebody's data.
 */
export async function runExchange(session: Session): Promise<SyncOutcome> {
  const pair = await currentPairing(session.store);
  if (pair === null) return { ran: false, why: 'not-paired' };

  const land = async (batch: readonly AppEvent[]): Promise<void> => {
    await session.commit(() => [...batch]);
  };

  let landed = 0;
  let waiting: AppEvent[] = [];

  // Anything left over from last time goes first, before a single new byte is
  // fetched. The event it was waiting for may have arrived on the previous
  // exchange, in which case this is where a chain finally completes.
  const carried = await readPending(session);
  if (carried.length > 0) {
    const held = new Set((await session.store.all()).map(stamp));
    const retry = carried.filter(e => !held.has(stamp(e)));
    const out = await ingestForeign(retry, land);
    landed += out.landed;
    waiting = out.deferred;
    await session.store.setKv(PENDING_KV, waiting);
  }

  const localEvents = await session.store.all();
  const result = await exchangeOnce({
    key: pair.key,
    wire: httpWire(pair.host),
    ownDevice: session.device,
    localEvents,
    mark: await readMark(session),
    // A pass-through on purpose — see the header. The boundary is `commit`.
    admit: events => [...events],
    persist: async events => {
      const out = await ingestForeign(events, land);
      landed += out.landed;
      // Merged rather than replaced: the carried-over buffer that just failed
      // again must not be dropped by this exchange's own leftovers.
      const seen = new Set(waiting.map(stamp));
      waiting = [...waiting, ...out.deferred.filter(e => !seen.has(stamp(e)))];
      await session.store.setKv(PENDING_KV, waiting);
    },
    remember: async mark => { await session.store.setKv(MARK_KV, mark); },
  });

  return { ran: true, result, landed, waiting: waiting.length };
}

/** What the surface says. Reuses `exchangeWords` inside `ExchangeResult` for the
 *  numbers and adds only what this layer knows. */
export function outcomeWords(o: SyncOutcome): string {
  if (!o.ran || !o.result) return 'This device is not paired yet.';
  const r = o.result;
  if (r.outcome === 'unreachable') {
    return 'Could not reach the handover point just now. Everything here is safe, and it will catch up next time.';
  }
  const bits: string[] = [r.words];
  if (r.outcome === 'full') {
    bits.push('The handover point is full, so some of this is still to go. It will finish next time.');
  } else if (r.outcome === 'refused') {
    bits.push('The handover point would not take the rest just now. It will be offered again next time.');
  }
  if (r.unopened > 0) {
    // Said rather than hidden: something is in the handover point that this
    // device cannot read, which usually means the other one is on a newer
    // version — or that the two are not actually the same pair.
    bits.push(r.unopened === 1
      ? 'One thing there could not be read. Check both devices show the same pairing name, and that this one is up to date.'
      : `${r.unopened} things there could not be read. Check both devices show the same pairing name, and that this one is up to date.`);
  }
  const held = deferredWords(o.waiting ?? 0);
  if (held) bits.push(held);
  const gaps = gapWords(r.requested);
  if (gaps) bits.push(gaps);
  return bits.join(' ');
}
