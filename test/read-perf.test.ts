// The perf gate on the READ path (1.17.1, ADR-0069).
//
// `admit-perf.test.ts` has guarded the write path since 1.3.0. The read path had
// nothing, and the roadmap's own note said why it would stay that way: the
// numbers were EXTRAPOLATED — "~220 ms today, 1.56 s at 10k" — and build-plan
// item 42 defers read-path work to a measurement on the actual device.
//
// 1.16.0 built the instrument. A 566-thing store with every kind in it is a
// fixture you can time, so the number stopped being a guess: **one refresh cost
// ~100 ms, and ~78 of that was resolving the same instants over and over.**
//
// Two gates here, and they fail for different reasons on purpose:
//
//  - **The structural one is deterministic.** It proves the memo exists by
//    identity. A wall-clock test on a shared CI runner is a coin flip at tight
//    bounds and useless at loose ones; this one cannot flake, and it is the check
//    that actually names the mechanism.
//  - **The wall-clock one is loose,** in the same spirit as the admit gate's
//    800 ms bound around a 55 ms operation: it is not there to measure, it is
//    there to catch a return of the shape — which lands multiples over, not
//    fractionally.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { bigSampleEvents } from '../src/big-sample.ts';
import { admit, coverageGauge, gateOptionsFor } from '../src/gate.ts';
import { fold, type State } from '../src/fold.ts';
import { heldGroups, undatedCount } from '../src/held.ts';
import { nextUp, workSurface } from '../src/nextup.ts';
import { offerNow } from '../src/offer.ts';
import { replanAll } from '../src/replan.ts';
import { reviewExceptions } from '../src/review.ts';
import { menuGroups } from '../src/menu.ts';
import { trackPortfolio } from '../src/portfolio.ts';
import { waitingOnAnyone } from '../src/people.ts';
import { todayCard } from '../src/today.ts';
import { composedFor } from '../src/composed.ts';
import { notNowLedger } from '../src/requests.ts';
import { loadNow } from '../src/load.ts';
import { calendarCount } from '../src/ics.ts';
import { reentryView } from '../src/reentry.ts';
import { localParts, localDayKey } from '../src/time.ts';

const TZ = 'America/Denver';
const NOW = '2026-08-03T18:00:00.000Z';

/**
 * Everything one commit makes the app recompute.
 *
 * Not a microbenchmark of a chosen function — the surfaces `app.ts` refreshes
 * together, because the cost that matters is the cost of one act. A gate over a
 * single projection would go green while the sum of them crawled.
 */
function refresh(st: State): void {
  coverageGauge(st); heldGroups(st, NOW, TZ); undatedCount(st, NOW, TZ);
  nextUp(st, NOW, TZ); workSurface(st, NOW, TZ); offerNow(st, NOW, TZ);
  replanAll(st, NOW, TZ); reviewExceptions(st, NOW, TZ); menuGroups(st);
  trackPortfolio(st, NOW, TZ); waitingOnAnyone(st, NOW, TZ); todayCard(st, NOW, TZ);
  composedFor(st, NOW, TZ); notNowLedger(st); loadNow(st); calendarCount(st, NOW, TZ);
  reentryView(st, NOW, TZ);
}

let cached: State | null = null;
async function store(): Promise<State> {
  if (cached) return cached;
  let n = 0, s = 0;
  const ctx = { at: NOW, device: 'perf', vault: 'personal', zone: TZ, seq: () => s++, id: () => `q${n++}` };
  const events = await bigSampleEvents(ctx, NOW);
  cached = fold(admit(events, fold([]), gateOptionsFor(TZ)));
  return cached;
}

// --- the structural gate: it cannot flake ------------------------------------

