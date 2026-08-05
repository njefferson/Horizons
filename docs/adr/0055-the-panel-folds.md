# ADR-0055 · The panel folds: four groups, closed until asked

**Status:** Accepted · **Date:** 2026-08-01

## Decision

The ⓘ panel carries everything — help, storage, import, extras, the record,
the release notes — and everything at once was too much to stand in front of.
found on device: accent rules separated small things while nothing separated
the big ones, and *"the information panel is carrying too much"*. He offered
two shapes: the sections collapse, or a separate settings surface. The panel
folds — the smaller change, and it keeps the family's one-panel promise (one
place that has everything, behind one ⓘ).

- The four **groups** — Help, Your data, Extras, About — sit behind their own
  headers, each header a real disclosure button (`aria-expanded` /
  `aria-controls`, target-height, the caret carrying state so the name never
  changes under the reader). **Closed by default.**
- **Which groups you keep open is remembered per device** (kv, the badge/lens
  pattern) — a view preference, never an event. A returning person finds the
  panel shaped the way they left it.
- **The opening stays above the fold**: what Quietkeep is, how to use it, and
  the install steps — the calm first screen a new person needs.
- **The way out never folds**: the Close control and the sticky dismiss stay
  outside every group.
- **The walkthrough's handoff unfolds Your data**: its last step promises
  "keeping your data safe is the first thing you do", and a promise behind a
  fold is not kept.

## Why not a separate settings surface

A second surface is a second place for things to be, and "where did that
control go" is exactly the question this audience should never be handed.
The panel stays the one place; the fold changes how much of it stands in
front of you, not where anything lives. If the panel keeps growing past what
four groups can hold, this decision is the one to revisit.

## What would overturn it

- **The default-closed posture, by the owner's word** — if real use shows he (or
  anyone) reopens the same groups every single time, per-device memory should
  already absorb that; if it does not, default-open for remembered groups is
  the first fallback, and a settings split is the second.
- **The one-panel promise itself is Doctrine-level** and not this ADR's to
  overturn.
