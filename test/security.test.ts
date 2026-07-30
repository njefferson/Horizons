// The security explanation, held to both of its jobs.
//
// Noah asked for the security story to be explained in the app "for people who
// want to know how it works, but not explaining how to hack it". That is two
// requirements pulling against each other, and both are testable:
//
//   1. it must be TRUE of the edition running it — the default build must never
//      describe a sync it does not have, and the sync build must never repeat the
//      default's "nothing leaves this device", which would be a lie;
//   2. it must describe PROPERTIES and CONSEQUENCES, not PROCEDURES. No limits,
//      no thresholds, no endpoint shapes, no named weakness with the conditions
//      that trigger it.
//
// The second is the one that would rot quietly. Somebody adding a helpful
// sentence about exactly how the rate limiting works would not think of
// themselves as writing an attack guide, and nothing would stop them.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { securityPassages, SECURITY_SUMMARY } from '../src/ui/security.ts';

const PLAIN = 'quietkeep.pages.dev';
const SYNC = 'quietkeep-sync.pages.dev';

const allText = (hostname: string): string =>
  securityPassages(hostname).flatMap(p => [p.heading, ...p.paragraphs]).join(' ');

test('the default edition claims nothing leaves, and never describes sync', async () => {
  const text = allText(PLAIN);
  assert.match(text, /Nothing\./, 'it states the strong claim plainly');
  assert.match(text, /browser would refuse it/, 'and says the browser enforces it');

  // The failure that would matter: the default build explaining a handover point,
  // a pairing key, or another device — none of which it has. Somebody reading
  // that would reasonably believe their private build was syncing.
  for (const absent of ['handover point', 'pairing', 'your other device', 'sealed']) {
    assert.doesNotMatch(text, new RegExp(absent, 'i'),
      `the build that cannot sync must not mention "${absent}"`);
  }
});

test('the sync edition never repeats the claim that nothing leaves', async () => {
  const text = allText(SYNC);
  assert.match(text, /handover point/i, 'it explains where things go');
  assert.match(text, /sealed/i, 'and that they are sealed first');
  assert.doesNotMatch(text, /has no way to send your writing anywhere/,
    'the sync build must not carry the default build\'s promise');
});

test('the sync edition admits what the handover point can see', async () => {
  // The overclaim this project already had to correct once, in its own source:
  // "the relay sees nothing more". A security page that repeated it would be the
  // same defect in the place a person is most likely to trust.
  const text = allText(SYNC);
  assert.match(text, /cannot read your writing/i, 'the true guarantee');
  assert.match(text, /how often/i, 'and the honest limit of it');
  assert.doesNotMatch(text, /(sees|learns|knows) nothing/i,
    'never the comfortable version of the claim');
});

test('it explains that other people cannot reach your planner', async () => {
  const text = allText(SYNC);
  assert.match(text, /own key/i);
  assert.match(text, /cannot see each other/i);
  // And the honest half: running a handover point for others is a position over
  // them, however limited. Offering it without saying so would be a small
  // betrayal of whoever accepted.
  assert.match(text, /if you run a handover point/i);
});

test('both editions say what they do NOT protect against', async () => {
  // A security page listing only strengths is marketing. These are the limits a
  // reader can actually act on.
  for (const host of [PLAIN, SYNC]) {
    assert.match(allText(host), /unlocked device/i, `${host} names the device-access limit`);
  }

  // The rest is edition-specific, and asserting otherwise was this test's own
  // first mistake: it demanded the DEFAULT build warn that "erasing one device
  // does not empty the other", in a build that has no other device. Telling
  // somebody about a second copy they do not have is the same class of error as
  // hiding one they do.
  assert.match(allText(SYNC), /does not empty the other/i,
    'the syncing build says erasing is not a remote wipe');
  assert.match(allText(SYNC), /also unpairs that device/i,
    'and that erasing stops the other filling it back up');
  assert.match(allText(PLAIN), /Losing the device without a copy/i,
    'the private build names the limit it actually has');
});

test('it is not an attack guide', async () => {
  // PROPERTIES and CONSEQUENCES, never PROCEDURES. This is the check that would
  // otherwise rot: a helpful sentence about exactly how a protection works does
  // not feel like writing an exploit, and nothing else would stop it.
  for (const host of [PLAIN, SYNC]) {
    const text = allText(host);
    for (const leak of [
      /rate limit/i, /per minute/i, /per day/i, /quota/i,
      /\bAES\b/, /GCM/i, /\b256\b/, /\b128\b/, /bit key/i,   // primitives and sizes
      /\/v1\//, /endpoint/i, /API/i, /header/i,
      /unauthenticated/i, /flood/i, /exhaust/i, /denial/i,
      /\b\d{3,}\b/,                                          // any bare large number
    ]) {
      assert.doesNotMatch(text, leak,
        `${host}: "${leak}" is a procedural detail, not something a reader can act on`);
    }
  }
});

test('the summary invites without alarming', async () => {
  // It sits collapsed in the (i) panel. The label must read as an explanation on
  // offer, not as a warning that something is wrong — this audience does not need
  // a security banner in their planner.
  assert.match(SECURITY_SUMMARY, /how this works/i);
  assert.doesNotMatch(SECURITY_SUMMARY, /warning|risk|danger|caution|alert/i);
});

test('every passage has a heading and something under it', async () => {
  for (const host of [PLAIN, SYNC]) {
    for (const p of securityPassages(host)) {
      assert.ok(p.heading.length > 0, 'a heading');
      assert.ok(p.paragraphs.length > 0, `${p.heading} says something`);
      assert.ok(p.paragraphs.every(t => t.trim().length > 0), `${p.heading} has no empty paragraph`);
    }
  }
});

test('an unknown host still gets an explanation, and gets the careful one', async () => {
  // Local development, or anywhere the hostname pattern does not hold. Defaulting
  // to the SYNC text would describe capabilities that build may not have; the
  // default edition's text is true of strictly less, so it is the safe fallback.
  const text = allText('localhost');
  assert.ok(text.length > 0, 'there is still an explanation');
  assert.doesNotMatch(text, /handover point/i, 'and it does not promise sync');
});
