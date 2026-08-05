// The store boundary.
//
// Everything above this line is pure and testable without a browser. The Dexie
// implementation lives in dexie-store.ts and satisfies the same interface, so
// the fold, the gate, snapshots and export/import are all exercised in Node
// with no IndexedDB shim (build-plan §2: dependencies point one way only).

import type { AppEvent, DeviceId } from './events.ts';
import { compareEvents } from './fold.ts';

export interface Snapshot {
  /** State is rebuilt from events after this point. */
  upToSeqByDevice: Record<DeviceId, number>;
  /** Serialised state. The snapshot is an OPTIMISATION — restore must work
   *  from the log alone, and there is a test that proves it (ADR-0006). */
  state: unknown;
  at: string;
}

export interface LogStore {
  /** Append-only. Never updates, never deletes. */
  append(events: readonly AppEvent[]): Promise<void>;
  /** Every event, in (at, device, seq) order. */
  all(): Promise<AppEvent[]>;
  /** Events after a per-device high-water mark — the snapshot tail. */
  since(upToSeqByDevice: Record<DeviceId, number>): Promise<AppEvent[]>;
  /**
   * The next UNUSED seq for this device: one past the highest it has ever
   * written. Not "gap-free", which is what this said and is a different claim —
   * a device whose store was seeded from a partial import can hold a hole below
   * its maximum, and this returns max + 1 regardless. That is correct (it can
   * never collide) but it does not fill the hole, and treating the number as
   * proof of completeness is the mistake `src/exchange.ts` exists to prevent.
   */
  nextSeq(device: DeviceId): Promise<number>;
  /**
   * The FIRST event this node ever had, or null — its genesis, and therefore
   * when it was written down (1.23.0).
   *
   * A single-node question asked of the LOG rather than of folded state, and
   * that is the whole design decision. The obvious alternative was a
   * `capturedAt` field on `NodeState`, and it is wrong here: `snapshot.ts`
   * serialises nodes whole, so every node already inside a snapshot would come
   * back without the new field and never regain it — the fold never revisits
   * its genesis event again. The nodes that would be permanently blank are
   * exactly the old backlog this exists to describe.
   *
   * The Dexie implementation reads the `node` index declared in v1, so this is
   * one indexed lookup rather than a walk of the log. That matters: the caller
   * is a triage card, and `all()` on a large store is the kind of cost that
   * ends up on the path to somebody's first capture (ADR-0001).
   */
  firstEventFor(node: string): Promise<AppEvent | null>;
  putSnapshot(s: Snapshot): Promise<void>;
  latestSnapshot(): Promise<Snapshot | null>;
  /** Import seeds a FRESH store — this wipes before seeding (ADR-0006). */
  reset(): Promise<void>;
  /**
   * Replace the whole log ATOMICALLY: either the new events are all there, or
   * the old ones still are. Never a half of each.
   *
   * `reset()` then `append()` is NOT the same thing, and the difference cost a
   * user their data: a file that passed validation still hit a duplicate-id
   * constraint partway through the append, so the store was already empty and
   * only some of the new rows had landed — real items gone, replaced by a
   * corrupt fragment, with a raw library error on screen (audit). Import is the
   * one operation whose entire purpose is not losing anything.
   */
  replaceAll(events: readonly AppEvent[]): Promise<void>;
}

/** In-memory LogStore. Used by the whole Phase 0 test suite. */
export class MemoryLogStore implements LogStore {
  #events: AppEvent[] = [];
  #snapshot: Snapshot | null = null;
  #kv = new Map<string, unknown>();

  /** Scratch, mirroring DexieLogStore's kv — lets the session layer be tested
   *  in Node, where there is no IndexedDB. */
  async getKv<T>(key: string): Promise<T | null> {
    return this.#kv.has(key) ? (this.#kv.get(key) as T) : null;
  }

  async setKv(key: string, value: unknown): Promise<void> {
    this.#kv.set(key, value);
  }

  async append(events: readonly AppEvent[]): Promise<void> {
    for (const e of events) {
      // Append-only means append-only: a duplicate id is a bug upstream, not
      // something to silently overwrite.
      if (this.#events.some(x => x.id === e.id)) {
        throw new Error(`duplicate event id ${e.id} — the log is append-only`);
      }
      this.#events.push(e);
    }
  }

  async all(): Promise<AppEvent[]> {
    return [...this.#events].sort(compareEvents);
  }

  async since(mark: Record<DeviceId, number>): Promise<AppEvent[]> {
    return (await this.all()).filter(e => e.seq > (mark[e.device] ?? -1));
  }

  async nextSeq(device: DeviceId): Promise<number> {
    let max = -1;
    for (const e of this.#events) if (e.device === device && e.seq > max) max = e.seq;
    return max + 1;
  }

  /** By filter — there is no index to use in memory, and the test stores are
   *  small. `compareEvents` order is what makes "first" mean the earliest
   *  instant rather than whichever row happened to be appended first, which is
   *  not the same thing once a shard has been folded in. */
  async firstEventFor(node: string): Promise<AppEvent | null> {
    return (await this.all()).find(e => e.node === node) ?? null;
  }

  async putSnapshot(s: Snapshot): Promise<void> { this.#snapshot = s; }
  async latestSnapshot(): Promise<Snapshot | null> { return this.#snapshot; }

  async reset(): Promise<void> { this.#events = []; this.#snapshot = null; }

  async replaceAll(events: readonly AppEvent[]): Promise<void> {
    // Build the replacement FIRST, so a throw leaves the old one in place.
    const next = [...events];
    this.#events = next;
    this.#snapshot = null;
  }
}
