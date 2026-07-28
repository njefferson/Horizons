# Verifications

The standing answer to *"did we ever actually check that?"*

Doctrine §6: a claim without evidence is a guess, and it gets labelled as one.
**VERIFIED** and **NEEDS NOAH'S HANDS** are kept apart on purpose. A row does not
move to VERIFIED because it seems likely — only because something proved it, and
the proof is named in the row.

Rows are never deleted. When one is resolved, the old status stays visible with
a dated resolution beneath it.

**Status vocabulary**

| Status | Means |
|---|---|
| `VERIFIED` | Checked, with the evidence named. Safe to build on. |
| `PARTIAL` | Part of the question is settled; the rest is not. The unsettled part is stated. |
| `UNVERIFIED` | Not checked, or checked by a method too weak to count. **Not** the same as "probably fine". |
| `INCONCLUSIVE` | A check was attempted and returned nothing usable. The attempt is recorded so it isn't repeated blindly. |
| `NEEDS NOAH'S HANDS` | Cannot be checked from a session by any means. Requires real hardware or a real account. |
| `NOT RUN` | Deliberately deferred, with the reason and the trigger for running it. |
| `WITHDRAWN` | No longer relevant — scope changed. The row stays so the consideration is on record. |

---

## V-00 · iPadOS storage behaviour — **the reference platform**
**Status: NEEDS NOAH'S HANDS** · requires a real device · **highest-value open check**

> **Promoted 2026-07-27.** This was V-07, filed as a nice-to-know whose failure "costs
> nothing". That is no longer true. Noah's decision that this is a **personal-iPad app**
> makes iPadOS the *only* platform in scope, so these two behaviours now govern the
> single environment the app is built for. The original row is preserved below as V-07;
> this is the one that matters.

Two claims from the brief, both needing confirmation on the current iOS/iPadOS release:

1. IndexedDB is isolated **per home-screen icon** — two icons for the same origin do
   not share a store.
2. Storage persistence still requires **notification permission** to have been granted.

> **2026-07-28 — this is no longer blocked.** It was unanswerable because there was
> nothing to put on an iPad. There is now: the shell ships a **Storage panel** that
> reads `persist()`, `persisted()` and `estimate()` and records the first grant with
> its timestamp, so step 2 answers itself by opening the panel again the next day.
> Noah runs it at **staging.quietkeep.pages.dev** once Phase 1 is deployed.

**What to check, in order:**
1. Install to the Home Screen from Safari. Does `navigator.storage.persist()` resolve
   `true` after notification permission is granted? — *the panel's "Ask for persistent
   storage" button does exactly this, requesting notification permission first.*
2. Does `navigator.storage.persisted()` **still** report `true` the next morning?
   — *open the panel again; it shows both the current value and when it was first
   granted, so a silent revert is visible rather than inferred.*
3. If two icons are created for the same origin, do they see the same data?
   — *add a second Home Screen icon, capture in one, look in the other. The panel
   shows the device id and event count, which makes "same store or not" obvious.*

Step 2 is the one that matters. A `true` on day one that silently reverts is worse than
a `false`, because the app would be promising durability it does not have — and on this
platform there is no folder mirror underneath to catch it
([ADR-0003](adr/0003-folder-mirror.md) does not exist on iPadOS).

**Consequence if persistence cannot be relied on:** the export/import path in
[ADR-0004](adr/0004-ios-path.md) is not a convenience, it is the durability story, and
the app must be honest about that rather than implying the store is safe.

---

## V-01 · File System Access API support matrix
**Status: VERIFIED** · 2026-07-27 · web search of MDN, Chrome for Developers, and
Mozilla's standards position

Chromium desktop only — Chrome / Edge / Opera 86+. Firefox does not implement
`showDirectoryPicker()` in any desktop or Android version and has filed a
*harmful* standards position against the local-disk pickers. Safari ships the
Origin Private File System only, and skips the disk pickers entirely.

**Consequence, revised 2026-07-27:** the support matrix is unchanged, but what it
*means* changed when iPadOS became the reference platform. **The folder mirror cannot
exist on the platform this app is actually for.** It is a Chromium-desktop-only
convenience for a secondary environment, not the sync story. Manual export/import via
Files is the sync story ([ADR-0004](adr/0004-ios-path.md)). Per the brief: never
advertise the folder feature where it does not exist — which on the reference platform
means never mentioning it at all. → [ADR-0003](adr/0003-folder-mirror.md)

