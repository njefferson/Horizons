// The person lens (v1 Must).
//
// The question this exists for is not "how is my work filed". It is "what am I
// waiting on Sam for", asked out loud, in a corridor, with no time to look
// anything up. So the tests are about whether that question gets a complete and
// honest answer — particularly the half that is easiest to get wrong, which is
// the things nobody has put a name to.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fold, type State } from '../src/fold.ts';
import { admit } from '../src/gate.ts';
import {
  people, personView, waitingOnAnyone, withWhom, openDays, waitingWords,
  peopleWords, isOpenWaiting, personName,
} from '../src/people.ts';
import { linkPersonEvents, closeWaitingEvents } from '../src/ui/detail-intents.ts';
import type { AppEvent } from '../src/events.ts';

const TZ = 'America/Denver';
const NOW = '2026-07-29T18:00:00.000Z';
const AGO = (d: number): string => new Date(Date.parse(NOW) - d * 86_400_000).toISOString();

let seq = 0;
const ev = (kind: string, node: string | null, payload: unknown, at = NOW): AppEvent =>
  ({ id: `e${seq}`, vault: 'personal', at, device: 'd0', seq: seq++, kind, node, payload } as AppEvent);
const st = (...e: AppEvent[]): State => fold(e);
const mk = (id: string, kind: string, title = id): AppEvent =>
  ev('node.created', id, { nodeKind: kind, title });
const clocked = (id: string): AppEvent =>
  ev('clock.set', id, { clockKind: 'review', at: NOW, source: 't' });

const ctxAt = (at: string) => ({
  id: () => `x${seq++}`, vault: 'personal', at, device: 'd0', seq: () => seq++, zone: TZ,
});
const ctx = ctxAt(NOW);
const apply = (state: State, events: AppEvent[]): State =>
  events.length === 0 ? state : fold(admit(events, state), state);

// --- naming somebody --------------------------------------------------------

test('saying who a thing is with creates the person and the link in one go', () => {
  const s0 = st(mk('W', 'waiting-for', 'the signed form'), clocked('W'));
  const s1 = apply(s0, linkPersonEvents(ctx, 'W', 'p1', 'waiting-on', {
    createNamed: 'Sam', openWaiting: true, forWhat: 'the signed form',
  }));
  assert.deepEqual(people(s1).map(p => p.title), ['Sam']);
  assert.equal(withWhom(s1, s1.nodes.get('W')!), 'Sam');
});

test('links are additive and idempotent, never last-writer-wins', () => {
  // Two devices each naming a DIFFERENT person on the same node must end with
  // both. LWW on a list would silently drop one device's answer — and the person
  // who owes you a thing is rarely the person who asked for it.
  const s0 = st(mk('N', 'action'), clocked('N'), mk('p1', 'person', 'Sam'), mk('p2', 'person', 'Ada'));
  let s = apply(s0, linkPersonEvents(ctx, 'N', 'p1', 'waiting-on'));
  s = apply(s, linkPersonEvents(ctx, 'N', 'p2', 'requested-by'));
  assert.equal(s.nodes.get('N')!.people.length, 2, 'both survive');

  s = apply(s, linkPersonEvents(ctx, 'N', 'p1', 'waiting-on'));
  assert.equal(s.nodes.get('N')!.people.length, 2, 'and saying it twice adds nothing');
});

test('one human is one node, however it is typed', () => {
  // A duplicate splits what you are owed across two rows for ever, and the
  // surface matches case-insensitively before minting a second node.
  const s0 = st(mk('p1', 'person', 'Sam'));
  const existing = people(s0).find(p => (p.title || '').toLowerCase() === 'sam'.toLowerCase());
  assert.equal(existing?.id, 'p1', 'the sheet finds "sam" and does not mint a second Sam');
});

// --- what you are owed ------------------------------------------------------

test('THE HALF EASIEST TO GET WRONG: an unnamed waiting-for still appears', () => {
  // Clarify's route is one tap and never asks who, so unattributed is the
  // COMMONEST kind. Dropping it would make the one surface that lists what you
  // are owed quietly incomplete — which is worse than being wrong, because you
  // would trust it.
  const s = st(mk('W', 'waiting-for', 'the signed form'), clocked('W'));
  const owed = waitingOnAnyone(s, NOW, TZ);
  assert.deepEqual(owed.map(l => l.node.id), ['W']);
  assert.equal(withWhom(s, s.nodes.get('W')!), null, 'and it does not invent a name');
});

