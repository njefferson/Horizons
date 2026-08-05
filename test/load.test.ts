// Load, not work (1.15.0, ADR-0065) — the consumer ADR-0014 described in the
// design phase and nothing ever built.
//
// The tests that matter here are not about arithmetic. They are the four things
// the laws forbid this feature from becoming: a demand, a score, a diagnosis,
// or a reason to hide work.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { admit, coverageGauge, heldNodes, silentNodes } from '../src/gate.ts';
import { heldGroups } from '../src/held.ts';
import { fold, emptyState, type State } from '../src/fold.ts';
import { HEAVY_AT, loadNow, loadWords, offerCapFor, pebbleWords } from '../src/load.ts';
import { OFFER_CAP, offerNow } from '../src/offer.ts';
import { raisePebbleEvents } from '../src/ui/load-intents.ts';
import { serialiseState, deserialiseState } from '../src/snapshot.ts';
import type { AppEvent } from '../src/events.ts';

const TZ = 'America/Denver';
const NOW = '2026-08-02T18:00:00.000Z';

let n = 0;
const ev = (kind: string, node: string | null, payload: unknown, over: Partial<AppEvent> = {}): AppEvent => ({
  id: (over.id as string) ?? `l${n++}`, vault: 'personal',
  at: (over.at as string) ?? '2026-08-02T12:00:00.000Z',
  device: (over.device as string) ?? 'd0', seq: (over.seq as number) ?? n,
  kind, node, payload,
} as AppEvent);
const write = (prior: State, offered: AppEvent[]): State => fold(admit(offered, prior), prior);

const pebble = (s: State, id: string, title: string, magnitude: string, affects: string[] = []): State =>
  write(s, [
    ev('node.created', id, { nodeKind: 'pebble', title }),
    ev('pebble.raised', id, { magnitude, affects }),
  ]);

/**
 * A store the offer can fill to its cap.
 *
 * TWO DIFFERENT REASONS, deliberately: the offer allows at most one item per
 * `NextUpReason` (ADR-0060), so three things with a date today produce ONE
 * offer, not two. The first version of this fixture did exactly that and made
 * the tests below fail against correct code — the rule working, and my fixture
 * not knowing it.
 */
const withWork = (): State => {
  let s = emptyState();
  // A real date today -> 'hard-date'.
  s = write(s, [ev('node.created', 'w1', { nodeKind: 'action', title: 'ring the plumber' })]);
  s = write(s, [ev('clock.set', 'w1', { clockKind: 'due', at: '2026-08-02T23:00:00.000Z', source: 'me' })]);
  // A thing simply waiting -> 'ready'. NOT an upkeep: a ready upkeep becomes a
  // chip, and the offer excludes chips because they have their own place.
  s = write(s, [ev('node.created', 'w2', { nodeKind: 'action', title: 'draft the note' })]);
  s = write(s, [ev('clock.set', 'w2', { clockKind: 'start', at: '2026-08-01T12:00:00.000Z', source: 'me' })]);
  return s;
};

test('A PEBBLE CANNOT BECOME A DEMAND — the gate refuses a clock, as it has since Phase 0', () => {
  const s = pebble(emptyState(), 'P', 'the thing with the roof', 'rock');
  assert.deepEqual(Object.keys(s.nodes.get('P')!.clocks), [],
    'no clock, not even the gate\'s own cure');
  assert.equal(silentNodes(s).length, 0, 'and law 1 is satisfied without one');
  assert.throws(
    () => admit([ev('clock.set', 'P', { clockKind: 'due', at: '2026-08-09T12:00:00.000Z', source: 'me' })], s),
    /cannot carry a clock/i,
    'and a date on one is refused outright',
  );
});

