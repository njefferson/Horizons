# ADR-0024 · The name is Quietkeep

**Status:** Accepted · **Date:** 2026-07-28
**Supersedes:** [ADR-0023](0023-name-wynts-withdrawn.md)

## Decision

The app is **Quietkeep**. Tagline and epigraph are unchanged: *"Out of sight. Never out of
mind."* / *"It holds the rest, so you can rest."*

Q-02 is closed. `Horizons` remains the **repo slug only** until the GitHub rename, and
survives permanently as domain vocabulary (see Consequences).

## Why

**The word does the app's job.** A *keep* is the strong inner tower — the part of a
structure whose only purpose is to hold what matters safely, without being lived in. That
is the product: a place things go that is not the place you work. And the thing it holds
against is *going quiet* — the app's own README says it is "structurally incapable of
letting something go quiet". The name names the failure mode it exists to prevent, and the
promise it makes instead, in two ordinary words.

**It is calm without being soft.** "Quiet" here is a property of the app, not an
instruction to the user — this is not a name that tells anyone to settle down. Nothing in
it is diagnosis-flavoured, nothing is a rebuke, nothing is childlike. It reads adult.

**It is a compound, which is why it was available.** The graveyard's own conclusion after
thirty-odd deaths: *single evocative words in class 9 are effectively exhausted; what
survives is compounds, coinages, and slightly-odd words.* Wynts tested the coinage branch
and failed on sound. This is the compound branch, and it clears.

## What was checked, in the order [ADR-0023](0023-name-wynts-withdrawn.md) established

Cheapest and most-likely-to-kill first. Step 1 exists because Wynts passed every registry
check and still had to be withdrawn.

- **1**
  - Check: **Said out loud**
  - Instrument: said, and said in a sentence
  - Result: KWY-ət-keep. Two ordinary words, one stress each, one spelling, one pronunciation. No homophone, no rhyme that bites, nothing one letter away.
- **2**
  - Check: **This repo's own spec**
  - Instrument: `grep` — **authoritative**
  - Result: Clear. "quiet" appears only in prose, "keep" only in ordinary usage. No surface, node kind, event noun, or law is named either. This is the check that killed *Lens*, *Gauge* and *Alignment*.
- **3**
  - Check: **Unscoped name + software**
  - Instrument: web search
  - Result: Nothing named Quietkeep. Nearest returns are SoftwareKeep (a software retailer), Quiet Mind Software, quiet.app, the Quiet Modem Project — none a collision. This is the query shape that was run *wrongly* against Perennial.
- **4**
  - Check: **npm and GitHub**
  - Instrument: direct registry query — **authoritative**
  - Result: `quietkeep`, `quiet-keep`, `quietkeep-app`, `usequietkeep` all free. No GitHub project of the name.
- **5**
  - Check: **App Store**
  - Instrument: **Noah's own device**
  - Result: *"there is nothing on the App Store that I see near it."* Blocked from a session and proven so ([V-05](../verifications.md)); handed over, and it came back answered.

**Recorded rather than omitted — the nearest live neighbours:**

- **Quietstart: AI Day Planner** (Google Play) — same category, shared first syllable,
  different second half. Not a collision, but it is where a half-remembered name could
  land. A findability note, not a clearance failure.
- **Quiet, Inc.** holds marks on the bare word *QUIET* in software classes. A compound is
  not that word, and this app is free and licensed against being sold, so trademark's
  confusion-in-commerce test does not reach it. Written down anyway.

**Not yet run:** `quietkeep.pages.dev` (Q-04, ten seconds on his device) and a USPTO
knockout in classes 9 and 42 if wanted — the lowest-priority check for a noncommercial
app, per [V-04](../verifications.md). This record is Accepted, not "cleared for print".

## Consequences

- **The rename is a copy pass, not a refactor.** Nothing in the schema, event vocabulary,
  or file formats encodes the product name — true through four name changes now, and the
  reason each cost hours rather than days.
- **"Horizons" survives as domain vocabulary, deliberately.** Product law 4 — *higher
  horizons project lineage and health downward* — and the *horizon-integrity engine* keep
  the word. A CI check asserts they survived, because a careless global replace would
  silently destroy an invariant's own statement.
- **`LICENSE.md`'s Required Notice URL still points at `njefferson/Horizons`.** It follows
  the GitHub slug and moves in the same commit as the repo rename; changing it earlier
  aims the notice at a 404.
- Q-04 becomes concrete: the subdomain to test is `quietkeep.pages.dev`, and the four §10
  metadata values can now be drafted for Noah's confirmation.
- The graveyard in [ADR-0020](0020-name-perennial.md) stays authoritative and stays open —
  it is the record of what was tried, not evidence that the search is finished.

## What would overturn it

A live USPTO mark on the compound in class 9 or 42, or a same-category app named Quietkeep
surfacing in a store search. Not the Quietstart adjacency, which is known and accepted.
