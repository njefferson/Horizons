# Event vocabulary

**All application state folds from this list.** Nothing is stored that is not an
event named here. Adding a noun to the app means adding it here first — this
document is the gate, and it exists before any code on purpose.

Related: [ADR-0001](adr/0001-event-sourced-log.md) (the log),
[ADR-0011](adr/0011-no-silent-nodes-gate.md) (the write boundary),
[ADR-0010](adr/0010-decay-primitive.md) (why there is no `overdue` event).

---

## 1 · The record

One record type. `kind` discriminates. There is no second table of "current
state" that could disagree with the log.

```
{
  id:      ULID,              // sortable, collision-safe across devices
  kind:    string,            // from the closed list below
  vault:   VaultId,           // every event belongs to exactly one vault
  node:    NodeId | null,     // the node it concerns, if any
  at:      ISO8601,           // wall clock on the writing device
  device:  DeviceId,
  seq:     integer,           // per-device monotonic; gap-free over OFFERED events (ADR-0027)
  payload: object             // shape is fixed per kind
}
```

**Stamping.** `(at, device, seq)` together. `seq` is per-device monotonic and
gap-free **over offered events**; a gate cure deliberately shares its cause's seq
and a derived id, so a shard proves completeness over offered events while cures
are verifiable by derivation (ADR-0027). `at` is wall clock and therefore
*untrusted for ordering across devices* — a user-facing timestamp, not a clock.
Ties on `(at, device, seq)` break by id, so ordering is total.

