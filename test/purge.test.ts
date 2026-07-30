// Clearing things out (roadmap item Noah asked for).
//
// Three tests carry the weight, and all three are about the guard rather than the
// act:
//
// **`clear` cannot lose history.** It is an append of trash events, so the log
// after it still contains everything, and an export taken afterwards is complete.
// If that ever stops being true, the two modes have collapsed into one and the
// reversible one has quietly become the destructive one.
//
// **The two confirmation words cannot substitute for each other.** With one shared
// word, satisfying the guard for the reversible mode and then switching would
// carry the authorisation across to the irreversible one — somebody loses their
// history to a control they had already passed for something else.
//
// **The count is the real count.** It is the most persuasive thing on the screen at
// that moment, and a confirmation that rounds or estimates has told you nothing.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  clearEvents, confirmMatches, purgeCount, purgeWords, purgeSummary, purgedWords,
  CONFIRM_WORD, PURGE_LABEL, type PurgeMode,
} from '../src/purge.ts';
import { admit, gateOptionsFor, heldNodes, silentNodes } from '../src/gate.ts';
import { fold } from '../src/fold.ts';
import { sampleEvents, type SampleContext } from '../src/sample.ts';
import { exportAll } from '../src/portability.ts';
import { MemoryLogStore } from '../src/log-store.ts';

const DENVER = 'America/Denver';
const NOW = '2026-07-29T18:00:00.000Z';

function ctxFor(at = NOW, from = 0): SampleContext {
  let n = from;
  let s = from;
  return { at, device: 'd1', vault: 'personal', zone: DENVER, seq: () => s++, id: () => `p${n++}` };
}

/** A real populated store, built the way the app builds one. */
function populated() {
  const offered = sampleEvents(ctxFor(), NOW);
  const events = admit(offered, fold([]), gateOptionsFor(DENVER));
  return { events, state: fold(events) };
}

// --- THE ONE THAT MATTERS ---------------------------------------------------

test('THE ONE THAT MATTERS: clear empties the surfaces and loses no history', async () => {
  const { events, state } = populated();
  const before = purgeCount(state, events);
  assert.ok(before.things >= 8, `only ${before.things} things to clear`);

  const cleared = clearEvents(ctxFor(NOW, 900), state);
  const after = fold([...events, ...cleared]);

  assert.equal(heldNodes(after).length, 0, 'the surfaces are empty');
  assert.deepEqual(silentNodes(after), [], 'and nothing was left silent on the way out');

  // The history. Every original event is still in the log, and an export taken
  // now still carries them — which is the entire difference between the two modes.
  const store = new MemoryLogStore();
  await store.append([...events, ...cleared]);
  const file = await exportAll(store, NOW);
  const ids = new Set(file.logJsonl.split('\n').filter(Boolean).map(l => (JSON.parse(l) as { id: string }).id));
  for (const e of events) assert.ok(ids.has(e.id), `${e.kind} was lost from the log`);
  assert.equal(purgeCount(after, [...events, ...cleared]).events > before.events, true,
    'the log GREW — clearing is an append, never a removal');
});

test('clear is admitted by the real write boundary, not forced past it', () => {
  const { events, state } = populated();
  const cleared = clearEvents(ctxFor(NOW, 900), state);
  const admitted = admit(cleared, state, gateOptionsFor(DENVER));
  for (const e of cleared) {
    assert.ok(admitted.some(a => a.id === e.id), `${e.kind} was refused`);
  }
});

test('clearing an empty planner does nothing at all, quietly', () => {
  const empty = fold([]);
  assert.deepEqual(clearEvents(ctxFor(), empty), []);
  assert.match(purgeSummary(purgeCount(empty, [])), /nothing on your surfaces/);
});

test('clearing twice is not an error and does not double-trash', () => {
  const { events, state } = populated();
  const once = clearEvents(ctxFor(NOW, 900), state);
  const after = fold([...events, ...once]);
  assert.deepEqual(clearEvents(ctxFor(NOW, 1800), after), [],
    'there is nothing held left to trash');
});

// --- THE OTHER ONE: the guard cannot be satisfied by accident ----------------

test('THE OTHER ONE: the two modes take different words, so authorisation cannot cross', () => {
  // With one shared word, typing it for the reversible mode and then switching
  // would carry the authorisation to the irreversible one. Somebody loses their
  // history to a control they had already passed for something else.
  assert.notEqual(CONFIRM_WORD['clear'], CONFIRM_WORD['start-again']);
  assert.equal(confirmMatches('start-again', CONFIRM_WORD['clear']), false,
    "the reversible mode's word must not authorise the destructive one");
  assert.equal(confirmMatches('clear', CONFIRM_WORD['start-again']), false);
});