test('weight narrows the OFFER, and nothing else', () => {
  let s = withWork();
  const before = offerNow(s, NOW, TZ);
  assert.equal(before.work.length, OFFER_CAP, 'two things on an ordinary day');
  const gaugeBefore = coverageGauge(s);
  const listedBefore = heldGroups(s, NOW, TZ).flatMap(g => g.items).length;

  s = pebble(s, 'P', 'the thing with the roof', 'boulder');
  const after = offerNow(s, NOW, TZ);
  assert.equal(after.work.length, OFFER_CAP - 1, 'one thing while a boulder is on');

  // WHAT MUST NOT HAPPEN. Hiding work is the opposite of this app, so the held
  // list keeps every piece of it — and a pebble never joins that list, because
  // ADR-0014 says a pebble accounts for weight "without ever becoming a task"
  // and a row in the todo list is what becoming a task looks like.
  assert.equal(heldGroups(s, NOW, TZ).flatMap(g => g.items).length, listedBefore,
    'no work left the todo list, and the pebble did not join it');
  // The PROOF still covers it. `silent` runs over every node, and excluding a
  // kind from a proof is how law 1 gets defined away (1.3.1).
  assert.equal(coverageGauge(s).silent, gaugeBefore.silent, 'nothing went silent');
  // The gauge's TOTAL does not move, and this assertion is the reverse of what
  // it said in 1.15.0. It read `+ 1` then, because the gauge counted a pebble
  // while the list under it did not — so opening the number produced a row
  // reading "the thing with the roof — held" in the middle of a work list. The
  // number and the list it itemises are one claim (1.15.1).
  assert.equal(coverageGauge(s).total, gaugeBefore.total,
    'the work you are holding did not change — a pebble is not work');
  // And nothing is hidden: it is still held, and every wider reader sees it.
  assert.equal(heldNodes(s).length, heldNodes(withWork()).length + 1,
    'the pebble is still a node you are holding');
});

test('NEVER BELOW ONE — a heavy day is when that matters most', () => {
  let s = withWork();
  s = pebble(s, 'P1', 'one', 'boulder');
  s = pebble(s, 'P2', 'two', 'boulder');
  s = pebble(s, 'P3', 'three', 'boulder');
  const o = offerNow(s, NOW, TZ);
  assert.equal(o.work.length, 1, 'still exactly one thing');
  assert.equal(offerCapFor(loadNow(s), 1), 1, 'and the cap cannot be argued below it');
});

test('one small thing changes nothing — a pebble must be sayable without consequence', () => {
  let s = withWork();
  s = pebble(s, 'P', 'a small annoyance', 'pebble');
  assert.equal(loadNow(s).heavy, false, `one pebble is under the threshold of ${HEAVY_AT}`);
  assert.equal(offerNow(s, NOW, TZ).work.length, OFFER_CAP,
    'the offer is unchanged, so writing it down cost nothing');
  assert.equal(loadWords(loadNow(s)), '', 'and the app says nothing about it');
});

test('saying "low" is believed on its own, with no pebbles at all', () => {
  let s = withWork();
  s = write(s, [ev('capacity.declared', null, { level: 'low' })]);
  const load = loadNow(s);
  assert.equal(load.heavy, true, 'your word is enough');
  assert.equal(load.pebbles.length, 0, 'and it needed no justification');
  assert.equal(offerNow(s, NOW, TZ).work.length, OFFER_CAP - 1);
});

test('an unrecognised capacity is REFUSED, never guessed', () => {
  const s = write(emptyState(), [ev('capacity.declared', null, { level: 'exhausted' })]);
  assert.equal(s.capacity, null,
    'the app does not decide how you are from something it did not understand');
});

test('CO-OCCURRENCE, NEVER CAUSATION (law 7) — the words name two facts and do not join them', () => {
  let s = withWork();
  s = pebble(s, 'P', 'the roof', 'boulder');
  const words = loadWords(loadNow(s));
  assert.match(words, /while/i, 'the two facts share a period');
  assert.doesNotMatch(words, /because|due to|caused|since you|that is why/i,
    'and the app never explains you to yourself');
  // Law 5: no score, no tally, no number anywhere in what is shown.
  assert.doesNotMatch(words, /\d/, 'no number');
  assert.doesNotMatch(`${words} ${pebbleWords(s, s.nodes.get('P')!)}`,
    /\b(overdue|late|missed|streak|behind|failing)\b/i, 'and no shame vocabulary');
});

