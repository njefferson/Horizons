// "A new version is ready" (Noah: "Ask to backup when update detected?").
//
// The words carry as much weight here as the logic. An update CANNOT lose what is
// already written — append-only log, `state = fold(log)`, additive migrations — so a
// prompt that implied otherwise would be manufacturing alarm, which is the one thing
// this app spent its whole design refusing. It must offer a copy for the real reason
// (a release that behaves badly after it lands) without inventing a false one.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  UPDATE_WORDS, UPDATE_SAVED_WORDS, updateFailedWords, updateIsReady,
} from '../src/ui/update.ts';

// --- the detection ----------------------------------------------------------

test('a waiting worker means a newer version is ready', () => {
  assert.equal(updateIsReady({ waiting: {} }, {}), true);
});

test('an installed-but-not-promoted worker counts too', () => {
  assert.equal(updateIsReady({ installing: { state: 'installed' } }, {}), true);
  assert.equal(updateIsReady({ installing: { state: 'installing' } }, {}), false,
    'still installing is not yet ready');
});

test('THE ONE THAT MATTERS ON THIS APP: an active worker that is not ours counts', () => {
  // `sw.js` calls `skipWaiting()`, so a new worker activates without asking and
  // `waiting` is empty by the time anything could look. A `waiting`-only check
  // therefore misses every real update on this app — the shell has already moved on
  // beneath the page, which is exactly the moment worth offering a copy.
  const ours = { id: 'old' };
  assert.equal(updateIsReady({ active: { id: 'new' } }, ours), true);
  assert.equal(updateIsReady({ active: ours }, ours), false, 'our own worker is not an update');
});

test('a first-ever load is not an update', () => {
  // No controller means nothing was installed before. Offering a copy of an empty
  // store to somebody who has just arrived would be nonsense.
  assert.equal(updateIsReady({ active: {} }, null), false);
  assert.equal(updateIsReady({ waiting: null, installing: null, active: null }, null), false);
});

test('no registration at all is not an update', () => {
  assert.equal(updateIsReady(null, {}), false);
});

// --- the words --------------------------------------------------------------

test('THE OTHER ONE: it does not claim anything is at risk, because nothing is', () => {
  // The log is append-only and an update cannot rewrite it. "Back up or lose your
  // data" would be a manufactured alarm — the same defect as a red wall, in a
  // sentence.
  for (const bad of [
    'lose', 'lost', 'risk of', 'danger', 'warning', 'careful', 'before it is too late',
    'may be deleted', 'could be erased', 'corrupt', 'irreversible',
  ]) {
    assert.doesNotMatch(UPDATE_WORDS, new RegExp(bad, 'i'), `it says "${bad}"`);
  }
  // And it states the reassurance positively rather than leaving it implied.
  assert.match(UPDATE_WORDS, /only ever adds to its record/);
  assert.match(UPDATE_WORDS, /cannot rewrite/);
});

test('but it gives a real reason to take one', () => {
  // Offered, not insisted on: "worth taking if you would like" rather than "you
  // should". An optional thing described as a duty is a nag.
  assert.match(UPDATE_WORDS, /worth taking/);
  assert.match(UPDATE_WORDS, /come back to/);
  assert.doesNotMatch(UPDATE_WORDS, /you should|you must|make sure you/i);
});

test('it says a version is ready, not that something has gone wrong', () => {
  assert.match(UPDATE_WORDS, /newer version is ready/);
  for (const bad of ['error', 'problem', 'failed', 'out of date', 'unsupported']) {
    assert.doesNotMatch(UPDATE_WORDS, new RegExp(bad, 'i'), `it says "${bad}"`);
  }
});

test('after a copy it says what to check, and does not claim the update happened', () => {
  assert.match(UPDATE_SAVED_WORDS, /Check it opened/);
  assert.match(UPDATE_SAVED_WORDS, /reload when you are ready/);
  assert.doesNotMatch(UPDATE_SAVED_WORDS, /updated|installed/i,
    'nothing has been applied — the page is still running the old code');
});

test('a failed copy is said out loud and does not pretend to be harmless', () => {
  // Somebody about to reload should know the copy they asked for is not there.
  const w = updateFailedWords('the disk is full.');
  assert.match(w, /could not be saved/);
  assert.match(w, /the disk is full\./, 'the real reason, not a generic one');
  assert.match(w, /Nothing has changed/);
});

test('none of the three sentences reaches for a word this app refuses', () => {
  for (const w of [UPDATE_WORDS, UPDATE_SAVED_WORDS, updateFailedWords('x.')]) {
    for (const bad of ['overdue', 'streak', 'you failed', 'behind']) {
      assert.doesNotMatch(w, new RegExp(bad, 'i'), `"${w}" says "${bad}"`);
    }
  }
});
