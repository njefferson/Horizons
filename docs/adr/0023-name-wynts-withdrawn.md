# ADR-0023 · Wynts withdrawn — it sounds like "wince"

**Status:** **Superseded by [ADR-0024](0024-name-quietkeep.md)** — the name is Quietkeep
2026-07-28 · **Date:** 2026-07-28
**Supersedes:** [ADR-0022](0022-name-wynts.md)

> The withdrawal stands and the check order this record established is now the standing
> method — [ADR-0024](0024-name-quietkeep.md) was cleared against it, step by step.

## Decision

**Wynts is withdrawn.** The app has no name. Q-02 is open again.

`Horizons` remains the **repo slug and a legacy label only**, as before.

## Why

Under its natural reading — WINTS — *Wynts* is a near-homophone of **wince**.

That is disqualifying against this app's own voice rules, which are not decorative:
adult, calm, **shame-free**, never a rebuke, no diagnosis-flavoured copy. A planner
for people who have been made to feel bad by every previous tool cannot be named
after a flinch. It is the same class of objection that killed *Diopter* — a name
that implies something is wrong with the user — arriving through sound instead of
meaning.

Noah caught it by saying it out loud. **No check in this repo would have.**

## The check that was missing, now first

Every check run against Wynts was a **registry** check: npm, GitHub, App Store,
trademark, and a grep of this repo. Registries catch collisions with *products*.
Nothing catches a collision with an ordinary English word except pronouncing it —
and ADR-0022 even recorded pronunciation as an open question (Q-08) without
anyone testing what the pronunciations sounded *like*.

> **Say it out loud. Say it in a sentence. Ask what it rhymes with, what it is one
> letter from, and what it sounds like to someone who has never seen it written.**

The full order for any future candidate, cheapest and most-likely-to-kill first:

1. **Say it aloud** — homophones, rhymes, unfortunate near-words
2. **Grep this repo's own spec** — the trap that killed *Lens*, *Gauge*, *Alignment*
3. **Unscoped name + software** web search
4. **npm and GitHub** — authoritative and reachable from a session
5. **App Store / USPTO** — Noah's device; blocked from a session ([V-05](../verifications.md))

Steps 1 and 2 are free and instant. They were being run last, or not at all.

## What this cost, and what contained it

**Nothing published.** The name reached `staging` only; `main` never carried it.
The staging gate (Doctrine §7) contained a naming mistake exactly as intended —
the first time in this sequence that a wrong decision cost nothing but a copy pass.

**What ADR-0022 got right and keeps:** a coinage was the correct *category*. Twenty-
three candidates died proving that single evocative words in class 9 are exhausted,
and that finding still holds. The hidden-acronym idea is also still sound — but the
letters of "What You Need To See" are precisely what force the WYNTS spelling and
therefore the wince, so a different phrase is required, not a different spelling of
the same one.

## Consequences

- **Escapement remains the only candidate that has passed every check**, and it
  passes the new one too — no unfortunate homophone. Its single caveat is unchanged:
  it contains "escape". Recorded as runner-up in the [graveyard](0020-name-perennial.md).
- Nothing in the schema, event vocabulary, or file formats encodes the name. This is
  the fourth name change and each has been a copy pass, never a refactor.
- Q-08 (how *Wynts* is pronounced) is closed as moot.

## What would overturn it

Nothing. Withdrawn on Noah's judgement, and the objection is correct.
