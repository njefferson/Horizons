// Bothers: the thing gnawing at you that is not a task (v1.5).
//
// The load-bearing option is `not-mine-to-carry`. Almost no planner can express
// it, so almost every planner quietly assumes everything you think about is
// yours to do something about — and for this audience that assumption is most of
// the load. The tests below are largely about the app honouring that answer
// completely, because a release that is quietly taken back is worse than none.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fold, type State } from '../src/fold.ts';
import { admit, silentNodes } from '../src/gate.ts';
import {
  openBothers, currentBother, botherCount, botherPrompt, botherWords,
  outcomeWords, OWNERSHIPS, OWNERSHIP_WORDS,
} from '../src/bother.ts';
import { botherEvents, answerBotherEvents, ownBotherEvents } from '../src/ui/bother-intents.ts';
import { unclarified } from '../src/triage.ts';
import type { AppEvent, Ownership } from '../src/events.ts';

const TZ = 'America/Denver';
const NOW = '2026-07-29T18:00:00.000Z';

let seq = 0;
const ev = (kind: string, node: string | null, payload: unknown): AppEvent =>
  ({ id: `e${seq}`, vault: 'personal', at: NOW, device: 'd0', seq: seq++, kind, node, payload } as AppEvent);
const ctx = { id: () => `x${seq++}`, vault: 'personal', at: NOW, device: 'd0', seq: () => seq++, zone: TZ };
const apply = (s: State, e: AppEvent[]): State => (e.length ? fold(admit(e, s), s) : s);

/** A worry put down through the app's own control. */
const worry = (id: string, text: string): State =>
  apply(fold([]), botherEvents({ ...ctx, id: () => id }, id, text));

// --- putting one down -------------------------------------------------------

test('a worry can be put down without inventing a next action for it', () => {
  // The whole point. Told to enter "the thing with the roof" as a task, you
  // either invent a step you will not do or you do not enter it at all.
  const s = worry('b1', 'the thing with the roof');
  const b = currentBother(s)!;
  assert.equal(b.node.kind, 'bother');
  assert.equal(b.node.title, 'the thing with the roof');
  assert.equal(b.ownership, null, 'nobody has been asked whose it is yet');
});

test('it is clocked in the same transaction, so it cannot be lost', () => {
  // A worry you wrote down and never saw again is worse than not writing it
  // down, because you stopped carrying it on the strength of a broken promise.
  const s = worry('b1', 'the roof');
  assert.deepEqual(silentNodes(s), [], 'law 1 holds for a worry like anything else');
  assert.equal(Object.keys(s.nodes.get('b1')!.clocks).length > 0, true);
});

test('an empty worry writes nothing', () => {
  assert.deepEqual(botherEvents(ctx, 'x', '   '), []);
});

test('a worry is NOT in the triage queue — it is asked a different question first', () => {
  const s = worry('b1', 'the roof');
  assert.equal(unclarified(s).some((n: { id: string }) => n.id === 'b1'), false,
    'asking "what is the next step" is exactly what must not happen yet');
});

// --- whose is it ------------------------------------------------------------

test('the first question is whose it is, not what you will do', () => {
  // Asking for a next action first is what makes people invent one, and an
  // invented next action is a lie you then live beside on a list you must trust.
  const s = worry('b1', 'the roof');
  assert.equal(botherPrompt(currentBother(s)!), 'Whose is this?');
});

test('all three answers exist, and each says what it will do', () => {
  assert.deepEqual([...OWNERSHIPS],
    ['mine-to-solve', 'mine-to-track', 'not-mine-to-carry']);
  for (const o of OWNERSHIPS) {
    assert.notEqual(OWNERSHIP_WORDS[o].label, '', o);
    assert.notEqual(OWNERSHIP_WORDS[o].hint, '', `${o} states its consequence`);
  }
});

test('mine-to-solve becomes ordinary work and enters triage', () => {
  const s0 = worry('b1', 'the roof');
  const s1 = apply(s0, answerBotherEvents(ctx, s0, 'b1', 'mine-to-solve'));
  const n = s1.nodes.get('b1')!;
  assert.equal(n.kind, 'action', 'it stops being a worry and starts being work');
  assert.deepEqual(openBothers(s1), [], 'and it leaves the flow');
  assert.equal(n.trashed, false);
  assert.deepEqual(silentNodes(s1), []);
  // AND IT ACTUALLY ARRIVES. The choice hint promises "it goes to your inbox",
  // and the first version of this test checked only that the kind changed — so
  // it passed while nothing arrived, because the clarify queue reads `captured`
  // and a bother never sets that latch at genesis (found by smoke, not here).
  assert.equal(unclarified(s1).some((x: { id: string }) => x.id === 'b1'), true,
    'the promise the button makes is the thing that has to be true');
});

test('mine-to-track parks it and brings it back once', () => {
  const s0 = worry('b1', 'the roof');
  const s1 = apply(s0, answerBotherEvents(ctx, s0, 'b1', 'mine-to-track'));
  const n = s1.nodes.get('b1')!;
  assert.equal(n.trashed, false, 'nothing is lost');
  assert.equal(Boolean(n.clocks.park), true, 'it is parked, not asked about');
  assert.deepEqual(openBothers(s1), []);
  assert.deepEqual(silentNodes(s1), []);
});

// --- THE ONE THAT MATTERS ---------------------------------------------------

