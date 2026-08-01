# ADR-0036 · Two builds from one branch — the default cannot sync, and the browser enforces it

**Status:** Accepted · **Date:** 2026-07-29 · Noah's decision

## Decision

Quietkeep ships as **two builds from one branch**, deployed to two Cloudflare
Pages sites:

- **Default**
  - Quietkeep: **yes, always**
  - Quietkeep Sync: no — you go and get it
- **Sync module in the bundle**
  - Quietkeep: **absent**
  - Quietkeep Sync: present
- **`connect-src`**
  - Quietkeep: `'self'`
  - Quietkeep Sync: `'self'` + the relay host, named
- **Store**
  - Quietkeep: its own origin
  - Quietkeep Sync: its own origin

**One `main`. One set of gates. One place to fix a bug.** The difference is a
build flag and one line of `public/_headers`.

## Why not two branches

Two long-lived branches means fixing the same defect twice, forever — and the
copy that would carry a missed fix longer is **the one with more exposure**. This
is not hypothetical: 0.10.1 fixed a CRITICAL defect where a validated import file
could destroy a store and then fail. On two branches that needed applying twice,
and a missed cherry-pick would have left it live in the sync edition.

Everything else doubles too: two smoke walks, two accessibility runs, two
changelog triplets, two service-worker cache namespaces, two release taxonomies.
This repo's whole discipline is one source of truth — one doctrine, one lessons
file, one event vocabulary, one changelog generator. Two branches breaks that
exactly where it matters most.

Two branches becomes defensible the day the two are **different products** rather
than one product with a module. If that day comes, this record is superseded.

## Why the CSP is the real guarantee

`public/_headers` already carries `connect-src 'self'`. **The default build
cannot make a request to a relay — the browser refuses it**, whatever code is in
the bundle. That is enforcement, not discipline.

So the guarantee is defence in depth, and both halves are checkable:

1. **The sync module is absent from the default bundle.** A build-time exclusion,
   not a runtime toggle, so there is no flag to get wrong at runtime and nothing
   to accidentally enable. Verifiable by reading the built artefact.
2. **The default origin cannot reach any other host.** Even if (1) failed — a bad
   flag, a bad merge — nothing can leave. `tools/headers.mjs` gates this, so the
   posture cannot erode quietly.

The second is what makes the first safe to rely on. A guarantee that rests only
on "we remembered to exclude it" is the shape [V-10](../verifications.md) is
about.

## Naming

**Quietkeep** and **Quietkeep Sync**. The default keeps the plain name because it
is the default and the more principled build; the variant says what it adds, in
the plainest available word. `<Product> Sync` is the ordinary convention for this
(Obsidian Sync, and others) and is immediately understood.

This is a **product edition name, not a release name** — Doctrine §7's "releases
do not have names" is untouched, and neither build gains a moniker.

Each build's (i) panel links the other and states its own posture plainly: the
default saying it cannot sync and why that is the default, the variant saying
exactly what leaves the device. The same pattern the hub already uses for the
shared accessibility statement.

## Consequences

- Two origins means **two IndexedDB stores**. Moving between the builds is an
  export and an import, which works as of 0.10.0; the shard union (ADR-0035)
  means someone can run both and keep them in step by hand.
- Every release ships to both sites, and the triplet is shared. A release note
  that only applies to one build says so.
- `tools/headers.mjs` joins the gates: the default's `connect-src` must be
  exactly `'self'`, and no directive in the default `_headers` may name an
  external host. It fails the build otherwise.
- The sync build's `_headers` names the relay host **in one place**, so the whole
  network exposure of that edition is one reviewable line.
- The repo description and the About copy currently say "no accounts, no
  telemetry, no server". That stays true of Quietkeep and becomes false of
  Quietkeep Sync, so both need their own wording — a Doctrine §10 confirm item,
  listed for Noah rather than changed unilaterally.

## What would overturn it

The two builds needing to differ in product terms rather than in one module. At
that point they are two products, two branches are honest, and this record is
superseded rather than stretched.

## Amendment — 2026-08-01 (1.7.2): the words follow the edition, on Noah's word

The wording gap this record listed for Noah resolved itself the honest way: he
opened Quietkeep Sync and caught the default's copy lying to him — "there is no
server" and "the default app you are in never contacts anything at all", both
false in that build. On his instruction ("these two lie… these need to match
the version"):

- `src/ui/edition.ts` carries the word-level edition fact, set once by the
  entry point's own shape (the sync entry passes its mount; the default passes
  nothing). The artefact-level guarantee is untouched — the default bundle
  still does not contain the sync module, and `tools/editions.mjs` still reads
  the built file to prove it.
- The panel header and the walkthrough name the edition ("Quietkeep Sync"),
  and every `[data-edition]` paragraph shows its own build's truth: the markup
  ships the default's words visible, and the sync build flips them at start.
- The build-time patches (page title, manifest name, cache name) stay as they
  were — this amendment adds the runtime words, it replaces nothing.
