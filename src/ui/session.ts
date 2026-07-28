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
import { admit } from '../gate.ts';
import { fold, emptyState, type State } from '../fold.ts';
import { ulid, newDeviceId } from '../ids.ts';
import { DexieLogStore } from '../dexie-store.ts';
import type { LogStore } from '../log-store.ts';
import { loadState } from '../snapshot.ts';

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
  state(): State;
  /** Commit intents. Resolves only once the write has LANDED (ADR-0008). */
  commit(make: (ctx: StampContext) => AppEvent[]): Promise<State>;
  draft(): Promise<string>;
  setDraft(text: string): Promise<void>;
  store: SessionStore;
}

export interface StampContext {
  at: string;
  device: DeviceId;
  vault: VaultId;
  seq: () => number;
  id: () => string;
}

export async function openSession(
  now: () => number,
  vault: VaultId = 'personal',
  dbName = 'quietkeep',
  storeOverride?: SessionStore,
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
    const admitted = admit(offered, state);

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

  return {
    device,
    vault,
    state: () => state,
    commit,
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
