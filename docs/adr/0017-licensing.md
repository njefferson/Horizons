# ADR-0017 · PolyForm Noncommercial 1.0.0

**Status:** **Accepted** · **Date:** 2026-07-27 · **Confirmed by the owner 2026-07-27**
("Doctrinal intent is correct")

## Decision

Ship under **PolyForm Noncommercial License 1.0.0**, the family standard.

**This overrides the design brief, which said AGPL.** The override is recorded
here rather than applied silently, because the brief is the owner's own document
and disagreeing with it is not a session's call to make quietly.

## Why

Doctrine §8 states the intent plainly: *"people may use it, but may NOT sell it
or use it commercially"*, and names PolyForm Noncommercial 1.0.0 as the family
standard in every repo unless a data source forces stricter.

**AGPL does not deliver that intent.** AGPL is strong copyleft — it compels
source disclosure, including over a network — but it **permits commercial use
outright**. Anyone may sell AGPL software or run it as a paid service, provided
they publish their source. If the goal is "not sold", AGPL is the wrong
instrument; it constrains *closing the source*, not *charging money*.

So the brief's "AGPL" and Doctrine §8's stated purpose are in genuine conflict,
and the hub's own rule resolves it: **where anything overlaps the Doctrine, the
Doctrine wins.**

The conflict is flagged rather than settled because it is possible the brief
means something §8 does not cover — a deliberate preference for the network
copyleft clause, say, accepting commercial use as its price. That would be a
legitimate choice and it is the owner's to make.

**Choosing PolyForm now costs nothing if it is wrong.** The repo has no external
contributors and no release, so the licence can change on one word. After a
public release with contributors it cannot, which is why the default is the
Doctrine's answer rather than the brief's.

## Consequences

- `LICENSE.md` is PolyForm NC 1.0.0, with the Required Notice pointing at
  `https://github.com/njefferson/Horizons`.
  > **Addendum, 2026-07-28.** The repo was renamed to `njefferson/Quietkeep`
  > ([ADR-0024](0024-name-quietkeep.md)) and the Required Notice URL moved with it, in the
  > same commit — that was always the condition for moving it. The decision here is
  > unchanged; only the address is. Recorded rather than rewritten in place, per the
  > append-only rule.
- The **Scope** block states explicitly that **the user's data is not covered by
  the licence, because it is not ours**. The licence governs the software; it
  makes no claim on the log, the snapshots, or the exports.
- Community content keeps whatever licence its contributor gives it, declared in
  the file. `template.loaded` records it.
- **PolyForm NC is not an OSI-approved open-source licence.** It must never be
  described as "open source" — that would be a false label (Doctrine §5). "Source
  available, noncommercial" is accurate.
- Noncommercial-use terms permit use by government institutions, educational
  institutions, and charities regardless of funding — worth knowing, given where
  this app will actually be used.

## Resolution

Asked and answered, 2026-07-27. The doctrinal intent was confirmed correct. The brief's
AGPL line is superseded by Doctrine §8; the family standard holds and this repo
does not diverge from it.

## What would overturn it

The owner's word. That is the whole of it.
