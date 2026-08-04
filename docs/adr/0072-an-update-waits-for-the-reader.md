# ADR-0072 · An update waits for the reader

**Status:** Accepted · **Date:** 2026-08-04

## Context

`public/sw.js` called `self.skipWaiting()` inside its `install` handler, under
the comment *"Take over promptly: a half-updated shell is worse than a brief
wait."* That reasoning is exactly backwards, and it had been in this repo since
the first release.

**What `skipWaiting()` on install actually does.** It promotes the new worker
immediately — but it does not replace the page anybody is looking at. That page
carries on executing the PREVIOUS release's HTML and modules. Meanwhile the
`activate` handler below deletes every cache whose name is not the current one,
so from that moment every request the open page makes is answered with the NEW
file. Old markup, new modules, no reload, and nothing said to anybody.

That IS the half-updated shell the comment was trying to avoid. `skipWaiting()`
creates it rather than preventing it. Waiting produces the opposite: a reader
keeps a *consistent old app* until they choose to move, and an old app that
works is a smaller problem than a mixed one that does not.

**Where it came from.** Universal App Doctrine §7h, added 2026-08-03, states the
rule and names the measurement: Intersecting Parallels shipped this way for
twenty-two releases. The hub gate `pwa-check.mjs` catches it. Quietkeep had never
been run against either, because both landed in the hub after this repo last
reconciled — which is what `doctrine-sync.mjs` exists to surface and did.

**The awkward part, which is why this needed a decision rather than a patch.**
The update prompt was already built, and built *deliberately around*
`skipWaiting()`. `src/ui/update.ts` said so in its own header: the prompt "is
never 'apply the update' — it is 'there is a newer version than the one you are
looking at, and here is a moment to take a copy before you go to it'", and the
button read `Reload now` for that reason. The words were honest about a model
that was itself wrong. Fixing the worker without moving the model would have left
a control whose label described the old behaviour.

## Decision

**The new worker waits, and only the reader's decision releases it.**

1. **No `skipWaiting()` in `install`.** The new worker installs, populates its
   cache, and waits.
2. **A `message` handler promotes it, checked by name** — `SKIP_WAITING` and
   nothing else. Not a timer, not `install`, not `activate`, and not a bare
   `postMessage` that any other code could trip.
3. **The page asks, then reloads when the swap has HAPPENED.** Pressing the
   control posts the message to `registration.waiting` and waits for
   `controllerchange` before reloading. Reloading first would re-enter the same
   old worker and show the same line again — the loop a plain `location.reload()`
   produces once the worker waits properly. A 3-second fallback reload covers a
   worker that never answers, so the control is never dead.
4. **`controllerchange` means two different things and is told apart.** If we
   asked, it is the reader's decision arriving and the page reloads. If we did
   not, something claimed the page unasked — a 1.18.0 worker still in the wild —
   and the honest response is to OFFER, never to reload underneath somebody
   mid-sentence.
5. **A newcomer is never told** (§7h.3). The no-controller gate moved to the TOP
   of `updateIsReady`, above the `waiting` and `installing` checks. It used to sit
   below them, so a first-ever visit that raced a worker into `installed` was told
   its brand-new install was an update.
6. **The button says what it does.** `Reload now` became `Install it now`, and
   the copy now leads with *"it waits until you say so — what you are using now
   keeps working until you install it."* SC 2.5.3 is satisfied by the visible text
   being the accessible name, as it already was.

## The one-release cost, stated because it is invisible

A device running 1.18.0 has 1.18.0's page code, which cannot post `SKIP_WAITING`.
It will see the prompt, and its `Reload now` will not promote the waiting worker;
the update lands when every client of the old worker is gone, which for a
home-screen app means the next full close.

That is one hop, it leaves those devices on a **consistent** 1.18.0 throughout,
and it is the unavoidable price of not being able to patch code that has already
shipped. It is written into the 1.18.1 patch notes in the reader's own words
rather than left to be discovered.

## Consequences

- The reader decides when the app changes underneath them. That is the point.
- The diagnostic gains the state that makes this legible (§7h.4): every cache
  held rather than the first, whether a worker controls the page, and whether one
  is waiting. Two caches is the signature of a half-finished update, and a report
  naming one cache could not show it.
- The report also gains its **address**, which is not §7h but was found by the
  same reading: a report saying `quietkeep-sync-1.18.0` could not settle whether
  it came from production or staging once both served that build, and it cost
  V-15 a round trip on a line that costs nothing.
- **`Devices seen in the log` became `Stores seen in the log`.** A device id is
  minted once per store and kept in IndexedDB (`src/ui/session.ts:83`), and
  IndexedDB is per-origin — so the same iPad has a different one for each edition
  and a fresh one after clearing website data. The old wording read as a count of
  hardware, which it never was, and a reasonable reader reached for the one
  explanation the code rules out.
- `test/update.test.ts` asserts §7h.1 against `public/sw.js` **as text**, with
  comments stripped so that a comment explaining why `skipWaiting` is absent is
  not mistaken for a call to it. The hub's `pwa-check.mjs` owns this rule, but it
  is not run by this repo's CI, and a rule enforced only in another repo's tooling
  is one this repo can silently lose.
- Each of those assertions was proved by planting: putting `skipWaiting()` back
  into `install`, deleting the `message` handler, and leaving the cache name at
  the old release each turn exactly one test red, and only that one.

## The panel budget is now the binding constraint on patch notes, twice running

`tools/smoke.mjs` asserts the ⓘ panel stays under **9,000px**, because a surface
that grows by accumulation eventually becomes the app (Doctrine §4, §7d). The
numbers, recorded because two releases in a row have now been written around
them rather than to the reader:

- 1.18.0 baseline: **8,813px** — 187px of headroom, and its notes were shortened
  during that release to fit.
- 1.18.1 first draft, five notes: **8,985px** — **15px** left. It passed, and
  shipping at fifteen pixels would have handed the next release a red gate for a
  reason that has nothing to do with its change.
- Shortened to three notes for this release, which is the second time the fix has
  been "write less" rather than "make the surface bounded".

**Older releases are NOT the cause and bounding them would not help.** They
render inside a collapsed `<details>`, which contributes no height. The pressure
is that the LATEST release renders expanded, so every release pays for its own
notes on top of a baseline near the ceiling — and the baseline is what nobody has
measured.

**So the next session that touches this panel should measure what the 8.8k is
made of before writing another short changelog.** §4 asks for a surface that
folds or paginates, and this one only folds its history. Writing terser notes is
a workaround with a known expiry, and the expiry is one release away.

## What this does NOT do

It does not test the promotion path with a real second worker. §7h says to prove
it by serving a genuinely different `sw.js` and letting the browser's own update
machinery run, because a mocked registration only proves the mock works. This
release asserts the worker's *source* and the decision function's *logic*; the
end-to-end swap is still unproven here and is recorded as such rather than
implied. fauxplane's `checkUpdateStrip` drives a real second worker and is the
implementation to copy.
