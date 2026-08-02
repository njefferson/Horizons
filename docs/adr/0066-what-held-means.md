# ADR-0066 · What "held" means

**Status:** Accepted · **Date:** 2026-08-02 ·
**Executes the open item in** [ADR-0065](0065-load-not-work.md)

## Context

ADR-0065 closed by naming something it would not decide: the gauge says *"N
held"* while the todo list shows fewer rows, so *"held is doing two jobs in one
word — that deserves a decision of its own."*

**Reading the code showed that description was wrong, and that what is actually
there is a shipped defect with an obvious fix rather than a question.** The
three facts that matter, all verified against source:

- **Law 1's proof is not involved.** `silentNodes` iterates `state.nodes`
  directly. It never read `heldNodes`, so nothing about the silent count has to
  change or was ever at risk.
- **`gate.ts` already stated the invariant** in a comment written after an
  earlier bug: `heldNodes` is *"nodes the gauge counts and the coverage list
  itemises — ONE definition, so the two can never disagree,"* added when the
  gauge said "3 held" over a list of 2, with the note that *"a proof that
  contradicts itself proves nothing."*
- **The coverage list itemises journal entries.** A journal entry has no title
  **by design** (ADR-0061), and `buildCoverage` renders `n.title ||
  '(untitled)'`. So opening the gauge listed every private entry as
  **"(untitled) — held"**, one row each. ADR-0061 excluded them from the todo
  list precisely so that row would not exist; the coverage list was missed, and
  it is the *more* prominent of the two surfaces, because the gauge invites you
  to open it. Since 1.15.0 active pebbles were listed there too — a weight
  itemised among things being covered, which is ADR-0014's "becoming a task" in
  another costume.

The mechanism is the 1.9.2 lesson repeating: `heldGroups` carried a hand-written
list of what is not work, and the gauge had no such list, so the two drifted
apart the moment a kind was added to it. 1.13.0 added journal entries, 1.15.0
added pebbles, and nothing failed either time. `tools/smoke.mjs` asserts the
coverage list's rows equal the gauge's number and had been passing because
neither kind existed at that point in the walk.

## Decision

**One predicate, and the surfaces that make the same claim read it.**

`heldWork(state)` lives in `gate.ts` beside `heldNodes` and the gauge that
reads it. Its body is the skip list that was hand-written inside `heldGroups`,
moved with a written reason per clause: a spent resume card, a journal entry, a
pebble.

Four readers become one definition:

- `coverageGauge`'s **`total`** — the number.
- **`buildCoverage`** — the list that number invites you to open.
- **`heldGroups`** — the list you actually work from.
- The ⓘ panel's **"Things held"** row, which binds itself to the gauge in its
  own comment: the same words about the same store must be the same number.

So card rows = gauge = coverage list = panel row, by construction rather than by
four people remembering.

### What is deliberately NOT narrowed

- **`silent`.** It runs over every node and always will. Excluding a kind from a
  proof is how law 1 gets defined away (the 1.3.1 merged-node finding). The
  gauge's two numbers answer two different questions on purpose: *is anything
  silent* is about everything this app stores; *how much are you holding* is
  about work.
- **`heldNodes` itself.** It keeps its meaning — not trashed, not merged — for
  its other ~28 readers: the merge picker, the portfolio, the person lens, the
  dependency views, the ranges, purge. Most filter by kind anyway, and narrowing
  it would be a wide unreviewable change for nothing the four surfaces above do
  not already give.
- **The import warning.** *"Bringing it in replaces the N things on this
  device"* stays on `heldNodes`, which is the opposite call to the panel row
  directly above it in the same file. An import replaces everything, journal
  entries and pebbles included, and the narrower number would under-state a
  destructive act — the one direction a warning may never round in. Both call
  sites now say which they are and why.

### Two further readers, found by reading rather than by the plan

- **`undatedCount`** — "you have not decided about these yet" — counted pebbles.
  A pebble has no date **by construction**, since the gate refuses a clock on a
  demand-free kind, so raising three would have added three to a number about
  undecided work. It reads `heldWork`.
- **`searchHeld` excludes pebbles**, and this one is not about the set. A
  result row is a door to a detail sheet built for work — routes, clocks, "put
  it in today" — every verb of which the gate must then refuse on a demand-free
  kind. That is the offered-then-refused shape the 1.9.2 audit filed as F-B. The
  load entry is a pebble's surface and it is the only one. A journal entry could
  never match anyway: it has no title, and `''.includes(q)` is false for any
  real query.

## Consequences

- No new event kinds, no fold change, no gate change to the write path. This is
  entirely a projection release.
- `heldGroups` recovers the sentence its header carried until 1.13.0 — the
  grouping is total over its input and the sum of the groups equals the gauge —
  and the period in which that sentence was false is recorded in the comment
  rather than quietly repaired.
- **A number the user sees will drop** on the next open, by however many journal
  entries and active pebbles they hold. Nothing was let go and nothing is
  hidden; the wider set is still exported, still merged into, still searched
  where searching is right. The changelog says this plainly rather than
  presenting a smaller number as an improvement.
- The smoke walk now raises a pebble across the rows-equal-the-gauge assertion
  and re-runs it with a journal entry written, so both halves are checked with
  the case present. Reverting the coverage list alone reds four assertions.
- **A kind added to the skip list in future changes every surface at once**,
  which is the whole point. The next kind that is held and is not work needs one
  clause and one sentence.

## What would overturn this

- **A surface that needs the wider set and reads the narrower one by mistake.**
  The two names are one word apart, which is the risk this shape carries; if
  that happens the answer is a clearer pair of names, not a merged definition.
- **"Held should mean everything, and the list should show everything."** That
  is a coherent position and it loses on ADR-0061's argument: a private journal
  entry rendered as an untitled row in a work list is the thing the journal
  exists to not be.
- **Not by "the gauge should count fewer things to look calmer."** The gauge is
  a proof, not a mood. It narrowed here because the list under it was already
  narrower and one of the two was lying.
