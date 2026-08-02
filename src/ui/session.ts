// The write path, and the only one.
//
// Surfaces emit intents; this turns them into events, runs them through the
// gate, and appends what the gate returns. Nothing in ui/ may call
// `store.append` directly — the gate is not bypassable, including by us
// (ADR-0011, build-plan §2).
//
// `now` is injected everywhere below rather than read from the clock, for the
// reason build-plan §2 gives: a function that reads the clock itself cannot be
// tested at an arbitrary moment.

import type { AppEvent, CaptureSource, DeviceId, VaultId } from '../events.ts';
import { admit, gateOptionsFor } from '../gate.ts';
import { fold, emptyState, type State } from '../fold.ts';
import { deviceZone } from '../time.ts';
import { ulid, newDeviceId } from '../ids.ts';
import { DexieLogStore } from '../dexie-store.ts';
import type { LogStore } from '../log-store.ts';
import { SNAPSHOT_LAG_LIMIT, loadState, snapshotFrom, snapshotLag } from '../snapshot.ts';

const DEVICE_KEY = 'device.id';

/** What a session needs from storage: the log, plus the kv scratch space.
 *  DexieLogStore provides it in the browser; MemoryLogStore in Node tests. */
export type SessionStore = LogStore & {
  getKv<T>(key: string): Promise<T | null>;
  setKv(key: string, value: unknown): Promise<void>;
};

export interface Session {
  readonly device: DeviceId;
  readonly vault: VaultId;
  /** The device's IANA zone, read once at the edge. Everything that says
   *  "today" resolves against this, never against UTC (V-13). */
  readonly zone: string;
  state(): State;
  /** Commit intents. Resolves only once the write has LANDED (ADR-0008). */
  commit(make: (ctx: StampContext) => AppEvent[]): Promise<State>;
  /**
   * Re-read the log and rebuild live state.
   *
   * For the one write that legitimately does not come through `commit`: taking
   * in another device's already-gated shard (`takeInEvents`). The import BUTTON
   * reloads the page afterwards, which is a fine answer for a deliberate action;
   * sync happens on open and cannot, so it needs this instead.
   *
   * Serialized on the SAME queue as commits, so it can never read the log
   * half-way through one and paint a state that never existed.
   */
  refresh(): Promise<State>;
  /**
   * Cut a snapshot if startup has drifted too far past the last one (1.14.1).
   *
   * Resolves to the number of events the snapshot covered, or null when none
   * was due. Called once per boot, AFTER the app is on screen — never on the
   * path to a capture.
   */
  maintain(): Promise<number | null>;
  draft(): Promise<string>;
  setDraft(text: string): Promise<void>;
  store: SessionStore;
}

export interface StampContext {
  at: string;
  device: DeviceId;
  vault: VaultId;
  /** So an intent can clock things to the end of the user's day, not UTC's. */
  zone: string;
  seq: () => number;
  id: () => string;
}