## V-02 · Cloudflare Workers AI free tier
**Status: VERIFIED** · 2026-07-27 · web search of Cloudflare pricing/blog and
several current secondary sources in agreement

10,000 Neurons/day per account on the Workers Free plan, resetting 00:00 UTC.
The pool is **shared across all models**, and Neuron cost differs sharply by
model — a large model drains it far faster than a small one. Cloudflare's own
estimate is roughly 1,300 small-LLM responses per day. Beyond the pool,
$0.011 per 1,000 Neurons. No card required to stay inside the free allocation.

**Consequence:** ample for v2's consented assist rungs at single-user volume.
Model choice matters more than call count. Does not gate v1 — every AI rung has
an offline rung beneath it (law 10). → [ADR-0015](adr/0015-ai-never-blocks.md)

## V-03 · EU availability of iOS web push
**Status: PARTIAL** · 2026-07-27 · web search; sources agree on half and
contradict on the other half

**Settled:** Apple's removal of home-screen web apps in the EU was *reversed*.
After developer and European Commission pressure, Apple announced on 2024-03-01
that iOS 17.4 would retain home-screen web app support in the EU. Home-screen
installation is not in question.

**Still contradicted:** whether the **Push API** is available to EU home-screen
web apps. Current sources published within months of each other state both
"push works on iOS 16.4+ outside the EU" (implying not inside) and general
availability without an EU carve-out. The brief already recorded this as
"conflicting sources on record" — that remains the honest state, and one more
search did not resolve it.

**Consequence: gates nothing.** Push is T2, which is v2, and the owner is not an
EU user. Re-run this check when T2 is actually being built, against Apple's own
documentation rather than secondary reporting. → [ADR-0007](adr/0007-notification-tiers.md)

## V-04 · Name availability — **the app is Quietkeep**
**Status: VERIFIED** · adopted 2026-07-28 → [ADR-0024](adr/0024-name-quietkeep.md)

Every check a session could run has run, and **both checks that only Noah's device could
run came back from him** — the App Store search and `quietkeep.pages.dev`, on 2026-07-28.

**The USPTO knockout was not run, and that is a decision rather than a gap.** Trademark
protects against confusion **in commerce**; Quietkeep is free, has no paid tier, and is
licensed against being sold ([ADR-0017](adr/0017-licensing.md)). A live mark on unrelated
goods does not reach it, and the row is left visible here instead of being dropped so that
the reasoning is auditable if the app's status ever changes. **If Quietkeep ever stops
being free, this row reopens.**

### What was run against Quietkeep

| # | Check | Instrument | Result |
|---|---|---|---|
| 1 | Said out loud | said, and said in a sentence | KWY-ət-keep. One spelling, one pronunciation. No homophone, no biting rhyme, nothing one letter away. |
| 2 | This repo's own spec | `grep` — **authoritative** | Clear. "quiet" only in prose, "keep" only in ordinary usage. No surface, node kind, event noun, or law is named either. |
| 3 | Unscoped name + software | web search | Nothing named Quietkeep. Nearest: SoftwareKeep (retailer), Quiet Mind Software, quiet.app, Quiet Modem Project. |
| 4 | npm + GitHub | direct registry query — **authoritative** | `quietkeep`, `quiet-keep`, `quietkeep-app`, `usequietkeep` all free. No GitHub project of the name. |
| 5 | **App Store** | **Noah's own device, 2026-07-28** | *"there is nothing on the App Store that I see near it."* **Answered.** |
| 6 | **`quietkeep.pages.dev`** | **Noah's own device, 2026-07-28** | *"Quietkeep.pages.dev is clean."* **Answered** — Q-04 closed, and the subdomain is the one the deploy targets. |
| — | USPTO classes 9 and 42 | — | **Not run, by reasoning** — see above. Reopens if the app ever stops being free. |

