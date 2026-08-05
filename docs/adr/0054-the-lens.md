# ADR-0054 · The lens: what you look at, never what is held

**Status:** Accepted · **Date:** 2026-08-01

## Decision

Q-10's recorded shape, built on the owner's word ("work on duplicate handling and
lenses"). A **lens** is one live top-level container — a "Home" or "Work"
area — chosen from a select above the held list. While it is active, the held
list's ROWS are filtered to things sitting anywhere beneath that root
(lineage membership, one cycle-guarded BFS in `src/lens.ts`), and a line
states law 1 out loud every time: *"Looking at ⟨root⟩. Everything else is
still held and still comes back — a lens changes what you see, never what
Quietkeep holds."* The line carries no count — a number there would be a
headline about everything else (law 8).

**The never-filter fence.** Q-10's closure is the law: "a filter may change
what you are looking at and may never change what the app is holding.
Anything else is an archive with a friendlier name (law 3)." So the lens
touches the held list's rows and NOTHING else — the coverage gauge, replan,
re-entry, Next up, search, the calendar export, and the record all read whole
state, take no lens argument, and therefore **cannot** differ under a lens;
the type system is the fence and the unit tests restate it at runtime. A
lensed Next up in particular would be two queues — the vault Q-10 refused,
wearing a friendlier name.

**The choice is a device view preference, not history**: kv (`lens.root`,
the badge pattern), never an event. What you were looking at is not something
the record should carry, and it does not travel between devices. If the
chosen root stops being a live container (trashed, merged away, re-parented),
the lens quietly stands down rather than filtering by a ghost.

**The filter runs BEFORE the cap slices.** A group's "N more" states what the
lens left, or the cap would lie about how many it held back. A group emptied
by the lens is simply absent — like an empty group always is.

## Why not the alternatives

- **Vaults / separate stores** — refused in Q-10 itself: two stores is two
  gauges, two Next ups, two places to lose something.
- **Tags or a "context" field** — the refused priority field in costume
  (recorded refusal); lineage already says where a thing belongs.
- **Persisting the lens as an event** — the log is the history of what you
  HOLD, not of where you were looking; a view preference in the record would
  be noise wearing the append-only suit.

## Consequences

- Loose things (no container) belong to no lens and step aside while one is
  active — still held, still clocked, and the lens line says so.
- The lens select's choices are exactly the tree's roots (`lensChoices ===
  roots`) — one definition of "top level" across the app.
- B-25 records the accessibility bindings; the row and its active-state line
  are in the contrast registry from the same commit.

## What would overturn it

- **The never-filter fence: nothing.** A lensed Next up or a lensed gauge is
  Q-10's refused vault with a select instead of a wall; the fence is the
  decision. If real use shows the WHOLE-life Next up is wrong for the owner, that
  is a Next-up question to bring to him, not a lens argument.
- **The row-filter shape, by his word** — if the select above the list proves
  the wrong furniture (mis-taps, or the line grows tired), the surface can
  change freely; membership-by-lineage and the spoken law-1 line go wherever
  it goes.