test('a pebble names what it sits on, and claims nothing about it', () => {
  let s = withWork();
  s = pebble(s, 'P', 'the roof', 'rock', ['w1', 'w2']);
  const words = pebbleWords(s, s.nodes.get('P')!);
  assert.match(words, /a rock/);
  assert.match(words, /ring the plumber/, 'the affected thing by NAME');
  assert.doesNotMatch(words, /blocked|blocking|stuck|delayed/i,
    '`affects` is a list to read, not a dependency — nothing derives from it');
});

test('settling lifts the weight, keeps the record, AND keeps the way back', () => {
  // REWRITTEN by the seam audit (1.17.3). The 1.15.0 version asserted that a
  // bare `pebble.settled` nulled the weight — and that null was the defect: the
  // trash view promises "Keep it after all", untrash restores only `trashed`,
  // so a kept pebble had no weight and appeared on NO surface at all. Settling
  // is the PAIR settlePebbleEvents writes (ADR-0065: the settle and the trash),
  // the trash is what lifts it from the load list, and the raise's data
  // survives so the way back is real.
  let s = withWork();
  s = pebble(s, 'P', 'the roof', 'boulder');
  assert.equal(loadNow(s).heavy, true);
  s = write(s, [
    ev('pebble.settled', 'P', {}),
    ev('node.trashed', 'P', { reason: 'pebble:settled' }),
  ]);
  assert.equal(loadNow(s).heavy, false, 'it is off you');
  assert.equal(loadNow(s).pebbles.length, 0, 'and out of the list');
  assert.ok(s.nodes.get('P'), 'but the node is still there — nothing here deletes');
  assert.equal(s.nodes.get('P')!.title, 'the roof', 'with what you called it');
  assert.deepEqual(s.nodes.get('P')!.pebble, { magnitude: 'boulder', affects: [] },
    'and the weight is kept, so "Keep it after all" has something to bring back');

  s = write(s, [ev('node.untrashed', 'P', {})]);
  assert.equal(loadNow(s).pebbles.length, 1, 'kept after all: back on the load list');
  assert.equal(loadNow(s).heavy, true, 'carrying what it carried');
});

test('raise and settle converge whatever order the shards arrive in', () => {
  // Whether a thing is still ON you now rides the `trashed` LWW key — the
  // settle pair carries a trash, and trash/untrash already converge like every
  // other stamped fact. `pebble.settled` itself folds to nothing (1.17.3): its
  // old body was the fold's one copy-on-write bypass, and nulling the weight
  // stranded the way back.
  const born = ev('node.created', 'P', { nodeKind: 'pebble', title: 'x' },
    { id: 'a0', at: '2026-08-02T08:00:00.000Z', seq: 4 });
  const raised = ev('pebble.raised', 'P', { magnitude: 'rock', affects: [] },
    { id: 'a1', at: '2026-08-02T09:00:00.000Z', seq: 5 });
  const settled = ev('pebble.settled', 'P', {},
    { id: 'a2', at: '2026-08-02T10:00:00.000Z', seq: 6 });
  const trashed = ev('node.trashed', 'P', { reason: 'pebble:settled' },
    { id: 'a3', at: '2026-08-02T10:00:00.000Z', seq: 7 });
  const orders = [
    [born, raised, settled, trashed],
    [born, settled, trashed, raised],
    [trashed, settled, raised, born],
  ];
  const states = orders.map(o => fold(o, emptyState()));
  assert.equal(states[0]!.nodes.get('P')!.trashed, true, 'settled means off you');
  assert.deepEqual(states[0]!.nodes.get('P')!.pebble, { magnitude: 'rock', affects: [] },
    'with the weight retained for the way back');
  for (const st of states.slice(1)) {
    assert.deepEqual(serialiseState(st), serialiseState(states[0]!),
      'same log, same state, whatever order it arrived in');
  }
});

