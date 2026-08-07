// Event anchors — an item that waits for another item to be FINISHED.
//
// The claim being tested is a promise the app makes about coverage, so most of
// these are about the ways that promise could be false. Law 1 gained a fifth
// clause here, and a coverage clause that can be satisfied by something nothing
// will ever surface is not coverage; it is the "clock nobody reads" defect in a
// different shape, and stage 1 existed to remove exactly that.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fold, emptyState, type State } from '../src/fold.ts';
import { admit, gateOptionsFor, isSilent, silentNodes, GateRejection } from '../src/gate.ts';
import { nextUpQueue } from '../src/nextup.ts';
import { afterEvents, clearAfterEvents } from '../src/ui/detail-intents.ts';
import type { AppEvent } from '../src/events.ts';
import type { StampContext } from '../src/ui/session.ts';

const TZ = 'America/Denver';
const AGO = '2026-07-01T15:00:00.000Z';
const NOW = '2026-08-07T15:00:00.000Z';

let seq = 5000;
const ev = (kind: string, node: string | null, payload: unknown): AppEvent =>
  ({ id: `e${seq}`, vault: 'personal', at: AGO, device: 'd0', seq: seq++, kind, node, payload } as AppEvent);
const ctx = (): StampContext =>
  ({ at: AGO, device: 'd0', vault: 'personal', zone: TZ, seq: () => seq++, id: () => `s${seq++}` } as StampContext);
const write = (prior: State, offered: AppEvent[]): State =>
  fold(admit(offered, prior, gateOptionsFor(TZ)), prior);
const refusal = (prior: State, offered: AppEvent[]): string => {
  try { admit(offered, prior, gateOptionsFor(TZ)); } catch (e) {
    assert.ok(e instanceof GateRejection, `expected a gate refusal, got ${e}`);
    return (e as GateRejection).reason;
  }
  assert.fail('the gate admitted something it must refuse');
};

/** Two routed actions, A and B, both alive and neither done. */
function pair(): State {
  let s = write(emptyState(), [ev('capture.recorded', 'A', { text: 'strip the old sealant' })]);
  s = write(s, [ev('clarify.routed', 'A', { route: 'next-action' })]);
  s = write(s, [ev('capture.recorded', 'B', { text: 're-seal the frame' })]);
  return write(s, [ev('clarify.routed', 'B', { route: 'next-action' })]);
}

/** B with no coverage of its own at all — every clock cleared — then anchored
 *  to A. This is the only shape in which clause (e) is doing the work rather
 *  than riding a clock that was already there. */
function anchoredBare(): State {
  let s = pair();
  s = write(s, afterEvents(ctx(), 'B', 'A'));
  for (const kind of Object.keys(s.nodes.get('B')!.clocks)) {
    s = write(s, [ev('clock.cleared', 'B', { clockKind: kind })]);
  }
  return s;
}

test('an anchor is enough on its own — clause (e) covers a node with no clock', () => {
  const s = anchoredBare();
  const b = s.nodes.get('B')!;
  assert.deepEqual(Object.keys(b.clocks), [],
    'fixture: B has no clock, so nothing but the anchor can be covering it');
  assert.equal(b.after, 'A');
  assert.equal(isSilent(b, s), false);
  assert.equal(silentNodes(s).length, 0, 'law 1 holds with the anchor as the only coverage');
});

test('the antecedent finishing is what puts it in front of you', () => {
  let s = anchoredBare();
  assert.equal(nextUpQueue(s, NOW, TZ).some(i => i.node.id === 'B'), false,
    'while A is unfinished B is deliberately out of the way — that is what the anchor bought');
  s = write(s, [ev('done.marked', 'A', { at: AGO })]);
  const head = nextUpQueue(s, NOW, TZ).find(i => i.node.id === 'B');
  assert.ok(head, 'finishing A must offer B — the completion IS the cue');
  assert.equal(head.reason, 'unblocked');
  assert.equal(head.words, 'strip the old sealant is done',
    'it names the thing it follows, because that is the useful fact at that moment');
});

