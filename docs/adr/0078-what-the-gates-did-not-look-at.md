# ADR-0078 — Two gates that measured everything except whether the page was right

*2026-08-05 · Accepted · shipped 1.24.1*

## Context

Four screenshots from a real phone, against production and staging. Two of the
five defects in them had been shipped for releases with every gate green, and
they failed in the same way: **each gate measured a property of the page rather
than the page.**

### A comment rendered as text, on every screen, on production

`public/index.html` carried one comment about the footer's build stamp. At some
point it was split in two and the middle five lines were left outside both
halves. So engineering prose about SC 2.5.3 — and a bare closing arrow — painted
under the Accessibility link on every screen of the app.

Every gate was green throughout. The a11y pass measures contrast, accessible
names and target size; the smoke walk drives behaviour; `docs-check` reads
markdown. **Nothing asserted that the page contains only text somebody meant to
publish.** A leaked comment is not a contrast failure, not a naming failure, not
a behaviour failure, and not a document. It is invisible to all of them.

It survived because the footer is below the fold on a phone, which is also
where it does the most damage: the last thing under the app's own accessibility
link was a paragraph explaining the app's source code.

### A date field an inch and a half tall, on every phone

`.detail-row input[type="date"] { flex: 1 1 10rem }` is a sensible minimum
**width** while the row is a row. At ≤26rem the media query flips the container
to `flex-direction: column`, and **`flex-basis` sizes the main axis** — which is
now the block axis. The 10rem minimum width silently became a 10rem minimum
height. The media query reset `width`, which by then was the cross axis and had
never been the problem.

The a11y target check has a 44px floor and had **no ceiling**, so a 160px-tall
input passed cleanly, in both themes, at every viewport, for every release.

## Decision

**The rendered page must carry no comment syntax, anywhere.** `tools/smoke.mjs`
reads `innerText` on the landing surface and inside the (i) panel and fails on
`<!--` or a closing arrow, plus a named check that the footer says nothing about
how the app was built. It is a signature rather than a proof — but it is exactly
the signature a reader saw, it costs nothing, and there was no check at all
before it.

**The target check gets a ceiling: three times the 44px floor, on fields.**
Every target here is sized from `--target`, nothing is legitimately three of
those tall, and an `<input>` or `<select>` is a single line by construction — so
one that tall has been stretched by layout rather than designed. Expressed in
rem so it scales with the reader's text setting exactly as `--target` does.

**Both halves of that sentence were found by planting, not by writing it.** The
first version capped at a quarter of the viewport and **did not catch the defect
it was written for**: 160px against a 211px quarter-screen passed cleanly, and
the gate would have shipped looking like protection. The second version caught
the date boxes and also failed a place-picker route button measuring 143px —
a real control, legitimately tall because its label wraps over its hint. A gate
that fires on correct work is the one thing this repo cannot afford; it teaches
everybody to route around the red. Restricting it to fields is what makes the
rule true rather than merely strict.

**The version stamp presses the button it names.** It opened the panel, unfolded
the group, scrolled to `#diagnostic-show` and focused it — and stopped. A control
labelled "open the diagnostic report" opened a menu instead. It now presses it,
waits for the report (building it is asynchronous, so a synchronous check would
have quietly restored the old behaviour), and puts focus on the report itself.

**The (i) panel shows that it scrolls.** A shading cue, not a control — the panel
already has two ways out and does not need a third thing to press. Pure CSS,
using `background-attachment: local` for the content-pinned layers against
`scroll`-pinned shadows, so a shadow appears only at an edge with more content
past it. iOS hides overlay scrollbars until a finger is already on the glass,
which is why 2,321px of panel read as ending at the fold.

**The diagnostic stops contradicting itself.** `pressureBands` counts what
carries a repeat interval; two lines called that "a clock", so a report listing
`due 259 · park 71 · review 239` went on to say 529 things were held without a
clock. The numbers were right and the words were the defect — in the one
artefact designed to be handed to somebody else when something is wrong.

## The transferable rule

**A gate that measures a property of the output is not a gate on the output.**
Contrast, names, target size and behaviour are all properties. None of them
notices that the page says something nobody wrote on purpose, or that a control
is absurdly the wrong size rather than slightly the wrong size. Both new checks
are cheap, and both are the first of their kind in this repo after a year of
increasingly careful measurement of everything else.

**A floor with no ceiling is half a measurement.** The 44px minimum exists
because small targets are hard to hit. Nothing was ever said about large ones,
so nothing was ever checked, and the failure mode it hid was not subtle — it was
an inch and a half of empty box under a label reading "Give it a date".

## A third number that had to move

The focus-ring walk's tab budget went from 60 to 90. 1.24.0 put three more
controls on the work surface — the first-step field, its submit, and "This one
is heavy" — ahead of the tree, and `#tree-open` tipped over 60. The walk reported
it as *"not keyboard-focusable"* about a button that plainly is.

The tell was that **light failed and dark passed in the same run**: one tab
order, two verdicts, which is a budget at its edge and never a broken control.
That is the third time this number has moved, so the failure message now names
the budget rather than delivering a verdict on the control — twice it has sent
somebody to inspect a button that was perfectly focusable and simply sat past
the walk's patience.

## Consequences

- Writing the closing sequence inside an HTML comment to explain this defect
  ends the comment on the spot. It happened once while fixing it, caught
  immediately by a balance scan; the note in `index.html` spells the sequence
  out in words for that reason.
- The diagnostic's wording change is copy only. `test/diagnostic.test.ts` had an
  assertion pinned to the old sentence and went red on the fix — hub LESSONS
  §59's exact shape — so it now holds the rule (the pair of numbers) rather than
  the draft, and gained the contradiction check the defect was about.
- The scroll cue uses gradients only, so forced-colours modes drop it harmlessly
  and there is nothing for `prefers-reduced-motion` to suppress.
