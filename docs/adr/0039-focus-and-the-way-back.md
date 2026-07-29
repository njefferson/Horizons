# ADR-0039 — The resume card is written at the interruption, not at the exit

*2026-07-29 · Accepted · shipped 0.14.0*

## Context

`focus.started`, `focus.ended`, `interrupt.captured` and the three
`resume.card.*` nouns have been in `docs/event-vocabulary.md` since the first
draft. `fold` retired a spent card. `nextup` ranked a resume card **second**,
behind only a hard date — the highest position any item can hold short of a real
appointment. And nothing in the application could create one.

So the entire tier was ordering an empty set, and had been for five capability
releases. This is the fourth time this repo has shipped a projection with no path
to it (`.replan-context`, `upkeep.interval.set`, containment before 0.13.0, and
this), which is why ADR-0038 made the point and this one repeats it: **a
capability with no route to it is not a capability.**

Worse, the two pieces that did exist were quietly wrong in a way no test asked
about. `resume.card.created` folded only the node's **kind** — so a card knew it
was a card and could not name what it pointed at. The fixture in
`test/nextup.test.ts` built exactly such a card and asserted it led the list. A
way back into nothing at all, ranked above almost everything.

## Decision

### The card is written the instant the interruption is recorded

This is the whole design, and everything else follows from it.

Focus does not break because you decide to stop. It breaks because someone is
standing in the doorway, or the meeting starts, or the OS reclaims the tab. **You
do not get to press a button on your way out of the room.** A resume card created
on `focus.ended` would work perfectly in every case except the one it exists for.

So `interruptEvents` writes two events in one transaction: the interruption as an
ordinary inbox item, and the resume card for the work being interrupted. From
that moment the thread survives the app being closed, backgrounded, killed, or
the device dying. `test/focus.test.ts` asserts this through a real snapshot round
trip with no `focus.ended` ever written, and the smoke walk reloads mid-session
without stopping.

### While the session is still running, the card stays out of the way

It is saved, not surfaced. Being offered your way back into the thread you are
currently sitting in is the app interrupting you about having been interrupted.
`nextup` skips a card whose `resumeFor` is the running focus — a fact about
current state, so it needs no event of its own.

### The five words are asked for on the way out, and never required

`cue` is `string | null` and null is unremarkable. Nobody can produce five words
at the instant of an interruption; that is the situation. So the card written
then carries no cue, and one offered later — on the Stop sheet, when there is
time — lands on the **card that already exists** rather than creating a second
one competing for the same thread.

### Focus is state-level, not a node field

Two nodes can never both be "the thing being worked on". Modelling it per-node
would make that expressible, and something would eventually express it. `State`
carries `focus` and `focusStamp`, LWW over the same ordering as everything else,
so two devices that both started a focus converge on the later one rather than on
whichever folded last.

## Consequences

- **`focus.ended` reasons are vocabulary, not copy.** `abandoned` is the schema's
  word for "you stopped without finishing"; the surface says *"Stopped. It is
  waiting for you."* No word this app shows a person calls them a quitter.
- **Finishing spends any card for that work.** You finished it; offering a way
  back would be the app arguing with you.
- **A card pointing at trashed or completed work is not offered.** A way back
  into something you have already decided against is not a way back.
- **A spent card leaves the held list.** It carries a cure clock like every node,
  so without an explicit exclusion it sat in "Ready now" for ever reading "where
  you left off" about finished work — Next up had excluded spent cards since the
  tier existed, the held list had not, and the two surfaces stated opposite
  things about one node. Found by smoke, fixed in `held.ts`, tested.
- **The elapsed clock is the only thing in the app that runs on its own.** It is
  bounded by the section being visible, ticks at the resolution its words have
  (a minute), and **writes nothing**. A clock that logged would turn "how long
  have I been at this" into a stream of events nobody asked for.
- **Interruptions are counted as things you wrote down.** Same number as
  "interruptions suffered", opposite sentence, and only one of them is a thing
  you did.
