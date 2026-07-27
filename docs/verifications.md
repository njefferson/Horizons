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

---

## V-01 · File System Access API support matrix
**Status: VERIFIED** · 2026-07-27 · web search of MDN, Chrome for Developers, and
Mozilla's standards position

Chromium desktop only — Chrome / Edge / Opera 86+. Firefox does not implement
`showDirectoryPicker()` in any desktop or Android version and has filed a
*harmful* standards position against the local-disk pickers. Safari ships the
Origin Private File System only, and skips the disk pickers entirely.

**Consequence:** the brief's assumption holds unchanged. The folder mirror is a
feature-detected Chromium-desktop enhancement, and the iOS/Safari path
(manual export/import via Files) is not a fallback — it is the *primary* path for
those platforms. Per the brief: never advertise the folder feature where it does
not exist. → [ADR-0003](adr/0003-folder-mirror.md), [ADR-0004](adr/0004-ios-path.md)

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

## V-04 · Name availability
**Status: UNVERIFIED** · 2026-07-27 · attempted; the method available was too
weak to count

An App-Store-oriented web search surfaced no prominent planner named "Horizons".
**This does not clear the name.** A search-results eyeball is not a store search,
and it is emphatically not a USPTO knockout — the trademark database requires an
interactive session that could not be driven from here.

**Explicitly still unchecked:**
- USPTO knockout, classes **9** and **42**
- Apple App Store and Google Play direct searches
- Domains: `horizons.app` (expected gone), `usehorizons.app`, `horizons.page`
- Whether Meta Horizon (Horizon Worlds / Horizon OS) adjacency is tolerable

"Horizons" is a common English word and a busy mark. Treat the name as
**unclear** until a real knockout is run.

### V-04a · The collision that was found
**Status: VERIFIED** · 2026-07-27 · read of `noahjefferson/public/index.html`
and `DOCTRINE.md:8`

The brief's availability pass looked outward and missed one at home. **The hub
already ships _Clear Horizons_** — the astronomy planner at
`clear-horizons.pages.dev`, linked from the hub index as "Astro Planner" and
named in the shared accessibility statement.

*Horizons* and *Clear Horizons*, side by side on one index page, will read to any
visitor as two versions of one product. This is a naming problem that exists
regardless of what the USPTO says.

**Open as Q-02 in [`NOTES.md`](../NOTES.md).** → [ADR-0018](adr/0018-name-and-slug.md)

## V-05 · `horizons.pages.dev` availability
**Status: INCONCLUSIVE** · 2026-07-27 · HTTPS probe returned 403 from the
sandbox proxy

Doctrine §11 records that some session sandboxes block `pages.dev` outright. A
403 from the proxy is a statement about the sandbox, not about the subdomain.
**This proves nothing in either direction** and must not be cited as evidence
that the name is free or taken.

Check at deploy time from a normal network. Note that a qualified subdomain is
expected regardless — see Q-02.

## V-06 · GFE Edge policy — PWA install and persistent storage
**Status: NEEDS NOAH'S HANDS** · cannot be probed from any session

Whether the owner's government machine permits (a) installing a PWA and
(b) granting persistent storage under managed Edge policy.

**This gates the work half** — Track portfolio, staff-call lens, suspense dates.
If persistence is denied, the work vault cannot be trusted on that machine and
the design needs a different answer there, not a warning label.

**What to check, in order:**
1. Does `https://<deployed-url>` offer an install prompt in Edge?
2. After install, does `navigator.storage.persist()` resolve `true`?
3. Does `navigator.storage.persisted()` still report `true` the next morning?

Step 3 is the one that matters. A `true` on day one that silently reverts is
worse than a `false`.

## V-07 · Current-iOS storage behaviour
**Status: NEEDS NOAH'S HANDS** · requires a real device

Two claims from the brief, both needing confirmation on the current iOS release:
1. IndexedDB is isolated **per home-screen icon** — two icons for the same origin
   do not share a store.
2. Storage persistence still requires **notification permission** to have been
   granted.

**Consequence if both are false: none.** The design already assumes the
pessimistic case — T0 requests notification permission for badge *and*
persistence before any push mechanism exists, and the iOS path never assumes a
second icon shares data. A negative answer costs nothing; a positive answer
confirms the T0 sequencing was right. → [ADR-0004](adr/0004-ios-path.md), [ADR-0007](adr/0007-notification-tiers.md)

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

## Standing note on instruments

Two lessons from sibling apps apply to every future row here:

- **A success response carrying nothing is not an answer — it is a question.**
  An HTTP 200 with an empty body, or a search returning no hits, is not evidence
  of absence. V-04 is exactly this shape and is labelled UNVERIFIED for exactly
  this reason.
- **When a result looks absurd, suspect the instrument first.** V-05's 403 is the
  instrument, not the answer.
