# ACCESSIBILITY.md — Quietkeep

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

**Stood up for the app 2026-07-28** — until then this section described the
brand-token check only, which was the V-10 shape (a claimed gate that was a
sentence). `tools/a11y.mjs` now audits the **rendered app** in CI: a per-state
selector registry (a selector that stops matching FAILS — silently skipping what
a check cannot find is how gates rot), contrast computed against the resolved
ancestor background in both themes, axe 4.10.2 per state, target sizes, and
B-04's hardest viewport, 320px at 200% text, where the page may not scroll
sideways. Proven to bite both ways before being trusted (§6): a broken
`--ink-soft` produced 16 failures and exit 1, and the axe half caught **F-01**
on its first run.

### B-09 · Language
COGA-informed: plain words, one idea per line, no idioms, no shame. Error and
empty states say what happened and what to do. Nothing is phrased as a rebuke.

### B-10 · The brand colours — the first colour decision this app has made
Everything above states *channels*. These are the first actual values, and they
are recorded here rather than in a stylesheet because B-08's rule is that a new
foreground/background pair joins the gate **in the same commit that introduces
it**. `tools/brand.mjs` is that gate for these.

| Token | Value | What it is |
|---|---|---|
| `--field` | `#F4F1E9` | warm paper — the field the mark sits on |
| `--wall` | `#33425F` | the sheltering form — a wall, not a marker |
| `--light` | `#F5C978` | the lit opening. The **only** warm note in the identity |
| `--type-strong` | `#F7F4EE` | the wordmark |
| `--type` | `#E9EDF4` | secondary type on dark |

**Measured, not eyeballed** — every pair the mark actually renders:

| Pair | Ratio | Needs | Why that threshold |
|---|---|---|---|
| wall / field | **8.92:1** | 3:1 | WCAG 1.4.11, non-text graphical object |
| light / wall | **6.48:1** | 3:1 | same |
| wordmark / plate | **8.50:1** worst | 4.5:1 | measured against the actual social-preview pixels behind it, at the worst sample |
| tagline / plate | **8.45:1** worst | 4.5:1 | same |
| rule / plate | **7.34:1** worst | 3:1 | same |

### Why the field is light, and why that was not just a taste call

The first palette was near-black (`#131B2E` field, `#5C6E8F` wall) and Noah asked for
something less dark. **Simply paling everything is impossible here, and the arithmetic says
why.** The mark is a three-step ladder — wall must clear 3:1 above the field, and the light
must clear 3:1 above the wall — so it needs roughly a **9:1 span** end to end. A light field
leaves no room upward; every "lift the whole thing" variant failed the second step at
2.0–2.4:1.

**So the wall inverted instead.** Light paper, dark wall, warm opening. The opening still
reads as *lit* because what surrounds it is dark — that is the one property the whole idea
depends on, and paling the wall would have destroyed it.

The lighter palette is also **measurably more legible**, which is the part worth keeping:
the ladder went from 3.34:1 / 3.45:1 to **8.92:1 / 6.48:1**, and in grayscale the old wall
nearly merged with its field at 32–48px where the new one stays crisp. The taste call and
the measurement agreed.

The social preview's source image is dusk-dark and is lifted `brightness(1.35)
saturate(1.05)` in the composite. Heavier lifts were rendered and rejected: at 1.8 and 2.4
the scene flattens and the single small lamp stops reading as a light, which is the whole
subject.

**The warm note is never an alarm.** `--light` is the app's one warm colour and it
means *lit*, *held*, *here* — never *late* and never *wrong*. B-01's no-red-walls
rule is a palette rule as well as a pressure-surface rule: **no red or amber
enters this identity**, because a colour that means "attention" in the brand will
eventually mean "you failed" in the UI.

**Grayscale survival is checked, not assumed.** The gate asserts the shelter and
the field stay separated with hue removed — the same pass condition B-01 sets for
every pressure surface, applied to the identity so the two cannot drift apart.

**Proven in CI, not just locally.** Spine **run 9** (`4f03e9a`) — the palette above —
watched green, with every ratio identical to the local run: `8.92:1`, `6.48:1`,
`8.50:1`, `8.45:1`, `7.34:1`. Run 7 was watched the same way on the superseded
palette. Per [V-10](docs/verifications.md), a gate nobody has watched pass is a
file. CI installs **chromium build v1194**, the revision `playwright-core` 1.56.0
pins to — the matched pair holds on a machine that is not this sandbox.

### B-11 · The app's own colours, both themes
B-10 is the identity. These are the **interface** tokens in `public/app.css`,
which is a separate question — an icon is seen once, a surface is lived in.

| Token | Light | Dark |
|---|---|---|
| `--bg` | `#F4F1E9` | `#141A26` |
| `--surface` | `#FFFFFF` | `#1E2637` |
| `--ink` | `#1B2333` | `#F2F0EA` |
| `--ink-soft` | `#4C5670` | `#B3BCCE` |
| `--line` | `#CFCABD` | `#3A4560` |
| `--accent` | `#33425F` | `#AFC0DC` |
| `--warm` | `#7A4E00` | `#F5C978` |

**Measured in both themes**, worst case of the two:

| Pair | Light | Dark | Needs |
|---|---|---|---|
| ink / bg | 13.94:1 | 15.29:1 | 4.5:1 |
| ink / surface | 15.73:1 | 13.28:1 | 4.5:1 |
| ink-soft / bg | 6.48:1 | 9.13:1 | 4.5:1 |
| ink-soft / surface | 7.31:1 | 7.93:1 | 4.5:1 |
| accent / bg | 8.92:1 | 9.45:1 | 3:1 |
| accent / surface | 10.07:1 | 8.21:1 | 3:1 |
| warm / surface | 7.20:1 | 9.73:1 | 4.5:1 |
| line / surface | 1.64:1 | 1.59:1 | — |

**`--warm` is not the brand warm, and that is the point.** `#F5C978` is a
*light* — beautiful as a lit opening, unreadable as text on paper. In the light
theme the interface uses a deep amber at 7.20:1 instead. **The same meaning has to
survive a different job, and the way it survives is by changing value, not by
being used at the wrong contrast.**

**A card does not rely on its fill.** `--surface` against `--bg` is only ~1.14:1
in both themes, so cards carry a border. One channel is never enough — the same
rule as B-01, applied to layout instead of pressure.

**The gate covers these.** `tools/brand.mjs` reads the tokens out of
`public/app.css` for both themes and fails on any pair below its floor, so B-08's
same-commit rule is enforced rather than promised.

---

## Part 2 — Findings register

Rows are appended as found.

### F-01 · Storage details invalid as a definition list to assistive tech
Found: 2026-07-28 · `tools/a11y.mjs`, its **first ever run** (axe `definition-list`, serious)
Rule: WCAG 1.3.1 Info and Relationships
Detail: the ⓘ panel appended its storage explanation as a direct child of the
`<dl>` — first as a `<p>`, and axe 4.10.2 rejected the `<div>` retry too. A
screen reader walking the list would meet prose where a term/definition pair
belongs. Moved outside the list as a sibling paragraph; the registry now audits
it at `#storage-note` (7.20:1 light / 9.73:1 dark).
Status: **FIXED in 0.2.2**, same commit that stood the gate up — which is the
point of B-08's same-commit rule.

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
