// Running one exchange against a real store and a real relay.
//
// The join between `sync.ts` — which knows the protocol and is tested against
// fakes — and this app's store. It decides only the two things that could not be
// decided anywhere else: where the mark is kept, and how arriving events are
// taken in.
//
// Everything about ORDERING lives in `exchangeOnce`. This file must not reorder
// anything, and it does not.
//
// ## Why arrivals do not go through `commit`
//
// Because `commit` runs the gate, and the gate must not run on another device's
// log. That is argued where it belongs, in `takeInEvents`, and demonstrated in
// `test/take-in.test.ts` — briefly: the events are already-gated history, their
// cures are in the log beside them, and re-admitting duplicates those cures,
// refuses any shard seen twice, and refuses anything whose subject is still in
// the next chunk. This is a shard union (ADR-0035), the same operation the "take
// in what I don't have" button performs, sharing its code.
//
// The one thing that road does not do for itself is live state: the import
// button reloads the page afterwards. Exchange happens on open and cannot, so it
// calls `session.refresh()` — serialized on the same queue as commits — and the
// surface repaints from a state that is once again the fold of the whole log.

import { takeInEvents } from '../portability.ts';
import { exchangeOnce, emptyMark, gapWords, type ExchangeResult, type SyncMark } from '../sync.ts';
import { httpWire } from '../wire.ts';
import { currentPairing, MARK_KV } from './pairing.ts';
import type { Session } from './session.ts';

/** The mark, or a fresh one. A mark that will not parse is treated as absent,
 *  which costs one repeated exchange and never a lost event — the safe
 *  direction, and the only one worth defaulting to. */
async function readMark(session: Session): Promise<SyncMark> {
  const raw = await session.store.getKv<SyncMark>(MARK_KV);
  if (raw === null || raw === undefined) return emptyMark();
  if (typeof raw !== 'object' || !Array.isArray(raw.ingested)) return emptyMark();
  return { ingested: raw.ingested, uploaded: raw.uploaded ?? {} };
}

export interface SyncOutcome {
  ran: boolean;
  /** Why nothing ran. Only set when `ran` is false. */
  why?: 'not-paired';
  result?: ExchangeResult;
  /** Events that actually landed in the store. */
  landed?: number;
}

/**
 * One exchange, if this device is paired.
 *
 * Never throws for an ordinary condition. Unreachable is ordinary — a train, a
 * hotel, a shut laptop — and `exchangeOnce` already reports it as an outcome
 * rather than an error. A genuine fault propagates, because a surface that
 * swallows one is a surface that lies about the state of somebody's data.
 */
export async function runExchange(session: Session, now: () => string): Promise<SyncOutcome> {
  const pair = await currentPairing(session.store);
  if (pair === null) return { ran: false, why: 'not-paired' };

  let landed = 0;
  const result = await exchangeOnce({
    key: pair.key,
    wire: httpWire(pair.host),
    ownDevice: session.device,
    localEvents: await session.store.all(),
    mark: await readMark(session),
    persist: async events => {
      const out = await takeInEvents(session.store, events, now());
      landed += out.taken;
      // Live state, immediately. Without this the events are in the store and
      // invisible until something else happens to reload — which on the surface
      // is indistinguishable from sync not working.
      await session.refresh();
    },
    remember: async mark => { await session.store.setKv(MARK_KV, mark); },
  });

  return { ran: true, result, landed };
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
    // Covers both "this mailbox is holding all it takes" and "you are being asked
    // to slow down". One sentence on purpose: from where somebody is standing
    // they are the same fact — some of it has not gone, none of it is lost, and
    // it finishes on its own. Splitting them would explain a storage quota to a
    // person who did not ask about one.
    bits.push('Some of this has not gone across yet. Nothing here is lost, and it finishes next time.');
  } else if (r.outcome === 'refused') {
    bits.push('The handover point would not take the rest just now. It will be offered again next time.');
  }
  if (r.unopened > 0) {
    // Said rather than hidden: something is in the handover point that this
    // device cannot read, which usually means the other one is on a newer
    // version — or that the two are not actually the same pair.
    const what = r.unopened === 1 ? 'One thing there could not be read.' : `${r.unopened} things there could not be read.`;
    bits.push(`${what} Check both devices show the same pairing name, and that this one is up to date.`);
  }
  const gaps = gapWords(r.requested);
  if (gaps) bits.push(gaps);
  return bits.join(' ');
}
