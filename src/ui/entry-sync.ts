// Quietkeep Sync — the edition entry point.
//
// The whole difference between the two builds, in one import (ADR-0036). The
// default entry (`entry.ts`) is the same file without this line, which is what
// makes "the sync module is absent from the default bundle" a property of the
// artefact rather than a claim about a flag. `tools/editions.mjs` checks both.

import { start } from './app.ts';
import { syncEdition } from './sync-ui.ts';

start(syncEdition);