**Conflict resolution: per-field last-writer-wins.** Two devices editing
different fields of one node both win. Two devices editing the *same* field
resolve by `at`, tie-broken by `device` string comparison so the result is
deterministic and identical on every device. This is why
[`node.field.set`](#a--node-lifecycle) carries **one** field per event and never
a bag of them — a multi-field event would make field-level LWW impossible.

**Ordering.** The fold sorts by `(at, device, seq)`. A device's own events always
fold in `seq` order regardless of clock skew.

---

## 2 · Node kinds

The `kind` a node *is*, distinct from the event kinds that act on it. Depth is
flexible; the types are fixed.

- **`action`** — Child of an outcome or project. The only thing that appears as a next action.
- **`outcome`** — Any multi-step personal result. *(This is GTD's "project" sense, renamed to avoid colliding with the work-grade `project` below. **Never use the GTD®/Getting Things Done® marks anywhere.**)*
- **`project`** — Work-grade. Optional extended attributes: OPR, stakeholders, suspense list, meeting/decision log, goal link, `role`.
- **`area`** — Ongoing responsibility. Can go dormant; dormancy is a Review exception.
- **`goal`** — Optional OKR-style key results.
- **`waiting-for`** — Owed to you by someone else.
- **`upkeep`** — Carries `interval` + `comfort_window`. The decay primitive's home.
- **`aspiration`** — Menu categories: Read · Try · Go · Make · Research · Save-for. **Cannot carry a clock** (law 6).
- **`bother`** — Free-text worry, pre-triage. Must terminate in a route or a park.
- **`pebble`** — Load, not work. Magnitude `pebble` | `rock` | `boulder`. **Cannot carry a clock** (law 6).
- **`journal`** — Payload always encrypted at rest.
- **`person`** — **Vault-scoped** — the same human in two vaults is two nodes, deliberately.
- **`resume-card`** — Generated, short-lived, spent or expired.
- **`anchor`** — A named recurring delta anchor (e.g. the staff call). Deltas compute between firings.

**Cross-cutting fields**, set via `node.field.set` on any node kind:

- `provenance` — `for/from: self | other(<name>)`
- `inbox_state` — `unclarified` (aggressive same-day clock; carries source tags,
  and a `boss`-tagged run goes one level hotter) or a heat value
- `estimate` — logged from v1, *learned from* in v2
- `note` — free text kept with an item (1.4.0, ADR-0047). Title-class user
  content: plaintext in exports exactly as titles are; renders on the detail
  sheet only; an empty value is the honest "removed". Written by the sheet and
  by the importer; read by `noteOf` in fold.ts — the one reader.

---

## 3 · The closed event list

The **Silent?** column is the machine-checkable form of product law 1: *can this
event leave a node that is not on a surface, under a clock, on the Menu, or
parented to something under a clock?* Every `yes` is a write the boundary must
inspect and either complete or refuse. See [ADR-0011](adr/0011-no-silent-nodes-gate.md).

### A · Node lifecycle

- **`node.created`**
  - Payload: `nodeKind, title, parent?, provenance`
  - Silent risk: **yes — gated**
- **`node.kind.changed`**
  - Payload: `from, to`
  - Silent risk: **yes — gated** (an `action` demoted to `aspiration` loses its clock)
- **`node.field.set`**
  - Payload: `field, value` — exactly one field
  - Silent risk: no
- **`node.renamed`**
  - Payload: `title`
  - Silent risk: no — renaming removes no coverage
- **`node.parented`**
  - Payload: `parent, priorParent?`
  - Silent risk: **yes — gated** (re-homing under an unclocked parent orphans the node)
- **`node.unparented`**
  - Payload: `priorParent`
  - Silent risk: **yes — gated**
- **`node.trashed`**
  - Payload: `reason?`
  - Silent risk: **yes — gated** — trashing a parent must not orphan its children (ADR-0011)
- **`node.untrashed`**
  - Silent risk: **yes — gated**
- **`node.merged`**
  - Payload: `into`
  - Silent risk: **yes — gated** — merge target must exist and live, or children go silent
  - The UI emitter (1.7.0, ADR-0053) is a BATCH: carried facts first (demand
    clocks the target lacks, the note, people links), the source's live
    children re-homed to the target, then the merge — so folding a duplicate
    never swallows a date, a note, or a child.
- **`node.unmerged`** (1.7.0, ADR-0053)
  - Payload: none
  - Silent risk: **yes** — splitting back out strips the chain coverage the
    target conferred; the gate cures with a same-day clock, like `untrashed`.
  - Carried facts and re-homed children STAY where the merge put them — the
    split restores the node's own standing, not the world before it; the
    words say so.

`node.trashed` is reversible and is *not* an archive: it records "I decided this
is not a thing", which is a decision. Law 3 forbids a bucket for things that
merely *lapsed* — that is a different case entirely, and it is `replan.raised`.

### B · Temporal — the decay primitive

- **`clock.set`**
  - Payload: `clockKind: due | start | suspense | review | park, at, source`
  - Silent risk: no — this is the cure
- **`clock.cleared`**
  - Payload: `clockKind`
  - Silent risk: **yes — gated**
- **`upkeep.interval.set`**
  - Payload: `interval, comfortWindow`
  - Silent risk: no
- **`done.marked`**
  - Payload: `at`
  - Silent risk: **yes — gated** (a completed one-off can orphan its parent)
- **`done.unmarked`**
  - Silent risk: no
- **`anchor.defined`**
  - Payload: `name, recurrence (RRULE)`
  - Silent risk: no
  - **Unemitted, deferred with the anchor surface** ([ADR-0057](adr/0057-stakeholders-and-the-decision-log.md)).
    `anchor` is not in `DEMAND_FREE_KINDS` and this kind is not in
    `SILENT_RISK_KINDS` with no cure branch, so an anchor node would be silent
    under law 1 today — and the gauge that PROVES law 1 would start disagreeing
    with itself. Shipping anchors needs a gate change plus a surface, in a
    release of its own.
- **`anchor.fired`**
  - Payload: `anchor, at`
  - Silent risk: no
  - **Unemitted, deferred with `anchor.defined`** — and it carries no per-device
    watermark, so a delta cut on it would be the degraded at-only cut that
    `reportedBefore` exists to avoid. The export mark already does this job
    better.
- **`replan.raised`**
  - Payload: `passedClock, fed[], suspense, daysLeft`
  - Silent risk: no — **and nothing emits it** ([ADR-0034](adr/0034-replan-cards-are-computed.md))
  - **Unemitted BY DESIGN, and it should stay that way.** Replan cards are
    computed from passed clocks at read time ([ADR-0034](adr/0034-replan-cards-are-computed.md));
    a stored one could disagree with the clock it describes.
- **`replan.resolved`**
  - Payload: `choice: compress | escalate | renegotiate | new-date | to-menu`
  - Silent risk: **yes — gated** unless the choice sets a clock or lands on the Menu
- **`park.set`**
  - Payload: `returnAt, reason?`
  - Silent risk: no — a park **always** carries a return clock

> **There is no `overdue` event, and there never will be.** Not in the schema,
> not in a payload, not in a variable name. Pressure is computed from
> `(last_done, comfort_window, now)` and is continuous. A **hard** clock that
> passes produces a live card, not a state of failure (laws 3 and 5) — computed
> at render time from the clock and the current time, never written down. A soft
> clock passing is ordinary operation and produces nothing, or the gate's own
> cures would manufacture one card per capture
> ([ADR-0034](adr/0034-replan-cards-are-computed.md)).
> A reviewer seeing the string `overdue` anywhere in this repo should treat it as
> a defect report.

### C · Capture and triage

- **`capture.recorded`**
  - Payload: `text, source: quick | share-target | url-endpoint | shortcut | focus-interrupt | sample, sourceTags[]`
  - `sample` is the demonstration set (`src/sample.ts`), added 2026-07-30. Named
    rather than folded into `quick`, because a capture claiming it came from a
    keystroke when it came from a button labelled "sample work" is a small lie in
    the one place the app keeps its history. Additive only: every log already
    written stays readable.
  - Silent risk: **yes — gated** (an unclarified item gets an aggressive same-day clock at write time, not later)
- **`heat.set`**
  - Payload: `heat: hot | cold`
  - Silent risk: no
- **`clarify.routed`**
  - Payload: `route: do-now | next-action | waiting-for | someday | reference | trash`
  - Silent risk: **yes — gated**
- **`clarify.reopened`**
  - Payload: `from: <the route being taken back>`
  - Silent risk: **yes — gated** — undo of a route: the item returns to the inbox
    (`route` → null), and reopening can leave it with no clock, so the gate cures
    it with the same same-day clock a fresh capture gets. Append-only means undo
    is an event, never a deletion; this competes for the same LWW field as
    `clarify.routed`, so undo is safe on a synced log.
- **`do-now.timed`**
  - Payload: `startedAt, endedAt`. `node` is the item.
  - Silent risk: no
  - A SPAN, no verdict (1.10.0, ADR-0059) — the `focus.started` / `focus.ended`
    shape. `outcome: completed | abandoned` was written until 1.10.0 and is
    still present on older events; nothing reads it. It was a record of the
    times you did not finish your own work, which ADR-0042 and ADR-0056 forbid
    in absolute terms. The chosen length is deliberately NOT in the payload, so
    a shortfall cannot be computed by subtraction.
- **`bother.received`**
  - Payload: `text`
  - Silent risk: **yes — gated**
- **`bother.owned`**
  - Payload: `ownership: mine-to-solve | mine-to-track | not-mine-to-carry`
  - Silent risk: **yes — gated**
- **`bother.routed`**
  - Payload: `route | park`
  - Silent risk: no — the flow **cannot** exit without one of these
- **`assist.offered`**
  - Payload: `rung: template | workers-ai | byok | manual, suggestions[]`
  - Silent risk: no
  - **Unemitted — reserved for the assist ladder** ([ADR-0015](adr/0015-ai-never-blocks.md)).
    No assisted rung of any kind ships, offline or cloud, so nothing has ever
    had cause to write it.
- **`assist.applied`**
  - Payload: `accepted[], rejected[]`
  - Silent risk: no
  - **Unemitted — reserved with `assist.offered`**, for the same reason.

`not-mine-to-carry` still produces a node — it lands on the Not Now ledger with a
`park.set`. Declining to carry something is recorded, not discarded; that is the
point of the ledger. (Built 1.8.0, ADR-0056 — the first bother build trashed it
instead, and this paragraph was the record of what it should have done.)

### D · Focus and resumption

- **`focus.started`**
  - Payload: `node`
  - Silent risk: no
- **`focus.ended`**
  - Payload: `reason: completed | switched | abandoned | interrupted`
  - Silent risk: no
- **`interrupt.captured`**
  - Payload: `text, duringFocus: NodeId | null`
  - Silent risk: **yes — gated**
- **`resume.card.created`**
  - Payload: `forNode, cue: string | null`
  - Silent risk: no
- **`resume.card.spent`**
  - Silent risk: no
- **`resume.card.expired`**
  - Payload: `toReviewQuestion: bool`
  - Silent risk: no

The five-word *"I was about to…"* cue is `cue`, and it is **skippable** — `null`
is a valid, unremarkable value, never nagged about.

### E · Work domain

- **`waiting.opened`**
  - Payload: `person, forWhat, since`
  - Silent risk: no
- **`waiting.closed`**
  - Payload: `outcome`
  - Silent risk: **yes — gated**
- **`dependency.declared`**
  - Payload: `feeds: NodeId, suspense, leadEstimate`
  - Silent risk: no — **gated**: must name a live target and must not close a loop (build-plan 27)
- **`dependency.released`**
  - Payload: `feeds`
  - Silent risk: **yes — gated**
- **`suspense.set`**
  - Payload: `at, label?`
  - Silent risk: no
- **`project.role.set`**
  - Payload: `role: execute | track`
  - Silent risk: **yes — gated** (a `track` project emits no next actions — only Waiting-Fors and Upkeep check-ins, so its children must re-home)
- **`opr.assigned`**
  - Payload: `person`
  - Silent risk: no
- **`stakeholder.added` / `.removed`** (emitters + folds 1.9.0, ADR-0057)
  - Payload: `person`
  - Silent risk: no
  - Both fold into `n.people[]` — the ONE home. `added` appends the
    `stakeholder` link idempotently, byte-identically to
    `person.linked{relation:'stakeholder'}`, so a link written any time since
    0.15.0 already reads without anything being re-entered.
  - `removed` is the ONLY event in this vocabulary that subtracts a person
    link, and it is scoped to person AND relation: taking somebody off the
    list must never strip the same person's `opr` or `waiting-on`. A removal
    naming nobody is a no-op, never a remove-all.
- **`decision.logged`** (emitter + fold 1.9.0, ADR-0057)
  - Payload: `text, at, meeting?`
  - Silent risk: no
  - Folds into `n.decisions[]` — APPEND-ONLY and idempotent by event id. No
    LWW stamp: a log is not a slot, and two devices logging different
    decisions must end with both. Never edited, never removed; the way back
    is to log the new decision.
  - `meeting` is folded and rendered when present, and written by nothing in
    1.9.0 — nothing resolves a meeting name yet, and the field is reserved
    additively (law 9).
- **`delta.recorded`**
  - Payload: `sinceAnchor | sinceExport, text`
  - Silent risk: no
  - **Unemitted, deferred with anchors.** The status report ships and records
    itself as `status.report.exported`; this kind is the anchor-scoped delta,
    which waits on the watermark this repo does not have.
- **`status.report.exported`**
  - Payload: `format: clipboard | markdown | print | csv, scope`
  - Silent risk: no — this is the provenance "delta since last export" reads from
- **`request.declined`** (emitters 1.8.0, ADR-0056)
  - Payload: `person (NodeId | null), what, reason?`
  - Silent risk: **yes — gated** → Not Now ledger + park. The write paths carry
    their own park in the same batch (to the request slot when one is set, else
    end of today); the gate's cure is the backstop for a bare event from an
    import or an older shard.
  - `person` is null when nobody has said who — the `waitingOn` precedent: an
    ordinary state, not a defect (the bother flow never asks). `what` is the
    title SNAPSHOT at decline time, so the record survives a rename (the
    consent-sentence rule). `reason` is a fixed provenance string
    (`detail` | `bother`), never free text.
  - Folds to `n.notNow {person, what, at}` under its own LWW key; cleared by
    `clock.cleared{park}` (carrying it after all) and `done.marked`.
- **`timer.length.set`** (emitter 1.10.0, ADR-0059)
  - Payload: `minutes` — a whole number from the closed offer (2, 5, 10, 20, 30). `node: null`.
  - Silent risk: no
  - Folds to `State.timerMinutes` (state-level LWW, the `requestSlot` shape). A
    length outside the offer reads as the two-minute default — refused at read
    time, never guessed, because a length nobody was offered is a commitment
    nobody made.
- **`request.slot.set`** (emitter 1.8.0, ADR-0056)
  - Payload: `recurrence` — `weekly:mon` … `weekly:sun`; `''` clears. `node: null`.
  - Silent risk: no
  - Folds to `State.requestSlot` (state-level LWW, the `focus` shape). An
    unrecognised recurrence reads as no slot — refused at read time, never
    guessed. Null slot = the feature is invisible; setting a day IS the opt-in.
- **`comms.sweep.scheduled`**
  - Payload: `at`
  - Silent risk: no
  - **Unemitted, and superseded in practice.** The comms sweep ships
    ([ADR-0042](adr/0042-the-comms-sweep.md)) as a FIELD on an upkeep node
    (`COMMS_FIELD` in `src/comms.ts`) rather than as its own kind, because it
    decays, completes and renders exactly like an upkeep and inventing a kind
    would mean teaching every projection about a thing they already know. These
    two nouns are what that design replaced.
- **`comms.sweep.ran`**
  - Payload: `at`
  - Silent risk: no
  - **Unemitted, superseded with `comms.sweep.scheduled`** — a sweep being done
    is a `done.marked` on the upkeep, like every other completion.

> The app owns **the schedule of looking**, never the messages themselves. There
> is no event that touches message content, and there is no integration that
> could produce one.

### F · Load and capacity

- **`pebble.raised`**
  - Payload: `magnitude, affects: NodeId[]`
  - Silent risk: no — pebbles are demand-free by construction (law 6)
  - **Unemitted. The design is settled; the substrate is unbuilt.**
    [ADR-0014](adr/0014-demand-free-types.md) says what a pebble does, in its
    Consequences and in terms: it links to the nodes it affects and **"may
    depress capacity / WIP while active"**, and it **"annotates the timeline, so
    a stretch of low capacity has a visible reason — co-occurrence only, never
    causation"** (law 7, restated in
    [the data constitution](../data-constitution.md)). What is missing is not a
    decision. It is the two things it acts on: nothing has ever read a
    `capacity.declared` or a `wip.limit.set`.
  - **Correction, 2026-08-02.** An earlier version of this note said the
    question "what does a pebble actually depress?" had never been answered.
    That was false, and it was written after the same day's releases had
    established that an ADR's Consequences section is a build list rather than
    prose — the exact mistake, made about the exact document that answers it.
- **`pebble.settled`**
  - Silent risk: no
  - **Unemitted, with `pebble.raised`** — and unbuilt rather than undecided,
    for the same reason.
- **`capacity.declared`**
  - Payload: `level: low | steady | sharp | unsure`
  - Silent risk: no
  - **Unemitted, and type-only.** The payload is fully specified — you say how
    you are doing, in one of four words — and no projection has ever read one.
    It is half of what [ADR-0014](adr/0014-demand-free-types.md)'s pebbles act
    on, and it is unbuilt work rather than an open question.
- **`wip.limit.set`**
  - Payload: `limit`
  - Silent risk: no
  - **Unemitted, and type-only**, with `capacity.declared` — the other half of
    what a pebble depresses. Next up offers one thing by construction, so a
    limit does not bear on that surface; the caps it could bear on are elsewhere
    (`COMPOSED_CAP` is 5, `OFFER_CAP` is 2), and none of them consults one yet.
- **`estimate.recorded`**
  - Payload: `duration, basis: guess | prior`
  - Silent risk: no

`estimate.recorded` ships in **v1** even though duration *learning* is v2. The
feature can be late; the data cannot be backfilled.

### G · Structure and store

- **`vault.created`**
  - Payload: `name, domain: work | personal | journal`
  - Silent risk: no
  - **Unemitted.** Vaults were closed as a mechanism by Q-10 and the journal
    took the kind-plus-encryption route instead
    ([ADR-0061](adr/0061-the-journal-is-a-kind-not-a-vault.md)). The `vault`
    field stays on every event and the gate's cross-vault refusal stays
    enforced — both cost nothing and removing either would be a destructive
    schema change — but nothing creates a second vault.
- **`vault.locked` / `.unlocked`**
  - Payload: `method: passphrase`
  - Silent risk: no
  - **Unemitted, and superseded** (1.13.0, [ADR-0061](adr/0061-the-journal-is-a-kind-not-a-vault.md)).
    They belonged to the vault split, which ADR-0061 replaced with
    `kind: 'journal'` plus an encrypted payload. They stay in the vocabulary
    because the log is append-only and removing a name is a destructive schema
    change for no gain — but nothing writes them, and an unlock is a session
    fact rather than a durable one, so nothing should.
- **`device.registered`**
  - Payload: `device, label`
  - Silent risk: no
  - **Unemitted, and redundant.** `State.devices` is folded from the `device`
    field every event already carries, so a device is known by having written
    something. There is no surface that lists devices and nothing that needs a
    label.
- **`module.enabled` / `.disabled`**
  - Payload: `module`
  - Silent risk: no
  - Folds into `State.modules` as of 1.6.0 (a set; enabled adds, disabled
    removes — order-dependent like `dependency.released`, covered by the same
    discipline). First customer: `today` (Composed Today, ADR-0051).
- **`consent.granted`**
  - Payload: `scope, whatLeaves: string, rung`
  - Silent risk: no
  - **Unemitted — reserved, and the reservation is load-bearing.**
    [ADR-0015](adr/0015-ai-never-blocks.md) binds every cloud rung to a recorded
    consent sentence naming exactly what leaves the device. No such rung ships,
    so nothing triggers it. **Sync is the open question**: it sends ciphertext to
    a relay that cannot read it, and [ADR-0037](adr/0037-sync-design.md) never
    mentions consent — which is a question nobody has asked in writing rather
    than a settled answer.
- **`consent.revoked`**
  - Payload: `scope`
  - Silent risk: no
  - **Unemitted — reserved with `consent.granted`.**
- **`snapshot.written`**
  - Payload: `upToSeq, reason: periodic | pre-migration`
  - Silent risk: no
  - **Emitted since 1.14.1** with `reason: 'periodic'`, once per boot when the
    log has run more than `SNAPSHOT_LAG_LIMIT` events past the newest snapshot
    ([ADR-0063](adr/0063-startup-does-not-replay-the-world.md)). It was declared
    in Phase 0 and written by nothing until then, which is why every cold start
    folded the entire log. `reason: 'pre-migration'` is never written — there is
    no migration path yet, and the record should not claim one.
- **`schema.migrated`**
  - Payload: `from, to`
  - Silent risk: no
  - **Unemitted, and no migration machinery exists** as of 1.14.1 — no schema
    version, no migration path, no pre-migration export, though the Dexie schema
    has already moved v1 to v2. `log-words.ts` renders this kind as "a copy was
    exported first", which describes a behaviour that is not built; the sentence
    is unreachable, but it is a claim and it is recorded here as one.
- **`export.written`**
  - Payload: `at, scope, encrypted: bool`
  - Silent risk: no
  - **Read since 1.14.0** by `src/copies.ts` — the ⓘ panel's "Last copy" row and
    the sentence about work no copy holds ([ADR-0062](adr/0062-the-copy-and-the-way-back.md)).
    It had been written since Phase 0 and read by nothing.
  - **`scope` decides whether it is a copy at all**, and this is load-bearing.
    The same noun records a whole importable export (`all`, `before-letting-go`),
    a range *reading* copy that `inspectExport` refuses, and the calendar `.ics`.
    Only the first family counts as your data being saved; the whole-copy scopes
    are `WHOLE_COPY_SCOPES` in `src/copies.ts` and `deliverCopy` refuses any
    scope outside them, so the set cannot fall behind the writers.
- **`shard.folded`**
  - Payload: `fromDevice, taken, skipped, at`
  - Silent risk: no — another device's copy was folded in ([ADR-0035](adr/0035-multi-device-shard-union.md))
- **`import.seeded`**
  - Payload: `fromExport, at`
  - Silent risk: no
- **`terminology.skin.applied`**
  - Payload: `skin, vault`
  - Silent risk: no
  - **Unemitted — reserved.** No terminology skinning is built, and none is
    scheduled; the app has one vocabulary and it is the one in this document.
- **`template.loaded`**
  - Payload: `template, source, licence`
  - Silent risk: no
  - **Unemitted — reserved for the offline template library**, which is the
    bottom rung of ADR-0015's ladder and unbuilt like the rest of it.
- **`shard.compacted`**
  - Payload: `device, throughSeq, archivedTo`
  - Silent risk: no
  - **Unemitted, and the machinery does not exist.** [ADR-0001](adr/0001-event-sourced-log.md)'s
    fifth consequence is "the log grows forever, compaction is required", and
    [ADR-0003](adr/0003-folder-mirror.md) even specifies the trigger. Neither is
    built. It was refused in 1.14.1 deliberately: discarding history under a law
    that says data is never lost deserves a measurement first
    ([ADR-0063](adr/0063-startup-does-not-replay-the-world.md)).

**`consent.granted.whatLeaves` is a required human-readable string**, not a flag.
It is the literal sentence shown to the user, stored so the record of what they
agreed to survives a copy change (law 10).

**`import.seeded` never merges.** It starts a fresh store. There is no
`import.merged` event and adding one would break law 9.

### H · People and journal

- **`person.created`**
  - Payload: `name` — vault-scoped
  - Silent risk: no
- **`person.linked`**
  - Payload: `node, person, relation: opr | stakeholder | waiting-on | requested-by | mentioned`
  - Silent risk: no
- **`journal.entry.written`** (emitter 1.13.0, ADR-0061)
  - Payload: `v, iv, ct` — the `seal.ts` envelope. **Always encrypted.** The
    third field was called `ciphertext` here from the first draft; nothing ever
    emitted the noun, so it now takes the name the code already uses rather than
    a translation layer between two names for one thing.
  - Silent risk: no
  - **The fold never reads this.** It has no key, and it must stay a pure
    function of the event set whether the journal is unlocked or not. The
    journal surface reads the log directly and opens entries in the UI — the
    log-viewer pattern — which is also why search cannot index the journal:
    there is nothing in state to index.
- **`journal.sealed`** (emitter 1.13.0, ADR-0061)
  - Payload: `salt, iterations`. `node: null`. Written ONCE, when the passphrase
    is first set.
  - Silent risk: no
  - The salt is not a secret and is in the log in the clear on purpose: it must
    reach a second device, because the whole point is that the same passphrase
    opens the journal there too. The iteration count travels with it so a later
    release can raise the work factor and still open what an earlier one sealed.
- **`journal.tag.attached`**
  - Payload: `tag`
  - Silent risk: no

> `journal.tag.attached` exists for **co-occurrence rendering only**. There is no
> sentiment field, no valence, no score, and no event that could carry one
> (law 7). The app plots; the human interprets. **Still unemitted after 1.13.0**:
> tags are their own decision about what may be rendered from them, and the
> journal shipped without needing them.

### I · Menu and re-entry

- **`menu.item.added`**
  - Payload: `category: read | try | go | make | research | save-for`
  - Silent risk: no — the Menu **is** a surface (law 1, clause c)
- **`menu.item.removed`**
  - Payload: `from: <the category it left>`
  - Silent risk: **yes — gated** — taking an item **off** the Menu removes law 1's
    clause (c), so the gate cures it with a same-day clock. It is the reverse of
    `menu.item.added` (used to undo a someday/reference route), and NOT
    `menu.item.promoted`: removing a wish from the list is not the deliberate act
    of deciding to do it, so the kind is untouched.
- **`menu.item.promoted`**
  - Payload: `toKind`
  - Silent risk: **yes — gated** — a deliberate promotion, never an accrued obligation
- **`save-for.updated`**
  - Payload: `target, saved` — both manual
  - Silent risk: no
- **`lapse.migration.ran`**
  - Payload: `absenceDays, itemsTriaged`
  - Silent risk: no
- **`reentry.greeted`**
  - Payload: `absenceDays, shown: {nextUp, triage[≤3], gauge}`
  - Silent risk: no
- **`amnesty.offered` / `.accepted`**
  - Payload: `scope`
  - Silent risk: no

> **Naming collision, resolved deliberately.** The brief's user-facing vocabulary
> calls the lapse ritual *"Migration"*, which collides with schema migration. The
> user-facing word stays **Migration**; the events are `lapse.migration.ran` and
> `schema.migrated`. Never `migration.*` bare — it is ambiguous and the ambiguity
> is in the most data-critical part of the system.

The re-entry greeting is **bounded by schema**: `reentry.greeted.shown` has room
for exactly Next-up, at most three triage items, and the gauge. There is no
shape it could take that shows the backlog (law 8).

### K · Composed today (1.6.0, ADR-0051)

- **`today.chosen` / `today.released`**
  - Payload: `day` — the LOCAL day key the choice is for/from
  - Silent risk: no — a choice adds no coverage and removes none
  - Folds to one LWW slot per node (`todayFor`). Read ONLY through
    `composedFor`, which answers for the current day — the expiry IS the
    projection: no exported reader takes a day argument, so "chosen yesterday
    and not done" is structurally uncomputable (laws 3 and 5). The whole
    capability is an opt-in module (`today`), off by default.

### J · Wholesale acts (1.5.0)

- **`range.acted`**
  - Payload: `scope, verb, count` — `scope` is the LITERAL sentence the user
    saw and agreed to (the consent-sentence rule: a key cannot reproduce what
    was agreed to once the copy changes); `verb` the machine name
    (`put-under | to-menu | park | let-go | bring-back | undo`); `count` the
    number of items in THIS chunk. `node` is null.
  - Silent risk: no — the ordinary events that follow it in the same chunk
    carry their own risk and their own cures.
  - Written FIRST in each chunk of a bulk act, so the log explains the pile of
    ordinary events after it. Deliberately unfolded: the state change is
    carried entirely by those events, and folding the receipt would count the
    act twice. The log viewer and per-node history read it from the log.

---

## 4 · What the fold produces

```
state = fold(snapshot, events after snapshot.upToSeq)
```

Startup replays the tail only — never the world (the < 2 s cold-capture budget
depends on it). Derived values are **computed, never stored**, so they cannot
drift out of agreement with the log:

- **pressure** — from `(last_done, comfort_window, now)`, continuous, unbounded
  above, no thresholds baked into storage
- **coverage gauge** — a count of nodes failing law 1's four-way test. **The
  invariant is enforced at write time, so the honest value is always 0**; the
  gauge exists to *prove* it, and a non-zero reading is a bug in the write gate,
  not a state for the user to fix
- **latest-start / buffer burn** — from `dependency.declared` + `suspense.set`
- **Next-up** — hard landscape > resume cards > pressure rank
- **Review exceptions** — stalled (no next action), orphan (no parent), dormant
  (area with no active work or a stale clock), unsupported goal
- **delta** — the diff between two `anchor.fired` or `status.report.exported` points

---

## 5 · Rules for changing this list

1. **The list is closed.** A writer emitting an unlisted `kind` is rejected, not
   ignored — silent tolerance is how a schema rots.
2. **Additive only.** Events are never renamed, never removed, never have a field
   change meaning. Old logs must fold on new code, forever (law 9).
3. **Superseding, not editing.** A replaced event kind stays in this document
   with a `Superseded by` line. Readers of a five-year-old log need it.
4. **A new event declares its Silent? answer**, and a `yes` ships with the gate
   logic in the same commit.
5. **Adding a field to `payload` is fine; changing an existing field's meaning is
   not.** The second one is a migration, and migrations are additive-only.
