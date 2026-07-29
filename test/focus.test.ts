// Focus, interruption, and the thread you get back.
//
// The load-bearing test in this file is "a device that dies mid-session still
// knows where you were". Everything else is arithmetic; that one is the reason
// the design puts the resume card at the moment of interruption rather than at
// the moment of stopping. A design that saves your thread only when you exit
// tidily saves it only when it was never at risk.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fold, type State } from '../src/fold.ts';
import { admit } from '../src/gate.ts';
import { focusView, focusWords, interruptWords, resumeCards, resumeWords, elapsedMinutes } from '../src/focus.ts';
import {
  startFocusEvents, endFocusEvents, interruptEvents, resumeEvents, dropResumeEvents, cleanCue,
} from '../src/ui/focus-intents.ts';
import { nextUp } from '../src/nextup.ts';
import { heldGroups } from '../src/held.ts';
import { serialiseState, deserialiseState } from '../src/snapshot.ts';
import type { AppEvent } from '../src/events.ts';

const TZ = 'America/Denver';
const NOW = '2026-07-29T18:00:00.000Z';

let seq = 0;
const ev = (kind: string, node: string | null, payload: unknown, at = NOW): AppEvent =>
  ({ id: `e${seq}`, vault: 'personal', at, device: 'd0', seq: seq++, kind, node, payload } as AppEvent);
const st = (...e: AppEvent[]): State => fold(e);
const mk = (id: string, title = id): AppEvent =>
  ev('node.created', id, { nodeKind: 'action', title });

const ctxAt = (at: string) => ({
  id: () => `n${seq++}`, vault: 'personal', at, device: 'd0',
  seq: () => seq++, zone: TZ,
});
const ctx = ctxAt(NOW);

/** Run intents through the real gate, exactly as the surface does. */
const apply = (state: State, events: AppEvent[]): State =>
  events.length === 0 ? state : fold(admit(events, state), state);

// --- starting and stopping --------------------------------------------------

test('starting focus makes exactly one thing the thing being worked on', () => {
  const s0 = st(mk('A', 'the chapter'));
  const s1 = apply(s0, startFocusEvents(ctx, s0, 'A'));
  assert.equal(s1.focus?.node, 'A');
  assert.equal(focusView(s1, NOW).node?.title, 'the chapter');
});

test('starting the one already running writes nothing', () => {
  const s0 = st(mk('A'));
  const s1 = apply(s0, startFocusEvents(ctx, s0, 'A'));
  assert.deepEqual(startFocusEvents(ctx, s1, 'A'), [],
    'a no-op is still a write, and the log is the record of what happened');
});

test('switching leaves a card behind for what is being put down', () => {
  // The commonest thing anyone does, and the case most likely to lose a thread
  // silently — you do not think of swapping tasks as stopping.
  const s0 = st(mk('A', 'the chapter'), mk('B', 'the email'));
  const s1 = apply(s0, startFocusEvents(ctx, s0, 'A'));
  const s2 = apply(s1, startFocusEvents(ctx, s1, 'B'));
  assert.equal(s2.focus?.node, 'B', 'the new one is running');
  const cards = resumeCards(s2);
  assert.equal(cards.length, 1);
  assert.equal(cards[0]!.target.id, 'A', 'and the old one is waiting for you');
});

test('finishing leaves no card — there is no thread to pick up', () => {
  const s0 = st(mk('A'));
  const s1 = apply(s0, startFocusEvents(ctx, s0, 'A'));
  const s2 = apply(s1, endFocusEvents(ctx, s1, 'completed'));
  assert.equal(s2.focus, null);
  assert.deepEqual(resumeCards(s2), []);
});

test('stopping leaves one, and the five words are optional throughout', () => {
  const s0 = st(mk('A'));
  const s1 = apply(s0, startFocusEvents(ctx, s0, 'A'));

  const quiet = apply(s1, endFocusEvents(ctx, s1, 'abandoned', null));
  assert.equal(resumeCards(quiet).length, 1);
  assert.equal(resumeCards(quiet)[0]!.cue, null, 'saying nothing is a legal answer');
  assert.equal(resumeWords(resumeCards(quiet)[0]!), 'Picking this back up.',
    'and the app does not fill the gap with an apology for the gap');

  const spoken = apply(s1, endFocusEvents(ctx, s1, 'abandoned', 'the bit about ferries'));
  assert.equal(resumeWords(resumeCards(spoken)[0]!), 'You were about to: the bit about ferries',
    'your words, repeated back — nothing this app composes beats them');
});

