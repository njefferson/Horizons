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
    focus: s.focus,
    focusStamp: s.focusStamp,
    lastReportAt: s.lastReportAt,
    lastReportMark: s.lastReportMark,
    lastActivityAt: s.lastActivityAt,
    modules: [...s.modules],
    requestSlot: s.requestSlot,
    requestSlotStamp: s.requestSlotStamp,
    timerMinutes: s.timerMinutes,
    timerMinutesStamp: s.timerMinutesStamp,
    capacity: s.capacity,
    capacityStamp: s.capacityStamp,
  });
}

export function deserialiseState(raw: unknown): State {
  const r = raw as {
    nodes: NodeState[];
    vaults: [string, { name: string; domain: string }][];
    devices: string[];
    seqByDevice: [string, number][];
    eventCount: number;
    focus?: State['focus'];
    focusStamp?: State['focusStamp'];
    lastReportAt?: string | null;
    lastReportMark?: Record<string, number> | null;
    lastActivityAt?: string | null;
    modules?: string[];
    requestSlot?: State['requestSlot'];
    requestSlotStamp?: State['requestSlotStamp'];
    timerMinutes?: State['timerMinutes'];
    timerMinutesStamp?: State['timerMinutesStamp'];
    capacity?: State['capacity'];
    capacityStamp?: State['capacityStamp'];
  };
  return {
    // Backfill Phase-2 fields a pre-Phase-2 snapshot never stored. Without this,
    // an updated app reads nodes with `sourceTags === undefined` and the clarify
    // queue throws on `.includes` — the update breaking the inbox, which the
    // "data is never lost to updates" law forbids (audit). `captured ?? true` is
    // correct for legacy data: before Phase 2 the ONLY node-creating event a
    // shipped surface emitted was capture.recorded, so every stored node was a
    // capture. A Phase-2+ snapshot sets `captured` explicitly, so `?? true`
    // never overrides a real `false`.
    nodes: new Map(r.nodes.map(n => [n.id, {
      ...n,
      // The Phase-0 structural fields, defaulted for completeness (1.9.2).
      // Every real snapshot carries them, so `??` never overrides anything —
      // but the generic three-place test asks the honest question ("does a
      // record missing a key deserialise to the type it promises?") and the
      // answer has to be yes for EVERY field or the invariant is a slogan.
      kind: n.kind ?? 'action',
      title: n.title ?? '',
      parent: n.parent ?? null,
      trashed: n.trashed ?? false,
      onMenu: n.onMenu ?? null,
      lastDone: n.lastDone ?? null,
      comfortWindowDays: n.comfortWindowDays ?? null,
      intervalDays: n.intervalDays ?? null,
      // COPIED, not just defaulted: `?? []` alone hands the snapshot record's
      // own array to running state (found by the 1.9.2 generic three-place
      // test, which is the whole argument for writing it without a field list).
      sourceTags: [...(n.sourceTags ?? [])],
      heat: n.heat ?? null,
      route: n.route ?? null,
      captured: n.captured ?? true,
      resumeSpent: n.resumeSpent ?? false,
      resumeFor: n.resumeFor ?? null,
      resumeCue: n.resumeCue ?? null,
      interruptedFocus: n.interruptedFocus ?? null,
      interruptedAt: n.interruptedAt ?? null,
      // MUTABLE — copied, like `feeds` directly below.
      people: [...(n.people ?? [])],
      waitingOn: n.waitingOn ?? null,
      waitingFor: n.waitingFor ?? null,
      waitingSince: n.waitingSince ?? null,
      waitingOutcome: n.waitingOutcome ?? null,
      role: n.role ?? null,
      opr: n.opr ?? null,
      saveTarget: n.saveTarget ?? null,
      saveSaved: n.saveSaved ?? null,
      ownership: n.ownership ?? null,
      botherRouted: n.botherRouted ?? false,
      lastReplan: n.lastReplan ?? null,
      // MUTABLE fields must be copied on deserialise as well as on clone. A
      // shared array between a snapshot and running state is how a fold rewrote
      // history in place once already (audit).
      feeds: [...(n.feeds ?? [])],
      // Both were missing their backfill until the 1.9.2 audit. Neither
      // misbehaved — Number.isFinite(undefined) is false and !undefined is
      // true — but the type promised null and delivered undefined.
      leadDays: n.leadDays ?? null,
      // A pre-1.30.0 snapshot has no anchors, because there was nothing to
      // record one with. Null, not undefined: clause (e) asks `node.after` on
      // every coverage check, and the type has to be true for a store written
      // by an older build or the promise is only true for new data.
      after: n.after ?? null,
      // A pre-1.32.0 snapshot has nothing put down, because there was no way to
      // put anything down. Null, not undefined: `heldNodes` asks this of every
      // node on every read, and a store written by an older build has to answer.
      released: n.released ?? null,
      mergedInto: n.mergedInto ?? null,
      todayFor: n.todayFor ?? null,
      // A pre-1.8.0 snapshot stored no declines — none were standing. COPIED,
      // not aliased: a shared object between a snapshot and running state is
      // how a fold rewrote history in place once already (audit).
      notNow: n.notNow ? { ...n.notNow } : null,
      // The third of the three places (1.15.0). A snapshot written before
      // pebbles existed has no field at all, and `undefined` reaching a
      // projection is how a type-lie becomes a runtime one — the generic
      // `three-place:` test exists because this exact backfill was missed twice.
      pebble: n.pebble
        ? { magnitude: n.pebble.magnitude, affects: [...(n.pebble.affects ?? [])] }
        : null,
      // MUTABLE, and the third place the rule bites: a pre-1.9.0 snapshot
      // stored no decisions — none had been logged.
      decisions: [...(n.decisions ?? [])],
      fields: { ...(n.fields ?? {}) },
      stamps: { ...(n.stamps ?? {}) },
      clocks: { ...(n.clocks ?? {}) },
    }])),
    vaults: new Map(r.vaults),
    devices: new Set(r.devices),
    seqByDevice: new Map(r.seqByDevice),
    eventCount: r.eventCount,
    // A snapshot taken before focus existed has neither. Null is exactly right:
    // nothing was being worked on, because nothing could be.
    focus: r.focus ?? null,
    focusStamp: r.focusStamp ?? null,
    lastReportAt: r.lastReportAt ?? null,
    // MUTABLE — copied on deserialise, like every other container here.
    lastReportMark: r.lastReportMark ? { ...r.lastReportMark } : null,
    lastActivityAt: r.lastActivityAt ?? null,
    // A pre-1.6.0 snapshot stored no modules — none were on, which is exactly
    // what an empty set says.
    modules: new Set(r.modules ?? []),
    // A pre-1.8.0 snapshot stored no slot — none was set. Copied on the way
    // in, like `lastReportMark` above.
    requestSlot: r.requestSlot ? { ...r.requestSlot } : null,
    requestSlotStamp: r.requestSlotStamp ? { ...r.requestSlotStamp } : null,
    // A pre-1.10.0 snapshot stored no timer length — nobody had chosen one.
    timerMinutes: r.timerMinutes ?? null,
    timerMinutesStamp: r.timerMinutesStamp ? { ...r.timerMinutesStamp } : null,
    // A pre-1.15.0 snapshot stored no capacity — nobody had been asked.
    capacity: r.capacity ?? null,
    capacityStamp: r.capacityStamp ? { ...r.capacityStamp } : null,
  };
}

