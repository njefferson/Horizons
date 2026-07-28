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

| Node kind | Notes |
|---|---|
| `action` | Child of an outcome or project. The only thing that appears as a next action. |
| `outcome` | Any multi-step personal result. *(This is GTD's "project" sense, renamed to avoid colliding with the work-grade `project` below. **Never use the GTD®/Getting Things Done® marks anywhere.**)* |
| `project` | Work-grade. Optional extended attributes: OPR, stakeholders, suspense list, meeting/decision log, goal link, `role`. |
| `area` | Ongoing responsibility. Can go dormant; dormancy is a Review exception. |
| `goal` | Optional OKR-style key results. |
| `waiting-for` | Owed to you by someone else. |
| `upkeep` | Carries `interval` + `comfort_window`. The decay primitive's home. |
| `aspiration` | Menu categories: Read · Try · Go · Make · Research · Save-for. **Cannot carry a clock** (law 6). |
| `bother` | Free-text worry, pre-triage. Must terminate in a route or a park. |
| `pebble` | Load, not work. Magnitude `pebble` \| `rock` \| `boulder`. **Cannot carry a clock** (law 6). |
| `journal` | Payload always encrypted at rest. |
| `person` | **Vault-scoped** — the same human in two vaults is two nodes, deliberately. |
| `resume-card` | Generated, short-lived, spent or expired. |
| `anchor` | A named recurring delta anchor (e.g. the staff call). Deltas compute between firings. |

**Cross-cutting fields**, set via `node.field.set` on any node kind:

- `provenance` — `for/from: self | other(<name>)`
- `inbox_state` — `unclarified` (aggressive same-day clock; carries source tags,
  and a `boss`-tagged run goes one level hotter) or a heat value
- `estimate` — logged from v1, *learned from* in v2

---

## 3 · The closed event list

The **Silent?** column is the machine-checkable form of product law 1: *can this
event leave a node that is not on a surface, under a clock, on the Menu, or
parented to something under a clock?* Every `yes` is a write the boundary must
inspect and either complete or refuse. See [ADR-0011](adr/0011-no-silent-nodes-gate.md).

### A · Node lifecycle

| Event | Payload | Silent? |
|---|---|---|
| `node.created` | `nodeKind, title, parent?, provenance` | **yes — gated** |
| `node.kind.changed` | `from, to` | **yes — gated** (an `action` demoted to `aspiration` loses its clock) |
| `node.field.set` | `field, value` — exactly one field | no |
| `node.parented` | `parent, priorParent?` | **yes — gated** (re-homing under an unclocked parent orphans the node) |
| `node.unparented` | `priorParent` | **yes — gated** |
| `node.trashed` | `reason?` | **yes — gated** — trashing a parent must not orphan its children (ADR-0011) |
| `node.untrashed` | — | **yes — gated** |
| `node.merged` | `into` | **yes — gated** — merge target must exist and live, or children go silent |

`node.trashed` is reversible and is *not* an archive: it records "I decided this
is not a thing", which is a decision. Law 3 forbids a bucket for things that
merely *lapsed* — that is a different case entirely, and it is `replan.raised`.

### B · Temporal — the decay primitive

| Event | Payload | Silent? |
|---|---|---|
| `clock.set` | `clockKind: due \| start \| suspense \| review \| park, at, source` | no — this is the cure |
| `clock.cleared` | `clockKind` | **yes — gated** |
| `upkeep.interval.set` | `interval, comfortWindow` | no |
| `done.marked` | `at` | **yes — gated** (a completed one-off can orphan its parent) |
| `done.unmarked` | — | no |
| `anchor.defined` | `name, recurrence (RRULE)` | no |
| `anchor.fired` | `anchor, at` | no |
| `replan.raised` | `passedClock, fed[], suspense, daysLeft` | no |
| `replan.resolved` | `choice: compress \| escalate \| renegotiate \| new-date \| to-menu` | **yes — gated** unless the choice sets a clock or lands on the Menu |
| `park.set` | `returnAt, reason?` | no — a park **always** carries a return clock |

> **There is no `overdue` event, and there never will be.** Not in the schema,
> not in a payload, not in a variable name. Pressure is computed from
> `(last_done, comfort_window, now)` and is continuous. A clock that passes
> produces `replan.raised` — a live card, not a state of failure (laws 3 and 5).
> A reviewer seeing the string `overdue` anywhere in this repo should treat it as
> a defect report.

### C · Capture and triage

| Event | Payload | Silent? |
|---|---|---|
| `capture.recorded` | `text, source: quick \| share-target \| url-endpoint \| shortcut \| focus-interrupt, sourceTags[]` | **yes — gated** (an unclarified item gets an aggressive same-day clock at write time, not later) |
| `heat.set` | `heat: hot \| cold` | no |
| `clarify.routed` | `route: do-now \| next-action \| waiting-for \| someday \| reference \| trash` | **yes — gated** |
| `do-now.timed` | `startedAt, endedAt, outcome: completed \| abandoned` | no |
| `bother.received` | `text` | **yes — gated** |
| `bother.owned` | `ownership: mine-to-solve \| mine-to-track \| not-mine-to-carry` | **yes — gated** |
| `bother.routed` | `route \| park` | no — the flow **cannot** exit without one of these |
| `assist.offered` | `rung: template \| workers-ai \| byok \| manual, suggestions[]` | no |
| `assist.applied` | `accepted[], rejected[]` | no |

`not-mine-to-carry` still produces a node — it lands on the Not Now ledger with a
`park.set`. Declining to carry something is recorded, not discarded; that is the
point of the ledger.

### D · Focus and resumption

| Event | Payload | Silent? |
|---|---|---|
| `focus.started` | `node` | no |
| `focus.ended` | `reason: completed \| switched \| abandoned \| interrupted` | no |
| `interrupt.captured` | `text, duringFocus: NodeId \| null` | **yes — gated** |
| `resume.card.created` | `forNode, cue: string \| null` | no |
| `resume.card.spent` | — | no |
| `resume.card.expired` | `toReviewQuestion: bool` | no |

The five-word *"I was about to…"* cue is `cue`, and it is **skippable** — `null`
is a valid, unremarkable value, never nagged about.

### E · Work domain

| Event | Payload | Silent? |
|---|---|---|
| `waiting.opened` | `person, forWhat, since` | no |
| `waiting.closed` | `outcome` | **yes — gated** |
| `dependency.declared` | `feeds: NodeId, suspense, leadEstimate` | no |
| `dependency.released` | `feeds` | **yes — gated** |
| `suspense.set` | `at, label?` | no |
| `project.role.set` | `role: execute \| track` | **yes — gated** (a `track` project emits no next actions — only Waiting-Fors and Upkeep check-ins, so its children must re-home) |
| `opr.assigned` | `person` | no |
| `stakeholder.added` / `.removed` | `person` | no |
| `decision.logged` | `text, at, meeting?` | no |
| `delta.recorded` | `sinceAnchor \| sinceExport, text` | no |
| `status.report.exported` | `format: clipboard \| markdown \| print \| csv, scope` | no — this is the provenance "delta since last export" reads from |
| `request.declined` | `person, what, reason?` | **yes — gated** → Not Now ledger + park |
| `request.slot.set` | `recurrence` | no |
| `comms.sweep.scheduled` | `at` | no |
| `comms.sweep.ran` | `at` | no |

> The app owns **the schedule of looking**, never the messages themselves. There
> is no event that touches message content, and there is no integration that
> could produce one.

### F · Load and capacity

| Event | Payload | Silent? |
|---|---|---|
| `pebble.raised` | `magnitude, affects: NodeId[]` | no — pebbles are demand-free by construction (law 6) |
| `pebble.settled` | — | no |
| `capacity.declared` | `level: low \| steady \| sharp \| unsure` | no |
| `wip.limit.set` | `limit` | no |
| `estimate.recorded` | `duration, basis: guess \| prior` | no |

`estimate.recorded` ships in **v1** even though duration *learning* is v2. The
feature can be late; the data cannot be backfilled.

### G · Structure and store

| Event | Payload | Silent? |
|---|---|---|
| `vault.created` | `name, domain: work \| personal \| journal` | no |
| `vault.locked` / `.unlocked` | `method: passphrase` | no |
| `device.registered` | `device, label` | no |
| `module.enabled` / `.disabled` | `module` | no |
| `consent.granted` | `scope, whatLeaves: string, rung` | no |
| `consent.revoked` | `scope` | no |
| `snapshot.written` | `upToSeq, reason: periodic \| pre-migration` | no |
| `schema.migrated` | `from, to` | no |
| `export.written` | `at, scope, encrypted: bool` | no |
| `import.seeded` | `fromExport, at` | no |
| `terminology.skin.applied` | `skin, vault` | no |
| `template.loaded` | `template, source, licence` | no |
| `shard.compacted` | `device, throughSeq, archivedTo` | no |

**`consent.granted.whatLeaves` is a required human-readable string**, not a flag.
It is the literal sentence shown to the user, stored so the record of what they
agreed to survives a copy change (law 10).

**`import.seeded` never merges.** It starts a fresh store. There is no
`import.merged` event and adding one would break law 9.

### H · People and journal

| Event | Payload | Silent? |
|---|---|---|
| `person.created` | `name` — vault-scoped | no |
| `person.linked` | `node, person, relation: opr \| stakeholder \| waiting-on \| requested-by \| mentioned` | no |
| `journal.entry.written` | `ciphertext, iv` — **payload always encrypted** | no |
| `journal.tag.attached` | `tag` | no |

> `journal.tag.attached` exists for **co-occurrence rendering only**. There is no
> sentiment field, no valence, no score, and no event that could carry one
> (law 7). The app plots; the human interprets.

### I · Menu and re-entry

| Event | Payload | Silent? |
|---|---|---|
| `menu.item.added` | `category: read \| try \| go \| make \| research \| save-for` | no — the Menu **is** a surface (law 1, clause c) |
| `menu.item.promoted` | `toKind` | **yes — gated** — a deliberate promotion, never an accrued obligation |
| `save-for.updated` | `target, saved` — both manual | no |
| `lapse.migration.ran` | `absenceDays, itemsTriaged` | no |
| `reentry.greeted` | `absenceDays, shown: {nextUp, triage[≤3], gauge}` | no |
| `amnesty.offered` / `.accepted` | `scope` | no |

> **Naming collision, resolved deliberately.** The brief's user-facing vocabulary
> calls the lapse ritual *"Migration"*, which collides with schema migration. The
> user-facing word stays **Migration**; the events are `lapse.migration.ran` and
> `schema.migrated`. Never `migration.*` bare — it is ambiguous and the ambiguity
> is in the most data-critical part of the system.

The re-entry greeting is **bounded by schema**: `reentry.greeted.shown` has room
for exactly Next-up, at most three triage items, and the gauge. There is no
shape it could take that shows the backlog (law 8).

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
