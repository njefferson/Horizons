# ADR-0015 · Every assisted flow has a working offline rung

**Status:** Accepted · **Date:** 2026-07-27

## Decision

**AI never blocks.** Every assisted flow is a **ladder**, and the bottom rung
works offline, forever, with no account and no network:

```
offline template library  →  Workers AI (consented)  →  BYOK  →  manual wizard
```

Cloud rungs require **explicit consent naming exactly what leaves the device**.
The consent record stores the literal sentence the user agreed to.

## Why

Doctrine §1: local-first, offline-first, no server-side user data. An AI feature
that is required for a flow to complete makes the network a dependency of
planning, and the moments this app is most needed — a walk-in, a meeting, a bad
morning — are exactly the moments when waiting on a request is unacceptable.

There is a sharper reason too. The content here is a government workplace's
suspenses and a private journal. Any flow that *silently* sends that content
somewhere is a serious breach, and "the user must have known" is not a defence.
Storing the literal consent sentence — rather than a boolean — means the record
of what was agreed survives a later copy change, so a reviewer can see what the
user was actually told, not what the current build says.

The ladder shape matters: the rungs are **alternatives, not fallbacks**. The
template library is a first-class answer, not a consolation prize for the
offline. The manual wizard at the top is not a failure state either — it is
sometimes simply the best tool, because the person knows their own work.

## Consequences

- The **offline template library must be good**, and is built first. If it is a
  stub, this ADR is decoration.
- Every AI-touching feature is specified with its offline rung **in the same
  design**. A feature that cannot state its offline rung does not ship.
- `consent.granted.whatLeaves` is a **required human-readable string**. Not a
  flag, not an enum.
- Consent is **per-scope and revocable** (`consent.revoked`). Revoking is
  immediate and does not require justification.
- The Dump-session batch assist may take **one consent for a whole batch** — this
  is a deliberate ergonomic exception, and the consent sentence must say plainly
  that it covers the batch.
- **The breakdown ladder's granularity dial generates all steps but reveals
  one.** Showing eight steps at once to someone who is stuck is choice overload
  at the worst possible moment.
- Workers AI free tier: V-02 confirms 10,000 Neurons/day shared across models,
  ~1,300 small-LLM responses. Ample at single-user volume; model choice matters
  more than call count.
- v2 WAR ingestion follows the same shape: **deterministic format-template parser
  first**, AI only as fallback, every update **confirmed** and
  **provenance-tagged**. An AI-derived field is never silently written — that
  would be exactly the "generated blurbs presented as field notes" failure
  Doctrine §5 names.

## Etiquette for the two networked things

Horizons has almost no network surface — but it has exactly two pieces, both v2: the
Workers AI rung and the T2 push Worker. **Doctrine §15.7 applies to both**, and it is
unconditional: a networked adapter declares its policy and pacing, and CI fails on
looser pacing, a missing policy citation, unidentified requests, or a 429 handled
without `Retry-After`.

These are Cloudflare's own paid-for services rather than volunteer infrastructure, so
the moral weight is lower than §15's founding case — but the mechanics are the same and
the gate is not conditional on who is being asked:

- **Identify accurately, derived from the shipped version.** Not a hard-coded string
  that drifts. A stale User-Agent is barely better than an anonymous one — an operator
  looking at a spike could not tell which build caused it.
- **Honour `Retry-After` exactly.** A 429 is an instruction, not an obstacle.
- **Two attempts, not nine, and never a different host on failure.** Retrying elsewhere
  is not a retry, it is moving your load onto someone else.
- **Circuit-break.** After N consecutive failures, stop the run rather than grinding
  through it proving the service is down. **A run that gives up writes nothing**, so a
  partial result can never be mistaken for a whole one.
- **Cache what answered.** A failed run must not make the next attempt re-ask for what
  it already received.

*(These are the freshly-recorded photo-pointer lessons of 2026-07-26/27, written down
here while the AI rungs are still unbuilt — which is the only moment they cost nothing.)*

## What would overturn it

Nothing. This is product law 10, and it is downstream of Doctrine §1 — changing
it would change what the app is.
