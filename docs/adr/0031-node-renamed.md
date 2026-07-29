# ADR-0031 · `node.renamed` — opening the closed list, once, deliberately

**Status:** Accepted · **Date:** 2026-07-29

## Decision

Add **one** event to the vocabulary: `node.renamed`, payload `{ title }`,
**Silent? = no**. Fold applies it under the existing `'title'` stamp, so it does
last-writer-wins against `capture.recorded` / `node.created` exactly as every
other field does.

## Why

**Renaming was impossible, and it is the first thing anyone hits.** You capture
"call dentst" in four seconds — which is the point of the capture surface — and
then you cannot fix it. Every node the app could create was a capture, and the
only thing it could do to one afterwards was route it six ways.

**`node.field.set` was the obvious reuse and it is wrong.** Fold writes
`node.field.set` into `n.fields[field]`, never into `n.title`. Renaming that way
would store a *shadow title* under `fields.title` that no surface reads and no
projection folds — the node would keep displaying its original text while the log
insisted it had been renamed. That is worse than no rename at all, because the log
would be lying rather than merely silent.

**The vocabulary has rules for exactly this, and they were followed**
([§5](../event-vocabulary.md)): additive only (nothing renamed, removed, or given
a new meaning); the new event declares its Silent? answer; and a `yes` would have
shipped gate logic in the same commit. It is a `no` — a title carries no coverage,
so renaming cannot orphan anything and law 1 is untouched.

**The closed list stays closed.** This is the first addition since the vocabulary
was written, and it is recorded here rather than absorbed quietly, because "the
list is closed" only means something if opening it costs a decision.

## Consequences

- `test/held.test.ts` proves LWW in both directions — rename-beats-rename across
  arrival orders, and a newer capture beating an older rename — plus the snapshot
  round-trip.
- **A title that would render as nothing is refused.** `trim()` alone was not
  enough and the first version of this record wrongly claimed it was: it strips
  ECMAScript whitespace only, so a title made of zero-width spaces, control
  characters, bidi overrides or bare combining marks was accepted and produced a
  blank, unidentifiable card (audit). `cleanTitle` now removes `\p{Cc}` and
  `\p{Cf}` outright, refuses anything with nothing visible left, and caps length
  at `TITLE_MAX` so one card cannot bury the list. The held list also gained the
  `'(untitled)'` fallback every other surface already had.
- **The gate refuses a rename of a node that does not exist.** `ensureNode` would
  otherwise mint one, and because `cureFor` switches on the *cause's* kind rather
  than on whether the cause concerns the node being cured, an unrelated
  silent-risk event in the same batch adopted the ghost and clocked it — landing a
  node the user never created in "Ready now" with a title from a rename. Alone it
  was caught by the belt-and-braces delta check; batched it was not.
- It asserts `isSilentRisk('node.renamed') === false`, so the vocabulary's
  declared answer and the code cannot drift apart.
- **Honest limit on determinism:** two events sharing an exact `(at, device, seq)`
  tie are resolved by processing order, so an incremental fold and a full replay
  could in principle disagree about which title wins. `nextSeq` and the device
  tiebreak make that tie unreachable today, but `fold.ts` claimed outright that
  "a replay is deterministic" for this case, and that was too strong to write.
- The detail sheet gains a text row seeded with the current title, so renaming is
  an edit rather than a blank box you must retype from memory.

## What would overturn it

If titles ever need history — who renamed it, and from what — the payload gains a
`from` field. §5 permits adding a field; it forbids changing an existing one's
meaning, so that is a legal, additive step and not a reopening of this decision.
