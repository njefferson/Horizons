# ADR-0018 · Repo slug `Horizons`; Pages subdomain qualified

**Status:** **Superseded pending** — Noah 2026-07-27: *"This app needs a new name."*
The replacement (ADR-0020) is written when the name exists. · **Date:** 2026-07-27

> **Outcome:** option 1 below — keep both names and differentiate on the hub — was
> **not** taken. Noah chose to rename this app. The reasoning below is kept because it
> is why the rename is happening, and because the closing observation still holds and
> is what makes the rename cheap: **nothing in the schema, the event vocabulary, or the
> file formats encodes the product name.**

## Decision

- **Repo slug stays `Horizons`** — already created that way by the owner.
- **Display name: "Horizons."** Tagline *"Out of sight. Never out of mind."*
- **Pages subdomain is qualified**, not bare `horizons.pages.dev`. Exact string
  is Q-04, pending.
- The name is **not cleared**, and this ADR does not pretend it is.

## Why

The brief anticipated needing a subdomain qualifier and flagged the name as
pending an availability pass. That pass was run and returned two things, one
expected and one not.

**Expected: the outward checks are incomplete.** No prominent planner called
"Horizons" surfaced in search, but that is a weak instrument — not a store
search, and emphatically not a USPTO knockout in classes 9 and 42. "Horizons" is
a common English word and a busy mark. V-04 records this as **UNVERIFIED**, not
as clear.

**Unexpected: the collision is at home.** The hub already ships **Clear
Horizons** — the astronomy planner at `clear-horizons.pages.dev`, linked from the
hub index as "Astro Planner" and named in the shared accessibility statement.

*Horizons* and *Clear Horizons*, listed together on one page, will read to any
visitor as two versions of one product. The brief's availability pass looked
outward and did not consider the shelf the app is going onto. This is a naming
problem independent of anything the USPTO says, and it is the one that will
actually be noticed.

The slug is kept because the owner created the repo that way, and renaming a repo
is a GitHub-UI step with redirect consequences — not something to spend on a
question that is still open.

## Consequences

- Both apps appear on the hub index. **Whatever else is decided, they need to be
  visually and verbally distinguishable there** — different tile, different
  one-line descriptor. "Astro Planner" and a planner-for-humans sitting adjacent
  with near-identical names is the concrete failure.
- Q-04 (subdomain string) is blocked on this and is blocking on deploy.
- V-04's outward checks stay owed. They do not block building — nothing in the
  architecture depends on the name — but they **must** be run before any public
  release copy is written. Shipping under a name that later has to change costs
  far more than checking now.
- The internal codename in code and docs is `horizons` regardless, so a display
  rename is a copy change and not a refactor. **Nothing in the schema, the event
  vocabulary, or the file formats encodes the product name.** This is deliberate.

## Options, if Noah wants a different answer

1. **Keep both names, differentiate hard on the hub** — cheapest, and the current
   default.
2. **Qualify this app's display name** (e.g. a two-word name) — moderate, and
   resolves the reading problem at the source.
3. **Rename the sibling** — *Clear Horizons* is already deployed and linked, so
   this costs a redirect and a hub edit. Almost certainly not worth it.

Not recommending 3.

## What would overturn it

A USPTO knockout returning a live mark in class 9 or 42 would force a rename
outright. Noah's preference on the hub-collision reading would settle the rest.