test('a waiting-for is found by the kind AND by the relation', () => {
  // Two ways of saying the same thing. An app that read only one would be right
  // half the time.
  const byKind = st(mk('W', 'waiting-for'), clocked('W'),
    ev('waiting.opened', 'W', { person: 'p1', forWhat: 'x', since: AGO(3) }),
    mk('p1', 'person', 'Sam'));
  const byLink = st(mk('W', 'waiting-for'), clocked('W'), mk('p1', 'person', 'Sam'),
    ev('person.linked', 'W', { node: 'W', person: 'p1', relation: 'waiting-on' }));
  for (const [name, s] of [['the opened wait', byKind], ['the bare link', byLink]] as [string, State][]) {
    const v = personView(s, 'p1', NOW, TZ)!;
    assert.deepEqual(v.owes.map(l => l.node.id), ['W'], name);
  }
});

test('longest-waiting leads — that is the one worth mentioning when you see them', () => {
  const s = st(
    mk('p1', 'person', 'Sam'),
    mk('A', 'waiting-for', 'the form'), clocked('A'),
    ev('waiting.opened', 'A', { person: 'p1', forWhat: 'the form', since: AGO(2) }),
    mk('B', 'waiting-for', 'the numbers'), clocked('B'),
    ev('waiting.opened', 'B', { person: 'p1', forWhat: 'the numbers', since: AGO(21) }),
  );
  assert.deepEqual(personView(s, 'p1', NOW, TZ)!.owes.map(l => l.node.id), ['B', 'A']);
  assert.deepEqual(waitingOnAnyone(s, NOW, TZ).map(l => l.node.id), ['B', 'A']);
});

test('the order is total, so a render never reshuffles what it just showed', () => {
  const s = st(
    mk('c', 'waiting-for'), clocked('c'), mk('a', 'waiting-for'), clocked('a'),
    mk('b', 'waiting-for'), clocked('b'),
  );
  assert.deepEqual(waitingOnAnyone(s, NOW, TZ).map(l => l.node.id), ['a', 'b', 'c'],
    'ties fall back to id, not to insertion order');
});

test('what you owe them is kept apart from what they owe you', () => {
  const s = st(
    mk('p1', 'person', 'Sam'),
    mk('W', 'waiting-for', 'the form'), clocked('W'),
    ev('waiting.opened', 'W', { person: 'p1', forWhat: 'the form', since: AGO(3) }),
    mk('R', 'action', 'the thing Sam asked for'), clocked('R'),
    ev('person.linked', 'R', { node: 'R', person: 'p1', relation: 'requested-by' }),
  );
  const v = personView(s, 'p1', NOW, TZ)!;
  assert.deepEqual(v.owes.map(l => l.node.id), ['W'], 'they owe you this');
  assert.deepEqual(v.involves.map(l => l.node.id), ['R'], 'and you owe them that');
  assert.equal(v.total, 2, 'and the count is both, so it is never a lie by omission');
});

// --- ending one -------------------------------------------------------------

test('it arrived — and the work is not thereby finished', () => {
  const s0 = st(mk('W', 'waiting-for', 'the form'), clocked('W'), mk('p1', 'person', 'Sam'),
    ev('waiting.opened', 'W', { person: 'p1', forWhat: 'the form', since: AGO(3) }));
  assert.equal(isOpenWaiting(s0.nodes.get('W')!), true);

  const s1 = apply(s0, closeWaitingEvents(ctx, 'W'));
  assert.equal(isOpenWaiting(s1.nodes.get('W')!), false, 'it is with you now');
  assert.deepEqual(waitingOnAnyone(s1, NOW, TZ), [], 'and off the list of what you are owed');
  const w = s1.nodes.get('W')!;
  assert.equal(w.lastDone, null, 'but it is NOT done — a thing arriving is not a thing finished');
  assert.equal(w.trashed, false);
  assert.equal(Object.keys(w.clocks).length > 0, true,
    'and it still has a clock, because it is still yours (law 1)');
});

test('a completed or let-go waiting-for is not something you are still owed', () => {
  for (const [kind, payload] of [['done.marked', { at: NOW }], ['node.trashed', {}]] as const) {
    const s = st(mk('W', 'waiting-for'), clocked('W'), ev(kind, 'W', payload));
    assert.deepEqual(waitingOnAnyone(s, NOW, TZ), [], kind);
  }
});

