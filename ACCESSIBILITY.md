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
must remain fully readable.** No pressure surface exists yet (Phase 0/1 ship
capture and a flat list), so there is nothing to render — but when the first one
lands, a grayscale screenshot check lands in the same commit, per B-08's rule.
Until then this is a design commitment, **not** a running gate, and it is named
as such rather than claimed as one.

**No red walls.** Rising pressure never terminates in an alarm colour, because
there is no failure state to alarm about (product law 5). The gradient runs
toward *emphasis*, not toward *danger*.

### B-02 · The coverage gauge
Reads as text first — "everything returns · 0 silent". The number is the
information; any colour is decoration. **Today it is a static `<p>`** that reports
the count; when it gains the expand-to-show-return-dates behaviour it becomes a
real `<button>` with `aria-expanded`, never a bare `<div>` with a click handler.
The interactive form is a design commitment for when the behaviour exists, not a
description of the current element.

### B-03 · Capacity, heat, and magnitude
Three places use small ordinal scales: capacity (low / steady / sharp / unsure),
the heat pass (hot / cold), pebble magnitude (pebble / rock / boulder). All three
are **labelled in words on the control itself** and differentiated by glyph and
size. Colour is never the distinguishing feature. Per LESSONS.md, the accepted
filter-chip pattern is used — **strike-through is banned for off-states**, it
reads as deleted.

### B-04 · Sizing
No fixed size may ignore the space available (Doctrine §4, LESSONS.md §6). Type is
sized in `rem` so the user's *text-size* preference is honoured, not only page
zoom, and content that cannot fit scrolls inside its own container rather than
the page. Both are **enforced today**: `tools/a11y.mjs` asserts zero page
overflow (and zero dialog overflow) at 320px with 200% text, in both themes.

**A floor must never exceed the space available.** The stronger form — every
panel *measuring* the space at the moment it opens, rather than trusting CSS —
is a design commitment for the surfaces that will need it (the sheets and
overlays of later phases); nothing in Phase 1 measures at runtime, and this does
not claim otherwise. The 320px/240px place-card failure in a sibling app is why
the viewport check is a gate and not an intention.

### B-05 · Motion
Reduced-motion is honoured throughout. The pressure gradient, the gauge, and the
replan card all have static presentations. No animation is load-bearing for
meaning.

### B-06 · Interaction and focus
Keyboard always. `:focus-visible` rings are never removed — the gate Tab-navigates
to every control and measures the ring's style, width and contrast. Touch targets
≥44px tall and ≥24px wide, checked in every rendered state. Real `<dialog>` and
`<button>` elements. Zoom never locked. The 2-second capture budget applies to the
keyboard path too — capture must be reachable without a pointer.

### B-07 · Modes
Dump · Review · Work (and Rest) are modes, and Doctrine §3 requires a mode
announce itself with a standing indicator and an obvious exit, with the current
mode in a live region so a screen-reader user learns of a change without hunting
for it. **No mode exists yet** — Phase 1 is capture only. This is the binding for
when they arrive; the one live region shipped today (`#status`) reports capture
confirmations, not mode.

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
sideways. Proven to bite both ways before being trusted (§6): a broken `--ink-soft`
produced failures and exit 1, and against the adversarial attack that fooled its
first version (rings/placeholder/targets removed) it produced 23 failures — see
F-02. **Watched green in CI**, per V-10's rule that a gate nobody has watched
pass is a file; the observed run is recorded in NOTES.md's log.

### B-12 · Containment and Review (0.13.0)
Two surfaces added, both audited in the same commit that introduced them.

