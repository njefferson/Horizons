# ADR-0051 · Composed Today: optional, hand-chosen, expiring by projection

**Status:** Accepted · **Date:** 2026-08-01

## Decision

A person can compose their day **by hand**: choose up to `COMPOSED_CAP = 5`
things from their own sheets, see them as a quiet strip above Next up, and
have the choosing **lapse at midnight with no residue**. The whole capability
is an **opt-in module, off by default** — Noah's own condition ("Can you make
it optional?") — riding `module.enabled`/`module.disabled{module:'today'}`,
the two nouns the vocabulary has carried since Phase 0 with no emitter and no
fold until now. `State.modules` is the new fold (a set; enabled adds,
disabled removes; order-dependent like `dependency.released` and covered by
the same discipline). Nothing renders anywhere while the module is off, and
turning it off removes every surface while the log keeps its record.

Two new nouns: `today.chosen{day}` / `today.released{day}`, folding to one
LWW slot per node (`todayFor`). Not silent-risk — a choice adds no coverage
and removes none.

## The expiry is the projection

`composedFor(state, now, zone)` is the ONE reader of `todayFor`, and it
answers only for the **current local day**. No exported function takes a day
argument, so "what did I choose yesterday and not do" is **structurally
uncomputable** — not politely unasked, uncomputable (laws 3 and 5, the
ADR-0043 counts-only trick applied to a day). At midnight an unfinished
chosen thing goes back to being an ordinary held thing: no fraction, no
carry-over, no record of a miss anywhere any surface can reach. The fold
keeps the fact (`todayFor` holds the stale day) because the log never lies —
but a fact with no reader is not a score.

## The shape rules

- **Strictly hand-chosen.** ADR-0030's ban on an auto-composed or scored day
  stands untouched; the app never picks, suggests, or ranks the chosen set.
  Next up's computed offer is unchanged below the strip.
- **The verb lives on the detail sheet** — reachable from every list, search,
  sort, and the strip itself. The strip's rows are DOORS only; one
  write-home per verb.
- **At the cap the button says so and disables** ("Today is full — a hand
  fits five") — never a failure after the tap.
- **The caveat carries the comms-sweep's three beats**: off unless you ask
  for it, it counts nothing, and an unfinished choice is not a failure.
- **The print card stays computed this release.** `todayCard`'s own rule — one
  definition of "what matters today" per surface — cuts both ways; composing
  the PRINT from the chosen set is future work on Noah's word, not a default.

## What would overturn it

Noah's word, at the module boundary: the whole feature can be switched off
forever without touching the log. The expiry-by-projection core is not
overturnable by convenience — a reader for past days would be the shame
ledger this app exists to not keep, and it would need this ADR reversed in
writing.