test('reopening clears how the last one ended', () => {
  const s0 = st(mk('W', 'waiting-for'), clocked('W'),
    ev('waiting.opened', 'W', { person: 'p1', forWhat: 'x', since: AGO(9) }),
    ev('waiting.closed', 'W', { outcome: 'arrived' }));
  assert.equal(isOpenWaiting(s0.nodes.get('W')!), false);
  const s1 = apply(s0, [ev('waiting.opened', 'W', { person: 'p1', forWhat: 'x again', since: NOW })]);
  assert.equal(isOpenWaiting(s1.nodes.get('W')!), true, 'asking again is a new wait, not the old one');
  assert.equal(s1.nodes.get('W')!.waitingOutcome, null);
});

// --- words ------------------------------------------------------------------

test('how long is a duration, never a verdict', () => {
  assert.equal(waitingWords(null), null, 'nobody said when, so nothing is said');
  assert.equal(waitingWords(0), null, '"for 0 days" is a number pretending to be information');
  assert.equal(waitingWords(1), 'since yesterday');
  assert.equal(waitingWords(5), 'for 5 days');
  assert.equal(waitingWords(14), 'for a fortnight');
  assert.equal(waitingWords(30), 'for 4 weeks');
  for (const d of [1, 5, 14, 30, 400]) {
    const w = waitingWords(d)!;
    // The temptation here is enormous and it is refused: this app keeps score on
    // nobody's behalf, least of all on someone else's.
    for (const verdict of ['overdue', 'late', 'chased', 'ignored', 'still', 'no reply', 'nagg']) {
      assert.doesNotMatch(w, new RegExp(verdict, 'i'), `"${w}" passes no judgement on anyone`);
    }
  }
});

test('the count is a number of open threads, not a scorecard', () => {
  assert.equal(peopleWords(0), 'Nothing is with anyone right now.');
  assert.equal(peopleWords(1), 'One thing is with someone else.');
  assert.equal(peopleWords(6), '6 things are with other people.');
});

test('open days is reported only where it is knowable', () => {
  const none = st(mk('W', 'waiting-for'), clocked('W'));
  assert.equal(openDays(none.nodes.get('W')!, NOW, TZ), null, 'nobody said when it started');
  const some = st(mk('W', 'waiting-for'), clocked('W'),
    ev('waiting.opened', 'W', { person: 'p1', forWhat: 'x', since: AGO(10) }));
  assert.equal(openDays(some.nodes.get('W')!, NOW, TZ), 10);
  const bad = st(mk('W', 'waiting-for'), clocked('W'),
    ev('waiting.opened', 'W', { person: 'p1', forWhat: 'x', since: 'not a date' }));
  assert.equal(openDays(bad.nodes.get('W')!, NOW, TZ), null,
    'a stored date that will not parse is silence, not a crash');
});

test('a person who was let go takes their lens with them, not your work', () => {
  const s0 = st(mk('p1', 'person', 'Sam'), mk('W', 'waiting-for'), clocked('W'),
    ev('waiting.opened', 'W', { person: 'p1', forWhat: 'x', since: AGO(3) }));
  const s1 = apply(s0, [ev('node.trashed', 'p1', {})]);
  assert.equal(personView(s1, 'p1', NOW, TZ), null, 'there is no lens for them any more');
  assert.deepEqual(waitingOnAnyone(s1, NOW, TZ).map(l => l.node.id), ['W'],
    'but you are still owed the thing — losing the name does not lose the work');
  assert.equal(withWhom(s1, s1.nodes.get('W')!), null, 'it simply stops claiming who');
});

test('a person who was let go is not named anywhere', () => {
  // FOUND BY AUDIT, 2026-07-29. `withWhom` checked liveness; `portfolio.ts`
  // reached into state.nodes directly and did not, so a tracked project went on
  // announcing "Ada is running it" about somebody already let go. One concept,
  // two places, one of them checking — now one function.
  const s = st(
    mk('p1', 'person', 'Ada'),
    mk('W', 'waiting-for'), clocked('W'),
    ev('waiting.opened', 'W', { person: 'p1', forWhat: 'x', since: AGO(3) }),
    ev('node.trashed', 'p1', {}),
  );
  assert.equal(personName(s, 'p1'), null, 'let go');
  assert.equal(personName(s, 'GHOST'), null, 'never existed');
  assert.equal(personName(s, null), null, 'nobody named');
  assert.equal(withWhom(s, s.nodes.get('W')!), null, 'and the waiting-for stops claiming who');
});
