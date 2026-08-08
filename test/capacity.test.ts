// Capacity changes WHICH things are offered, never HOW MANY.
//
// The rule is one line and the argument behind it is not. Narrowing the offer on
// a low day is a PACING mechanism: correct for post-exertional conditions, and
// iatrogenic for depression, where behavioural activation says offer anyway. The
// same declaration, two correct and opposite responses — the sharpest of the
// conflicts in the synthesis, and the one that looked like it needed a standing
// preference to resolve.
//
// Changing WHICH dissolves it instead. The same number of offers arrive and the
// lighter ones are chosen: nothing is withdrawn, so activation is served;
// nothing demanding is put in front of you, so pacing is served. No preference
// has to be asked for, which is the better outcome on its own terms.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fold, emptyState, weightOf, type State } from '../src/fold.ts';
import { admit, gateOptionsFor } from '../src/gate.ts';
import { offerCapFor, weightOrderFor, loadNow, type Load } from '../src/load.ts';
import { offerNow, OFFER_CAP } from '../src/offer.ts';
import { weightEvents } from '../src/ui/detail-intents.ts';
import type { AppEvent } from '../src/events.ts';
import type { StampContext } from '../src/ui/session.ts';

const TZ = 'America/Denver';
const AGO = '2026-07-01T15:00:00.000Z';
const NOW = '2026-08-07T15:00:00.000Z';

let seq = 12000;
const ev = (kind: string, node: string | null, payload: unknown): AppEvent =>
  ({ id: `e${seq}`, vault: 'personal', at: AGO, device: 'd0', seq: seq++, kind, node, payload } as AppEvent);
const ctx = (): StampContext =>
  ({ at: AGO, device: 'd0', vault: 'personal', zone: TZ, seq: () => seq++, id: () => `s${seq++}` } as StampContext);
const write = (prior: State, offered: AppEvent[]): State =>
  fold(admit(offered, prior, gateOptionsFor(TZ)), prior);

/** Four routed actions, all asking for the same reason, differing only in the
 *  weight the person put on them. */
function four(): State {
  let s = emptyState();
  for (const [id, title] of [['L', 'a light one'], ['O', 'an ordinary one'],
    ['H', 'a heavy one'], ['U', 'an unweighed one']] as const) {
    s = write(s, [ev('capture.recorded', id, { text: title })]);
    s = write(s, [ev('clarify.routed', id, { route: 'next-action' })]);
  }
  s = write(s, weightEvents(ctx(), 'L', 'light'));
  s = write(s, weightEvents(ctx(), 'O', 'ordinary'));
  s = write(s, weightEvents(ctx(), 'H', 'heavy'));
  return s;
}

// `level`, not `capacity` — the payload key the fold actually reads. The first
// version of this used the wrong one, so every "low day" fixture was an ordinary
// day and two tests failed against correct code.
const lowDay = (s: State): State => write(s, [ev('capacity.declared', null, { level: 'low' })]);

test('THE RULE: a low day changes which is offered and never how many', () => {
  const s = four();
  const ordinary = offerNow(s, NOW, TZ, 0);
  const low = offerNow(lowDay(s), NOW, TZ, 0);
  assert.equal(low.work.length, ordinary.work.length,
    'the same number of things arrive — a shorter list would say "you can manage less today", '
    + 'which is a statement about the person and the harm behavioural activation warns of');
  assert.ok(low.work.length > 0, 'fixture: something is being offered at all');
});

test('the cap itself is constant, whatever the day is like', () => {
  // Asked of the function directly, because this is the line that used to read
  // `load.heavy ? cap - 1 : cap` and is the one somebody would reach for to put
  // the old behaviour back.
  const heavy: Load = { capacity: 'low', pebbles: [], weight: 9, heavy: true };
  const light: Load = { capacity: 'steady', pebbles: [], weight: 0, heavy: false };
  assert.equal(offerCapFor(heavy, OFFER_CAP), OFFER_CAP);
  assert.equal(offerCapFor(light, OFFER_CAP), OFFER_CAP);
});

test('a low day reaches for the lighter thing first', () => {
  const low = offerNow(lowDay(four()), NOW, TZ, 0);
  assert.equal(low.work[0]?.node.id, 'L',
    'the thing the person called light leads on a low stretch');
});

