// The Dexie/IndexedDB implementation of LogStore.
//
// `localStorage` is banned outright (ADR-0002): it is synchronous, ~5 MB, and
// the first thing evicted under pressure — an append-only log there would
// silently truncate, which is the exact failure law 9 exists to prevent.
//
// This file is the ONLY place that touches IndexedDB. Everything above it is
// pure and tested in Node without a browser, which is why the Phase 0 suite
// needs no IndexedDB shim.

import Dexie, { type Table } from 'dexie';
import type { AppEvent, DeviceId } from './events.ts';
import { compareEvents } from './fold.ts';
import type { LogStore, Snapshot } from './log-store.ts';

interface SnapshotRow extends Snapshot { id: number }
interface KvRow { key: string; value: unknown }

class PlannerDb extends Dexie {
  events!: Table<AppEvent, string>;
  snapshots!: Table<SnapshotRow, number>;
  kv!: Table<KvRow, string>;

  constructor(name: string) {
    super(name);
    // Migrations are ADDITIVE ONLY, forever. A version bump may add stores or
    // indexes; it may never change what an existing field means (law 9).
    this.version(1).stores({
      // Primary key `id`. Compound [device+seq] gives gap-free per-device reads;
      // `at` supports ordering; `vault` supports per-vault export.
      events: 'id, [device+seq], at, vault, kind, node',
      snapshots: '++id, at',
    });
    // v2 adds `kv` and nothing else — the additive rule in practice. It holds
    // in-flight scratch that is NOT user history: the capture draft (persisted
    // per keystroke, ADR-0008) and this device's id. Deliberately outside the
    // log, because a keystroke is not an event and flooding the log with them
    // would make the history unreadable for no gain.
    this.version(2).stores({ kv: 'key' });
  }
}

export class DexieLogStore implements LogStore {
  #db: PlannerDb;

  constructor(name = 'planner') {
    this.#db = new PlannerDb(name);
  }

  async append(events: readonly AppEvent[]): Promise<void> {
    if (events.length === 0) return;
    // bulkAdd, not bulkPut: append-only means a duplicate id is an error
    // upstream, never a silent overwrite.
    await this.#db.events.bulkAdd(events as AppEvent[]);
  }

  async all(): Promise<AppEvent[]> {
    const rows = await this.#db.events.toArray();
    return rows.sort(compareEvents);
  }

  async since(mark: Record<DeviceId, number>): Promise<AppEvent[]> {
    const rows = await this.#db.events.toArray();
    return rows.filter(e => e.seq > (mark[e.device] ?? -1)).sort(compareEvents);
  }

  async nextSeq(device: DeviceId): Promise<number> {
    const last = await this.#db.events
      .where('[device+seq]')
      .between([device, Dexie.minKey], [device, Dexie.maxKey])
      .last();
    return last ? last.seq + 1 : 0;
  }

  async putSnapshot(s: Snapshot): Promise<void> {
    await this.#db.transaction('rw', this.#db.snapshots, async () => {
      // One snapshot is enough; the log is the history, not the snapshots.
      await this.#db.snapshots.clear();
      await this.#db.snapshots.add({ ...s, id: 1 });
    });
  }

  async latestSnapshot(): Promise<Snapshot | null> {
    const row = await this.#db.snapshots.orderBy('at').last();
    return row ?? null;
  }

  /**
   * Scratch, not history. See the v2 migration note above: this is where the
   * per-keystroke capture draft lives so an interruption mid-capture — the
   * EXPECTED case for this audience, not the edge case — costs nothing.
   */
  async getKv<T>(key: string): Promise<T | null> {
    const row = await this.#db.kv.get(key);
    return row ? (row.value as T) : null;
  }

  async setKv(key: string, value: unknown): Promise<void> {
    await this.#db.kv.put({ key, value });
  }

  /** Destructive by design — import seeds fresh (ADR-0006). Callers confirm first. */
  async reset(): Promise<void> {
    await this.#db.transaction('rw', this.#db.events, this.#db.snapshots, this.#db.kv, async () => {
      await this.#db.events.clear();
      await this.#db.snapshots.clear();
      await this.#db.kv.clear();
    });
  }

  async close(): Promise<void> { this.#db.close(); }
}
