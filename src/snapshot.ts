// Snapshot + tail.
//
// Startup must not replay the world: state = latest snapshot + the events after
// it (ADR-0001). The < 2 s cold-capture budget depends on this.
//
// The snapshot is ALWAYS an optimisation. `restoreFromLogAlone` exists so a
// snapshot-format bug cannot hide until the day it matters (ADR-0006), and the
// test suite proves both paths agree.

import type { AppEvent, DeviceId } from './events.ts';
import { fold, emptyState, type State, type NodeState } from './fold.ts';
import type { LogStore, Snapshot } from './log-store.ts';

/** State -> plain JSON. Maps and Sets do not survive JSON.stringify.
 *  structuredClone, because emitting the LIVE node objects made the stored
 *  snapshot an alias of running state — later folds mutated history in place
 *  (audit). A snapshot is a photograph, not a window. */
export function serialiseState(s: State): unknown {
  return structuredClone({
    nodes: [...s.nodes.values()],
    vaults: [...s.vaults.entries()],
    devices: [...s.devices],
    seqByDevice: [...s.seqByDevice.entries()],
    eventCount: s.eventCount,
  });
}

export function deserialiseState(raw: unknown): State {
  const r = raw as {
    nodes: NodeState[];
    vaults: [string, { name: string; domain: string }][];
    devices: string[];
    seqByDevice: [string, number][];
    eventCount: number;
  };
  return {
    nodes: new Map(r.nodes.map(n => [n.id, n])),
    vaults: new Map(r.vaults),
    devices: new Set(r.devices),
    seqByDevice: new Map(r.seqByDevice),
    eventCount: r.eventCount,
  };
}

export const highWaterMark = (s: State): Record<DeviceId, number> =>
  Object.fromEntries(s.seqByDevice);

/** Write a snapshot covering everything currently in the log. */
export async function writeSnapshot(store: LogStore, at: string): Promise<Snapshot> {
  const state = fold(await store.all());
  const snap: Snapshot = {
    upToSeqByDevice: highWaterMark(state),
    state: serialiseState(state),
    at,
  };
  await store.putSnapshot(snap);
  return snap;
}

/** The startup path: snapshot + tail — VERIFIED, else a full replay.
 *
 *  The high-water mark is a max, not a set: an event that arrives at-or-below
 *  the mark after the snapshot was cut (a late shard under ADR-0003, or a cure
 *  sharing its cause's seq per ADR-0027) is invisible to `since()` forever.
 *  The audit produced exactly that — a restore that resurrected a silent node
 *  the gate had cured. So the fast path must EARN itself: if the arithmetic
 *  (snapshot's events + tail) does not equal what the log holds, the snapshot
 *  is stale and the log is the truth. */
export async function loadState(store: LogStore): Promise<State> {
  const snap = await store.latestSnapshot();
  if (!snap) return fold(await store.all());
  const all = await store.all();
  const tail = await store.since(snap.upToSeqByDevice);
  const snapCount = (snap.state as { eventCount?: number }).eventCount ?? -1;
  if (snapCount + tail.length !== all.length) {
    return fold(all, emptyState());
  }
  return fold(tail, deserialiseState(snap.state));
}

/**
 * Rebuild ignoring any snapshot. If this ever disagrees with `loadState`, the
 * snapshot is lying and the snapshot is what is wrong — the log is the truth.
 */
export async function restoreFromLogAlone(store: LogStore): Promise<State> {
  return fold(await store.all(), emptyState());
}