test('an empty cue is null, never an empty string pretending to be one', () => {
  for (const raw of ['', '   ', '​​']) assert.equal(cleanCue(raw), null, JSON.stringify(raw));
  assert.equal(cleanCue('  five words is plenty '), 'five words is plenty');
});

// --- the reason the design is what it is ------------------------------------

test('THE ONE THAT MATTERS: a device that dies mid-session still knows where you were', () => {
  // No focus.ended is ever written here. The app is killed. This is the case the
  // whole design exists for, and a card created on `focus.ended` would fail it
  // while passing every other test in this file.
  const s0 = st(mk('A', 'the chapter'));
  const s1 = apply(s0, startFocusEvents(ctx, s0, 'A'));
  const s2 = apply(s1, interruptEvents(ctx, s1, 'i1', 'the phone rang'));

  // ...and now nothing. Simulate the restart the way the app really does it:
  // through the snapshot round trip, not by reusing the live object.
  const restarted = deserialiseState(serialiseState(s2));

  const waiting = resumeCards(restarted);
  assert.equal(waiting.length, 1, 'the thread is there');
  assert.equal(waiting[0]!.target.id, 'A', 'and it points at the work');
  assert.equal(restarted.nodes.get('i1')?.title, 'the phone rang',
    'and what interrupted you is held too');
});

test('an interruption does not stop you — it is held and you carry on', () => {
  const s0 = st(mk('A'));
  const s1 = apply(s0, startFocusEvents(ctx, s0, 'A'));
  const s2 = apply(s1, interruptEvents(ctx, s1, 'i1', 'the phone rang'));
  assert.equal(s2.focus?.node, 'A', 'still on it');
  assert.equal(focusView(s2, NOW).interrupted.length, 1, 'and it knows what came up');
});

test('the card written at interruption is NOT offered back while you are still in it', () => {
  // Otherwise the app interrupts you about having been interrupted.
  const s0 = st(mk('A'));
  const s1 = apply(s0, startFocusEvents(ctx, s0, 'A'));
  const s2 = apply(s1, interruptEvents(ctx, s1, 'i1', 'the phone rang'));
  assert.deepEqual(resumeCards(s2, s2.focus?.node ?? null), [],
    'the thread is saved, not surfaced — it is not lost yet');
  assert.equal(resumeCards(s2).length, 1, 'but it does exist');

  const stopped = apply(s2, endFocusEvents(ctx, s2, 'abandoned'));
  assert.equal(resumeCards(stopped, null).length, 1, 'and the moment you stop, there it is');
});

test('interrupting twice does not stack two ways back into one thread', () => {
  const s0 = st(mk('A'));
  let s = apply(s0, startFocusEvents(ctx, s0, 'A'));
  s = apply(s, interruptEvents(ctx, s, 'i1', 'the phone rang'));
  s = apply(s, interruptEvents(ctx, s, 'i2', 'and again'));
  assert.equal(resumeCards(s).length, 1, 'one thread, one card');
  assert.equal(focusView(s, NOW).interrupted.length, 2, 'and both interruptions held');
});

test('a cue offered on the way out lands on the card that already exists', () => {
  const s0 = st(mk('A'));
  let s = apply(s0, startFocusEvents(ctx, s0, 'A'));
  s = apply(s, interruptEvents(ctx, s, 'i1', 'the phone rang'));
  const before = resumeCards(s)[0]!.card.id;
  s = apply(s, endFocusEvents(ctx, s, 'abandoned', 'the ferry paragraph'));
  const after = resumeCards(s);
  assert.equal(after.length, 1, 'still one card, not a second competing with it');
  assert.equal(after[0]!.card.id, before, 'and it is the same one');
  assert.equal(after[0]!.cue, 'the ferry paragraph');
});

// --- picking it back up -----------------------------------------------------

