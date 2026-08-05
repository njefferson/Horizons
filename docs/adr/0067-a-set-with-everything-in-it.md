# ADR-0067 · A set with everything in it

**Status:** Accepted · **Date:** 2026-08-03

## Context

Asked 2026-08-03: for enough test data across every category and type to surface real data errors.

`src/sample.ts` already existed — the "set of test data i can import" he asked
for on 2026-07-29. It is relative-dated, it goes through the real `admit`, and
it was right when it was written at 0.22.0.

**Measured before building anything, by the same grep `tools/emitters.mjs`
uses:**

- The app emits **70** of its 90 event kinds.
- The sample set contained **8** of them, and 8 of 14 node kinds.
- Sixty-two emitted kinds appeared in no sample at all: every merge, every
  dependency, every decision, every stakeholder, the whole Not Now ledger, the
  whole trash, Composed Today, focus and resume, capacity and weight, notes,
  save-fors, ranges, reports, modules.

So **every surface built since 0.22.0 had never once been seen with data in it**
except whatever happened to be in one person's store. That is where the errors
he is asking about live, and 1.15.1 is the worked example: the coverage list
rendered every private journal entry as "(untitled) — held" for two releases,
and the smoke assertion written to catch exactly that was green throughout,
because the walk had no journal entry in it at the moment it looked.

This is the same shape as `emitters.mjs` (a noun nothing writes) and
`MERGE_DISPOSITION` (a field nobody ruled on): something grows, a list beside it
does not, and no instrument reports it because nothing is technically broken.

## Decision

**A second set, a gate that keeps it honest, and a sweep that reads it.**

### It is a FILE, not an append

The demonstration set appends to your store, and its own words admit the
consequence: *"yours to sort out afterwards."* At fourteen things that is a fair
trade. At the size needed to find real errors it is not, and **there is no verb
in this app that takes just those back out — there must not be, because that is
`import.merged` in costume** (law 9).

So this one writes a `planner-log` file. Bringing it in is the ordinary import,
which already seeds a fresh store, already warns *"this replaces the N things on
this device"*, and already refuses a file that folds to a silent node. No new
destructive act, no new typed-word guard, no new noun. The way back is the copy
you take first — which is also a live rehearsal of V-20's second half.

### It records nothing, and that is the decision

Both existing deliverers write `export.written`, and `src/copies.ts` reads that
noun to say **"Last copy"**. A generated file contains none of your data, so
recording one would make that row claim a backup that does not exist — the worst
possible lie for that row in particular, because somebody reads it precisely when
deciding whether they are covered.

`deliverGeneratedSet` therefore commits nothing. Nothing happened to your data,
so there is nothing for the log to explain. The smoke walk pins it: after making
a set, the store's event count and its `export.written` count are both unchanged.

### The gate: every kind is demonstrated, or says why not

`tools/sample-coverage.mjs` **generates the set and runs it through the real
`admit`**, then asks what kinds actually came out — not a grep, which would pass
on a kind named in a comment or built in a branch that never runs.

Both directions, like `emitters.mjs`: a missing kind fails, **and an exemption
for a kind the set now produces fails too**, or the reasons rot into the next
quiet lie. Nine exemptions, each with a written sentence:

- **Eight event kinds**, all one species — `snapshot.written`, `export.written`,
  `import.seeded`, `shard.folded`, `lapse.migration.ran`, `reentry.greeted`,
  `amnesty.offered`, `amnesty.accepted`. These are **acts of a device, not
  content of a life**: another device's greeting inside an imported log is noise,
  and `import.seeded` inside the file would assert an import that had not
  happened yet.
- **One node kind: `anchor`** — and this one is not a choice about the fixture,
  it is the gate. An anchor is not in `DEMAND_FREE_KINDS`, `anchor.defined` is
  not silent-risk and has no cure branch, so an anchor node is a **silent node**:
  `admit` refuses it and `inspectExport` would refuse the file. ADR-0057 defers
  anchors for exactly this reason.

### The sweep is the half that finds the errors

`test/big-sample.test.ts` folds the set once and runs **every exported
projection** over it, asserting what a person must never be shown: `undefined`,
`NaN`, `Invalid Date`, `[object Object]`, or the word `null`, in any rendered
string — across every list, every `*Words` function, `eventWords` over all ~1,570
events, the report in all four formats, and the calendar. Over 4,000 rendered
strings per run.

Plus, at a scale that can actually break them: nothing throws; the snapshot
round-trips; every cap states a total it has; and 1.15.1's invariant holds with a
journal entry, a settled weight, a spent resume card and three live pebbles in
one store.

### What is in it, and why those things

Coverage of kinds is necessary and not sufficient, so the content is built from
the shapes that have historically broken things here: past every cap (more than
25 held, trashed, declined, and matching a common search; a container with 31
children); a date more than a year out, a passed due, a passed park, a passed
suspense, and offsets far enough either side of today that a DST boundary is
crossed whenever it is generated; a title at the 200-character cap, diacritics
and CJK, a person named with an apostrophe, a note with newlines, and a title
beginning `=`; a three-deep merge chain and a merged node carrying decisions; a
dependency chain deep enough for the arithmetic to be a real number; upkeep at
several points across its comfort window; and **a journal that is really sealed**,
with the passphrase stated beside the button — a journal nobody can open would
demonstrate the locked state and nothing else.

Deterministic, from a seeded generator rather than `Math.random`: a failure
nobody can reproduce is not a finding.

## Consequences

- No new event kinds, no fold change, no gate change. `sample.ts` is untouched
  and keeps doing its job.
- **A new kind now has to be demonstrated in the same release that ships it**, or
  the sentence has to be written. That is the whole durable half.
- Two defects were found in the checks themselves while building them, both
  worth recording because both are the same species and one is a repeat:
  - The sweep's first version stringified whole `NodeState` objects, every one of
    which legitimately contains `"parent":null` — 94 hits, all of them its own
    scaffolding. **A check that flags its own instrumentation teaches you to
    ignore it.** It now sweeps rendered text only.
  - The trigger-list check searched every payload, which includes the journal's
    base64 ciphertext. A fresh IV per seal means random base64, and one run
    produced "gtd" inside it. It would have been a coin flip on every CI run for
    ever. **This is the second time that exact collision has happened here** —
    `journal.test.ts` records the first, where the substring `'bb'` matched the
    word "pe-**bb**-le". It now checks the words somebody wrote.
- Generating the set takes a visible moment on device — PBKDF2 at 600,000
  iterations plus ~1,570 events through `admit` — so the button says "Making it…"
  before it starts. A silent button reads as a broken one.
- The set is ~560 things from one constant, `BIG_SAMPLE_SIZE`. Bigger is one
  edit.

## What would overturn this

- **The sweep going quiet for a long time.** A breadth check that never fires is
  either proof or theatre, and the way to tell is to plant a fault in a
  projection and watch it name that projection. It was proved that way here
  (`ledgerRowWords` rendering "null asked · declined 3 Aug"), and it should be
  proved that way again rather than trusted.
- **Somebody importing the set and losing real work.** The import's own warning
  is the guard, and it predates this. If it turns out not to be enough, the
  answer is a better warning on the import — not a smaller sample.
- **Not by "the set is too big to look at."** It is not for reading top to
  bottom. It is for finding the one row that says something wrong.
