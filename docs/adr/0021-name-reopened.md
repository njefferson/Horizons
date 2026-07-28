# ADR-0021 · Perennial withdrawn; the name is reopened

**Status:** Accepted · **Date:** 2026-07-28
**Supersedes:** [ADR-0020](0020-name-perennial.md)

## Decision

**Perennial is withdrawn.** The app has no name. Q-02 is open again.

`Horizons` remains the **repo slug and a legacy label only** — it is not a chosen name and
must not be treated as one. ADR-0018 already records why it was rejected.

## Why

Three software companies hold the name, and the subdomain is gone:

| Occupant | What it is |
|---|---|
| **Perennial Labs, Inc.** | DeFi derivatives protocol, California — **and it is serving `perennial.pages.dev`** |
| **Perennial Systems** | Web development and fintech consultancy |
| **Perennial Software** | Security / integration sector |

`perennial.pages.dev` was confirmed taken by Noah on his own device, 2026-07-28. Q-04 is
answered negatively.

None of these is likely fatal on trademark grounds for a free, noncommercial app — they are
different goods and services. **The disqualifying problem is practical:** the app would be
the fourth Perennial in software and effectively invisible in search, which for a free tool
nobody is advertising is the whole distribution channel.

## The method error that produced this, recorded because it is the real lesson

Perennial was recommended on the strength of two searches that **asked the wrong question**:

1. `"Perennial" app task planner productivity App Store software` — scoped to the app's own
   category, which filters out every company that is not a to-do app.
2. `"Perennial" trademark software app company class 9 brand name` — the query shape already
   documented in [V-09](../verifications.md) as returning SEO articles instead of products.
   It was reused after being documented as broken.

Neither found any of the three companies. A single properly-scoped query —
`"Perennial Labs" web development agency` — returned two of them immediately.

> **The question is not "is another planner called this?" It is "is this name taken in
> software?"** Those are different searches, and only the second one clears a name.
> A narrow query is a weak probe wearing a thorough one's clothes: it returns a confident
> empty result for a name that is heavily occupied.

This compounded a second failure: the `pages.dev` check was handed to Noah as a manual step
without being attempted first, one message after he had corrected exactly that behaviour.
It could not in fact have been loaded from a session — the gateway blocks it, now proven in
[V-05](../verifications.md) — but *searching* for the occupant was always possible and was
never tried.

## Consequences

- **Every future candidate is checked name-plus-software first, unscoped**, before any
  category-specific query and before it is ever shown to Noah.
- The graveyard in [ADR-0020](0020-name-perennial.md) stands and grows — ~21 candidates now,
  Perennial included. It is the most reusable artifact of this exercise.
- Everything downstream of the name stays cheap: nothing in the schema, the event
  vocabulary, or the file formats encodes it. This withdrawal cost one copy pass, which is
  exactly what "Provisional" was protecting against.
- **Nothing is blocked.** Phase 0 of the build plan does not depend on the name.

## What would overturn it

Nothing. Perennial is withdrawn on Noah's decision, 2026-07-28.