**Review** (`#review`) carries no colour of its own. Its rows use the same
`--ink`-on-`--bg` and `--ink-soft`-on-`--bg` pairs as every other list in the
app, measured at **13.94:1** and **6.48:1** light, **and its heading at 15.73:1**.
That is the point rather than an economy: this is the surface that tells you
something is structurally wrong, and it must not be the one place the app raises
its voice. There is no alert colour here to check, and the *absence* is the
measurement (law 5, and B-01's rule that nothing rides on hue).

**`#detail-place`** — the line stating what a thing is part of — is `--ink`, not
the quieter `--ink-soft` used for hints. A structural fact is not an aside. It is
registered under its own gate state, `detail sheet, inside something`, because it
renders **only** when the node has a parent; put in the base sheet's registry it
matched nothing and the gate said so, which is the registry rule in B-08 working
rather than a thing to route around. Measured 15.73:1 light, 13.28:1 dark.

**`#detail-parent`** shares `#detail-feeds`' rule exactly, so the sheet's two
structural selects cannot drift into looking like different kinds of control.
Both are `min-height: var(--target)`; targets pass at 44px in both themes.

### B-13 · Focus and the way back (0.14.0)
The focus surface carries no colour of its own and nothing on it counts down.
Elapsed time is stated in the quiet token, the same one every other "when" line
uses — it is a fact, not a pace to keep up with, and there is no threshold at
which it changes appearance. That absence is deliberate and it is the point
(law 5, B-01).

**Two contrast failures the gate caught in this work, both fixed:**
`#focus-cue::placeholder` measured **3.28:1 in dark** on `--ink-soft`/`--surface`.
A placeholder is text someone has to read to know what the box wants, so it is
held to 4.5:1 like any other text — now `--ink` at full opacity, matching
`#capture::placeholder`. Both placeholders are in the registry.

**Two overflow failures at 320px/200%, both fixed:** adding "Work on this" made
`.card` a three-control row that could not wrap (**42px past the edge**), and
once it wrapped the button itself was still wider than the viewport at 200%
(**12px past**). `.card` now wraps; `.card-focus` is `max-width: 100%` with a
wrapping label. Both were found by the gate rather than by looking, and the
overflow check now **names the offending element** — "42px of overflow" said the
page was broken and nothing about where, which cost two hand-written probes.

**`.focus-elapsed` is UNMEASURED, and this is the honest record of it.** The line
renders only after a whole minute has passed (`focusWords` returns null below
that, because "0 minutes so far" is a number pretending to be information), and a
CI walk that sat for sixty seconds in each theme would spend two minutes to
measure a pair that is already measured: `--ink-soft` on `--surface`, identical
to `.review-count` and `.replan-count`, both of which ARE in the registry. That
is an **argument, not a measurement** — the same treatment and the same wording
as `.replan-context`, recorded rather than quietly assumed.

### B-14 · The person lens (0.15.0)
`.people-why` — *"With Sam for three weeks."* — is the lowest-contrast text on
the surface and it is load-bearing: it is the fact you use to decide whether to
mention something. `--ink-soft` on `--bg`, measured in both themes and in the
registry.

**There is no colour that means "they have had this a while", and there will not
be.** Duration is stated in words at one weight, and no threshold changes the
appearance of anything. B-01's rule that nothing rides on hue applies here for a
second reason as well: a colour aimed at how long someone else has taken is this
app passing judgement on a third party, which it does not do (law 5).

The surface deliberately shares `.review`'s shape. Both answer *"what is not
ordinary work right now"*, and two different-looking boxes for the same kind of
answer is a thing to learn rather than a thing to read.

`#detail-person::placeholder` is `--ink` at full opacity, matching every other
placeholder in the app after the 0.14.0 finding — a placeholder is text someone
must read to know what the box wants, so it meets 4.5:1 like any other text.

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
| warm / bg | 6.38:1 | 11.21:1 | 4.5:1 |
| line / surface | 3.45:1 | 3.42:1 | 3:1 (WCAG 1.4.11 — it is a control boundary) |

**`--warm` is not the brand warm, and that is the point.** `#F5C978` is a
*light* — beautiful as a lit opening, unreadable as text on paper. In the light
theme the interface uses a deep amber at 7.20:1 instead. **The same meaning has to
survive a different job, and the way it survives is by changing value, not by
being used at the wrong contrast.**

**A card does not rely on its fill.** `--surface` against `--bg` is only ~1.14:1
in both themes, so cards carry a border. One channel is never enough — the same
rule as B-01, applied to layout instead of pressure.

**`--line` is a graphical object, not decoration.** It draws the boundary of the
text input and every ghost button, so it is held to WCAG 1.4.11's 3:1 and joins
the gate (`brand.mjs` UI_PAIRS) — the audit found it carved out with no floor at
1.45:1, invisible to both gates.

**The triage surface (Phase 2) adds no new tokens, only one new pair.** The heat
and clarify cards live on `--surface`; the route buttons and the do-now timer sit
on `--bg`. Every pairing was already covered except the timer label, `--warm` on
`--bg` — added above and to the `brand.mjs` gate in the commit that introduced the
timer. The rendered surface is also audited directly: `tools/a11y.mjs` renders
both the heat and clarify passes in both themes, measures the route buttons' focus
rings, and judges the lowest-contrast text on the surface — the route hint
(`--ink-soft` on `--bg`, 6.48:1 light).

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

### F-02 · The a11y gate passed a build with focus rings, placeholder and target sizes broken
Found: 2026-07-28 · adversarial audit of the gate itself
Rule: B-06 (focus rings, ≥44px), B-08 (no exceptions incl. placeholder/disabled)
Detail: a reviewer copied `tools/a11y.mjs` verbatim, deleted `:focus-visible`
outlines, dropped the placeholder to 1.44:1, shrank a link to 20px and made the
input border transparent — the gate printed **66 ok, 0 FAIL**. The values shipped
were fine; nothing measured them. `sampler` never passed a pseudo-element, no
function read `outlineWidth`, `auditTargets` tested height only and in one of
three states, and the everyday (return-visit) dialog was never rendered.
Status: **FIXED in 0.2.3** — the gate now samples `::placeholder`, Tab-navigates
and measures each focus ring's style/width/contrast, checks width and height in
every state, renders the return-visit dialog and the dialog at 320/200, runs axe
at the stressed viewport, and enables reduced-motion. **Re-run against the exact
attack: 23 failures, exit 1.** The gate was made to fail before being re-trusted
(§6), a second time and harder.

### F-03 · The text input and ghost buttons had no 3:1 boundary; `--line` was carved out of the gate
Found: 2026-07-28 · audit
Rule: WCAG 1.4.11 (non-text contrast of UI-component boundaries)
Detail: `--line` drew the border of `#capture` (a form control) and every ghost
button at **1.45–1.83:1**, and B-11 listed the pair with "Needs: —" so no gate
watched it. A control's visible boundary needs 3:1.
Status: **FIXED in 0.2.3** — `--line` retuned to `#8E8A7F` (3.45:1 on surface,
3.05:1 on bg) / `#6A7896` (3.42 / 3.93), and its floor added to `brand.mjs`
`UI_PAIRS` and to B-11, so the carve-out is closed.

### F-04 · A long error message overflowed the page sideways at 320px/200%
Found: 2026-07-28 · audit
Rule: WCAG 1.4.10 Reflow
Detail: `#status` used `overflow-wrap: normal`, so an error containing one
unbroken token (a quoted id, a URL) produced 449px of horizontal page scroll at
the reference stress viewport.
Status: **FIXED in 0.2.3** — `#status` and every dialog descendant wrap with
`overflow-wrap: anywhere`; the gate now asserts page AND dialog overflow ≤1px.

### F-05 · Focus fell to `<body>` after every triage tap
Found: 2026-07-29 · Phase 2 adversarial audit
Rule: WCAG 2.4.3 Focus Order
Detail: the clarify surface rebuilds its buttons with `replaceChildren` on every
heat/route tap, removing the control the user just activated; nothing moved focus,
so a keyboard or screen-reader user was dumped to `<body>` and had to Tab back down
after each of up to twelve taps — in a flow whose whole point is "keyboard-first,
one card at a time". `auditFocusRings` could not see it: it blurs and Tabs from
scratch and never activates a control to see where focus lands.
Status: **FIXED (0.4.0, pre-promote)** — focus moves to the prompt heading
(`tabindex=-1`), or to the capture line once the inbox is clear; the prompt, not the
first route, so an accidental double-activation cannot fire Trash. `a11y.mjs` now
activates a route and asserts focus is not `<body>`, made to fail first.

### F-06 · A dated card status overflowed the card at 320px/200%
Found: 2026-07-29 · Phase 2 a11y gate (downstream of [V-13](docs/verifications.md))
Rule: WCAG 1.4.10 Reflow
Detail: `.card-when` was `flex: 0 0 auto` — fixed to its content width, never
wrapping. When the same-day clock reads a dated "returns \<day\>" rather than the
short "returns today" (the end-of-UTC-day issue, V-13), the label was wide enough to
push the page ~6px sideways at the reference stress viewport.
Status: **FIXED (0.4.0, pre-promote)** — `.card-when` is `flex: 0 1 auto; min-width:0`
so it shrinks and wraps within the card on its own line; the gate asserts page
overflow ≤1px in this state.

### F-07 · A `display` rule silently defeated the `hidden` attribute
Found: 2026-07-29 · Phase 3 smoke walk
Rule: WCAG 4.1.2 Name, Role, Value (state must match what is rendered)
Detail: `.coverage { display: flex }` overrides the user-agent's
`[hidden] { display: none }`, so the coverage list rendered **fully expanded**
while its `hidden` attribute was set and its toggle button reported
`aria-expanded="false"`. Assistive tech and sighted users were told two different
things, and every gate that asked "is it hidden?" by attribute was satisfied. Any
element given a `display` value is exposed to this; it is a property of the
cascade, not a one-off mistake.
Status: **FIXED (0.5.0)** — a global `[hidden] { display: none !important }` now
leads `app.css`, so no future `display` rule can reintroduce it, and the smoke
walk asserts the list starts closed and that `aria-expanded` tracks it.

### F-08 · Finishing the last item stranded focus on `<body>`; failures were announced but invisible
Found: 2026-07-29 · Phase 3 adversarial audit
Rule: WCAG 2.4.3 Focus Order; Doctrine §5 (honesty) for the second half
Detail: two defects in the same surface. (1) `work.ts` moved focus only
`if (!REGION.hidden)` — but the region hides *precisely because* the last item was
completed, so finishing the final thing left focus on `<body>`. `clarify.ts`
already handled the identical case with a fallback to the capture line; work mode
did not copy it across, and neither did the a11y gate, so the one check that would
have caught it was the one not written. (2) A failed write was reported only into
`#nextup-live`, which is `visually-hidden` (measured 0×0) — a sighted user tapped
Done, saw nothing change, and had no way to learn the write had failed, while
capture puts the identical failure in the visible `#status`.
Status: **FIXED (0.5.1)** — `restoreFocus()` falls back to `#capture` when the
region hides, and failures are written to both the live region and the visible
status line. An in-flight guard also stops a double-tap recording the same action
twice.

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
