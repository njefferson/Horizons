# ADR-0075 — The header clock says the time, the remainder and a count — and refuses the fourth thing

*2026-08-05 · Accepted · shipped 1.22.0*

## Context

An analog clock was asked for: switchable, in the header, on every screen, to
work against time blindness. Tapping it would open the device's alarm page.

Two halves of that request behave very differently.

**The dial alone does not do the job.** Time blindness is not ignorance of the
current time. `docs/nd-collisions.md` entry 4 states the shape: the future
carries no weight until it becomes now. A thing at four o'clock is weightless at
two and an emergency at ten past four, with nothing in between. A clock face
answers *what time is it*, which is the question that was never the problem — it
would sit in the chrome being correct and changing nothing.

**What gives a day weight is watching it drain.** The remainder — how much of
today is left — is a shrinking quantity, which is exactly the gradient the decay
primitive gives to everything else in this app (ADR-0010), applied to the day
itself. That is the part that fights the thing.

## Decision

**Three facts, all derived, none invented:** the time on a real dial, how much of
the local day is left, and how many held things carry today's date.

**The count is a count, never a list.** The header is chrome. A list of today's
work in the header would be a second work surface competing with the real one
below it, and would make the top of every screen a place that hands out work.

**And the count is a BADGE, so it obeys what a badge may never be about.** It
reads `exportsToCalendar` — the predicate the export already calls the one
reader of this question — rather than a private copy that would agree today and
drift later. Its two exclusions matter more in the chrome than they do in a
file: a worry is not a thing dated today, and a standing decline never counts,
because ADR-0056's whole relief is that a park never demands — *"no
notification, no banner, no badge"* — and a header number that ticks up on the
day a declined request's park lands is a badge about the very thing you said no
to, in the one place on the screen nobody can look away from. Caught in review
before this shipped, and held by a test seen red on the missing guard.

**It is an opt-in Extra, off until switched on** — `module.enabled` /
`module.disabled` on `state.modules`, the Composed Today precedent (ADR-0051),
so the closed event vocabulary stays closed for a second consecutive release.
Chrome that arrives switched on has decided something about somebody's screen
that it was not asked to decide, and a clock is the most charged piece of chrome
there is: half the point of this app is that a day is not a countdown.

**The dial is decorative to assistive technology.** `aria-hidden`, no label, no
role — the words beside it are the accessible version and stand alone as a
sentence. A screen reader gets "14:20. 9h 39m left today. 2 things are dated
today.", not a description of where two lines point.

**Nothing here is a control.** See below.

## What it refuses to say, and why that is the decision

**It does not count down to an appointment.** Every clock in this app is
DAY-GRANULAR: `clock.set` accepts a datetime and every writer in the app builds
it with `endOfLocalDay`; there is no time input anywhere in the markup. The app
therefore does not know that anything happens at nine o'clock. "Your 0900 is in
1h 40m" would be a fabricated number, and fabricating a number is the one thing
ADR-0010 exists to refuse. Nor can it read one back: the `.ics` path is one-way,
and a page has no API to see what a calendar imported.

The plan for this release said the clock would show exactly that. It was wrong,
and the correction is the substance of this record: a capability was designed
before the data model it needed was checked.

**Whether the model should gain a time of day at all is a separate decision**,
not something to smuggle in under a clock. It would touch `clock.set`, every
date input, the `.ics` export and the replan path.

## Why the tap is not wired

The request was that tapping opens the device's alarm page. No browser can reach
that screen — there is no public URL scheme for it and this repo has no
verification for one (`docs/verifications.md` is the standard). The honest
substitute is the `.ics` hand-off, which writes a real `VALARM` and rings with
the app shut, and it already exists on the (i) panel.

**It is not moved onto the clock.** Two reasons, and either alone is enough:

- A control's accessible name would be its visible words, and those change every
  thirty seconds. Voice control needs a phrase somebody can *say*; "14:20, 9h 39m
  left today" is not one. Pinning a stable `aria-label` over changing visible
  text is an SC 2.5.3 failure, and it is the exact trap this repo has already
  paid a release for (hub LESSONS §29). The gate catches it: the shape was
  planted, and `light/clock on: SC 2.5.3` went red before the design was
  settled.
- A tap on the header that writes a file into somebody's Files app is a
  surprise, and the header is the easiest thing on a screen to hit by accident.

The Extras copy points at the calendar hand-off by name instead. One tap away,
on a surface that says what it does before it does it.

## Consequences

- One new pure module, `src/clock.ts`, and one rendering module. No new event
  kind, no schema change, no migration.
- No new colour pair enters the contrast gate: the hands are `--ink`, the rim is
  `--line` (a graphical object at 3:1), the words are `--ink-soft`. All three
  pairs were already held. The rendered result is measured all the same —
  `clock opt-in` and `clock on` are audited states in both themes.
- Both readers are TOTAL. `endOfLocalDay` throws a `RangeError` on an
  unparseable instant, and the clock repaints inside the chain that repaints
  every other surface, so a throw would have cost somebody their card list. A
  clock that cannot be drawn hides itself; it never takes the app with it.
- The remainder is the ZONE's day and not twenty-four hours minus the time. The
  two days a year that are 23 and 25 hours long are asserted, because
  `now + 86_400_000` passes every other day of the year.
- It ticks every thirty seconds while visible, and repaints on becoming visible.
  The second matters more: a backgrounded standalone app on iPadOS is frozen,
  not throttled, so a clock that only ticked would show a two-hour-old time in
  the most confident place on the screen. A stale clock is the same class of
  failure as a negative remainder.
- Nothing animates. The hands move by being redrawn once a minute, so there is
  no sweep, nothing for `prefers-reduced-motion` to suppress, and no spiral
  anywhere near it (ADR-0025).