test('picking it back up spends the card and focuses the WORK, not the card', () => {
  const s0 = st(mk('A', 'the chapter'));
  let s = apply(s0, startFocusEvents(ctx, s0, 'A'));
  s = apply(s, endFocusEvents(ctx, s, 'abandoned', 'the ferries'));
  const card = resumeCards(s)[0]!;

  s = apply(s, resumeEvents(ctx, s, card.card.id, card.target.id));
  assert.equal(s.focus?.node, 'A', 'you are back on the work itself');
  assert.deepEqual(resumeCards(s), [], 'and the card is spent, not lying around');
});

test('letting a thread go retires the card and leaves the work alone', () => {
  const s0 = st(mk('A', 'the chapter'));
  let s = apply(s0, startFocusEvents(ctx, s0, 'A'));
  s = apply(s, endFocusEvents(ctx, s, 'abandoned'));
  const card = resumeCards(s)[0]!;
  s = apply(s, dropResumeEvents(ctx, card.card.id));
  assert.deepEqual(resumeCards(s), [], 'the card is gone');
  const a = s.nodes.get('A')!;
  assert.equal(a.trashed, false, 'and the work is untouched — this is not a deletion');
  assert.equal(a.lastDone, null, 'nor a completion');
});

test('a card pointing at work that was let go, or finished, is not offered', () => {
  for (const kill of ['node.trashed', 'done.marked'] as const) {
    const s0 = st(mk('A'));
    let s = apply(s0, startFocusEvents(ctx, s0, 'A'));
    s = apply(s, endFocusEvents(ctx, s, 'abandoned'));
    assert.equal(resumeCards(s).length, 1);
    s = apply(s, [ev(kill, 'A', kill === 'done.marked' ? { at: NOW } : {})]);
    assert.deepEqual(resumeCards(s), [],
      `a way back into work you already ${kill === 'done.marked' ? 'finished' : 'let go'} is not a way back`);
  }
});

// --- next up ----------------------------------------------------------------

test('a waiting thread leads Next up, in the words you wrote', () => {
  const s0 = st(mk('A', 'the chapter'), ev('clock.set', 'A', { clockKind: 'review', at: NOW, source: 't' }));
  let s = apply(s0, startFocusEvents(ctx, s0, 'A'));
  s = apply(s, endFocusEvents(ctx, s, 'abandoned', 'the ferry paragraph'));
  const head = nextUp(s, NOW, TZ).head!;
  assert.equal(head.reason, 'resume');
  assert.equal(head.words, 'you were about to: the ferry paragraph');
});

test('a focus still running does not put its own card at the top of Next up', () => {
  const s0 = st(mk('A', 'the chapter'), ev('clock.set', 'A', { clockKind: 'review', at: NOW, source: 't' }));
  let s = apply(s0, startFocusEvents(ctx, s0, 'A'));
  s = apply(s, interruptEvents(ctx, s, 'i1', 'the phone rang'));
  const up = nextUp(s, NOW, TZ);
  const kinds = [up.head, ...up.behind].filter(Boolean).map(x => x!.node.kind);
  assert.equal(kinds.includes('resume-card'), false,
    'you are sitting in the thread; being offered it back is the app arguing with you');
});

// --- words ------------------------------------------------------------------

test('elapsed time is a fact, never a pace', () => {
  assert.equal(focusWords(null), null, 'an unreadable clock says nothing');
  assert.equal(focusWords(0), null, '"0 minutes" is a number pretending to be information');
  assert.equal(focusWords(1), 'One minute so far.');
  assert.equal(focusWords(42), '42 minutes so far.');
  assert.equal(focusWords(60), 'One hour so far.');
  assert.equal(focusWords(135), '2 hours 15 min so far.');
  for (const m of [1, 5, 42, 60, 135, 600]) {
    const w = focusWords(m)!;
    for (const shame of ['only', 'just', 'still', 'already', 'late', 'wasted']) {
      assert.doesNotMatch(w, new RegExp(`\\b${shame}\\b`, 'i'), `"${w}" carries no judgement`);
    }
  }
});

test('a clock that went backwards reports zero, never a negative age', () => {
  assert.equal(elapsedMinutes('2026-07-29T19:00:00.000Z', NOW), 0,
    'a device time change mid-session is not something anyone can act on');
  assert.equal(elapsedMinutes('nonsense', NOW), null);
});

