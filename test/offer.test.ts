// A few things you could pick up — the menu shape (1.11.0, ADR-0060).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { admit } from '../src/gate.ts';
import { fold, emptyState, type State } from '../src/fold.ts';
import { OFFER_CAP, offerNow, offerWords } from '../src/offer.ts';
import type { AppEvent } from '../src/events.ts';

const TZ = 'America/Denver';
const NOW = '2026-08-02T18:00:00.000Z';
let n = 0;
const ev = (kind: string, node: string | null, payload: unknown, over: Partial<AppEvent> = {}): AppEvent => ({
  id: over.id ?? `o${n++}`, vault: 'personal', at: '2026-08-02T12:00:00.000Z',
  device: 'd0', seq: (over.seq as number) ?? n, kind, node, payload,
} as AppEvent);
const write = (prior: State, offered: AppEvent[]): State => fold(admit(offered, prior), prior);

/** Work with a hard date that has arrived. */
const dated = (s: State, id: string, at: string): State =>
  write(write(s, [ev('node.created', id, { nodeKind: 'action', title: id })]),
    [ev('clock.set', id, { clockKind: 'due', at, source: 'me' })]);

/**
 * Something simply waiting — the `ready` tier, a different REASON from a hard
 * date. A `start` clock is the defer verb, so it demands without being hard,
 * and `source: 'me'` keeps it out of the gate-cure exclusion.
 *
 * (An `upkeep` would be the obvious second class and is the wrong fixture: it
 * becomes an Upkeep chip, and chips are excluded from this queue exactly as
 * they are from the single-card surface.)
 */
const ready = (s: State, id: string): State =>
  write(write(s, [ev('node.created', id, { nodeKind: 'action', title: id })]),
    [ev('clock.set', id, { clockKind: 'start', at: '2026-08-01T12:00:00.000Z', source: 'me' })]);

const wish = (s: State, id: string, category = 'read'): State =>
  write(write(s, [ev('node.created', id, { nodeKind: 'action', title: id })]),
    [ev('menu.item.added', id, { category })]);

test('ONE PER REASON: the set cannot be two near-identical things', () => {
  // The whole mechanism. Choice overload holds "where options are SIMILAR"
  // (thesis §4), so the set is made unalike by construction: a second item
  // sharing the first's reason is skipped, however well it ranks.
  let s = emptyState();
  s = dated(s, 'A', '2026-08-02T12:00:00.000Z');
  s = dated(s, 'B', '2026-08-02T12:00:00.000Z');   // same reason as A
  s = ready(s, 'C');                                // a different reason

  const o = offerNow(s, NOW, TZ);
  assert.equal(o.work.length, 2, 'two things on offer');
  assert.equal(new Set(o.work.map(w => w.reason)).size, 2, 'and they differ in KIND, not just in title');
  assert.ok(!o.work.some(w => w.node.id === 'B'), 'the second hard date is not offered beside the first');
});

test('the precedence is untouched: a real date today still leads', () => {
  // The set is a change to how many are offered and how they are chosen to
  // differ — never to what outranks what. A date that has arrived still leads.
  let s = emptyState();
  s = ready(s, 'WAITING');
  s = dated(s, 'TODAY', '2026-08-02T12:00:00.000Z');
  const o = offerNow(s, NOW, TZ);
  assert.equal(o.work[0]?.node.id, 'TODAY');
  assert.equal(o.work[0]?.reason, 'hard-date');
});

test('never more than the cap, however much is asking', () => {
  let s = emptyState();
  s = dated(s, 'A', '2026-08-02T12:00:00.000Z');
  s = ready(s, 'B');
  for (let i = 0; i < 20; i++) s = dated(s, `X${i}`, '2026-08-02T12:00:00.000Z');
  const o = offerNow(s, NOW, TZ);
  assert.ok(o.work.length <= OFFER_CAP, `at most ${OFFER_CAP} (got ${o.work.length})`);
});