test('a pebble survives a snapshot round trip, list and all', () => {
  let s = withWork();
  s = pebble(s, 'P', 'the roof', 'rock', ['w1']);
  s = write(s, [ev('capacity.declared', null, { level: 'low' })]);
  const back = deserialiseState(serialiseState(s));
  assert.deepEqual(back.nodes.get('P')!.pebble, { magnitude: 'rock', affects: ['w1'] });
  assert.equal(back.capacity, 'low');
  // Not ALIASED — the third of the three places. A shared array between a
  // snapshot and running state is how a fold rewrote history in place once.
  assert.notEqual(back.nodes.get('P')!.pebble!.affects, s.nodes.get('P')!.pebble!.affects);
});

test('the wish still rides along on a heavy day', () => {
  // A Menu item owes nothing (law 6), and on a low stretch the thing you
  // actually wanted is the most appropriate offer in the set, not the least.
  let s = withWork();
  s = write(s, [ev('node.created', 'M', { nodeKind: 'aspiration', title: 'that book' })]);
  s = write(s, [ev('menu.item.added', 'M', { category: 'Read' })]);
  s = pebble(s, 'P', 'the roof', 'boulder');
  const o = offerNow(s, NOW, TZ);
  assert.equal(o.work.length, 1, 'less work');
  assert.ok(o.wish, 'and the thing you wanted is still there');
});

// --- saying a piece of work is heavy (1.24.0) ---------------------------------
//
// docs/nd-collisions.md entry 2, the wall of awful: what stands between somebody
// and a ten-minute chore is the history rather than the chore. The routing is to
// let a person SAY it, and route that through the machinery that already
// narrows the offer.
//
// `pebble.raised` has carried `affects` since 1.15.0, `raisePebbleEvents` has
// accepted it since the day it was written, `pebbleWords` already reads the
// names out of it — and NO SURFACE EVER SET IT. Eight releases of a complete,
// unreachable field, and no test covered the emitter at all.

test('the emitter carries `affects` through the gate and onto the row', () => {
  const ctx = {
    id: () => 'PB', vault: 'personal', at: '2026-08-02T12:00:00.000Z',
    device: 'd0', seq: () => 900, zone: TZ,
  };
  const events = raisePebbleEvents(ctx, 'PB', 'the wall of it', 'rock', ['w1']);
  const raised = events.find(e => e.kind === 'pebble.raised');
  assert.deepEqual((raised!.payload as { affects: string[] }).affects, ['w1'],
    'the emitter passes it, which nothing has ever asked it to do');

  const s = write(withWork(), events);
  assert.match(pebbleWords(s, s.nodes.get('PB')!), /ring the plumber/,
    'and the row names the work it is about');
});

test('the payload is a COPY — the caller cannot rewrite history later', () => {
  // The same defect `capture.recorded` already fixed for `sourceTags`: storing
  // the caller's array by reference holes copy-on-write, so a later mutation
  // of a live list would rewrite an event that has already been written down.
  const ctx = {
    id: () => 'PB', vault: 'personal', at: '2026-08-02T12:00:00.000Z',
    device: 'd0', seq: () => 901, zone: TZ,
  };
  const mine = ['w1'];
  const events = raisePebbleEvents(ctx, 'PB', 'the wall of it', 'rock', mine);
  mine.push('w2');
  const raised = events.find(e => e.kind === 'pebble.raised');
  assert.deepEqual((raised!.payload as { affects: string[] }).affects, ['w1'],
    'what was written stays written');
});

test('a weight said about work is STILL not a demand, and still not a score', () => {
  // The whole risk of attaching weight to a task: it starts to read as a status
  // on the task. It may not. A pebble is demand-free by construction — the gate
  // refuses a clock on one — and nothing about the work changes.
  const s = write(withWork(), raisePebbleEvents(
    { id: () => 'PB', vault: 'personal', at: '2026-08-02T12:00:00.000Z', device: 'd0', seq: () => 902, zone: TZ },
    'PB', 'the wall of it', 'boulder', ['w1'],
  ));
  const work = s.nodes.get('w1')!;
  assert.equal(work.trashed, false, 'the work is untouched');
  assert.equal(work.lastDone, null, 'and certainly not completed');
  assert.doesNotMatch(pebbleWords(s, s.nodes.get('PB')!), /blocked|stuck|because|why/i,
    'co-occurrence only, never causation (law 7)');
});