export async function openSession(
  now: () => number,
  vault: VaultId = 'personal',
  dbName = 'quietkeep',
  storeOverride?: SessionStore,
  zone: string = deviceZone(),
): Promise<Session> {
  const store: SessionStore = storeOverride ?? new DexieLogStore(dbName);

  let device = await store.getKv<DeviceId>(DEVICE_KEY);
  if (!device) {
    device = newDeviceId();
    await store.setKv(DEVICE_KEY, device);
  }

  let state: State = await loadState(store).catch(() => emptyState());

  // Commits are SERIALIZED. Two interleaved commits would both read nextSeq
  // before either appends, and neither store enforces per-device seq uniqueness
  // (Dexie's [device+seq] index is non-unique) — so a double-tap could silently
  // mint two events with the same seq and break the gap-free invariant the
  // shard-completeness proof rests on. The queue makes each commit read seq
  // AFTER the previous one has landed. Failures do not wedge the queue.
  let queue: Promise<unknown> = Promise.resolve();

  const commitOne = async (make: (ctx: StampContext) => AppEvent[]): Promise<State> => {
    const at = new Date(now()).toISOString();
    let seq = await store.nextSeq(device!);
    const ctx: StampContext = {
      at,
      device: device!,
      vault,
      zone,
      seq: () => seq++,
      id: () => ulid(now()),
    };

    const offered = make(ctx);
    if (offered.length === 0) return state;

    // The gate may return MORE events than were offered — a cure is itself an
    // event, because the log has to explain the state (ADR-0011). Whatever it
    // hands back is appended UNMODIFIED.
    //
    // In particular a cure deliberately carries its cause's stamp and a derived
    // id (`<cause>~cure~<node>`), so replaying the same log reproduces the same
    // cure with the same id. Re-stamping it here to keep seq strictly unique
    // would break that determinism to satisfy a property the store does not
    // actually require — `nextSeq` takes the max, and the derived id keeps the
    // cure sorting immediately after its cause.
    const admitted = admit(offered, state, gateOptionsFor(zone));

    try {
      await store.append(admitted);
    } catch (err) {
      // bulkAdd can land rows AND reject (Dexie BulkError; an aborting tx).
      // Guessing which half landed would desync live state from the log — the
      // audit produced exactly that — so on any append failure the log is
      // re-read and live state rebuilt from what is actually there.
      state = fold(await store.all());
      throw err;
    }
    state = fold(admitted, state);
    return state;
  };

  const commit: Session['commit'] = (make) => {
    const run = queue.then(() => commitOne(make));
    queue = run.catch(() => { /* the next commit must not inherit this failure */ });
    return run;
  };

  const refresh: Session['refresh'] = () => {
    const run = queue.then(async () => {
      state = fold(await store.all());
      return state;
    });
    queue = run.catch(() => { /* as with commit, a failure does not wedge the queue */ });
    return run;
  };

  /**
   * Keep the startup path honest (1.14.1, ADR-0063).
   *
   * ADR-0001's first consequence is "startup must not replay the world", and
   * for the whole of this app's life it has: `writeSnapshot` existed, was
   * tested, and had no caller outside the test suite, so `loadState` never
   * found a snapshot and always fell through to folding the entire log. Nothing
   * failed — the fallback path is the correct one — it simply cost the thing
   * the snapshot was built to buy, and cost more every day.
   *
   * DELIVER, THEN RECORD, the same ordering the export path learned the hard
   * way: the snapshot lands first, and only then is an event written saying one
   * did. A failure leaves no record claiming otherwise.
   *
   * Deliberately NOT on the commit queue. It runs after the app is on screen,
   * and queueing it would put a clone of the whole state in front of the user's
   * first capture — the one interaction this app protects above all others. The
   * cost of not queueing is that a commit may land between the photograph and
   * its record, which is harmless: the snapshot simply covers less than the log.
   */
  const maintain: Session['maintain'] = async () => {
    const lag = await snapshotLag(store, state);
    if (lag < SNAPSHOT_LAG_LIMIT) return null;
    // `state` is read synchronously inside `snapshotFrom`, so the mark and the
    // count it stores are the same state's — internally consistent whatever
    // else is happening.
    const covered = state.eventCount;
    const mark = state.seqByDevice.get(device!) ?? 0;
    await snapshotFrom(store, state, new Date(now()).toISOString());
    await commit((ctx) => [{
      id: ctx.id(), vault: ctx.vault, at: ctx.at, device: ctx.device, seq: ctx.seq(),
      kind: 'snapshot.written', node: null,
      payload: { upToSeq: mark, reason: 'periodic' },
    } as AppEvent]);
    return covered;
  };

  return {
    device,
    vault,
    zone,
    state: () => state,
    commit,
    refresh,
    maintain,
    draft: async () => (await store.getKv<string>('capture.draft')) ?? '',
    setDraft: (text) => store.setKv('capture.draft', text),
    store,
  };
}

/** One captured thought. The gate gives it a same-day clock in the same
 *  transaction, so there is no window in which it is silent (ADR-0008). */
export const captureEvent = (
  ctx: StampContext,
  text: string,
  source: CaptureSource,
): AppEvent[] => {
  const node = ulid(Date.parse(ctx.at));
  return [{
    id: ctx.id(), vault: ctx.vault, at: ctx.at, device: ctx.device, seq: ctx.seq(),
    kind: 'capture.recorded', node,
    payload: { text, source },
  } as AppEvent];
};