test('THE WISH IS NOT WORK: it carries nothing a surface could render as a demand', () => {
  // Law 6: "acting on one is a deliberate promotion, never an obligation that
  // accrued." The guard is structural, not a matter of copy — a wish comes back
  // as a bare node with no reason and no pressure, so there is nothing here for
  // a surface to dress up as something asking.
  let s = emptyState();
  s = wish(s, 'A BOOK');
  const o = offerNow(s, NOW, TZ);
  assert.equal(o.wish?.id, 'A BOOK');
  assert.equal(o.wish?.onMenu, 'read');
  // Law 6 is about DEMAND clocks. A Menu item may still carry the gate's own
  // `review` bookkeeping from creation — that is the app keeping law 1, not the
  // wish asking for anything, and it is the same distinction `isAppClock` draws.
  for (const k of ['due', 'start', 'suspense', 'park']) {
    assert.equal((o.wish?.clocks as Record<string, unknown>)[k], undefined,
      `a wish carries no ${k} clock, by law 6`);
  }
  // And it is not in the work half, which is the half that carries reasons.
  assert.ok(!o.work.some(w => w.node.id === 'A BOOK'), 'a wish is never offered as work');
});

test('a finished wish is not offered back, and an empty Menu offers none', () => {
  let s = wish(emptyState(), 'READ IT');
  assert.equal(offerNow(s, NOW, TZ).wish?.id, 'READ IT');
  s = write(s, [ev('done.marked', 'READ IT', { at: NOW })]);
  assert.equal(offerNow(s, NOW, TZ).wish, null, 'a wish you have had is not offered again');
  assert.equal(offerNow(emptyState(), NOW, TZ).wish, null, 'and an empty Menu offers nothing');
});

test('"Not this" rotates BOTH halves and writes nothing', () => {
  // Cycling is an index moving. It has never written an event and it never
  // will — a record of refusal is a record that would eventually be shown to
  // somebody (thesis §9).
  let s = emptyState();
  s = dated(s, 'A', '2026-08-02T12:00:00.000Z');
  s = ready(s, 'B');
  s = wish(s, 'W1'); s = wish(s, 'W2');

  const first = offerNow(s, NOW, TZ, 0);
  const second = offerNow(s, NOW, TZ, 1);
  assert.notEqual(first.work[0]?.node.id, second.work[0]?.node.id, 'the work moves on');
  assert.notEqual(first.wish?.id, second.wish?.id, 'and so does the wish');
  // Deterministic: the same state and cycle always produce the same offer, or
  // a surface reshuffles under the reader between two renders of one state.
  assert.deepEqual(
    offerNow(s, NOW, TZ, 1).work.map(w => w.node.id),
    second.work.map(w => w.node.id),
    'the same state and cycle produce the same offer',
  );
});

test('NO NUMBER: the offer never states how much is waiting', () => {
  // "8 things are asking" is a count of pending work on the landing surface —
  // the nearest thing this app has to a backlog headline, which law 8 names
  // outright. The coverage gauge already states the honest totals a few lines
  // up; saying it twice, once as a demand, buys nothing.
  let s = emptyState();
  for (let i = 0; i < 12; i++) s = dated(s, `D${i}`, '2026-08-02T12:00:00.000Z');
  s = ready(s, 'R');
  s = wish(s, 'A BOOK');
  const words = offerWords(offerNow(s, NOW, TZ));
  assert.doesNotMatch(words, /\d/, `no digit anywhere (got "${words}")`);
  assert.doesNotMatch(words, /left|remaining|more|others|waiting|behind/i, 'and no word that implies a pile');
  assert.match(words, /pick up/, 'it says what it is: things you could pick up');
});

test('nothing asking, but something you wanted — and the words say exactly that', () => {
  const s = wish(emptyState(), 'A BOOK');
  const o = offerNow(s, NOW, TZ);
  assert.equal(o.work.length, 0);
  assert.match(offerWords(o), /Nothing is asking/);
  // The genuinely empty case says nothing at all rather than inventing cheer.
  assert.equal(offerWords({ work: [], wish: null }), '');
});
