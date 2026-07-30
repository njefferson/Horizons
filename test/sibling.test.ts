// Where the other edition lives — and, more importantly, when we do not know.
//
// The interesting assertions here are the null ones. A derived URL that quietly
// guesses is the failure this repo spent an afternoon on: `RELAY_HOST` held a
// plausible workers.dev hostname, passed every gate, and would have shipped an
// app dialling an address that does not resolve. A link is the same shape of
// mistake in a smaller coat — one that 404s reads as "this is broken", not "you
// are somewhere unexpected".

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { editionOf, siblingOrigin, PLAIN_INVITE_WORDS, SYNC_INVITE_WORDS } from '../src/ui/sibling.ts';

test('each edition points at the other, at the same stage', async () => {
  // The pairs that actually exist. Staging must point at staging: a staging
  // build linking to production would send somebody testing a change to a site
  // that does not have it.
  assert.equal(siblingOrigin('quietkeep.pages.dev'), 'https://quietkeep-sync.pages.dev');
  assert.equal(siblingOrigin('quietkeep-sync.pages.dev'), 'https://quietkeep.pages.dev');
  assert.equal(siblingOrigin('staging.quietkeep.pages.dev'), 'https://staging.quietkeep-sync.pages.dev');
  assert.equal(siblingOrigin('staging.quietkeep-sync.pages.dev'), 'https://staging.quietkeep.pages.dev');
});

test('the round trip is exact, so neither edition can drift from the other', async () => {
  for (const host of ['quietkeep.pages.dev', 'staging.quietkeep.pages.dev',
    'quietkeep-sync.pages.dev', 'staging.quietkeep-sync.pages.dev']) {
    const there = siblingOrigin(host)!;
    const back = siblingOrigin(new URL(there).hostname)!;
    assert.equal(new URL(back).hostname, host, `${host} -> ${there} -> back`);
  }
});

test('a sync hostname is never mistaken for the default one', async () => {
  // The substring trap: "quietkeep-sync.pages.dev" contains "quietkeep". A
  // naive check would call the sync build the default build and then link it to
  // itself, which looks like nothing happening.
  assert.equal(editionOf('quietkeep-sync.pages.dev'), 'sync');
  assert.equal(editionOf('staging.quietkeep-sync.pages.dev'), 'sync');
  assert.equal(editionOf('quietkeep.pages.dev'), 'default');
  assert.notEqual(siblingOrigin('quietkeep-sync.pages.dev'), 'https://quietkeep-sync.pages.dev');
});

test('anywhere else, there is no link and none is invented', async () => {
  // Local development, a preview hash URL for another project, a custom domain
  // nobody has set up yet, and an outright hostile host. None of these has a
  // knowable sibling, and every one of them must produce silence.
  for (const host of ['localhost', '127.0.0.1', 'example.com',
    'quietkeep.pages.dev.evil.test', 'notquietkeep.example']) {
    assert.equal(siblingOrigin(host), null, `${host} has no knowable sibling`);
    assert.equal(editionOf(host), null);
  }
});

test('a lookalike domain cannot make this build advertise it', async () => {
  // `quietkeep.pages.dev.evil.test` ends in someone else's domain while
  // containing ours. If the check were a bare `includes`, the app would render a
  // link to `quietkeep-sync.pages.dev.evil.test` — this app inviting somebody to
  // a hostile clone of itself, in its own voice.
  assert.equal(siblingOrigin('quietkeep.pages.dev.evil.test'), null);
  assert.equal(siblingOrigin('staging.quietkeep-sync.pages.dev.evil.test'), null);
});

test('the invitation states what is given up, not only what is gained', async () => {
  // Somebody reading this is being offered a weaker privacy posture. Naming the
  // benefit and omitting the cost would be the ordinary way to write it and the
  // wrong one.
  assert.match(SYNC_INVITE_WORDS, /reach nothing at all/);
  assert.match(SYNC_INVITE_WORDS, /gives up/);
  assert.match(SYNC_INVITE_WORDS, /export and an import/);
  // And going the other way is never phrased as a downgrade.
  assert.match(PLAIN_INVITE_WORDS, /better choice/);
  assert.doesNotMatch(PLAIN_INVITE_WORDS, /basic|limited|lesser|only has/i);
});
