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

- `test/held.test.ts` proves LWW against the capture that named it (in three
  arrival orders), the snapshot round-trip, and that an empty or whitespace title
  is refused rather than written — a nameless card is not a correction, it is a
  thing you can no longer identify.
- It asserts `isSilentRisk('node.renamed') === false`, so the vocabulary's
  declared answer and the code cannot drift apart.
- The detail sheet gains a text row seeded with the current title, so renaming is
  an edit rather than a blank box you must retype from memory.

## What would overturn it

If titles ever need history — who renamed it, and from what — the payload gains a
`from` field. §5 permits adding a field; it forbids changing an existing one's
meaning, so that is a legal, additive step and not a reopening of this decision.
