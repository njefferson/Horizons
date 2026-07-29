# ADR-0041 — Carrying is not doing, and the report is a fold

*2026-07-29 · Accepted · shipped 0.16.0*

## Context

Two items from the frozen v1 scope, shipped together because the report is
largely worthless without the distinction the portfolio draws.

`project.role.set` has been in `docs/event-vocabulary.md` from the first draft
with its consequence spelled out: *"a `track` project emits no next actions —
only Waiting-Fors and Upkeep check-ins, so its children must re-home"*. Nothing
folded the role. So **every project was an execute project**, and the distinction
existed only in prose.

`status.report.exported` was there too, annotated *"this is the provenance
'delta since last export' reads from"*. Nothing read it, because nothing wrote
it.

## Decision

### A tracked project puts no work in front of you

This is the load-bearing behaviour and it is enforced in `nextup.ts`, not merely
described. Work under a project someone else is executing is **excluded from
Next up**, at any depth.

Offering a next action on something you are only carrying is the app telling you
to do somebody else's job — on the surface whose entire promise is that it has
already decided for you. Once it does that twice, you stop trusting it, and an
untrusted Next up is worse than none: you go back to holding the list in your
head, which is the thing this app exists to stop.

The work stays on the held list. It is still real; it is just not yours to do.

### Nothing on the portfolio is graded

No "at risk", no "slipping", no amber, no colour that means anything about how
someone else is getting on. `trackWords` joins facts with middots: who is running
it, when an answer is owed, how many things are outstanding, when anything last
moved.

A health word is this app grading a third party on evidence it does not have,
and a hue that means "they have had this a while" is worse — it is that judgement
made unarguable. Law 5 says no scores; the place it would be easiest to let that
slip is the surface about somebody else's work, so the test asserts the absence
of ten specific words.

**"Nobody named yet" is reported, not hidden.** A tracked thing with no owner is
the classic way something quietly stops being anybody's.

### The report is `fold(log up to then)` vs `fold(log)`

Not a change-log this app maintains and keeps in sync. The same arithmetic
everything else here is built on, which means:

- **there is no second source of truth to drift**;
- a report over an *imported* history is exactly as correct as one over a history
  this device wrote;
- nothing has to be kept up to date for it to be right.

The mark is `state.lastReportAt`, folded as a **maximum** rather than
last-written: a shard arriving out of order must not wind it back and re-report a
fortnight of changes as though they were new (ADR-0035).

**Deliver, then record** — the ordering an audit already had to fix on the export
path. A `status.report.exported` written before the text reached anywhere would
move the mark, and the next report would silently start from a moment nobody was
ever told about: a whole reporting period lost, with no error and nothing to
notice. When the clipboard is refused, nothing is recorded and the text is
*shown* instead of lost with an apology.

**Finished outranks started.** A thing begun and completed inside one period is
reported as finished, because "we finished it" is the useful sentence.

**Coming up is state, not change**, so it repeats across reports by design. A
report that hid an upcoming date because it mentioned it last week would be
actively misleading — the smoke walk asserts both halves of that distinction.

## Consequences

- **CSV is RFC 4180 and injection-guarded.** Every cell quoted, quotes doubled,
  CRLF. A leading `=`, `+`, `-` or `@` is prefixed with `'`: a title beginning
  `=` is a formula in Excel, Numbers and Sheets alike, and this file exists to be
  opened in one of them. Titles are free text a person typed and they *will*
  contain a comma, a quote, or a newline.
- **`suspense.set` folds into the same `clocks` map as every other date.** Its
  own event exists because setting one is a different act from scheduling work,
  but one date living in two places is how a calendar and a list come to
  disagree.
- **Reports are byte-identical for the same pair of states.** Every ordering is
  total. Otherwise "what changed since last time" starts including reshuffles.
- **`deltaBetween` takes `now` and `zone` as arguments.** The first draft held
  them in module-level mutable globals so `statusReport` could pass them down —
  which made a function documented as pure depend on the last caller. Corrected
  before it shipped.
- **A test that could not fail was found and fixed.** "The mark only ever moves
  forward" passed against a deliberately broken `lastReportAt = e.at`, because
  `fold` sorts internally and a single batch cannot distinguish max from
  last-writer. It now folds a second batch into an existing base, which is how a
  shard actually arrives — and which is the only shape that bites.
