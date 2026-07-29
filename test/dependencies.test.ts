// Dependency dates — `feeds →`, latest-start, buffer burn (build-plan item 27).
//
// This is the half of law 3 that ADR-0012 always described and nothing built.
// "That date went by" is a fact anyone can see; "it fed the thing you promised
// for the 14th, and it needed starting two days ago" is the part that costs real
// effort and is exactly what temporal myopia makes impossible on demand.
//
// The load-bearing properties: the arithmetic goes SILENT rather than guessing
// when a term is missing, a cycle cannot be written at all, and finished work
// stops constraining anything.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fold, emptyState, type State } from '../src/fold.ts';
import { admit, gateOptionsFor, GateRejection } from '../src/gate.ts';
import { dependencyView, dependencyWords, fedBy, wouldCycle } from '../src/dependencies.ts';
import { replanCards, contextWords } from '../src/replan.ts';
import { declareFeedsEvents, releaseFeedsEvents } from '../src/ui/detail-intents.ts';
import type { AppEvent } from '../src/events.ts';
import type { StampContext } from '../src/ui/session.ts';

const TZ = 'America/Denver';                    // never UTC (V-13)
const NOW = '2026-07-29T18:00:00.000Z';         // 12:00 on the 29th, Denver
const opts = gateOptionsFor(TZ);

let seq = 0;
const ev = (kind: string, node: string | null, payload: unknown): AppEvent =>
  ({ id: `e${seq}`, vault: 'personal', at: NOW, device: 'd0', seq: seq++, kind, node, payload } as AppEvent);
const st = (...events: AppEvent[]): State => fold(events);
const ctx = (): StampContext => ({
  at: NOW, device: 'd0', vault: 'personal', zone: TZ, seq: () => seq++, id: () => `x${seq}`,
});
const node = (id: string, title = id): AppEvent => ev('node.created', id, { nodeKind: 'action', title });
const clock = (id: string, kind: string, days: number): AppEvent =>
  ev('clock.set', id, { clockKind: kind, at: new Date(Date.parse(NOW) + days * 86_400_000).toISOString(), source: 't' });
const feeds = (from: string, to: string, lead: number): AppEvent =>
  ev('dependency.declared', from, { feeds: to, suspense: NOW, leadEstimateDays: lead });

// --- the arithmetic --------------------------------------------------------

test('latest start is the commitment minus how long this takes', () => {
  // The brief is promised on the 8th (10 days out) and the draft takes 3 days,
  // so the draft has to start within 7.
  const s = st(
    node('DRAFT', 'draft the brief'), node('BRIEF', 'the brief is due'),
    clock('BRIEF', 'suspense', 10), feeds('DRAFT', 'BRIEF', 3),
  );
  const v = dependencyView(s, s.nodes.get('DRAFT')!, NOW, TZ);
  assert.equal(v.soonest?.node.id, 'BRIEF');
  assert.equal(v.soonest?.daysLeft, 10);
  assert.equal(v.leadDays, 3);
  assert.equal(v.latestStartInDays, 7, '10 days out, 3 days of work');
  assert.equal(v.bufferDays, 7);
});

test('the dates not fitting is a fact about the plan, not about the person', () => {
  // Promised in 2 days, takes 5. That is a negative buffer, and the words must
  // say what happened to the DATES without ever calling anyone late (law 5).
  const s = st(
    node('DRAFT', 'draft the brief'), node('BRIEF', 'the brief'),
    clock('BRIEF', 'suspense', 2), feeds('DRAFT', 'BRIEF', 5),
  );
  const v = dependencyView(s, s.nodes.get('DRAFT')!, NOW, TZ);
  assert.equal(v.latestStartInDays, -3, 'it needed starting three days ago');
  const words = dependencyWords(v)!;
  assert.match(words, /needed starting 3 days ago/);
  for (const shame of ['late', 'overdue', 'missed', 'fail', 'behind', 'should have']) {
    assert.doesNotMatch(words, new RegExp(shame, 'i'), `"${words}" carries no rebuke`);
  }
});

