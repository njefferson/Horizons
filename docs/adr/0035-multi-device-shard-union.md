# ADR-0035 · Two devices, by folding in a shard — opt-in, additive, no server

**Status:** Accepted · **Date:** 2026-07-29

## Decision

A second import operation: **take in another device's copy**, adding the events
this store does not already hold and removing nothing. It sits beside the
existing **replace everything**, which is unchanged.

- **Opt-in**, by being a thing you press. Nothing runs on its own, nothing is
  sent anywhere, and the app is complete without it.
- **Additive.** It cannot lose you anything, so pressing it on the wrong file
  costs a few events and nothing else.
- **No server, no account, no network.** The file moves however you already move
  files — on iPadOS that is the Files app and iCloud Drive, which the app neither
  integrates with nor knows about.

## Why this is not the merge law 9 forbids

Law 9 and [ADR-0006](0006-backups-and-import.md) say import never merges, and
`import.merged` is a permanently banned event kind. That stands, and this does
not touch it.

**"Merge" there means resolving two versions of one state.** There is no honest
way to do it: two edited copies of the same thing, and something has to guess.
That is the thing with no good answer, and the ban is right.

**This is the union of single-writer shards**, which is what
[ADR-0003](0003-folder-mirror.md) has said the fold is since the spine was built:

> Each install writes **only its own** `log-<deviceId>.jsonl`. … Fold = **union
> of all shards** found in the folder.

Because a device only ever writes its own events, two shards **cannot disagree
about what happened**. They can disagree about what is *currently true* — and
per-field last-writer-wins over `(at, device, seq)` has settled that from the
beginning. Nothing new is being decided; the events are simply arriving by a
different route.

The route is the only part ADR-0003 got wrong for this app, and V-01 explains
why: Safari has no directory picker, so the automatic folder mirror cannot exist
on the reference platform. What this record adds is the **manual** version of the
same operation, which needs no API Safari lacks.

## Verified before it was built

Folding two devices' logs, through the real gate:

- the union holds everything from both, and nothing is left silent
- iPhone-first, iPad-first and any interleaving produce **identical state**
- taking the same copy in twice changes nothing a person can see

The one thing that had to be added is **de-duplication by event id**. The store's
index is unique on id, so appending one it already holds throws mid-write — the
exact shape that destroyed a store before `replaceAll` existed. The ordinary case
for anyone using two devices is handing the same file over again because they are
not sure whether they already did, so that path has to cost nothing.

## What it is not

- **Not automatic.** You press it, like the calendar export. There is no
  background sync on iOS and this app has no server to sync to.
- **Not conflict resolution.** Edit the same field on both devices before
  exchanging and last-writer-wins picks one, silently. That is inherent to the
  model and is stated rather than hidden.
- **Not a network feature.** It works with no connectivity at all. Noah uses
  cellular on both devices, but *"you can't assume everyone will"* (2026-07-29) —
  so nothing here may depend on being online.

## Consequences

- `shard.folded` joins the vocabulary: which device the events came from, how
  many were taken, how many were already held. A store should be able to say
  where its contents came from.
- Deletions travel, because a deletion is an event like any other. This is
  convergence, not accumulation.
- Two devices exchanging in both directions converge on the same state. Neither
  is a master.
- The exchange is as many taps as the export and import take. If that friction
  turns out to be too much in real use, the next question is a transport — and
  every transport worth considering (a relay, a native wrapper) crosses a line in
  the thesis, so it is Noah's call and a separate record, not an implementation
  detail of this one.

## What would overturn it

A transport that removes the manual step without a server — Safari shipping the
File System Access pickers would do it, and this operation would stay exactly as
it is underneath.
