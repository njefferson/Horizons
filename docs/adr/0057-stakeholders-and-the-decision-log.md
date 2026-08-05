# ADR-0057 · Stakeholders that are read, and the decision log

**Status:** Accepted · **Date:** 2026-08-01

## Decision

Build-plan item 31's remainder — the project attributes a real meeting needs.
Three nouns that have existed since Phase 0 with no fold, no emitter and no
reader get all three, and one shipped surface loses a section that could never
render.

### Stakeholders live in `people[]`. No new field.

The obvious move was a dedicated `NodeState.stakeholders`, on the OPR
precedent. It is wrong, and the OPR precedent is the reason: `n.opr` is a
field **because its cardinality differs** — "who is running this has exactly
one answer or it has none". Stakeholders are multi-valued, which is what
`people[]` already is. A second home would:

- **contradict itself on day one** — `stakeholder.removed` would clear the new
  field while the sheet's people list and the person lens went on rendering
  the removed name; that is the render-contradicts-record shape of the OPR
  defect, reintroduced by the fix for it;
- **be silently dropped by a fold** — `mergeEvents` carries `people` links to
  the survivor and would not know about a second array, against 1.7.0's
  "nothing is swallowed";
- cost three more places for the copy-on-clone / copy-on-store /
  default-on-deserialise rule to be got wrong.

**And the healing is better without it.** Every `person.linked{relation:
'stakeholder'}` written since 0.15.0 is ALREADY in state — only the reader was
missing. The owner's stakeholders appear the moment this ships, with nothing
re-entered and no fold rewrite. That is the 1.2.3 lesson in its truest form.

`stakeholder.added` is emitted forward beside the link (the OPR shape) and
folds byte-identically, so the two can never disagree.

### Removal is scoped, and it is the only subtraction in the vocabulary

There is no `person.unlinked` noun anywhere. `stakeholder.removed` is the one
event that can take a person link away, so it filters on **person AND
relation**: Sam can be the OPR and someone who cares how it goes, and taking
one off must never strip the other. A removal naming nobody is a **no-op,
never a remove-all** — refused, not guessed.

**Convergence without an LWW slot.** `fold` sorts totally before applying, so
replay is a pure function of the event SET, not of arrival order; with a
per-person payload that is exactly per-person LWW, reached by replay instead
of by a stamp key. This is the recorded `dependency.released` /
`module.enabled` discipline, and adding `stamps['stakeholder:'+id]` would buy
nothing and grow unbounded keys.

### The decision log is append-only

`NodeState.decisions[]`, idempotent by event id (a shard union can deliver the
same event twice). **No LWW stamp**: a log is not a slot, and two devices
logging different decisions must end with both.

**Not editable, not removable** — ADR-0048's rule: editing history is not a
smaller feature of a record, it is a different product. The way back is stated
in the hint rather than hidden behind a missing button: **log the new
decision.** That is what a real decision log does — "on the 12th we reversed
the 3rd's call" — and it is the append-only law expressed as product
behaviour. The bargain accepted out loud: a typo is permanent, the same
bargain `request.declined`'s `what` snapshot already makes.

`meeting?` is **folded and rendered when present, and written by nothing** in
1.9.0: no anchor exists and nothing resolves a meeting name, so writing one
would be a second unvalidated string with nothing behind it. Reserving it
additively is law 9.

### "Started" is removed from the report, not implemented

`ChangeKind` carried `'started'` with a heading and a slot in the section
order, emitted by nothing — every status report shipped with a section that
could not render. It is deleted, for reasons that outrank convenience:

- **It would be a shame ledger.** Started-and-not-finished becomes computable
  by subtraction across two consecutive reports, **in a document you hand to
  your manager**. Nothing else in this app permits that arithmetic, on purpose
  (`requests.ts`: "a record of the times you did not do your own work is the
  ledger this app exists to NOT keep").
- **This app has no in-progress state, deliberately.** Work is held, clocked,
  or done. A "Started" heading asserts a state the product does not model.
- **Every candidate definition was dishonest or empty.** The `start` clock is
  the DEFER verb (ADR-0045) — reporting a deferral as a start is a lie in the
  opposite direction. A focus session opening and closing inside the period is
  invisible to a two-State diff. `todayFor` is structurally uncomputable by
  design (ADR-0051), and reading it in the one artefact that leaves the device
  would defeat that design.

**The durable half is the invariant, not the deletion:** a
`Record<ChangeKind, witness>` totality test now proves every declared kind is
reachable. That is what would have caught this on the day it shipped.

### Stakeholders render on the sheet and the portfolio row — not in the report

The report is **what changed since you last told anyone**; a roster is
standing state. Printing everyone who cares about a project into a hand-over
document is also a disclosure nobody asked for, and a count of them there
would read as importance ranking. The portfolio clause names people —
"Sam and Priya care how it goes" — with an overflow count that is the caps
convention, never a score.

## What must not be built

- No decision editing, no decision deletion, no per-decision verb of any kind.
- No count of decisions per project anywhere outside the sheet's own true
  count (a record may state how many it holds — ADR-0048 — and may never
  grade the person holding it).
- No "Started", under any definition, and no other section whose meaning has
  to be invented to fill a heading.
- No second home for stakeholders.

## What would overturn it

- **The report's ordering of decisions** (newest first) — chronological reads
  better as a narrative of a bounded period, and if the owner reads a report aloud
  and finds it backwards, that is the first thing to change.
- **`meeting`** becomes writable the day something resolves a meeting name —
  the field is already folded and rendered, so that release adds an emitter
  and nothing else.
- **The no-editing rule is ADR-0048's**, and would need that record overturned
  first.

## Not built here: anchors (build-plan item 34's remaining half)

Deferred deliberately, with the reasons recorded so this is not rediscovered:

- **An anchor node would be a silent node today.** `anchor` is in `NODE_KINDS`
  but not in `DEMAND_FREE_KINDS`; `anchor.defined` is not in
  `SILENT_RISK_KINDS` and has no `cureFor` branch. So it would create a node
  with no clock, no Menu placement, no parent and no exemption — `isSilent`
  returns true, and **the coverage gauge stops reading zero**. The gauge is
  what proves law 1; a proof that contradicts itself proves nothing.
  `DEMAND_FREE_KINDS`' own comment sets the price: nothing joins it "on the
  argument that it isn't really work — only on the argument that a surface
  renders it, and that the surface ships". That is a gate change plus a
  shipped surface, in one release. Its own release.
- **`anchor.fired{anchor, at}` carries no per-device watermark.**
  `reportedBefore` exists precisely because a time-only cut silently drops
  another device's history — an audit finding, and `delta.ts` calls at-only
  the degraded fallback. An anchor-based delta cut would be born in the mode
  the export path had to be rescued from.
- **The provenance already exists and the act coincides.** Exporting a status
  report at the staff call is the same act as holding it. Anchors add a
  *named* period and firing-without-exporting — real, and smaller than they
  look.

Build-plan item 34 therefore stays open: its delta half shipped in 0.16.0,
its anchor half is deferred here, and the item says exactly that.