test('and an ordinary day lets the heavier thing lead', () => {
  const s = offerNow(four(), NOW, TZ, 0);
  assert.equal(s.work[0]?.node.id, 'H',
    'a good day buys a harder thing — which is the other half of the same rule');
});

test('nothing nobody weighed is treated as either extreme', () => {
  // A missing declaration is not a claim. Reading it as light would hide real
  // work on a low day; reading it as heavy would bury it on a good one. Both
  // would be the app inventing an opinion it was never given.
  // BETWEEN the two, and asserted against BOTH neighbours. Comparing it only
  // with `heavy` cannot tell `ordinary` from `light` — a plant reading an
  // unweighed item as light passed that version of this test, which is a test
  // that did not test the thing it was named for.
  //
  // The unweighed one is captured FIRST on purpose, so it wins any tie by
  // creation order. If it were read as light it would tie with L1 and lead; it
  // must not.
  let s = emptyState();
  for (const [id, t] of [['U1', 'unweighed'], ['L1', 'light one'], ['H1', 'heavy one']] as const) {
    s = write(s, [ev('capture.recorded', id, { text: t })]);
    s = write(s, [ev('clarify.routed', id, { route: 'next-action' })]);
  }
  s = write(s, weightEvents(ctx(), 'L1', 'light'));
  s = write(s, weightEvents(ctx(), 'H1', 'heavy'));
  assert.equal(weightOf(s.nodes.get('U1')!), null, 'fixture: nobody said');

  const low = lowDay(s);
  assert.equal(offerNow(low, NOW, TZ, 0).work[0]?.node.id, 'L1',
    'on a low day the declared-LIGHT one leads, ahead of the unweighed one that was captured first');
  // …and the unweighed one is still ahead of the heavy one. Walk the cycle to
  // read the order rather than only its head.
  const lowOrder = [0, 1, 2].map(c => offerNow(low, NOW, TZ, c).work[0]?.node.id);
  assert.deepEqual(lowOrder, ['L1', 'U1', 'H1'],
    'light, then unweighed, then heavy — the unweighed one is neither extreme');
  const upOrder = [0, 1, 2].map(c => offerNow(s, NOW, TZ, c).work[0]?.node.id);
  assert.deepEqual(upOrder, ['H1', 'U1', 'L1'],
    'and exactly reversed on an ordinary day, with the unweighed one still in the middle');
});

test('weight only ever REORDERS — nothing is withheld for being heavy', () => {
  // A promise to somebody else is not something the app may quietly hold back
  // because of how the day is going. The heavy item must still be reachable in
  // the offer set on a low day, not filtered out of existence.
  const low = offerNow(lowDay(four()), NOW, TZ, 0);
  const everyone = offerNow(lowDay(four()), NOW, TZ, 0).work.length;
  assert.ok(everyone > 0);
  // Cycling past the light one must be able to reach the heavy one: the queue
  // still contains it, and "Not this" is how you get there.
  const cycled = offerNow(lowDay(four()), NOW, TZ, 3);
  const seen = new Set([...low.work, ...cycled.work].map(i => i.node.id));
  assert.ok(seen.has('H'),
    'the heavy thing is still in the offer, reachable by cycling — reordered, not removed');
});

test('the order is a list, and it says the rule out loud', () => {
  assert.deepEqual(weightOrderFor({ capacity: 'low', pebbles: [], weight: 9, heavy: true }),
    ['light', 'ordinary', 'heavy']);
  assert.deepEqual(weightOrderFor({ capacity: 'steady', pebbles: [], weight: 0, heavy: false }),
    ['heavy', 'ordinary', 'light']);
});

test('the weight is a declaration and a closed set, never a number', () => {
  // Three words and no number, exactly as `capacity` has four and no number. A
  // number would be a rating of the work, and one step later a rating of you.
  let s = four();
  s = write(s, [ev('node.field.set', 'L', { field: 'weight', value: 7 })]);
  assert.equal(weightOf(s.nodes.get('L')!), null,
    'a number is not a weight, and the reader refuses it rather than coercing');
  s = write(s, [ev('node.field.set', 'L', { field: 'weight', value: 'crushing' })]);
  assert.equal(weightOf(s.nodes.get('L')!), null, 'nor is a word outside the set');
  s = write(s, weightEvents(ctx(), 'L', ''));
  assert.equal(weightOf(s.nodes.get('L')!), null, 'and clearing it is the honest removal');
});
