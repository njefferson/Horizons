# ADR-0052 · The session close: peak-end, never a report card

**Status:** Accepted · **Date:** 2026-08-01

## Decision

When a focus session ends, a **close strip** appears (build-plan item 40): the
win in words ("Done: ⟨title⟩." — or, for a stop, "⟨title⟩ is left where you
can pick it back up."), and the coverage gauge stated in WORDS, never colour
(B-02): "Everything you hold is covered — N things, none silent." It rides
the **same in-memory `surfacing` ramp as the comms chip** — the second rider
on a proven mechanism: never persisted, never an event, cleared by the next
act, and it never greets a cold start. "Carry on" lowers the ramp and writes
nothing.

**The day-end review question (item 26) lives here.** When a resume card from
an EARLIER sitting is still unspent, the strip asks the one question — "A
thread from earlier is still waiting" — with exactly two answers: a door to
the thread's sheet, or "Let the thread go", which writes
`resume.card.expired{toReviewQuestion: true}` — the flag the vocabulary
carried from Phase 0, hardcoded false until now, finally set true by the one
path that really is the question. A card minted by the session that just
ended is not questioned: it is the way back the interrupt promised.

## Why this shape

Peak-end: the last thing a sitting shows should be what was true and good
about it, and this app's honest version of that is a fact (the work's state)
and a proof (the gauge) — not a score. The question exists because an unspent
thread is the one thing a session leaves genuinely unresolved, and asking at
the close is asking at the moment the answer is cheapest.

## What it must never become

- **No duration, no count of sessions, no streak** — a close screen that
  grades the sitting is a report card, and a report card is the ledger this
  app exists to not keep (laws 5 and 7).
- **Never more than one question.** A list of lapsed threads is a backlog
  wearing a farewell's name (law 8).
- **Never persisted.** A close strip that survives a reload greets a cold
  start with yesterday's summary — the arriving-unbidden behaviour the ramp
  design refuses.

## What would overturn it

Nothing about the ramp (it is the comms chip's own settled mechanism). The
words could change on Noah's on-device read; the three "never"s above would
need this ADR reversed in writing.