test('an unblocked item outranks everything except a date that is actually here', () => {
  let s = anchoredBare();
  s = write(s, [ev('capture.recorded', 'C', { text: 'something else entirely' })]);
  s = write(s, [ev('clarify.routed', 'C', { route: 'next-action' })]);
  s = write(s, [ev('done.marked', 'A', { at: AGO })]);
  const q = nextUpQueue(s, NOW, TZ);
  assert.equal(q[0]?.node.id, 'B', 'the next step of what you were just doing leads');

  // …and a real date that has arrived still wins, because that is a promise to
  // somebody else and the chain will still be there in an hour.
  s = write(s, [ev('clock.set', 'C', { clockKind: 'due', at: '2026-08-06T12:00:00.000Z', source: 'test' })]);
  assert.equal(nextUpQueue(s, NOW, TZ)[0]?.node.id, 'C');
});

test('a future park still wins — an early finish does not overturn a decision you made', () => {
  let s = anchoredBare();
  s = write(s, [ev('park.set', 'B', { returnAt: '2026-09-20T12:00:00.000Z', reason: 'test' })]);
  s = write(s, [ev('done.marked', 'A', { at: AGO })]);
  assert.equal(nextUpQueue(s, NOW, TZ).some(i => i.node.id === 'B'), false,
    'pulling a parked thing forward is the app not believing you');
});

test('letting the antecedent go brings the dependent BACK, never takes it with it', () => {
  // The failure this forbids is the quiet one: trash the first step of a routine
  // and every later step loses its only coverage at a distance, with nothing
  // pointing at them in the event that caused it.
  let s = anchoredBare();
  s = write(s, [ev('capture.recorded', 'C', { text: 'let the frame dry out' })]);
  s = write(s, [ev('clarify.routed', 'C', { route: 'next-action' })]);
  s = write(s, afterEvents(ctx(), 'C', 'B'));
  for (const kind of Object.keys(s.nodes.get('C')!.clocks)) {
    s = write(s, [ev('clock.cleared', 'C', { clockKind: kind })]);
  }
  assert.equal(silentNodes(s).length, 0, 'fixture: a three-step chain, all of it covered');

  s = write(s, [ev('node.trashed', 'A', {})]);
  assert.equal(silentNodes(s).length, 0, 'nothing went silent when the head of the chain was let go');
  assert.ok(Object.keys(s.nodes.get('B')!.clocks).length > 0, 'B came back with a clock of its own');
  assert.ok(Object.keys(s.nodes.get('C')!.clocks).length > 0,
    'and so did C, which was two links away — the cure has to be transitive or the tail is lost');
});

test('cutting the anchor hands the thing back rather than dropping it', () => {
  let s = anchoredBare();
  s = write(s, clearAfterEvents(ctx(), 'B'));
  assert.equal(s.nodes.get('B')!.after, null);
  assert.equal(silentNodes(s).length, 0);
  assert.ok(Object.keys(s.nodes.get('B')!.clocks).length > 0,
    'waiting for nothing means being asked about again, not vanishing');
});

test('an anchor to something that will never be shown to you is not coverage', () => {
  // The whole reason clause (e) asks whether the ANTECEDENT is covered. Without
  // it, a chain hanging off a silent node would report as covered while nothing
  // in the app would ever surface any of it.
  const s = anchoredBare();
  const a = s.nodes.get('A')!;
  // Build the counterfactual directly on the fold: a state in which A is silent.
  const broken: State = { ...s, nodes: new Map(s.nodes) };
  broken.nodes.set('A', { ...a, clocks: {}, onMenu: null, parent: null });
  assert.equal(isSilent(broken.nodes.get('A')!, broken), true, 'fixture: A is silent');
  assert.equal(isSilent(broken.nodes.get('B')!, broken), true,
    'B must be silent too — a chain is only as good as its first link');
});