test('a missing term produces SILENCE, never a guessed number', () => {
  // The rule that keeps this honest. An invented lead estimate would be the app
  // deciding how long someone else's work takes.
  const noLead = st(
    node('A'), node('B'), clock('B', 'suspense', 5),
    ev('dependency.declared', 'A', { feeds: 'B', suspense: NOW, leadEstimateDays: 0 }),
  );
  const v1 = dependencyView(noLead, noLead.nodes.get('A')!, NOW, TZ);
  assert.equal(v1.leadDays, null, 'zero is not a lead estimate');
  assert.equal(v1.latestStartInDays, null, 'so there is no latest start to state');
  assert.match(dependencyWords(v1)!, /feeds "B"/, 'but the commitment itself is still named');
  assert.doesNotMatch(dependencyWords(v1)!, /start/, 'and nothing is said about when to start');

  const noDate = st(node('A'), node('B'), feeds('A', 'B', 3));
  const v2 = dependencyView(noDate, noDate.nodes.get('A')!, NOW, TZ);
  assert.equal(v2.soonest, null, 'a downstream thing with no date constrains nothing');
  assert.equal(v2.latestStartInDays, null);
  assert.equal(dependencyWords(v2), null, 'and there is nothing to say');
});

test('the soonest commitment is the one that binds, and suspense outranks due', () => {
  const s = st(
    node('A'), node('FAR'), node('NEAR'),
    clock('FAR', 'suspense', 30), clock('NEAR', 'suspense', 4),
    feeds('A', 'FAR', 2), feeds('A', 'NEAR', 2),
  );
  const v = dependencyView(s, s.nodes.get('A')!, NOW, TZ);
  assert.equal(v.soonest?.node.id, 'NEAR', 'the tightest one is the constraint');
  assert.equal(v.feeds.length, 2, 'though both are reported');
  assert.equal(v.latestStartInDays, 2);

  // A promise to someone else outranks a promise to yourself.
  const both = st(node('A'), node('B'), clock('B', 'due', 9), clock('B', 'suspense', 3), feeds('A', 'B', 1));
  assert.equal(dependencyView(both, both.nodes.get('A')!, NOW, TZ).soonest?.daysLeft, 3);
});

test('finished, trashed and merged work stops constraining anything', () => {
  // Manufacturing urgency out of something already dealt with is the same class
  // of defect as a completed item claiming it is coming back.
  for (const [name, extra] of [
    ['done', ev('done.marked', 'B', { at: NOW })],
    ['trashed', ev('node.trashed', 'B', {})],
  ] as [string, AppEvent][]) {
    const s = st(node('A'), node('B'), clock('B', 'suspense', 1), feeds('A', 'B', 5), extra);
    const v = dependencyView(s, s.nodes.get('A')!, NOW, TZ);
    assert.equal(v.soonest, null, `${name}: a commitment you are no longer under cannot bind you`);
    assert.equal(v.latestStartInDays, null);
  }
});

// --- the graph -------------------------------------------------------------

test('a cycle cannot be written — the gate refuses it', () => {
  // Two things each having to happen before the other has no meaning and no
  // fix, so it is refused at the boundary rather than reported afterwards. That
  // is what lets every walk above be a simple loop with no cycle guard.
  let s = fold(admit([node('A'), node('B')], emptyState(), opts));
  s = fold(admit([feeds('A', 'B', 1)], s, opts), s);
  assert.throws(() => admit([feeds('B', 'A', 1)], s, opts), GateRejection,
    'B cannot feed A when A already feeds B');
  assert.throws(() => admit([feeds('A', 'A', 1)], s, opts), GateRejection,
    'and nothing feeds itself');

  // Three deep, which a naive one-step check would miss.
  let t = fold(admit([node('A'), node('B'), node('C')], emptyState(), opts));
  t = fold(admit([feeds('A', 'B', 1)], t, opts), t);
  t = fold(admit([feeds('B', 'C', 1)], t, opts), t);
  assert.equal(wouldCycle(t, 'C', 'A'), true, 'C -> A would close a three-node loop');
  assert.throws(() => admit([feeds('C', 'A', 1)], t, opts), GateRejection);
});

