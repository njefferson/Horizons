# ADR-0032 · What you are holding is grouped, and can be ticked off in place

**Status:** Accepted · **Date:** 2026-07-29

## Decision

`#cards` becomes a **grouped list** (`src/held.ts`), computed and stored nowhere:

**Not sorted yet · Ready now · Coming up · Later · On the Menu · Done**

Empty groups are not rendered. Each row carries two real controls — open it
(`.card-open`) or tick it off (`.card-done`).

## Why

It was a flat, newest-first list of everything not trashed. Unrouted inbox items,
Menu items and completed work were mixed together with nothing to tell them apart
— at twenty items, the pile this app exists to stand between you and.

**It also stated a falsehood.** The gate re-clocks `done.marked` to keep a node
non-silent (law 1 does not exempt completed work), so a finished item genuinely
carries a clock for today, and the surface reported that as **"returns today"**.
Grouping fixes the cause: Done is tested first, so a completed thing says `done`
and stops claiming it is coming back (Doctrine §5 — no copy the data does not
support).

**Order of the tests is the design.** Done first; then Menu, because a Menu item
is demand-free by law and must never sit under a heading implying it is asking
(law 6); then unsorted, because triage owns those and the list should say so;
then by when it returns.

**Totality is the load-bearing property.** Every held node lands in exactly one
group, and the groups sum to `heldNodes(state).length` — the same definition the
coverage gauge counts (ADR-0030 §5). A list that quietly dropped an item would
mean something you are holding is shown nowhere, which is the worst failure this
surface can have.

**No score.** Groups are headings, not counts of things undone. There is no tally,
no streak, and Done sits last and quiet because it is a record, not a reward
(law 5).

## Consequences

- `test/held.test.ts` holds totality (including a 60-node fuzz of mixed states),
  the Done-is-honest property, Menu-over-clock precedence, the calendar-day group
  boundary, and malformed-date resilience.
- Each group is a real `<h3>` with its own `<ul>`. The first version made the
  heading an `<li>` with `role="presentation"`, which strips the listitem role and
  leaves a `<ul>` holding a non-listitem — axe caught it as a serious `list`
  violation, and it was one: the grouping would have been invisible to a screen
  reader.
- A card is a **row with two controls** rather than one large button, because a
  button inside a button is invalid HTML and the inline tick-off is what makes
  this a todo list rather than a list you can only read.
- Unrouted captures get no Done control: triage owns them, and offering two ways
  to dispose of one item in two surfaces is how the two come to disagree.
- **Fixed with it:** `handleUrlEntrances` and its undo called `render()` bare,
  dropping the `openDetail` handler, so after a link capture no card opened its
  sheet until the next re-render. Every render goes through one closure now, and
  the smoke walk asserts tappability *after* a URL capture (made to fail first).

## What would overturn it

If the six groups turn out to be five or seven in real use, that is a change to
`src/held.ts` and this record — not to the log. Grouping is computed and stored
nowhere, so no migration is involved and nothing already written needs revisiting.
