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
// does TWO things when events land — and it took a device report to learn the
// second was missing. First it calls `session.refresh()`, serialized on the same
// queue as commits, so the in-memory state is once again the fold of the whole
// log. That alone is NOT enough: the state object is correct but every surface is
// still showing what it painted before the exchange, because nothing told it to
// redraw. So it then calls `repaint()` — the app's own "repaint every surface"
// — and only that makes the arrived events appear without a restart. The old
// comment here claimed the refresh was sufficient; it wasn't, and a planner that
// synced onto a phone showed a blank screen until the app was force-quit.

import { exchangeWords } from '../exchange.ts';
import { takeInEvents } from '../portability.ts';
import { exchangeOnce, emptyMark, gapWords, type ExchangeResult, type SyncMark } from '../sync.ts';
import { httpWire } from '../wire.ts';
import { currentPairing, MARK_KV } from './pairing.ts';
import type { Session } from './session.ts';

/** How often two open devices try to catch up without a press. Idle ticks only
 *  READ (the plentiful quota); a tick writes only when there is genuinely new
 *  work, so a quiet pair spends nothing scarce. */
export const AUTO_SYNC_MS = 30_000;

/** How many exchange rounds a single sync will run before giving up on this
 *  turn. Convergence from one side is normally one round; the loop exists for
 *  the case where taking events in reveals more to do, and the bound is a
 *  backstop, not an expected path. */
const MAX_ROUNDS = 12;

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
export async function runExchange(session: Session, now: () => string, repaint?: () => void): Promise<SyncOutcome> {
  const pair = await currentPairing(session.store);
  if (pair === null) return { ran: false, why: 'not-paired' };

  const wire = httpWire(pair.host);
  let landed = 0;
  let recv = 0;
  let sent = 0;
  let fulfilled = 0;
  let last: ExchangeResult | undefined;

  // ONE sync, MANY rounds until it goes quiet. A single exchange drains the
  // mailbox from this side, but taking events in can reveal more to do (a gap to
  // request, a request to answer), so it repeats until a round moves nothing —
  // then reports the TOTAL, not the last (empty) round. It terminates because the
  // anti-ping-pong mark means each event is offered at most once; MAX_ROUNDS is a
  // backstop, never the expected exit.
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const r = await exchangeOnce({
      key: pair.key,
      wire,
      ownDevice: session.device,
      // Re-read the log and the mark EACH round: the previous round wrote both.
      localEvents: await session.store.all(),
      mark: await readMark(session),
      persist: async events => {
        const out = await takeInEvents(session.store, events, now());
        landed += out.taken;
        // Re-fold, THEN repaint — both, because either alone leaves a lie on the
        // screen. `session.refresh()` makes the in-memory state correct but
        // redraws nothing; `repaint()` redraws the surfaces but from whatever
        // state they can read, so it must follow the refresh. Without the repaint
        // the events are in the store and in `state` and STILL invisible until a
        // reload — which on a phone looked exactly like sync not working (it
        // showed blank until a force quit). `repaint` is optional only so the
        // fakes in the tests need not pass one; the app always does.
        await session.refresh();
        repaint?.();
      },
      remember: async mark => { await session.store.setKv(MARK_KV, mark); },
    });
    last = r;
    recv += r.received;
    sent += r.sent;
    fulfilled += r.fulfilled;
    // Stop cleanly on anything that is not plain success — unreachable, full,
    // refused all mean "offer the rest next time", not "hammer the relay now".
    if (r.outcome !== 'ok') break;
    // Converged from this side: a round that moved nothing in either direction
    // and answered no request is the fixed point.
    if (r.received === 0 && r.sent === 0 && r.fulfilled === 0) break;
  }

  const result: ExchangeResult | undefined = last && {
    ...last,
    received: recv,
    sent,
    fulfilled,
    // The words describe the WHOLE sync. `unopened` and `requested` are carried
    // from the last round because each round re-counts the same standing ones,
    // so their final value — not a sum — is the true current picture.
    words: exchangeWords(sent, recv),
  };
  // Spread rather than `result: undefined` — exactOptionalPropertyTypes wants the
  // property ABSENT when there was no round, not present and undefined.
  return { ran: true, landed, ...(result ? { result } : {}) };
}

/** A clock for the keep-in-step loop, injected so the scheduling is testable
 *  without a timer or a DOM. The app passes one backed by `setInterval` and the
 *  page's visibility; the tests pass a fake that fires on demand. */
export interface AutoSyncClock {
  /** Call `fn` every `ms` for the life of the page. */
  every(ms: number, fn: () => void): void;
  /** Call `fn` each time the app becomes visible (switched to, unlocked). */
  onVisible(fn: () => void): void;
  /** Is the app visible right now? A hidden tab must not sync — it wastes the
   *  quota and a backgrounded PWA is throttled anyway. */
  visible(): boolean;
}

/**
 * Keep two open devices converging without a press.
 *
 * This is the actual fix for "I opened both and had to press Sync three times":
 * a single open does one round, and the cross-device handoff (A uploads, then B
 * pulls) needs each side to act after the other. So while a device is visible it
 * syncs on a timer AND the instant it is shown — which is the common case,
 * switching to this device after writing on the other. The `inFlight` guard stops
 * a slow sync from stacking with the next tick.
 */
export function keepInStep(tick: () => Promise<void>, clock: AutoSyncClock, everyMs = AUTO_SYNC_MS): void {
  let inFlight = false;
  const run = (): void => {
    if (inFlight || !clock.visible()) return;
    inFlight = true;
    void Promise.resolve(tick()).finally(() => { inFlight = false; });
  };
  clock.every(everyMs, run);
  clock.onVisible(run);
}

/**
 * Empty a mailbox at the handover point — revocation.
 *
 * Called when a key is replaced, on the OLD id and host, so a device that still
 * holds the old key finds nothing waiting for it. BEST-EFFORT and it says so in
 * its return: being offline must never block re-keying, so a failure here is a
 * `false`, not a throw, and the surface tells the truth about which happened.
 *
 * It needs no key — the id alone addresses the mailbox, and the id is what the
 * old pairing already computed. Nothing sealed is read or written; the whole
 * exchange is one DELETE.
 */
export async function revokeMailbox(host: string, id: string): Promise<boolean> {
  try {
    await httpWire(host).purge(id);
    return true;
  } catch {
    return false;
  }
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