test('the word is required, and nothing near it will do', () => {
  for (const mode of ['clear', 'start-again'] as PurgeMode[]) {
    const word = CONFIRM_WORD[mode];
    assert.equal(confirmMatches(mode, word), true);
    for (const wrong of ['', ' ', 'y', 'yes', 'ok', 'confirm', word.slice(0, -1), `${word}s`, `${word} everything`]) {
      assert.equal(confirmMatches(mode, wrong), false, `"${wrong}" passed for ${mode}`);
    }
  }
});

test('but case and stray spaces are forgiven, because this tests intent not dexterity', () => {
  // Tremor is a supported condition here. A guard a shaking hand cannot pass is a
  // guard that locks somebody out of their own data — so the check is on what was
  // meant, not on how neatly it was typed.
  for (const mode of ['clear', 'start-again'] as PurgeMode[]) {
    const w = CONFIRM_WORD[mode];
    for (const ok of [w.toUpperCase(), ` ${w} `, `\t${w}\n`, w[0]!.toUpperCase() + w.slice(1)]) {
      assert.equal(confirmMatches(mode, ok), true, `"${ok}" was rejected for ${mode}`);
    }
  }
});

test('the confirmation word is not a word somebody would type for another reason', () => {
  // It has to be a word you only type here. "yes", "ok" and "delete" all arrive by
  // habit from other software.
  for (const w of Object.values(CONFIRM_WORD)) {
    assert.ok(w.length >= 5, `"${w}" is short enough to be a slip`);
    assert.equal(['yes', 'ok', 'y', 'delete', 'confirm'].includes(w), false);
  }
});

// --- the numbers are the real numbers ---------------------------------------

test('THE THIRD ONE: the count is counted, never estimated', () => {
  const { events, state } = populated();
  const c = purgeCount(state, events);
  assert.equal(c.things, heldNodes(state).length);
  assert.equal(c.events, events.length);
  // And the words carry those exact numbers, so the sentence cannot drift from
  // the thing it is describing.
  assert.ok(purgeWords('start-again', c, false).includes(String(c.events)));
  assert.ok(purgeWords('clear', c, false).includes(String(c.things)));
});

test('the unsorted are counted separately, and only real inbox items count', () => {
  // Losing something you never even read is a different loss from losing
  // something you decided about. But "unsorted" is captures-not-yet-routed — a
  // person or an anchor was never going to be sorted and must not inflate it.
  const { events, state } = populated();
  const c = purgeCount(state, events);
  const inbox = heldNodes(state).filter(n => n.captured && n.route === null);
  assert.equal(c.unsorted, inbox.length);
  assert.ok(c.unsorted < c.things, 'not everything held is an inbox item');
  assert.match(purgeSummary(c), new RegExp(`${c.unsorted} of them never sorted`));
});

test('one thing is "1 thing", not "1 things"', () => {
  const one = { things: 1, unsorted: 0, events: 4 };
  assert.match(purgeSummary(one), /^1 thing on/);
  assert.match(purgedWords('clear', one), /^Cleared\. One thing/);
  assert.match(purgeWords('clear', one, true), /1 thing off/);
});

// --- the words -------------------------------------------------------------

test('the backup is recommended at the moment of the decision, in both states', () => {
  // Noah asked for the backup to be recommended with a button there. A
  // recommendation nobody acted on has to still be visible when the choice is
  // made, so the sentence states which it is either way.
  const c = { things: 12, unsorted: 3, events: 400 };
  assert.match(purgeWords('start-again', c, false), /have not saved a copy/);
  assert.match(purgeWords('start-again', c, true), /have saved a copy/);
  assert.match(purgeWords('clear', c, false), /have not saved a copy/);
});

test('the destructive mode says it cannot be undone, and the other says what survives', () => {
  const c = { things: 12, unsorted: 3, events: 400 };
  assert.match(purgeWords('start-again', c, true), /cannot be undone/);
  assert.doesNotMatch(purgeWords('clear', c, true), /cannot be undone/);
  assert.match(purgeWords('clear', c, true), /stays in the log/);
});

test('neither mode is named as an act of violence, and neither scolds', () => {
  const c = { things: 12, unsorted: 3, events: 400 };
  const all = [
    ...Object.values(PURGE_LABEL),
    purgeWords('clear', c, false), purgeWords('start-again', c, false),
    purgeSummary(c), purgedWords('clear', c), purgedWords('start-again', c),
  ];
  for (const w of all) {
    for (const bad of [
      'wipe', 'destroy', 'nuke', 'purge', 'permanently delete', 'danger', 'warning',
      'are you sure', 'irreversible', 'careful', 'you should have',
    ]) {
      assert.doesNotMatch(w, new RegExp(bad, 'i'), `"${w}" says "${bad}"`);
    }
  }
});

test('the labels say which is which without reading the body text', () => {
  // Somebody scanning two buttons must not have to read a paragraph to find out
  // which one keeps their history.
  assert.notEqual(PURGE_LABEL['clear'], PURGE_LABEL['start-again']);
  assert.match(PURGE_LABEL['clear'], /holding/);
  assert.match(PURGE_LABEL['start-again'], /empty|again/);
});
