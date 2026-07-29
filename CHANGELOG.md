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

## 0.5.1 — ITERATION

*2026-07-29*

- Fixed a fault that could stop Quietkeep opening at all. If a single date in your data was malformed, the app failed to start and — worse — anything you typed while it was in that state was lost silently. Your writing was always safe on the device; it just could not be reached. It now starts regardless, and refuses to record a broken date in the first place.
- Something you finished can no longer come back as though you had not done it, and an item can no longer get into a state where neither finishing nor dismissing it did anything.
- Work can no longer disappear from the day’s list because it had two dates on it.
- The same thing is never shown to you twice on one screen.
- Tapping to see everything you are holding now lists exactly as many things as the count claims.
- If saving fails, you are told so where you can see it, rather than only being told by a screen reader.
- Finishing the last thing on the list leaves the keyboard somewhere sensible instead of nowhere.
- Areas and goals are no longer offered as though they were a task you could tick off.

## 0.5.0 — CAPABILITY

*2026-07-29*

- Quietkeep now opens with one thing to do, chosen for you, and says why it picked it. Behind it is a short list — never the whole pile.
- “Not this” moves on and keeps no record of it. Skipping something is not held against you, because nothing about it is written down at all.
- Things you do regularly come back on their own rhythm, and each one has its own idea of what “a while” means — the plant and the phone call are not held to the same patience.
- Nothing is ever marked late. When something comes round again it simply says so, and it keeps saying so gently rather than louder.
- Tapping what you are holding now opens the full list, with the day each thing comes back — so the count is something you can check rather than take on trust.
- “Today” now means today where you are. Anything you put down in the evening comes back that same evening, not the following afternoon.

## 0.4.0 — CAPABILITY

*2026-07-28*

- Quietkeep now helps you sort what you have put down. It brings up one thing at a time and asks a single question, so you never face the whole list at once.
- A quick first pass, if you want it: hot or cold — just a feel for what matters, two taps.
- Then a clear choice of where each thing goes: do it now, make it the next step, wait on someone else, keep it for someday, file it as reference, or let it go. Whatever you pick, the thing is looked after — it can never fall silent.
- Choosing “do it now” starts a calm two-minute timer for the small thing in front of you. You can stop it whenever; it is there to help, never to hurry you.

## 0.3.0 — CAPABILITY

*2026-07-28*

- You can now capture into Quietkeep from outside it: share a page or a note to it from any app, add a Capture shortcut to the app icon, or open a link that drops text straight in.
- Anything captured from a link shows a plain confirmation with an Undo, and never runs or trusts what the link contained.
- The app now ships a strict security policy that stops any code it did not author from running.

## 0.2.4 — ITERATION

*2026-07-28*

- The one-time welcome no longer flickers back if you reopen the app right after closing it.

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
