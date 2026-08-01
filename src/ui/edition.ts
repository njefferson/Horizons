// Which edition this running bundle IS (ADR-0036).
//
// The artefact-level guarantee stays where it always was: the default bundle
// does not CONTAIN the sync module, and `tools/editions.mjs` reads the built
// file to prove it. This module carries the lesser, word-level fact — set once
// at start from the entry point's own shape (the sync entry passes its mount;
// the default passes nothing) — so that every sentence describing "this app"
// can tell the truth about THIS build. The default's words shown inside
// Quietkeep Sync claimed "there is no server" and "the default app you are in
// never contacts anything at all" — both lies in that build (Noah, on device,
// 1.7.2).

let sync = false;

/** Called exactly once, by `main()` when the sync mount is handed in. */
export const markSyncEdition = (): void => { sync = true; };

export const isSyncEdition = (): boolean => sync;

export const editionName = (): string => (sync ? 'Quietkeep Sync' : 'Quietkeep');