export const highWaterMark = (s: State): Record<DeviceId, number> =>
  Object.fromEntries(s.seqByDevice);

/**
 * How far the log has run past the newest snapshot, in events.
 *
 * `state.eventCount` is folded from the log, and every snapshot carries the
 * count it was cut at — `loadState` already relies on that number to decide
 * whether its fast path has earned itself. Subtracting the two answers "how
 * much would a cold start have to replay right now", which is the only question
 * that decides whether cutting another one is worth anything.
 *
 * With no snapshot at all the answer is the whole log, which is exactly right:
 * that IS what startup replays today.
 */
export async function snapshotLag(store: LogStore, state: State): Promise<number> {
  const snap = await store.latestSnapshot();
  const covered = snap ? ((snap.state as { eventCount?: number }).eventCount ?? 0) : 0;
  return Math.max(0, state.eventCount - covered);
}

/**
 * Events past the newest snapshot before another is worth cutting (1.14.1).
 *
 * Not a tuning knob so much as a statement of what startup is allowed to cost.
 * Below it, a cold start folds at most this many events onto a deserialised
 * state; above it, the tail is doing work a photograph could have done. 500 is
 * chosen to be comfortably inside the < 2 s cold-capture budget on the
 * reference device while being large enough that ordinary days never cut one —
 * a heavy session is tens of events, an import is thousands.
 *
 * The number is deliberately NOT time-based. A device used once a fortnight has
 * a short tail and should do no work; a device that took an import an hour ago
 * has a long one. Elapsed time knows neither.
 */
export const SNAPSHOT_LAG_LIMIT = 500;

/**
 * Cut a snapshot from a state that has ALREADY been folded.
 *
 * This is the one the running app uses, and the distinction from
 * `writeSnapshot` below is the whole point: re-reading and re-folding the log to
 * photograph it would cost exactly the work the photograph exists to avoid. The
 * session has just folded this state; serialising it is a clone and nothing
 * more.
 *
 * The mark and the count both come from the SAME state object, read
 * synchronously, so the snapshot is internally consistent even if a commit
 * lands while it is being written. It will simply cover less than the log does,
 * which is what a snapshot is.
 */
export async function snapshotFrom(
  store: LogStore, state: State, at: string,
): Promise<Snapshot> {
  const snap: Snapshot = {
    upToSeqByDevice: highWaterMark(state),
    state: serialiseState(state),
    at,
  };
  await store.putSnapshot(snap);
  return snap;
}

/** Write a snapshot covering everything currently in the log, re-folding to get
 *  it. Used by the tests and by any caller that does not already hold state;
 *  the app itself uses `snapshotFrom`, which does not pay the fold twice. */
export async function writeSnapshot(store: LogStore, at: string): Promise<Snapshot> {
  return snapshotFrom(store, fold(await store.all()), at);
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