**Known and accepted, recorded rather than omitted:** **Quietstart: AI Day Planner**
(Google Play) shares the first syllable in the same category — not a collision, but where a
half-remembered name could land. **Quiet, Inc.** holds marks on the bare word *QUIET*; a
compound is not that word, and confusion-in-commerce does not reach a free app licensed
against being sold.

> **Both handed-over checks came back.** These are the first in the naming sequence that
> Noah ran and reported, rather than ones a session asserted were impossible. The rule in
> Doctrine §6 — hand over a manual step only after proving it impossible from this side —
> is what made them real checks instead of a shrug. The pattern to keep: prove the block,
> name the exact thing to look at, and the answer comes back in seconds.

### The order to check a candidate in — **the standing method**

Cheapest and most-likely-to-kill first. Steps 1 and 2 are free and instant; they were
being run last, or not at all.

1. **SAY IT OUT LOUD.** Say it in a sentence. Ask what it rhymes with, what it is one
   letter from, and what it sounds like to someone who has never seen it written.
   *Wynts* passed every registry check and sounds like **wince** — disqualifying for an
   app whose voice is shame-free and never a rebuke. No registry catches that.
2. **Grep this repo's own spec.** Killed *Lens* (the person lens), *Gauge* (the coverage
   gauge) and *Alignment* (the alignment tree).
3. **Unscoped `"<name>" software company app brand`.** Killed *Perennial*, *Parallax*.
4. **npm and GitHub** — authoritative and reachable from a session.
5. **App Store / USPTO** — Noah's device; blocked from here, proven in V-05.

### The Wynts round — what was run, and why it was not enough

*Kept because the method is the transferable part.*

| Check | Instrument | Result |
|---|---|---|
| npm registry | direct query — **authoritative** | `wynts`, `wynt`, `wynts-app`, `usewynts` all free |
| GitHub | repo search API — **authoritative** | one hit, a personal profile-config repo. No project. |
| App Store | web search only | nothing named Wynts |
| Unscoped name + software | web search only | nothing named Wynts |
| This repo's own spec | `grep` | no internal collision |

**Still owed, on Noah's device:** the App Store search from a real device, and a USPTO
knockout in classes 9 and 42 if wanted. Blocked from a session — proven in V-05, not
assumed. Until those run this row stays **PARTIAL**, not VERIFIED.

**Known and accepted:** nothing is named Wynts, but the phonetic neighbourhood is busy —
**WYNT** (community-hub app, Google Play) is one letter away, plus Wynta, Wynter, Wynk,
Wynd Technologies. Low trademark risk for a free noncommercial planner; the real cost is
a half-remembered name landing on a neighbour. Recorded in ADR-0022.

### The method, which is the part that transfers

Perennial was reported here as "un-killed" on the strength of two searches that **asked
the wrong question**. It is in fact held by **three** software companies — Perennial Labs
(DeFi, and serving `perennial.pages.dev`), Perennial Systems (web dev/fintech), and
Perennial Software (security). Noah found the subdomain occupant himself, on his phone,
in seconds.

The two failing queries were scoped to the app's own category
(`app task planner productivity App Store`) and to the SEO-poisoned `trademark class 9`
shape already documented below in V-09. A single properly-scoped query —
`"Perennial Labs" web development agency` — returned two of the three at once.

> **Ask "is this name taken in software?" — never "is another planner called this?"**
> The narrow query returns a confident empty result for a heavily occupied name. It is a
> weak probe wearing a thorough one's clothes.

**Standing rule for every future candidate:** the unscoped *name + software* query runs
**first**, before any category query and before the name is shown to Noah at all.

### What a session can and cannot do here — proven 2026-07-28, not assumed

A session can *search* but cannot *query*. Web search returns what people have written
about a name; the
authoritative registers are the USPTO database and the store indexes. Both were probed
directly:

