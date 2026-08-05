# ADR-0062 · The copy is surfaced, and the way back is one tap

**Status:** Accepted · **Date:** 2026-08-02 ·
**Executes** [ADR-0004](0004-ios-path.md)

## Context

Asked 2026-08-02: whether clearing Safari's website data loses everything.

The answer is yes. Everything Quietkeep holds lives in one IndexedDB database —
`events`, `snapshots`, and `kv` are three tables in it (`src/dexie-store.ts`, the
v2 migration). Clearing a browser's website data takes the lot. Persistent
storage does not cover this and never claimed to: persistent mode means the
browser will not clear the store **on its own** to make room, and somebody
clearing their own website data is the one case it was always outside.

Answering the question turned up three things, and none of them is a surprise to
this repo's own records. Two are decisions ADR-0004 took in the design phase and
nobody built.

**`export.written` had no reader.** Three call sites wrote it; the log viewer
rendered it as one line among thousands; nothing computed when the last copy was
written and no surface said so. ADR-0004's own consequence reads: *"The export
cadence has to be good enough to be the only mechanism… Exporting must be quick,
obvious, and hard to forget — and if it is forgotten, the app should say so
plainly rather than let the user assume they are covered."* The last clause was
never built, so the app let people assume.

**The Restore-on-empty action did not exist.** ADR-0004's decision paragraph
specifies it in terms — *"one prominent Restore action that opens the file picker
directly. Not a dialog explaining the situation, not a settings page to hunt
through."* What existed was a file input inside the ⓘ panel, inside a folding
group, under a heading, three deliberate acts from somebody looking at a blank
screen.

**And `kv` goes with the events, so a cleared browser is indistinguishable from a
fresh install.** `tour.seen` is a kv key. The walkthrough therefore runs again,
and the app greets a person who has just lost everything with *"Welcome to
Quietkeep."* The moment the copy most needs naming was the moment the app was
least equipped to name it.

## Decision

### The copy has a date, and the date is read from the log

`src/copies.ts` — pure, reading the **log**, never folded state, on the
`journalSeal` precedent from 1.13.0. Whether a copy exists is a fact about the
record, not about any node, and `fold` does not grow a field for it.

The ⓘ panel gains a **Last copy** row beside "Keeping your data", and one
sentence beneath when there is something to say.

### Not every `export.written` is a copy

This is the load-bearing distinction, and getting it wrong would be a worse lie
than the silence it replaces. One noun serves three acts: `deliverCopy`
(`exportAll`, whole, importable), `deliverRangeCopy` (a reading copy that
`inspectExport` refuses outright, ADR-0049), and the calendar `.ics`. Counting a
calendar file as somebody's backup would tell them they were covered on the day
they were not.

So a copy is recognised by its scope, `WHOLE_COPY_SCOPES` lives beside the
reader, and **`deliverCopy` refuses any scope outside it**. A hand-written list
the writers are not held to is the carry list with a delay fuse that 1.9.2 was
written about; this one cannot fall behind, because adding a whole-copy scope
without naming it there fails at the call site.

### "Stale" is measured on the log, never on the clock

ADR-0004 proposed the definition and attached the warning: *"it must not fire on
a device that is simply used less often."* Measuring the log satisfies that
exactly. A device nobody has touched for three weeks has nothing newer than its
copy and says nothing — where an elapsed-time rule would nag precisely the person
with nothing to be nagged about.

**Strictly after the copy event, not at-or-after.** The file is delivered before
`export.written` is committed, so a failed export can never leave the log
claiming a copy exists — and the consequence is that a file never contains its
own record. Read the other way, the sentence would be on permanently, one
millisecond after every export, which is how a warning becomes wallpaper.

`export.written` never counts as a change, whatever its scope. Bookkeeping about
copies is not unsaved work; without this, exporting a calendar file would make
somebody's data look stale.

### The way back, on the empty screen

`#restore` renders when **the store is empty** — `nodes.size === 0`, not "nothing
is held", which is also true of somebody who has finished everything or put it
all on the Menu. Offering that person a restore would be the app misreading a
good day as a disaster.

It does **not** put a second file input on the page. The note beside
`#import-file` records that on iPadOS the hidden-input trick loses the Files app
entry point, so there is exactly one real input in this app and this control
delivers you to it: panel open, group unfolded, focus on the input. A second one
would be a second chance to reintroduce the trap that comment exists to record.

The copy serves both readers without accusing either — a new person, for whom
this is simply not their situation, and somebody whose browser has just been
cleared, who is told the case is ordinary and the recovery is whole.

### The panel says what persistence covers

The note said *"the browser has agreed to keep your data"* and stopped, which is
true and reads as a guarantee it never was. It now says what the promise covers,
what it does not, and where the durable copy is — **worded from what persistent
mode means**, not as a claim about any particular iOS build. V-00 measured the
grant, the quota and a force-quit on real hardware; it has not measured the
clearing path. That is [V-20](../verifications.md), and until it is run this app
does not put a platform fact on screen that it has not run.

## Consequences

- No new event kind. `export.written` already carries `at` and `scope`; the
  release is a reader, a refusal and two surfaces.
- `paintStorage` now performs one `store.all()` — the same cost the purge count
  and the log viewer already pay, on a panel somebody has deliberately opened.
- A new whole-copy scope is now a two-file change by construction.
- **Nothing automatic.** ADR-0004 asked for "hard to forget", not "impossible to
  ignore".

## Refused, deliberately, and said rather than half-built

- **No automatic export, no scheduled backup, no reminder that nags.** A planner
  that asks you to do maintenance for it has become a thing to be done (laws 5
  and 8).
- **No count of unsaved items.** Work-since is a yes/no fact. A number is a score
  about how far behind you are, and this app does not keep those.
- **No badge, no red, no modal**, and nothing on the landing view except on an
  empty store, where the person is already looking for their things.
- **No "you are up to date" line.** Being covered is silence. Congratulating
  somebody for housekeeping is the shape this app refuses everywhere else.

## What would overturn this

- **V-20 coming back negative** — if clearing website data turns out not to reach
  a Home Screen app's store, the persistence sentence is overstated and should be
  narrowed to what was actually measured. It would not change the Restore action
  or the copy row, which stand on new devices and lost devices regardless.
- **Evidence that the sentence is being ignored.** If the copy note is on for
  weeks at a time it has become wallpaper, and the answer is a better moment to
  say it — not a louder one, and never a modal.
- **Not by "an automatic backup would be simpler."** It would; it also makes the
  app something that acts on your files without being asked, and ADR-0004 chose
  the manual path knowing its cost.
