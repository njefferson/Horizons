// "A new version is ready" (Noah: "Ask to backup when update detected?").
//
// The words carry as much weight here as the logic. An update CANNOT lose what is
// already written — append-only log, `state = fold(log)`, additive migrations — so a
// prompt that implied otherwise would be manufacturing alarm, which is the one thing
// this app spent its whole design refusing. It must offer a copy for the real reason
// (a release that behaves badly after it lands) without inventing a false one.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  UPDATE_WORDS, UPDATE_SAVED_WORDS, updateFailedWords, updateIsReady,
} from '../src/ui/update.ts';
import { CURRENT } from '../src/ui/changelog.ts';

// --- the detection ----------------------------------------------------------

test('a waiting worker means a newer version is ready', () => {
  assert.equal(updateIsReady({ waiting: {} }, {}), true);
});

test('an installed-but-not-promoted worker counts too', () => {
  assert.equal(updateIsReady({ installing: { state: 'installed' } }, {}), true);
  assert.equal(updateIsReady({ installing: { state: 'installing' } }, {}), false,
    'still installing is not yet ready');
});

test('an active worker that is not ours still counts, and 1.18.1 did not delete it', () => {
  // This branch was written when `sw.js` called `skipWaiting()`: a new worker
  // activated without asking, `waiting` was empty by the time anything looked, and
  // a `waiting`-only check missed every real update on this app.
  //
  // 1.18.1 removed that skipWaiting, so `waiting` is now the ordinary signal — but
  // this check STAYS, because it is what catches a device whose page is controlled
  // by a worker the registration no longer considers current. Deleting a branch
  // because the common case moved is how the uncommon case stops being covered.
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

test('§7h.3 — A NEWCOMER IS NEVER TOLD, even with a worker already waiting', () => {
  // The regression this pins: the no-controller gate used to sit BELOW the
  // `waiting` and `installing` checks, so a first-ever visit that managed to get
  // a worker installed was told its brand-new install was an update. "A new
  // version is ready" thirty seconds after arriving is nonsense, and §7h.3 asks
  // for exactly this gate.
  assert.equal(updateIsReady({ waiting: {} }, null), false,
    'a waiting worker with nothing controlling the page is a first install');
  assert.equal(updateIsReady({ installing: { state: 'installed' } }, null), false,
    'an installed worker with no controller is a first install');
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

// --- the worker itself, read as text ----------------------------------------
//
// §7h.1 is a property of `public/sw.js`, and the hub's `pwa-check.mjs` is the
// gate that owns it. These assert it HERE too, because that gate is not run by
// this repo's CI and a rule enforced only in another repo's tooling is a rule
// this repo can silently lose. Comments are stripped first: a comment explaining
// why skipWaiting is absent is not a call to it, and matching one would demand
// the comment be deleted to go green.

const swSource = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const withoutComments = swSource
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

test('§7h.1 — the new worker WAITS: no skipWaiting() inside install', () => {
  const install = /addEventListener\(\s*['"]install['"][\s\S]*?\n\}\);/.exec(withoutComments)?.[0];
  assert.ok(install, 'no install listener found in sw.js');
  assert.doesNotMatch(install, /skipWaiting/,
    'skipWaiting() in install takes over under the open page — old markup, new modules (§7h.1)');
});

test('§7h.1 — and the READER releases it: a message handler, checked by name', () => {
  assert.match(withoutComments, /addEventListener\(\s*['"]message['"]/,
    'nothing the reader does can promote the waiting worker');
  assert.match(withoutComments, /SKIP_WAITING/,
    'the message is not checked by name, so any stray postMessage would promote it');
  assert.match(withoutComments, /skipWaiting/,
    'a worker that never calls skipWaiting can never be promoted at all');
});

test('the cache name carries the running triplet, so a release cannot reuse it', () => {
  const name = /(?:const|let|var)\s+CACHE\s*=\s*['"]([^'"]+)['"]/.exec(withoutComments)?.[1];
  assert.ok(name, 'no CACHE constant found');
  assert.equal(name, `quietkeep-${CURRENT.triplet}`,
    'sw.js cache name and the running release have drifted apart');
});
