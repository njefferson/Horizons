# ADR-0079 — Triage gets a way past a card, and it records nothing

*2026-08-06 · Accepted · shipped 1.25.0*

## Context

Reported from a phone, in four words: *paths in without a path out.*

The heat pass offered Hot and Cold. Clarify offered seven routes. **Neither had
a way past a card** — while Next up has had "Not this" since ADR-0030, and that
control records nothing precisely because "a person who has to justify skipping
something will avoid opening the app at all".

The same reasoning applies harder here, and had never been applied. `unclarified`
is oldest-first and stable, so a card somebody could not decide about was not
merely awkward for a moment: it was the **same card at the top of the surface
every time the app opened**, indefinitely. The surface whose job is to drain the
inbox had a card at its head that could not be got past, in an app for people
whose defining difficulty is starting.

Every collision in `docs/nd-collisions.md` that this app routes well —
initiation cost, the wall of awful, demand avoidance — describes exactly that
position: knowing what the question is and being unable to answer it. Triage
answered it with a forced choice and no exit.

## Decision

**"Not this one", on both passes**, beside the answers rather than among them:
every answer first, then the way out for when none of them is available yet.
Marked `ghost` like Next up's, so it reads as the way past and not as an eighth
route.

**It records NOTHING.** No event, no field, no count. An in-memory set, exactly
as `work.ts` keeps its `declined` ids, cleared on reload.

This is the whole decision and it is not a performance one. A skip that survived
a reload would be a durable list of what somebody could not face, kept by the
app on their behalf — the wall rebuilt one layer down, with a record attached.
Law 5 forbids scores about work; this would have been worse than a score,
because it would be a score about avoidance specifically.

**A passed card goes to the back, never away.** The queue prefers the first card
not passed this session, and when every one has been passed it starts again from
the top. An inbox that emptied itself because somebody skipped everything would
be the app hiding work — the opposite of law 1, and the exact fear that makes a
person keep forty tabs open instead of filing anything.

**The count is untouched.** It says what is in the inbox, which is what the
number means and what somebody would check it against. A count that shrank as
things were passed over would be keeping score of what was avoided, on the
surface where that would hurt most.

**The words say what happened, not what was decided.** "Not this one — come back
to it, nothing is recorded", and the announcement reads *"Passed over. It is
still in the inbox."* There was no decision; a label implying one would put a
verdict in somebody's mouth at the exact moment they could not reach one.

## Consequences

- No new event kind. The closed vocabulary is unchanged for a fifth consecutive
  release; the whole feature is a set that lives as long as the tab does.
- The smoke walk asserts the three things that matter: passing over moves on,
  the log length is **identical** before and after, and the count does not
  change. Then it reloads and asserts the card is back at the top, which proves
  the in-memory property and restores the surface for the rest of the walk.
- **The skip's hint broke the walk's idea of which pass was showing.** It
  detected a heat card as "the one with no hints", and this control carries a
  hint on both passes — deliberately, since *"nothing is recorded"* is the whole
  reassurance. The walk now asks the PROMPT, which says which pass it is in so
  many words and cannot be knocked over by adding a control. A heuristic that
  infers state from the absence of a thing breaks the first time that thing
  legitimately appears.
- **And the a11y walk opened the place picker by clicking "the last route in the
  row"**, which was true until this release put the way out after it. The walk
  passed over the card and then waited thirty seconds for a picker it had never
  opened. It reaches the control by name now.

  Two walks, two breakages, one shape: **inferring identity from position or
  from the absence of a thing.** Both held for a year and both broke on the same
  commit, because adding one control to a surface is exactly the change those
  inferences cannot survive. Anything a walk needs to find, it should ask for by
  name.

- The first version of the smoke block also left a card passed over, and two
  later checks that route specific cards by name went down with it. Leave the
  surface as you found it — the second time that has cost a run this week.