test('THE ONE THAT MATTERS: not-mine-to-carry is honoured completely', () => {
  // The relief IS the feature. An app that quietly re-raises what you released
  // is an app that did not believe you, and a release taken back is worse than
  // one never offered.
  const s0 = worry('b1', 'my brother’s job situation');
  const s1 = apply(s0, answerBotherEvents(ctx, s0, 'b1', 'not-mine-to-carry'));
  const n = s1.nodes.get('b1')!;

  // 1.8.0 (ADR-0056): the decision is KEPT, not trashed — the vocabulary said
  // "lands on the Not Now ledger with a park.set" from the start, and the
  // first build trashed it instead. The relief still holds: a park never
  // demands, so nothing chases you; the ledger speaks only when you look.
  assert.equal(n.trashed, false, 'not trashed — declining is a decision, not a deletion');
  assert.notEqual(n.notNow, null, 'it stands in the Not Now ledger');
  assert.equal(n.notNow!.what, 'my brother’s job situation', 'the words are the snapshot');
  assert.equal(n.notNow!.person, null, 'nobody was asked who — an ordinary state');
  assert.equal(Boolean(n.clocks.park), true, 'parked — the lawful comeback, never a nag');
  assert.deepEqual(openBothers(s1), [], 'it is not asked about again');
  assert.equal(unclarified(s1).some((x: { id: string }) => x.id === 'b1'), false, 'nor sent to triage');
  assert.deepEqual(silentNodes(s1), [], 'law 1 holds');

  // It is not deleted from history. It happened, and the log says so.
  assert.equal(s1.nodes.has('b1'), true);
  assert.equal(n.title, 'my brother’s job situation');
  assert.equal(n.kind, 'bother', 'and it is still recorded as what it was');
});

test('the ownership answer itself is recorded, whichever it was', () => {
  for (const o of OWNERSHIPS) {
    const s = apply(worry('b1', 'x'), ownBotherEvents(ctx, 'b1', o));
    assert.equal(s.nodes.get('b1')!.ownership, o, o);
  }
});

test('a routed worry does not come back into the flow', () => {
  // A latch. Being asked the same question twice about the same worry is exactly
  // what this exists to stop.
  const s0 = worry('b1', 'the roof');
  const s1 = apply(s0, answerBotherEvents(ctx, s0, 'b1', 'mine-to-track'));
  assert.deepEqual(openBothers(s1), []);
  // Even if something later touches the node.
  const s2 = fold([ev('node.renamed', 'b1', { title: 'the roof, still' })], s1);
  assert.deepEqual(openBothers(s2), [], 'once through, once only');
});

// --- one at a time ----------------------------------------------------------

test('one at a time, and the true number is stated', () => {
  let s = worry('b1', 'first');
  s = apply(s, botherEvents({ ...ctx, id: () => 'b2' }, 'b2', 'second'));
  s = apply(s, botherEvents({ ...ctx, id: () => 'b3' }, 'b3', 'third'));
  assert.equal(botherCount(s), 3);
  assert.equal(currentBother(s)!.node.id, 'b1', 'oldest first');
  assert.equal(botherWords(3), '3 things on your mind. One at a time.');
  // A LIST of worries is a worse object than any single worry on it.
  assert.equal(openBothers(s).length, 3, 'the projection knows them all');
  assert.equal(currentBother(s)!.node.id, 'b1', 'and the surface is handed exactly one');
});

test('answering moves to the next one', () => {
  let s = worry('b1', 'first');
  s = apply(s, botherEvents({ ...ctx, id: () => 'b2' }, 'b2', 'second'));
  s = apply(s, answerBotherEvents(ctx, s, 'b1', 'not-mine-to-carry'));
  assert.equal(currentBother(s)!.node.id, 'b2');
  assert.equal(botherCount(s), 1);
});

// --- words ------------------------------------------------------------------

test('nothing here calls them problems, or you a worrier', () => {
  const texts = [botherWords(1), botherWords(4), ...OWNERSHIPS.map(o => outcomeWords(o)),
    ...OWNERSHIPS.flatMap(o => [OWNERSHIP_WORDS[o].label, OWNERSHIP_WORDS[o].hint])];
  for (const t of texts) {
    for (const bad of ['problem', 'issue', 'anxiet', 'worry about', 'stress', 'overwhelm',
      'don’t worry', 'calm down', 'you should', 'failure', 'avoid']) {
      assert.doesNotMatch(t, new RegExp(bad, 'i'), `"${t}" contains "${bad}"`);
    }
  }
});

test('letting something go gets the plainest sentence in the app', () => {
  // A congratulation would make the decision into a performance. The point is
  // that it was allowed to be ordinary.
  assert.equal(outcomeWords('not-mine-to-carry'),
    'Let go. The decision is kept, and nothing will chase you.');
  for (const bad of ['well done', 'great', 'good for you', 'brave', '!']) {
    assert.doesNotMatch(outcomeWords('not-mine-to-carry'), new RegExp(bad, 'i'), bad);
  }
});

test('the count line is silent when there is nothing', () => {
  assert.equal(botherWords(0), '');
  assert.equal(currentBother(fold([])), null);
});

test('every answer terminates the flow — none of them can leave it hanging', () => {
  // The vocabulary's own rule: "must terminate in a route or a park".
  for (const o of OWNERSHIPS as Ownership[]) {
    const w = worry('b1', 'x');
    const s = apply(w, answerBotherEvents(ctx, w, 'b1', o));
    assert.deepEqual(openBothers(s), [], o);
    assert.deepEqual(silentNodes(s), [], `${o} leaves nothing silent`);
  }
});