test('read-perf: resolving an instant twice returns the SAME answer, not a second computation', () => {
  // Identity, which is the only observable difference between a memo and a
  // function that recomputes — and it is the mechanism the whole release is.
  const a = localParts(NOW, TZ);
  const b = localParts(NOW, TZ);
  assert.equal(a, b, 'the memo is gone — every projection is paying full price again');
  // And a different zone is a different answer, so the key is not just the
  // instant. A cache keyed on the instant alone would hand a traveller the
  // wrong day, which is worse than being slow.
  assert.notEqual(localParts(NOW, 'Pacific/Kiritimati'), a);
  assert.notEqual(localDayKey(NOW, 'Pacific/Kiritimati'), localDayKey(NOW, TZ));
});

test('read-perf: the shared answer is frozen, so one caller cannot change another\'s', () => {
  // A memo hands out one object. This repo has already paid for aliasing once —
  // the three-place rule in `fold.ts` exists for it.
  const p = localParts(NOW, TZ);
  assert.equal(Object.isFrozen(p), true);
  assert.throws(() => { (p as { day: number }).day = 99; }, TypeError);
  assert.equal(localParts(NOW, TZ).day, p.day, 'and the cached answer survived the attempt');
});

test('read-perf: a malformed instant throws exactly as it did before the memo', () => {
  // Written expecting NaN parts, and the platform corrected it: `formatToParts`
  // THROWS on an invalid date. So the memo's first draft carried a NaN guard for
  // a case that cannot reach it — dead code with a confident comment on it.
  //
  // What matters for this release is that the behaviour is UNCHANGED: it threw
  // before, it throws now, and nothing nonsense is ever cached because the throw
  // happens before the cache is touched. Callers guard with `isValidIso`, which
  // is why that has always been the rule.
  assert.throws(() => localParts('not-a-date', TZ), RangeError);
  assert.throws(() => localParts('2026-08-32T00:00:00.000Z', TZ), RangeError);
});

// --- the invariants must survive the memo -----------------------------------

test('read-perf: the same store answers the same after any number of refreshes', async () => {
  // A cache that changed an answer would be the worst possible trade. Pin the
  // things a person reads, before and after the cache is warm.
  const st = await store();
  const first = {
    gauge: coverageGauge(st),
    rows: heldGroups(st, NOW, TZ).flatMap(g => g.items).length,
    replan: replanAll(st, NOW, TZ).length,
    waiting: waitingOnAnyone(st, NOW, TZ).length,
    calendar: calendarCount(st, NOW, TZ),
    undated: undatedCount(st, NOW, TZ),
  };
  for (let i = 0; i < 5; i++) refresh(st);
  assert.deepEqual({
    gauge: coverageGauge(st),
    rows: heldGroups(st, NOW, TZ).flatMap(g => g.items).length,
    replan: replanAll(st, NOW, TZ).length,
    waiting: waitingOnAnyone(st, NOW, TZ).length,
    calendar: calendarCount(st, NOW, TZ),
    undated: undatedCount(st, NOW, TZ),
  }, first);
});

// --- the wall-clock gate: loose, and about the SHAPE -------------------------

/**
 * Generous against a shared runner, and far under what it guards.
 *
 * Measured on this hardware: ~22 ms with the memo, ~100 ms without — and the
 * defect it exists to catch is not a few percent, it is a multiple. The admit
 * gate makes the same trade (800 ms around a 55 ms operation) for the same
 * reason: a bound tight enough to measure is a bound loose enough to flake.
 */
const BUDGET_MS = 250;

test(`read-perf: one refresh over a full store stays under ${BUDGET_MS}ms`, async () => {
  const st = await store();
  assert.ok(st.nodes.size > 500, `the fixture is only ${st.nodes.size} nodes`);
  refresh(st);                      // warm: the first pass fills the memo
  const t0 = performance.now();
  for (let i = 0; i < 5; i++) refresh(st);
  const per = (performance.now() - t0) / 5;
  assert.ok(per < BUDGET_MS,
    `one refresh at ${st.nodes.size} nodes took ${per.toFixed(0)}ms (budget ${BUDGET_MS}ms)`);
});
