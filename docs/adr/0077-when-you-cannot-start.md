# ADR-0077 — The two things you can do when you cannot start, both on the offer

*2026-08-05 · Accepted · shipped 1.24.0*

## Context

`docs/nd-collisions.md` opens with the two collisions that sit between a person
and starting anything, and they are entries 1 and 2 because they are the pair
that actually stops a day.

**Entry 1, task initiation cost.** Barkley locates the ADHD deficit "at the
point of performance": the knowledge is intact and the launch mechanism is not.
Activation cost is highest when the thing is large or vague, and it is paid
before any progress exists to reward it — which is why "it'll only take ten
minutes" persuades nobody. The ten minutes were never the problem.

**Entry 2, the wall of awful.** Every avoidance attached to a task adds a brick,
until what stands between somebody and a ten-minute chore is the history rather
than the chore.

Everything the app had already built reduces how many things are being decided
between: one card, two unalike options, a cheap entry price, a wish that owes
nothing. None of it helps once the one thing on screen is itself too big to
begin, or too heavy to touch. The app's own azimuth check names initiation as
one of its thin halves.

They are the same moment from two directions, so they ship together.

## Decision

**Both acts live on the offer card**, because the moment they help is the moment
leaving the surface to do them is more than somebody can spend. That is the same
reasoning ADR-0073 used to put filing inside triage rather than behind a trip to
the detail sheet.

**Neither adds an event kind.** The closed vocabulary
(`docs/event-vocabulary.md`) is unchanged for a fourth consecutive release.

### Too big — a smaller bite

One field and a submit on the card, copying `#focus-interrupt-form`, this app's
settled shape for putting something down without leaving where you are. The bite
is an ordinary `action`, so every projection already knows how to complete,
decay, render and let go of it — the reasoning ADR-0042 and ADR-0074 both used.

**ONE EVENT, and the order is the whole point.** `node.created` carries an
optional `parent`, so the bite is born already under the offered item. The write
gate cures anything a silent-risk event leaves silent, and `node.created` is
one — so a bare create followed by a separate `node.parented` is evaluated in
the gap, where the new node is on no surface, under no clock and under no
parent. The gate would cure it with a same-day review clock and the bite would
arrive carrying a date nobody chose. `fileUnderEvents` records the same trap and
answers it by ordering two events; here one event removes the gap entirely. The
test proves it from the other side: a bare create in the same state comes back
with a clock.

**THE BITE HAS NO CLOCK OF ITS OWN.** Write-gate clause (d): a node parented to
something under a clock is not silent (`gate.ts:61`). The offered item is under
a clock by definition — an arrived clock is why it was offered — so law 1 is
satisfied without inventing a date.

That is not an optimisation, it is the product decision. Entry 8 is demand
avoidance, and it binds *self-imposed* demands hardest: writing "go for a walk"
on a list can make the walk impossible. A first step that quietly acquired a due
date would be a demand somebody made of themselves while trying to get unstuck,
and law 3 would bring it back as a replan card whether or not it was ever the
right step.

**One step, not a list.** The card shows the first live unfinished child. A card
that grows a list of sub-steps has become the pile in miniature, on the one
surface whose promise is that it has already chosen. The rest are in the sheet.

**The head does not change.** Naming a smaller start does not reorder the offer
out from under somebody mid-thought.

**Two completions, two names.** The card's Done already reads "Done with what is
next up"; the step's reads "Done with the first step". Two controls answering to
one name is a §4 failure, and this is the first card in the app to carry two
completions.

### Too heavy — say so, from the same place

**Not a second form.** The control opens the existing load entry with the
offered item attached, so the weight is recorded exactly as it always has been.

**`affects` had been complete and unreachable for eight releases.**
`pebble.raised` has carried `affects: NodeId[]` since 1.15.0,
`raisePebbleEvents` has accepted it since the day it was written, `pebbleWords`
already reads the names out of it — and no surface had ever set one. No test
covered the emitter at all. This is its first writer.

**The attachment is spent on submit and cleared when the entry closes.** A
sticky attachment would file the next unrelated weight against a task somebody
has stopped thinking about, and `affects` is a list a person reads — so a wrong
entry is not a wrong number, it is a false sentence about their week.

**The field is not pre-filled.** The placeholder names what the weight will be
about; the value stays empty, because the weight is not the task's title, it is
what is heavy about it. Pre-filling would put words in somebody's mouth on the
one surface built for their own.

**REFUSE any detection, permanently.** The catalogue is explicit that an
inferred wall is the ledger this app exists not to keep. Nothing here reads how
long an item has been held or how often it has been skipped — "Not this" records
nothing and always will. Weight exists because somebody said so.

## Consequences

- No new colour pair. The named step is `--ink` on the page background, the pair
  the card's own title already uses; the hint reuses `.detail-hint`. Both new
  states join the a11y registry in the same commit (hub LESSONS §28), including
  a driven state for a step being named, which is where the §4 name check earns
  its keep.
- The smoke walk drives both through the app's own controls, asserts the bite
  carries **zero** `clock.set` events of any origin, and then settles both
  weights and closes the entry — leaving the surface as it found it. The first
  version did not, and the load section further down opens that `<details>` by
  clicking its summary, which toggles: an entry left open is an entry that
  section then closes on itself, and its failure reads as a broken load surface
  rather than as this block's litter.
- `mountWork` takes the load entry's opener late-bound, because the load surface
  mounts after it. Binding eagerly would hand it the no-op stub.
- The offer card now has four lines and five controls when everything is
  present. That is the ceiling; anything further belongs on the sheet.