test('a dependency must name something that is really there', () => {
  const s = fold(admit([node('A')], emptyState(), opts));
  assert.throws(() => admit([feeds('A', 'GHOST', 1)], s, opts), GateRejection,
    'an edge to a node that does not exist is not an edge');
});

test('declaring the same edge twice is one edge', () => {
  // Two devices can legitimately declare it independently (ADR-0035), so this
  // has to be idempotent or a shard exchange would double every edge.
  const s = st(node('A'), node('B'), feeds('A', 'B', 2), feeds('A', 'B', 2));
  assert.deepEqual(s.nodes.get('A')!.feeds, ['B']);
});

test('the reverse edge is computed, so it cannot disagree with the forward one', () => {
  const s = st(node('A'), node('B'), node('C'), feeds('A', 'C', 1), feeds('B', 'C', 1));
  assert.deepEqual(fedBy(s, 'C').map(n => n.id), ['A', 'B']);
  assert.deepEqual(fedBy(s, 'A'), [], 'and nothing feeds A');
});

test('releasing an edge withdraws it without rewriting history', () => {
  let s = st(node('A'), node('B'), node('C'), feeds('A', 'B', 1), feeds('A', 'C', 1));
  assert.deepEqual(s.nodes.get('A')!.feeds, ['B', 'C']);
  s = fold(releaseFeedsEvents(ctx(), 'A', 'B'), s);
  assert.deepEqual(s.nodes.get('A')!.feeds, ['C'], 'the named one goes, the other stays');
});

test('the intent builder produces what the fold reads', () => {
  // The two halves are written in different files and could drift; this is the
  // only thing that says they agree.
  let s = fold(admit([node('A'), node('B'), clock('B', 'suspense', 6)], emptyState(), opts));
  s = fold(admit(declareFeedsEvents(ctx(), 'A', 'B', 2), s, opts), s);
  const v = dependencyView(s, s.nodes.get('A')!, NOW, TZ);
  assert.equal(v.soonest?.node.id, 'B');
  assert.equal(v.leadDays, 2);
  assert.equal(v.latestStartInDays, 4);
});

// --- and the reason it was built: the replan card --------------------------

test('a passed date now says what it FED — the expensive half of ADR-0012', () => {
  // The whole point. Before this the card could only say how long ago the date
  // was; the question a person actually has is what it costs, and that lives
  // downstream.
  const s = st(
    node('DRAFT', 'draft the brief'), node('BRIEF', 'brief the boss'),
    clock('DRAFT', 'due', -2), clock('BRIEF', 'suspense', 3),
    feeds('DRAFT', 'BRIEF', 5),
  );
  const card = replanCards(s, NOW, TZ).cards[0]!;
  assert.equal(card.node.id, 'DRAFT');
  assert.deepEqual(card.fed.map(n => n.id), ['BRIEF'], 'the card knows what it fed');
  assert.equal(card.depends.latestStartInDays, -2);
  const words = contextWords(card, TZ)!;
  assert.match(words, /brief the boss/, 'and says so, by name');
  assert.match(words, /needed starting 2 days ago/);
  for (const shame of ['late', 'overdue', 'missed', 'fail', 'behind']) {
    assert.doesNotMatch(words, new RegExp(shame, 'i'), `"${words}" carries no rebuke`);
  }
});

test('with no dependency declared, the card claims none', () => {
  // The other half of honesty: silence when nothing is known, never "nothing
  // recorded" dressed up as "this feeds nothing".
  const s = st(node('D', 'a thing'), clock('D', 'due', -4));
  const card = replanCards(s, NOW, TZ).cards[0]!;
  assert.deepEqual(card.fed, []);
  const words = contextWords(card, TZ);
  if (words) assert.doesNotMatch(words, /feeds/, 'no relationship is asserted');
});
