// The session layer — the write path the UI actually uses.
//
// The one property that matters here: commits are SERIALIZED. Two interleaved
// commits would both read nextSeq before either appends, and neither store
// enforces per-device seq uniqueness — Dexie's [device+seq] index is
// non-unique — so without the queue, a double-tap silently mints two events
// with the same seq and the gap-free invariant dies without an error.
//
// Cures are the deliberate exception: a gate cure carries its cause's stamp
// (ADR-0027), so uniqueness and gap-freeness are asserted over OFFERED events,
// and cures are checked to sit exactly on their cause's seq.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openSession, captureEvent } from '../src/ui/session.ts';
import { MemoryLogStore } from '../src/log-store.ts';
import { serialiseState } from '../src/snapshot.ts';
import { fold } from '../src/fold.ts';

const tick = (() => { let t = 1_753_000_000_000; return () => t += 7; })();

const isCure = (id: string): boolean => id.includes('~cure~');

test('concurrent commits cannot collide on (device, seq)', async () => {
  const store = new MemoryLogStore();
  const session = await openSession(tick, 'personal', 'test', store);

  const N = 8;
  // Fired together, deliberately — no await between them. This is the
  // double-tap, the paste-then-enter, the share-target racing the open app.
  await Promise.all(
    Array.from({ length: N }, (_, i) =>
      session.commit(ctx => captureEvent(ctx, `thought ${i}`, 'quick')),
    ),
  );

  const all = await store.all();
  const offered = all.filter(e => !isCure(e.id));

  const seqs = offered.map(e => e.seq).sort((a, b) => a - b);
  assert.equal(new Set(seqs).size, offered.length, 'offered seqs are distinct');
  assert.deepEqual(seqs, seqs.map((_, i) => i), 'and gap-free from zero');

  assert.equal(session.state().nodes.size, N, 'every thought landed as a node');
  for (let i = 0; i < N; i++) {
    assert.ok(
      [...session.state().nodes.values()].some(n => n.title === `thought ${i}`),
      `thought ${i} is present`,
    );
  }
});

test('cures sit exactly on their cause’s stamp (ADR-0027)', async () => {
  const store = new MemoryLogStore();
  const session = await openSession(tick, 'personal', 'test', store);
  await session.commit(ctx => captureEvent(ctx, 'needs a clock', 'quick'));

  const all = await store.all();
  const cures = all.filter(e => isCure(e.id));
  assert.ok(cures.length > 0, 'a capture is silent-risk, so the gate cured it');
  for (const cure of cures) {
    const causeId = cure.id.split('~cure~')[0]!;
    const cause = all.find(e => e.id === causeId);
    assert.ok(cause, 'the cure names its cause');
    assert.equal(cure.seq, cause!.seq, 'and shares its seq');
    assert.equal(cure.device, cause!.device, 'and its device');
  }
});

test('a failing commit does not wedge the queue', async () => {
  const store = new MemoryLogStore();
  const session = await openSession(tick, 'personal', 'test', store);

  await assert.rejects(
    session.commit(() => { throw new Error('surface bug'); }),
    /surface bug/,
  );
  // The NEXT write must still land — a stuck queue would turn one bug into
  // silent data loss forever after, which is the worst failure this app has.
  await session.commit(ctx => captureEvent(ctx, 'still works', 'quick'));
  assert.equal(session.state().nodes.size, 1);
});

test('replay determinism survives concurrency: fold(log) equals live state', async () => {
  const store = new MemoryLogStore();
  const session = await openSession(tick, 'personal', 'test', store);
  await Promise.all(
    Array.from({ length: 5 }, (_, i) =>
      session.commit(ctx => captureEvent(ctx, `t${i}`, 'quick')),
    ),
  );
  const replayed = fold(await store.all());
  assert.deepEqual(
    JSON.parse(JSON.stringify(serialiseState(replayed))),
    JSON.parse(JSON.stringify(serialiseState(session.state()))),
    'same log, same state, regardless of arrival order',
  );
});