test('the gate refuses every anchor whose promise is false when it is written', () => {
  const s = pair();
  assert.match(refusal(s, [ev('after.set', 'B', { after: 'B' })]), /cannot wait for itself/);
  assert.match(refusal(s, [ev('after.set', 'B', { after: 'nope' })]), /nothing here to wait for/);

  let done = write(s, [ev('done.marked', 'A', { at: AGO })]);
  assert.match(refusal(done, [ev('after.set', 'B', { after: 'A' })]), /already done/);

  let trashed = write(s, [ev('node.trashed', 'A', {})]);
  assert.match(refusal(trashed, [ev('after.set', 'B', { after: 'A' })]), /nothing here to wait for/);

  // A person is never finished, so waiting for one is waiting for an event that
  // cannot occur — coverage that is false the instant it is written.
  const withPerson = write(s, [ev('person.created', 'P', { name: 'Sam' })]);
  assert.match(refusal(withPerson, [ev('after.set', 'B', { after: 'P' })]), /never finished/);
});

test('a loop is refused at any depth, not just one step out', () => {
  let s = pair();
  s = write(s, [ev('capture.recorded', 'C', { text: 'third step' })]);
  s = write(s, [ev('clarify.routed', 'C', { route: 'next-action' })]);
  s = write(s, afterEvents(ctx(), 'B', 'A'));
  s = write(s, afterEvents(ctx(), 'C', 'B'));
  // A after C closes A → C → B → A. One-step checking would let this through,
  // and it is the shape somebody building a routine out of order writes.
  assert.match(refusal(s, [ev('after.set', 'A', { after: 'C' })]), /each wait for the other/);
});

test('a loop already in the store cannot hang a read', () => {
  // The gate refuses to write one; the fold is a total function over logs the
  // gate never saw — an import, or an older build. Both halves have to hold or
  // one bad shard freezes the app on open.
  const s = anchoredBare();
  const looped: State = { ...s, nodes: new Map(s.nodes) };
  looped.nodes.set('A', { ...s.nodes.get('A')!, clocks: {}, onMenu: null, parent: null, after: 'B' });
  looped.nodes.set('B', { ...s.nodes.get('B')!, after: 'A' });
  assert.equal(isSilent(looped.nodes.get('B')!, looped), true,
    'a closed loop covers nobody, and asking terminates');
});

test('anchoring sets no date and makes no demand', () => {
  const before = pair();
  const clocksBefore = Object.keys(before.nodes.get('B')!.clocks).sort();
  const s = write(before, afterEvents(ctx(), 'B', 'A'));
  assert.deepEqual(Object.keys(s.nodes.get('B')!.clocks).sort(), clocksBefore,
    'an anchor is not a date and must not mint one');
  assert.equal(nextUpQueue(s, NOW, TZ).some(i => i.node.id === 'B' && i.reason === 'unblocked'), false,
    'nothing is unblocked until the thing it waits for is finished');
});

test('setting and clearing on two devices converge on the later act, not on arrival order', () => {
  // Per-field LWW, the `notNow` and `pebble` precedent. Delivered in the wrong
  // order this must still end where the clock says it ends.
  const base = pair();
  const setEv = { ...ev('after.set', 'B', { after: 'A' }), at: '2026-07-02T10:00:00.000Z', device: 'd1', seq: 1 } as AppEvent;
  const clearEv = { ...ev('after.cleared', 'B', {}), at: '2026-07-03T10:00:00.000Z', device: 'd2', seq: 1 } as AppEvent;
  assert.equal(fold([setEv, clearEv], base).nodes.get('B')!.after, null);
  assert.equal(fold([clearEv, setEv], base).nodes.get('B')!.after, null,
    'the later act wins whichever order the shards arrive in');
});
