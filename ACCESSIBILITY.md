# ACCESSIBILITY.md — Horizons

Append-only register. Rows are **never deleted and never silently edited**. A
fixed row keeps its original number and gains a resolution line naming the
release that fixed it. Doctrine §4 governs; this file records how it is applied
here, plus every finding as it is found.

Target: **WCAG 2.2 AA**, with COGA-informed patterns. A published conformance
note ships with v1.

---

## Part 1 — Design-time bindings

Doctrine §4 requires the non-hue channel be **stated before the code is
written**. This section is that statement. It exists before any UI does, on
purpose. Nothing here may be decided later at the keyboard.

### B-01 · Pressure and decay
The single decay primitive `(last_done, comfort_window, rising pressure)` drives
most of what the user sees. Pressure is continuous, and it is carried by **four
redundant channels**, of which hue is the least important:

| Channel | How pressure is encoded |
|---|---|
| **Position** | Higher pressure sorts higher in the list. Order alone conveys the ranking. |
| **Fill** | A horizontal fill bar, 0–100% of the comfort window. Length is readable with no colour perception at all. |
| **Luminance** | Fill darkens monotonically as pressure rises. Survives a grayscale render — the pass condition, not a nicety. |
| **Text** | Every item states its own status in words ("ready again", "ready in 3 days"). |

Hue may reinforce, never carry. **A grayscale render of any pressure surface
must remain fully readable** — this is a CI check over rendered screenshots, not
a designer's judgement.

**No red walls.** Rising pressure never terminates in an alarm colour, because
there is no failure state to alarm about (product law 5). The gradient runs
toward *emphasis*, not toward *danger*.

### B-02 · The coverage gauge
Reads as text first — "everything returns · 0 silent". The number is the
information; any colour is decoration. It is a `<button>` (it expands to show
each item's return date), so it is keyboard-reachable and announces its expanded
state. Never a bare `<div>` with a click handler.

### B-03 · Capacity, heat, and magnitude
Three places use small ordinal scales: capacity (low / steady / sharp / unsure),
the heat pass (hot / cold), pebble magnitude (pebble / rock / boulder). All three
are **labelled in words on the control itself** and differentiated by glyph and
size. Colour is never the distinguishing feature. Per LESSONS.md, the accepted
filter-chip pattern is used — **strike-through is banned for off-states**, it
reads as deleted.

### B-04 · Sizing
No fixed size may ignore the space available (Doctrine §4, LESSONS.md §6). Every
panel, card, and sheet measures the space **at the moment it opens** — never a
constant, never a value captured at startup. **A floor must never exceed the
space available.** Content that cannot fit scrolls inside itself. Type is sized
in `rem` so the user's *text-size* preference is honoured, not only page zoom.

Gate viewports include small-phone-at-200%-text. The 320px/240px place-card
failure in a sibling app is the reason this is a gate and not an intention.

### B-05 · Motion
Reduced-motion is honoured throughout. The pressure gradient, the gauge, and the
replan card all have static presentations. No animation is load-bearing for
meaning.

### B-06 · Interaction and focus
Keyboard always. `:focus-visible` rings are never removed. Touch targets ≥44px.
Real `<dialog>` and `<button>` elements. Zoom never locked. The 2-second capture
budget applies to the keyboard path too — capture must be reachable without a
pointer.

### B-07 · Modes
Dump · Review · Work (and Rest) are modes, and Doctrine §3 requires a mode
announce itself with a standing indicator and an obvious exit. The current mode
is in a live region so a screen-reader user learns of a mode change without
hunting for it.

### B-08 · The contrast gate
Contrast is **computed, never eyeballed** — a CI check that exits non-zero on any
failure, run in both themes. **A new foreground/background pair is added to the
gate in the same commit that introduces it.** No exceptions, including for
disabled states and placeholder text.

Known instrument limitation, inherited from a sibling app: automated audits
silently drop colour-contrast to `incomplete` (not `violations`) for elements
under a CSS transform. Any transformed surface is checked by explicit
measurement, not by trusting the audit's summary. A green axe run over
transformed content proves nothing.

### B-09 · Language
COGA-informed: plain words, one idea per line, no idioms, no shame. Error and
empty states say what happened and what to do. Nothing is phrased as a rebuke.

---

## Part 2 — Findings register

No findings yet — there is no UI. Rows begin at F-01 and are appended as found.

Format:

```
### F-01 · <one-line symptom>
Found: <date> · <how — audit, device, report>
Rule: WCAG <SC> / Doctrine §4 <clause>
Detail: <what was measured, with the number>
Status: OPEN | FIXED in <version.capability.iteration>
```

A row's `Detail` must carry the **measurement**, not an impression — "popup
buttons measured 1.26:1", not "contrast looked low".
