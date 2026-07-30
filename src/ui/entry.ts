// Quietkeep — the default edition. THE bundle entry point.
//
// Three lines, and the reason it exists is the third one's absence: nothing here
// imports the sync module, so the default `public/app.js` cannot contain it. That
// is [ADR-0036](../../docs/adr/0036-two-builds.md)'s first guarantee, and it is a
// property of the artefact rather than a promise about a flag — `tools/editions.mjs`
// reads the built file and checks it.
//
// The second guarantee is `connect-src 'self'` in `public/_headers`: even a bad
// merge that pulled sync in here could not reach a relay, because the browser
// would refuse. Two independent halves, both gated.

import { start } from './app.ts';

start();
