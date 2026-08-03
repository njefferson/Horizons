# ADR-0071 · The diagnostic report — shape, never content

**Status:** Accepted · **Date:** 2026-08-03

## Context

Two things arrived at the same answer from opposite directions.

**The repo had already promised this and never built it.**
[`docs/data-constitution.md`](../data-constitution.md) has told the reader,
since it was written: *"If something breaks, you may choose to copy a
diagnostic report. It is generated on request, shown to you in full before it
goes anywhere, and you send it — nothing transmits by itself."* Nothing built
one. The only diagnostic in the app was the build stamp in the footer, whose
own comment calls itself one. This is the 1.9.1 class exactly — a claim the
product makes about itself that is not true — and it is the worst variety of
it, because the claim is a promise about what happens when something goes
wrong.

**And the doctrine made it a rule the same day.** Universal App Doctrine §7f:
*"ask for the DIAGNOSTIC, never for a screenshot… a session that asks Noah to
photograph his screen is asking him to do worse work on its behalf."* Every
outstanding verification in this repo is his, on an iPad — V-14, V-16/V-17,
V-00 step 2, V-20, build-plan 42 — and the dogfood gate that decides whether
any of this is good has been running the whole time and resetting daily,
because the app cannot survive a day (corrected 2026-08-03 on Noah's word — an
earlier draft of this paragraph said it "has not started", which read an absent
record of success as an absent attempt). A photograph loses every reason string and
shows no internal state at all.

So this is not a planner feature. **It is the instrument that makes the device
reportable**, which is a precondition for the measurement this project is
waiting on.

## Decision

**The report carries SHAPE and never CONTENT**, and that is the whole design.

Other apps' diagnostics worry about location. Quietkeep's worry is the opposite
and sharper: this app's entire promise is that nothing readable leaves the
device, and it holds an encrypted journal. **A report containing titles, names,
notes or entry text would break that promise in the one artefact designed to be
sent to another person.** So it reports counts, kinds, clock kinds, versions,
storage numbers and states — never a title, never a name, never a note, never
plaintext. It is the `reentry.greeted` correction of 1.17.4 restated as a
design rule: record WHETHER and HOW MANY, never WHICH.

**Therefore no opt-in to include content.** §7f asks for coarsening with an
explicit opt-in to include the precise thing. The honest answer here is that
there is no diagnostic question a title would answer, and **the export already
IS the reproduction case** — the constitution says so in the same paragraph and
`deliverCopy` builds it. The report points at that instead of duplicating it,
and says so in its own words rather than leaving it implied. A toggle would be
a way to make the privacy guarantee conditional for no diagnostic gain.

**How that rule is enforced, and why the obvious test was not enough.** The
first form was a substring sweep: build a store full of distinctive strings and
assert none appears in the report. It is necessary and it is noisy — a node
titled *"the numbers"* collided with the report's own sentence *"diagnosed from
the numbers above"* on the day this shipped, failing loudly while proving
nothing. An empty-store differential over-fires the other way, flagging the
app's own closed vocabulary (the clock kinds, "passphrase") as though a fixed
word were content.

So the property is stated directly: **two stores with the same shape and
entirely different words must produce byte-identical reports.** Nothing to
allowlist, nothing to keep in step with the prose, and it fails the moment any
section starts printing something a reader supplied. Both forms are kept — the
sweep over the real store in the headless walk, the equality in the unit tests.

**It leads with the diagnosis** (§7f): root causes first and separated from
what they knocked over, each saying what is missing *and why*. A silent node is
not a symptom — it is law 1 failing, and the report says so and warns that the
rest may be downstream of it.

**It writes no event.** `deliverGeneratedSet` (1.16.0) is the precedent and the
reason is identical: both whole-copy deliverers emit `export.written`, which
`src/copies.ts` reads to say *"Last copy"*. A diagnostic contains none of your
data, so recording one would make the panel claim a backup that does not exist
— the worst possible lie for that row, since somebody reads it precisely when
deciding whether they are covered. A test and a smoke assertion both pin it.

**Two doors, no new chrome.** The build stamp in the footer becomes the control
(§7f: *"the version stamp is a good home"*), which costs the app no height
because it was already there — §7e's warning about a 44px control costing 51px
of header is why that mattered. It is also listed in the ⓘ panel, which §7e
item 6 requires.

## What must not be built

- **No telemetry, no auto-send, no "report this to the developer".** Generated
  on request, shown in full, sent by the reader or not at all. The
  constitution's existing sentence is the specification.
- **No health score.** No "your planner is 87% healthy", no grade, no verdict.
  Law 5 binds the diagnostic exactly as it binds the planner: it describes.
- **No new event and no new noun.** Taking a diagnostic is not a thing that
  happened to your data.
- **No content opt-in**, for the reason above.

## Consequences

- The panel's height budget got tighter, and it was already close. The report
  region is bounded and scrolls inside itself; the section is a heading, a
  sentence and three controls. The 1.17.4 patch notes were shortened in the
  same release to stay under 9,000px — measured, not assumed.
- **`journalUnreadable` is `null`, not `0`, when the journal is locked or
  unset.** Only the journal surface holds the key, so "we did not look" and "we
  looked and they all opened" are different facts and the report says which.
- The a11y walk's focus-ring check was found to be **order-dependent** while
  this was built: `blur()` does not reset Chromium's sequential-focus starting
  point, so the walk resumed from wherever the previous audit left focus and had
  to wrap the whole surface. Four new controls pushed two unrelated states past
  the budget, reporting "not keyboard-focusable" about buttons that plainly
  are. Fixed by focusing the open dialog first, and the repair was verified by
  planting an unreachable control and watching the gate go red.

## What would overturn it

- **The shape-never-content rule is the privacy promise itself** and would need
  that promise to change, which is ADR-0004's and the constitution's territory,
  not this record's.
- **The no-opt-in decision, by evidence**: if a real defect is ever diagnosed
  that the counts genuinely cannot reach and the export genuinely cannot serve,
  that is the argument. It has not happened yet and speculation is not it.
