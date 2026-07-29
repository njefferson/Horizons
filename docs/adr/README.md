# Architecture decision records

Why these exist: the design phase decided a great deal, and a decision whose
reasoning is lost gets re-litigated by the next person to find it inconvenient —
usually a future session, usually at the worst moment.

There was no ADR convention anywhere in this family of apps before this repo, so
one is established here in the family's existing idiom rather than borrowed from
a generic template. It matches how `ACCESSIBILITY.md` and the hub's `LESSONS.md`
already behave: **short, numbered, append-only, never edited in place.**

## The rules

1. **Never edit a record to change its decision.** Write a new one and add a
   `Superseded by ADR-NNNN` line to the old. The old record stays, forever.
   Someone reading a two-year-old commit needs the reasoning that was live then.
2. **Every record names what would overturn it.** A decision with no falsifier is
   a preference wearing a decision's clothes.
3. **Only settled things go here.** Anything still open lives in
   [`NOTES.md`](../../NOTES.md) as a numbered question. A session does not get to
   close an open question by writing an ADR about it.
4. **One decision per record.** If it needs "and", it is two records.

## Format

```
# ADR-NNNN · <title>
Status · Date · Decision · Why · Consequences · What would overturn it
```

## Index

- **[0001](0001-event-sourced-log.md)**
  - Decision: State is a fold over an append-only event log
  - Status: Accepted
- **[0002](0002-storage-dexie-indexeddb.md)**
  - Decision: IndexedDB via Dexie; `localStorage` banned
  - Status: Accepted
- **[0003](0003-folder-mirror.md)**
  - Decision: Optional folder mirror, per-device shards, Chromium desktop only
  - Status: Accepted
- **[0004](0004-ios-path.md)**
  - Decision: iOS gets manual export/import, not a degraded folder mirror
  - Status: Accepted
- **[0005](0005-vaults-and-journal-encryption.md)**
  - Decision: Vaults per life-domain; journal encryption ships with the journal
  - Status: Accepted
- **[0006](0006-backups-and-import.md)**
  - Decision: Immutable timestamped exports; import seeds a fresh store, never merges
  - Status: Accepted
- **[0007](0007-notification-tiers.md)**
  - Decision: Notification ladder T0 → T3, each tier standing alone
  - Status: Accepted
- **[0008](0008-capture-endpoints.md)**
  - Decision: Multiple capture entrances; commit before confirm
  - Status: Accepted
- **[0009](0009-strategy-modules.md)**
  - Decision: Minimal invariant core plus toggleable modules
  - Status: Accepted
- **[0010](0010-decay-primitive.md)**
  - Decision: One decay primitive for everything temporal; no "overdue"
  - Status: Accepted
- **[0011](0011-no-silent-nodes-gate.md)**
  - Decision: The no-silent-nodes invariant is enforced at the write boundary
  - Status: Accepted
- **[0012](0012-no-past-bucket.md)**
  - Decision: A passed clock becomes a live replan card, never an archive row
  - Status: Accepted
- **[0013](0013-levels-push-down.md)**
  - Decision: Higher horizons project downward; the runway is the only workspace
  - Status: Accepted
- **[0014](0014-demand-free-types.md)**
  - Decision: Menu items and pebbles cannot carry clocks
  - Status: Accepted
- **[0015](0015-ai-never-blocks.md)**
  - Decision: Every assisted flow has a working offline rung
  - Status: Accepted
- **[0016](0016-gtd-marks-and-original-content.md)**
  - Decision: Never use the GTD® marks; all trigger-list content original
  - Status: Accepted
- **[0017](0017-licensing.md)**
  - Decision: PolyForm Noncommercial 1.0.0
  - Status: Accepted
- **[0019](0019-v1-freeze.md)**
  - Decision: v1 scope frozen; the dogfood gate defines done
  - Status: Accepted
- **[0018](0018-name-and-slug.md)**
  - Decision: Repo slug `Horizons`; subdomain qualified
  - Status: **Superseded by [0020](0020-name-perennial.md)**
- **[0020](0020-name-perennial.md)**
  - Decision: The name is Perennial — **and the candidate graveyard, which is still current**
  - Status: **Superseded by [0021](0021-name-reopened.md)**
- **[0021](0021-name-reopened.md)**
  - Decision: Perennial withdrawn; the name is reopened
  - Status: **Superseded by [0022](0022-name-wynts.md)**
- **[0022](0022-name-wynts.md)**
  - Decision: The name is Wynts — what you need to see
  - Status: **Superseded by [0023](0023-name-wynts-withdrawn.md)**
- **[0023](0023-name-wynts-withdrawn.md)**
  - Decision: Wynts withdrawn — it sounds like "wince"; the check order
  - Status: **Superseded by [0024](0024-name-quietkeep.md)**
- **[0024](0024-name-quietkeep.md)**
  - Decision: **The name is Quietkeep**
  - Status: Accepted
- **[0025](0025-visual-identity.md)**
  - Decision: The mark is drawn as SVG; the social background is generated
  - Status: Accepted
- **[0026](0026-ui-and-build.md)**
  - Decision: No UI framework; one esbuild type-strip step
  - Status: Accepted
- **[0027](0027-cure-stamps.md)**
  - Decision: Cures share their cause's stamp; commits are serialized
  - Status: Accepted
- **[0028](0028-public-capture-surfaces.md)**
  - Decision: URL/share/shortcut capture entrances; strict CSP
  - Status: Accepted
- **[0029](0029-triage-model.md)**
  - Decision: Triage: optional heat pass, forced-choice clarify, each route self-terminating
  - Status: Accepted
- **[0030](0030-work-mode.md)**
  - Decision: Work mode: pressure formula, fixed precedence, a skip that records nothing
  - Status: Accepted
- **[0031](0031-node-renamed.md)**
  - Decision: `node.renamed` — the first addition to the closed vocabulary
  - Status: Accepted
- **[0032](0032-held-list-grouped.md)**
  - Decision: What you are holding is grouped, and can be ticked off in place
  - Status: Accepted
- **[0033](0033-calendar-export-t1.md)**
  - Decision: The calendar file is all-day events with a relative alarm (T1)
  - Status: Accepted
- **[0034](0034-replan-cards-are-computed.md)**
  - Decision: Replan cards are computed, and only hard clocks raise them
  - Status: Accepted
- **[0035](0035-multi-device-shard-union.md)**
  - Decision: Two devices, by folding in a shard — opt-in, additive, no server
  - Status: Accepted
- **[0036](0036-two-builds-one-branch.md)**
  - Decision: Two builds from one branch; the default cannot sync and the browser enforces it
  - Status: Accepted
- **[0037](0037-sync-design.md)**
  - Decision: Quietkeep Sync — a relay that cannot read, gated against accident
  - Status: Accepted (design)

**Provisional** means: decided well enough to build on, and explicitly awaiting the
owner's word. It is not the same as Accepted, and it is not the same as open.

**Superseded pending** means the decision is known to be changing but the replacement does
not exist yet. The naming chain used it between [0021](0021-name-reopened.md) and
[0024](0024-name-quietkeep.md), when it was settled that the name had to change before any
replacement existed. **No record is in that state now.** It is documented because the
situation recurs, and a record that stays accurate about its own obsolescence is better
than one quietly describing a decision that no longer holds.

**The naming chain reads 0018 → 0020 → 0021 → 0022 → 0023 → 0024**, and every step stays.
[0020](0020-name-perennial.md) also carries the **candidate graveyard**, which remains
current and authoritative regardless of that record's superseded status.