| Attempt | Result |
|---|---|
| `itunes.apple.com/search` (Apple's public search API), raw request | **403** — gateway CONNECT policy denial |
| `tmsearch.uspto.gov` ×2 and `developer.uspto.gov`, raw request | **403** — same |
| Same URLs via the fetch tool, in case it routed differently | **403** — same |

The environment's network gateway allows a fixed host list; these are outside it. This is
an environment restriction, not a capability gap, and it is the same cause as V-05's
inconclusive `pages.dev` probe. **Recorded because Doctrine §6 permits handing over a
manual step only after proving it impossible from this side — which had been asserted
before it was tested.**

**Per candidate, owed on Noah's device — but only after the session's own checks pass:**
1. **App Store / Play direct search** — the check most likely to matter. A same-category
   clash is the realistic failure; *Hyperfocus 2* is exactly what this catches.
2. **`<name>.pages.dev`** — ten seconds, and it settles Q-04.
3. **USPTO knockout, classes 9 and 42** — *lowest priority, arguably skippable.* Trademark
   protects against confusion **in commerce**; this app is free, noncommercial, and
   licensed against being sold. A live mark on unrelated goods does not reach it.

**Nothing reaches Noah until the session has run the unscoped name+software query and
reported what it found.** Handing over a check that a search could have answered is what
went wrong with Perennial.

### V-04a · The hub collision — **CORRECTED, and the original was wrong**
**Status: CORRECTED** · originally recorded VERIFIED 2026-07-27 · corrected 2026-07-28

**What this row said, and it was inaccurate:**

> *"Horizons and Clear Horizons, side by side on one index page, will read to any visitor
> as two versions of one product."*

They would not have. `noahjefferson/public/index.html:258` displays the astro app as
**"Astro Planner"** — the name *Clear Horizons* appears only in the URL, and three times
in `accessibility.html`. The collision was real but smaller and differently shaped than
recorded.

**The worse error was what got built on top of it.** This row was used to argue that
"horizons" was *decorative* in the astro app and that the planner had the better claim to
the word. That assumption was never checked. Noah corrected it: **recording your actual
horizon, and using it to compute what is genuinely visible from where you stand, is that
app's core differentiating feature** — something he says no other astro app does. Its
claim is literal; the planner's was figurative.

**Kept visible rather than rewritten.** A wrong `VERIFIED` row is worse than an open one,
because it stops anyone looking again — Doctrine §6. The lesson is the one already in the
family record: *a claim without a test is a guess, and it must be labelled as one.*

**Resolved by the rename.** The planner is now Perennial; there is no collision left.
The astro app's *own* naming inconsistency is open separately as **Q-06**.

## V-05 · `pages.dev` is unreachable from a session — **and that is now proven**
**Status: VERIFIED (as a limitation)** · 2026-07-28

`perennial.pages.dev` and `horizons.pages.dev` both return **HTTP 000** by raw request;
the gateway logs a **403 CONNECT policy denial**, the same refusal it gives
`itunes.apple.com` and `tmsearch.uspto.gov`. The earlier 403 through the fetch tool was
the same cause.

**A session can never answer whether a `pages.dev` subdomain is free.** It is a device
check, permanently. Doctrine §11 already recorded that some sandboxes block `pages.dev`;
this row upgrades that from "some" to "this one, measured".

**What it is not an excuse for.** `perennial.pages.dev` was taken — by Perennial Labs —
and while the *page* could not be loaded, the *occupant* was findable by search all along
and was never searched for. The unreachable probe was real; the unattempted search was
not. See V-04.

## V-06 · GFE Edge policy — PWA install and persistent storage
**Status: WITHDRAWN** · 2026-07-27 · out of scope by owner's decision

Originally: whether the owner's government machine permits installing a PWA and
granting persistent storage under managed Edge policy. It was recorded as gating the
work half.

**Withdrawn because the app is not for that machine.** Noah, 2026-07-27: *"Not intended
or designed for GFE. Personal iPad only is my personal intent."* There is nothing to
check, because there is no supported configuration to check it in.

**Kept rather than deleted**, so that a future reader finds the question already
considered and closed instead of raising it again as an oversight.

> **One thing deliberately not claimed.** Noah expects managed-device storage policy
> would block the app anyway if someone tried. That is a reasonable expectation and it
> is **unverified** — no session can test it and no one has. It is recorded here as his
> expectation and **nothing in the design relies on it as a control**. The scope
> statement in [`data-constitution.md`](data-constitution.md) does that work. An
> unverified technical guess is not a safeguard, and treating it as one would be exactly
> the false-confidence failure Doctrine §5 names.

## V-07 · Current-iOS storage behaviour — *superseded framing*
**Status: SUPERSEDED by [V-00](#v-00--ipados-storage-behaviour--the-reference-platform)** · 2026-07-27

Original row, preserved because the reasoning it contained was wrong in a way worth
keeping visible:

> *"Consequence if both are false: none.* The design already assumes the pessimistic
> case — T0 requests notification permission for badge *and* persistence before any
> push mechanism exists, and the iOS path never assumes a second icon shares data. A
> negative answer costs nothing."

That was true **while iPadOS was one platform among several**. Once it became the only
platform in scope, "costs nothing" stopped being accurate — the same failure now has no
desktop mirror underneath it. Re-filed as **V-00**, at the top, as the highest-value
outstanding check. → [ADR-0004](adr/0004-ios-path.md), [ADR-0007](adr/0007-notification-tiers.md)

## V-08 · Competitive pass on the five claimed differentiators
**Status: NOT RUN** · deliberately deferred

The five: decay-based Upkeep lane · unified suspend-capture-resume bound to a
modeled focus state · bother triage terminating in clock-guaranteed routes ·
horizon-integrity engine · pebble load ledger.

**Deferred because** it informs positioning copy in
[`planning-for-humans.md`](planning-for-humans.md) and nothing in v1's design.
No decision waits on it.

**Trigger:** before the first public release copy is written. Deferred, not
dropped — this row is the record that it is owed.

---

## V-09 · The name-search instrument itself
**Status: VERIFIED** · 2026-07-28 · observed twice in one session

A query containing the phrase **"trademark class 9"** returns SEO articles *about*
trademark classes and no actual products. It happened twice — for *Chroma* and for
*Perennial* — and both times the result was an empty-looking page that could easily have
been read as "nothing is using this name."

**Chroma is in fact heavily occupied** (Razer Chroma is an entire class 9 ecosystem), which
proves the empty result was the instrument, not the world.

**Use plain queries** — `"<name>" app software company brand` — which found real conflicts
every time. And treat any name search that returns only advice articles as a **failed
probe**, not a clean one.

This is the family lesson restated in a new place: *a success response carrying nothing is
not an answer, it is a question.*

---

## V-10 · The Spine gate had never passed — **found 2026-07-28, and it was cited as proof**
**Status: FIXED · green run observed** (run 5, `721f59e`)

`.github/workflows/spine.yml` is the repo's CI gate: `npm ci` → typecheck → tests →
banned-vocabulary grep. **It failed on all four of its runs, every run since it was
created**, and always on the very first step.

The cause was three characters. `package.json` carried

```json
"test:only": "node --test --experimental-strip-types "test/**/*.test.ts""
```

— unescaped double quotes inside a JSON string, so the file is **not valid JSON**. `npm ci`
dies with `EJSONPARSE` before a single test runs. Every downstream step was skipped, and
the gate was red from the moment it existed.

**The part that matters is not the typo.** Every session, including this one, verified the
spine by running the tools *directly* — `node --experimental-strip-types --test …` and
`npx tsc --noEmit` — which bypass `package.json` entirely and pass. So the local check was
green, the CI check was red, and nobody looked at the second one. A commit message on this
repo says *"Verified: 14/14 spine tests, tsc clean"* while a red run sat on that exact SHA.
Each statement was individually true. Together they described a repo whose gate worked.

This is [§4's fake-gate finding](../ACCESSIBILITY.md) in a second place: **a gate that has
never been observed passing is not a gate, it is a file.** The fix for the class is not
"be careful with JSON" — it is *watch the run*.

| | |
|---|---|
| Runs 1–4 | `failure`, all on `npm ci`, 2026-07-28 |
| Cause | invalid JSON in `package.json` `scripts` |
| Fix | `test:only` quotes the glob with `'…'`; `test` chains `npm run test:only` rather than repeating it |
| Proven locally | `rm -rf node_modules && npm ci && npm run typecheck && npm run test:only` — clean install, 14/14, exit 0. The banned-vocabulary step run verbatim: clean. |
| **Proven in CI** | **Run 5, `721f59e`, `success`** — observed, not assumed. The first green run this workflow has ever had. |

**And the Deploy workflow's runs were watched too, because that is the whole point of this
row.** Run 1 on `721f59e` and run 3 on `fac16df`: guard step green, **all five deploy steps
`skipped`**, nothing published. Run 3 is the stronger evidence — by then `public/` existed
and held the brand assets, and the guard still skipped, because it tests for
`public/index.html` rather than for the directory. That is the right granularity, and it is
observed rather than reasoned about. Note what it does and does not prove: the *guard*
works, the *deploy* still has not run.

**Every gate in this repo has now been watched green:** Spine runs 5, 6 and 7; Deploy runs
1, 2 and 3; and the brand gate on its first CI run, with ratios identical to local.

**And watching the runs immediately earned its keep.** Deploy run 7 (`68199ac`) — the
first push with a real `public/index.html` — reported **success and published nothing.**
The runner's own env block says why:

```
RAW_TOKEN:                    ← empty
RAW_ACCOUNT: ***              ← present
Cloudflare secrets not configured — skipping deploy.
```

`CLOUDFLARE_ACCOUNT_ID` is set; **`CLOUDFLARE_API_TOKEN` is not** (or is stored under a
different name). Two separate things went wrong and only one of them is Noah's:

1. **The secret is missing.** Needs his hands — Settings → Secrets and variables →
   Actions. The name must be exactly `CLOUDFLARE_API_TOKEN`.
2. **The workflow called that success**, which is mine. The skip-quietly behaviour was
   correct while there was no site to publish; the moment `public/index.html` existed it
   became a green run that shipped nothing — the very shape V-10 is about. It is now a
   **hard failure** that names the missing secret (never its value).

---

## V-11 · Reading this repo's metadata from a session — **you cannot**
**Status: PROVEN** · 2026-07-28

**What happened.** Two sessions running told Noah the `indexed` topic still needed fixing.
He had already fixed it, before the first of those reports. The report was not a guess — it
was quoted from an API response, which is what made it convincing and what made it wrong.

**The instrument.** GitHub's **search API is a cached index, not a read of current state.**
The tell was in the same payload both times and neither read it:

```
updated_at: 2026-07-28T15:31:07Z    ← frozen, across four subsequent pushes and his edit
topics:     [... "indexed" ...]      ← stale
```

A repository's `updated_at` moves on pushes. Four pushes went by and it did not move. The
response was a snapshot of a moment hours earlier, presented with no indication that it was.

**The other instrument is blocked.** `api.github.com/repos/njefferson/Quietkeep` returns
**403** through this environment's proxy — the same CONNECT policy denial proven in
[V-05](#v-05--pagesdev-is-unreachable-from-a-session--and-that-is-now-proven) and V-04.

**Therefore:** a session **cannot** verify this repo's description, website, topics, or
social preview. Doctrine §10 says list the values and ask Noah to confirm each. **His
confirmation is the verification.** There is no second opinion available, and the thing
being treated as one was a cache.

> **The error worth remembering is not the stale read — it is what the stale read was used
> for.** "Read back from the API, not assumed" was reported as a *stronger* check than the
> owner's word. It was a weaker one, and it was used to contradict him about his own repo,
> twice. When the only available witness is the owner, the job is to ask clearly and then
> believe the answer.

---

## Standing note on instruments

Two lessons from sibling apps apply to every future row here:

- **A success response carrying nothing is not an answer — it is a question.**
  An HTTP 200 with an empty body, or a search returning no hits, is not evidence
  of absence. V-04 is exactly this shape and is labelled UNVERIFIED for exactly
  this reason.
- **When a result looks absurd, suspect the instrument first.** V-05's 403 is the
  instrument, not the answer.
- **Running the command is not the same as watching the gate.** V-10: the spine's
  CI failed on all four runs while every session reported the same tests passing,
  because the local invocation and the CI invocation took different paths. If a
  workflow is going to be *cited* as verification, its run has to be opened.
- **A cached index answering instantly is not a current read.** V-11: a search
  API returned a topic list hours out of date, with its own stale `updated_at`
  sitting in the same response. This is V-04's confident-empty-result in a new
  costume — the failure is trusting an instrument's *fluency* instead of asking
  what it actually measures and when it last measured it.
- **When the only witness is the owner, ask clearly and believe the answer.**
  V-11 again: a weaker instrument was used to contradict him about his own repo.
