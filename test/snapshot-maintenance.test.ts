// The app actually cuts a snapshot (1.14.1, ADR-0063).
//
// `writeSnapshot` has existed and been tested since Phase 0, and had no caller
// outside this suite — so `loadState` never found a snapshot and every cold
// start folded the entire log, against ADR-0001's first consequence. Nothing
// went red, because the fallback path is the correct one. That is exactly why
// the tests here are about the CALLER and the OUTCOME rather than about the
// serialiser, which was never the part that was broken.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openSession } from '../src/ui/session.ts';
import { MemoryLogStore } from '../src/log-store.ts';
import { SNAPSHOT_LAG_LIMIT, loadState, restoreFromLogAlone, serialiseState, snapshotLag } from '../src/snapshot.ts';
import type { AppEvent } from '../src/events.ts';
import type { SessionStore } from '../src/ui/session.ts';

const tick = (() => { let t = 1_753_100_000_000; return () => t += 7; })();

/** N captures in ONE commit — a single trip through the gate rather than N, so
 *  a test about snapshots is not really a test of how fast `admit` is. Each
 *  capture takes a cure, so the log grows by roughly 2N. */
const captures = (n: number) => (ctx: {
  id: () => string; seq: () => number; at: string; device: string; vault: string;
}): AppEvent[] =>
  Array.from({ length: n }, (_, i) => ({
    id: ctx.id(), vault: ctx.vault, at: ctx.at, device: ctx.device, seq: ctx.seq(),
    kind: 'capture.recorded', node: `n${String(i).padStart(5, '0')}-${ctx.seq()}`,
    payload: { text: `a thought ${i}`, source: 'quick' },
  } as AppEvent));

test('a small store is left alone — nothing is due, and nothing is written', async () => {
  const store = new MemoryLogStore();
  const session = await openSession(tick, 'personal', 'maint-a', store);
  await session.commit(captures(5));

  assert.equal(await session.maintain(), null, 'not due');
  assert.equal(await store.latestSnapshot(), null, 'and no photograph was taken');
  const kinds = (await store.all()).map(e => e.kind);
  assert.ok(!kinds.includes('snapshot.written'),
    'and nothing in the record claims one was — a log that says it did work it did not do is worse than the work being skipped');
});

test('THE POINT: past the limit, a snapshot is cut and the next start uses it', async () => {
  const store = new MemoryLogStore();
  const session = await openSession(tick, 'personal', 'maint-b', store);
  // Comfortably past the limit, in one commit.
  await session.commit(captures(SNAPSHOT_LAG_LIMIT));

  const lagBefore = await snapshotLag(store, session.state());
  assert.ok(lagBefore >= SNAPSHOT_LAG_LIMIT,
    `the whole log is what a cold start would replay (${lagBefore} events)`);

  const covered = await session.maintain();
  assert.equal(typeof covered, 'number', 'a snapshot was cut');

  const snap = await store.latestSnapshot();
  assert.ok(snap, 'and it is really in the store');
  assert.equal((snap.state as { eventCount: number }).eventCount, covered,
    'covering exactly what it says it covers');

  // THE ACTUAL PROOF that startup stops replaying the world: `loadState`'s fast
  // path is taken when snapshot-count plus tail equals the log, and refuses
  // itself otherwise. Asserting that condition IS asserting the fast path,
  // rather than asserting a call was made and hoping.
  const all = await store.all();
  const tail = await store.since(snap.upToSeqByDevice);
  assert.equal((snap.state as { eventCount: number }).eventCount + tail.length, all.length,
    'the arithmetic loadState requires holds, so the fast path earns itself');
  assert.ok(tail.length < SNAPSHOT_LAG_LIMIT,
    `and the tail is bounded (${tail.length}), which is the whole point`);

  // And it must still be the SAME state. A fast start that disagrees with the
  // log is worse than a slow one (ADR-0006).
  assert.deepEqual(
    serialiseState(await loadState(store)),
    serialiseState(await restoreFromLogAlone(store)),
    'snapshot + tail agrees with the log alone, exactly',
  );
});

test('the snapshot is recorded in the log, once, and after the fact', async () => {
  const store = new MemoryLogStore();
  const session = await openSession(tick, 'personal', 'maint-c', store);
  await session.commit(captures(SNAPSHOT_LAG_LIMIT));
  await session.maintain();

  const written = (await store.all()).filter(e => e.kind === 'snapshot.written');
  assert.equal(written.length, 1, 'one record for one snapshot');
  const p = written[0]!.payload as { upToSeq: number; reason: string };
  assert.equal(p.reason, 'periodic');
  assert.ok(Number.isInteger(p.upToSeq) && p.upToSeq > 0, 'carrying the mark it was cut at');

  // Running again changes nothing: the lag was just reset, so nothing is due.
  assert.equal(await session.maintain(), null, 'a second boot does not cut another');
  assert.equal((await store.all()).filter(e => e.kind === 'snapshot.written').length, 1);
});

test('DELIVER, THEN RECORD: a failed write leaves no record claiming otherwise', async () => {
  // The export path learned this the hard way — an audit found `export.written`
  // being logged before any file existed, so a failed export left the log
  // asserting a copy had left when none had, silently. Same ordering, same
  // reason, pinned here rather than assumed.
  const inner = new MemoryLogStore();
  // A delegating wrapper, not a clone of the instance: `MemoryLogStore` keeps
  // its rows in a private field, so copying its own properties yields an object
  // whose methods have nothing to read.
  const refusing = {
    append: (e: readonly AppEvent[]) => inner.append(e),
    all: () => inner.all(),
    since: (m: Record<string, number>) => inner.since(m),
    nextSeq: (d: string) => inner.nextSeq(d),
    latestSnapshot: () => inner.latestSnapshot(),
    reset: () => inner.reset(),
    replaceAll: (e: readonly AppEvent[]) => inner.replaceAll(e),
    getKv: <T>(k: string) => inner.getKv<T>(k),
    setKv: (k: string, v: unknown) => inner.setKv(k, v),
    putSnapshot: () => Promise.reject(new Error('the store will not hold a photograph')),
  } as unknown as SessionStore;
  const session = await openSession(tick, 'personal', 'maint-d', refusing);
  await session.commit(captures(SNAPSHOT_LAG_LIMIT));

  await assert.rejects(() => session.maintain(), /will not hold a photograph/);
  const kinds = (await refusing.all()).map(e => e.kind);
  assert.ok(!kinds.includes('snapshot.written'),
    'nothing in the record claims a snapshot exists');
});

test('a stale snapshot is refused rather than believed', async () => {
  // The guard that makes all of this safe to turn on. `loadState` recomputes the
  // arithmetic and falls back to the log when it does not hold — so the worst
  // case of cutting snapshots is a slow start, never a wrong state.
  const store = new MemoryLogStore();
  const session = await openSession(tick, 'personal', 'maint-e', store);
  await session.commit(captures(SNAPSHOT_LAG_LIMIT));
  await session.maintain();

  const snap = (await store.latestSnapshot())!;
  await store.putSnapshot({
    ...snap,
    state: { ...(snap.state as object), eventCount: 999_999 },
  });

  assert.deepEqual(
    serialiseState(await loadState(store)),
    serialiseState(await restoreFromLogAlone(store)),
    'a snapshot whose count does not add up is ignored, and the log is the truth',
  );
});