test('interruptions are counted as things you did, not things done to you', () => {
  assert.equal(interruptWords(0), null, 'nothing came up, so nothing is said');
  assert.equal(interruptWords(1), 'One thing came up and is held.');
  assert.equal(interruptWords(4), '4 things came up and are held.');
  for (const n of [1, 4, 20]) {
    const w = interruptWords(n)!;
    for (const shame of ['distract', 'interrupted you', 'lost', 'broken', 'failed']) {
      assert.doesNotMatch(w, new RegExp(shame, 'i'), `"${w}" is not a rebuke`);
    }
  }
});

// --- the session boundary ---------------------------------------------------

test('yesterday’s interruptions do not reappear inside today’s session', () => {
  // The card is keyed by node AND time. Keyed by node alone, a second focus on
  // the same piece of work would open showing every interruption it ever had.
  const s0 = st(mk('A'));
  const early = ctxAt('2026-07-28T10:00:00.000Z');
  let s = apply(s0, startFocusEvents(early, s0, 'A'));
  s = apply(s, interruptEvents(early, s, 'i1', 'yesterday’s phone call'));
  s = apply(s, endFocusEvents(early, s, 'abandoned'));

  s = apply(s, startFocusEvents(ctx, s, 'A'));
  assert.deepEqual(focusView(s, NOW).interrupted, [],
    'a fresh session starts clean');
  s = apply(s, interruptEvents(ctx, s, 'i2', 'today’s'));
  assert.deepEqual(focusView(s, NOW).interrupted.map(n => n.id), ['i2']);
});

test('focus on something that was let go elsewhere reports no focus, not a focus on nothing', () => {
  const s0 = st(mk('A'));
  let s = apply(s0, startFocusEvents(ctx, s0, 'A'));
  s = apply(s, [ev('node.trashed', 'A', {})]);
  assert.equal(focusView(s, NOW).node, null,
    'a surface built around a null title is how a projection kills the app it renders');
});

test('the interrupt itself lands in the inbox like any other capture', () => {
  const s0 = st(mk('A'));
  let s = apply(s0, startFocusEvents(ctx, s0, 'A'));
  s = apply(s, interruptEvents(ctx, s, 'i1', 'the phone rang'));
  const n = s.nodes.get('i1')!;
  assert.equal(n.captured, true, 'triage owns it now, exactly like a quick capture');
  assert.equal(n.route, null);
  assert.equal(n.interruptedFocus, 'A', 'and it remembers what it pulled you off');
});

test('an empty interrupt writes nothing at all', () => {
  const s0 = st(mk('A'));
  const s1 = apply(s0, startFocusEvents(ctx, s0, 'A'));
  assert.deepEqual(interruptEvents(ctx, s1, 'x', '   '), []);
});

test('an interrupt with no focus running is just a capture', () => {
  const s0 = st(mk('A'));
  const out = interruptEvents(ctx, s0, 'i1', 'the phone rang');
  assert.equal(out.length, 1, 'no card, because there was no thread to save');
  const s = apply(s0, out);
  assert.deepEqual(resumeCards(s), []);
});

test('a spent card is not something you are holding', () => {
  // It carries a cure clock like every node, so without an explicit exclusion it
  // sat in "Ready now" for ever, reading "where you left off" about work that
  // was already finished. Next up had excluded spent cards since the tier
  // existed and the held list had not — two surfaces, one node, opposite claims
  // (smoke).
  const s0 = st(mk('A', 'the chapter'));
  let s = apply(s0, startFocusEvents(ctx, s0, 'A'));
  s = apply(s, endFocusEvents(ctx, s, 'abandoned'));
  const card = resumeCards(s)[0]!.card.id;
  const listed = () => heldGroups(s, NOW, TZ).flatMap(g => g.items).map(n => n.id);
  assert.equal(listed().includes(card), true, 'a live card IS on your list — it is how you find it');

  s = apply(s, resumeEvents(ctx, s, card, 'A'));
  assert.equal(listed().includes(card), false, 'a spent one is not');
  assert.equal(s.nodes.get(card)!.trashed, false,
    'and it is not deleted either — it happened, and the log says so');
});
