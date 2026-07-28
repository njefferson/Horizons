# Changelog

What changed, written for the person using Quietkeep rather than for whoever
wrote it (Doctrine §5). Patch notes tell the truth: no absolutes the tests do
not back (§14).

Numbering is `version.capability.iteration` (§7). Each release is exactly one
kind — **VERSION** changes what the app is, **CAPABILITY** means it can do
something it could not, **ITERATION** refines something that already exists.

**Releases do not have names.** No monikers, no codenames — a release is its
triplet and what it did for you.

> Generated from `src/ui/changelog.ts`, which is what the app itself shows in
> its (i) panel. Edit that, then run `npm run changelog`. Don't edit this file.

## 0.2.3 — ITERATION

*2026-07-28*

- A held thought is never reported as lost. If anything goes wrong after it is saved, you are told the truth about it, and the thing you typed is never taken from you.
- Holding the same thought twice by tapping quickly can no longer make a duplicate.
- Exporting tells you plainly whether the file was made, and never records a copy that did not leave.
- Opening the app when the network is broken always shows the copy on your device, never an error page.
- Your writing reads correctly whatever your text size, and every control is reachable by keyboard with a clear focus outline.

## 0.2.2 — ITERATION

*2026-07-28*

- The storage details now read correctly to screen readers.

## 0.2.1 — ITERATION

*2026-07-28*

- Opening the app on a slow or stalling connection no longer waits on the network. After two seconds the copy already on your device appears, and any update quietly arrives for next time.
- Holding two thoughts in quick succession can no longer tangle the order they are recorded in.

## 0.2.0 — CAPABILITY

*2026-07-28*

- There is an ⓘ in the corner now. It holds these notes, the storage answer, and what Quietkeep is — and it introduces itself once, the first time you open the app.
- You can export a copy of everything to a file, whenever you like. It is plain text you can read without us, and it is yours.
- Every export is recorded in your own log, so your history also remembers when a copy left.

## 0.1.0 — CAPABILITY

*2026-07-28*

- Quietkeep can hold things now. Type a thought, and it comes back to you — you do not have to remember to look.
- What you type is kept as you type it. If you are interrupted mid-sentence and come back later, it is still there.
- Nothing is saved to a server, because there is no server. Your writing stays on this device.
- You can ask the browser to keep your data rather than treat it as disposable. The Storage panel says plainly whether it agreed.
