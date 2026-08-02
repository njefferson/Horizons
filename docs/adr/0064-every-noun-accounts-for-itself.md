# ADR-0064 · Every noun accounts for itself

**Status:** Accepted · **Date:** 2026-08-02 ·
**Generalises** [ADR-0062](0062-the-copy-and-the-way-back.md) and
[ADR-0063](0063-startup-does-not-replay-the-world.md)

## Context

Two releases on one day fixed the same defect at two layers.

**`export.written`** had been recorded since Phase 0 and read by nothing, so no
surface could answer "when did I last save a copy" — the question ADR-0004 makes
the entire durability story turn on (ADR-0062).

**`snapshot.written`** had been declared in Phase 0 and written by nothing, so
`loadState` never found a snapshot and every cold start folded the whole log —
against ADR-0001's first consequence (ADR-0063).

**Neither was visible.** The types compiled, the vocabulary gate passed, 864
tests were green, the app worked. A noun that nothing writes breaks nothing; it
simply means a feature the record insists exists does not. Every instrument
reported success, which is what makes this the quietest defect the system can
have.

A sweep of the closed list found **23 more kinds written by nothing**, of which
exactly two carried a note saying so. The rest were silent without explanation —
some correctly (a reserved noun is a fine thing), some because a decision was
deferred, some because the feature was replaced by a different mechanism and
nobody went back. From the outside, all 23 looked identical, and identical to
the two that were real defects.

## Decision

**A kind is either written by the app, or the vocabulary says in words that it
is not, and why.** There is no third state, and `tools/emitters.mjs` fails the
build on one.

### What counts as written

The kind's string literal appearing anywhere in `src/` other than the four files
that necessarily name every kind whether or not it is alive: `events.ts`
declares them, `log-words.ts` renders them all by design, `fold.ts` folds the
ones that fold — **folding is reading, not writing** — and `snapshot.ts`
serialises folded state.

**Deliberately crude.** A precise emit-detector would have to understand every
intent builder, the gate's cures and the sync layer, and would itself become a
thing that could quietly stop working — which is the failure mode this whole
release is about. Grep is legible, has no interesting failure mode, and errs
toward calling a kind *written*, which is the safe direction: the annotation it
would otherwise demand is cheap, and a false "accounted for" is the outcome
worth avoiding.

### What counts as accounted for

A note **inside that kind's own entry** containing the word "unemitted". Prose,
not a machine field. The mechanism is the same as `MERGE_DISPOSITION` (1.9.2): a
reasoned "no" is a fine answer, and **forcing somebody to write the sentence is
the gate**, not the sentence's content.

The doc is parsed into per-kind blocks rather than paragraphs. The first version
split on blank lines, and since a Markdown bullet list has none, all of section G
became one lump in which a note about one kind vouched for every kind beside it —
exactly the sloppiness this exists to refuse. A block now runs from a kind's own
bullet to the next kind's bullet or the next heading, so a note has to sit
**beside the thing it is about** to count. One existing note (the `vault.*`
supersession) lived in a different section entirely and was moved to where it
belongs.

### It checks both directions

A kind the app *does* write must not still be described as unemitted. A note that
has gone stale is simply the next quiet lie, and it would be written by exactly
the person least likely to check — whoever finally wires the noun up.

## Consequences

- Adding a noun now costs either a writer or a sentence, in the same commit.
- The 23 unemitted kinds now say what they are: **reserved** (the assist ladder,
  templates, terminology skins, consent), **deferred with a named blocker**
  (anchors and their delta; pebbles, capacity and WIP, all waiting on "what does
  a pebble actually depress?"), **superseded** (the vault trio; the comms-sweep
  pair, replaced by a field on an upkeep node), **redundant**
  (`device.registered` — `State.devices` folds from the `device` field every
  event already carries), or **correct by design** (`replan.raised`, which
  ADR-0034 requires to stay unemitted).
- **Two of those notes record open questions rather than settled answers**, and
  say so: whether sync needs a `consent.granted` under ADR-0015, and that
  compaction — ADR-0001's fifth consequence — is entirely unbuilt.
- This release changes nothing on screen. The bundle changes only because the
  patch notes live in it.

## What would overturn this

- **The grep proving too crude in practice** — a kind mentioned in a comment and
  written nowhere would read as written. The fix is a narrower pattern, not
  abandoning the check; and the failure is in the safe direction.
- **Notes decaying into "reserved" boilerplate.** If every entry says the same
  four words, the gate is being satisfied rather than used, and the answer is to
  ask what each one is actually waiting for — not to loosen it.
- **Not by "this noun is obviously fine."** Both defects that caused this were
  obviously fine for a year.
