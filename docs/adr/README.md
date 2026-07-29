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

| # | Decision | Status |
|---|---|---|
| [0001](0001-event-sourced-log.md) | State is a fold over an append-only event log | Accepted |
| [0002](0002-storage-dexie-indexeddb.md) | IndexedDB via Dexie; `localStorage` banned | Accepted |
| [0003](0003-folder-mirror.md) | Optional folder mirror, per-device shards, Chromium desktop only | Accepted |
| [0004](0004-ios-path.md) | iOS gets manual export/import, not a degraded folder mirror | Accepted |
| [0005](0005-vaults-and-journal-encryption.md) | Vaults per life-domain; journal encryption ships with the journal | Accepted |
| [0006](0006-backups-and-import.md) | Immutable timestamped exports; import seeds a fresh store, never merges | Accepted |
| [0007](0007-notification-tiers.md) | Notification ladder T0 → T3, each tier standing alone | Accepted |
| [0008](0008-capture-endpoints.md) | Multiple capture entrances; commit before confirm | Accepted |
| [0009](0009-strategy-modules.md) | Minimal invariant core plus toggleable modules | Accepted |
| [0010](0010-decay-primitive.md) | One decay primitive for everything temporal; no "overdue" | Accepted |
| [0011](0011-no-silent-nodes-gate.md) | The no-silent-nodes invariant is enforced at the write boundary | Accepted |
| [0012](0012-no-past-bucket.md) | A passed clock becomes a live replan card, never an archive row | Accepted |
| [0013](0013-levels-push-down.md) | Higher horizons project downward; the runway is the only workspace | Accepted |
| [0014](0014-demand-free-types.md) | Menu items and pebbles cannot carry clocks | Accepted |
| [0015](0015-ai-never-blocks.md) | Every assisted flow has a working offline rung | Accepted |
| [0016](0016-gtd-marks-and-original-content.md) | Never use the GTD® marks; all trigger-list content original | Accepted |
| [0017](0017-licensing.md) | PolyForm Noncommercial 1.0.0 | Accepted |
| [0019](0019-v1-freeze.md) | v1 scope frozen; the dogfood gate defines done | Accepted |
| [0018](0018-name-and-slug.md) | Repo slug `Horizons`; subdomain qualified | **Superseded by [0020](0020-name-perennial.md)** |
| [0020](0020-name-perennial.md) | The name is Perennial — **and the candidate graveyard, which is still current** | **Superseded by [0021](0021-name-reopened.md)** |
| [0021](0021-name-reopened.md) | Perennial withdrawn; the name is reopened | **Superseded by [0022](0022-name-wynts.md)** |
| [0022](0022-name-wynts.md) | The name is Wynts — what you need to see | **Superseded by [0023](0023-name-wynts-withdrawn.md)** |
| [0023](0023-name-wynts-withdrawn.md) | Wynts withdrawn — it sounds like "wince"; the check order | **Superseded by [0024](0024-name-quietkeep.md)** |
| [0024](0024-name-quietkeep.md) | **The name is Quietkeep** | Accepted |
| [0025](0025-visual-identity.md) | The mark is drawn as SVG; the social background is generated | Accepted |
| [0026](0026-ui-and-build.md) | No UI framework; one esbuild type-strip step | Accepted |
| [0027](0027-cure-stamps.md) | Cures share their cause's stamp; commits are serialized | Accepted |
| [0028](0028-public-capture-surfaces.md) | URL/share/shortcut capture entrances; strict CSP | Accepted |
| [0029](0029-triage-model.md) | Triage: optional heat pass, forced-choice clarify, each route self-terminating | Accepted |
| [0030](0030-work-mode.md) | Work mode: pressure formula, fixed precedence, a skip that records nothing | Accepted |
| [0031](0031-node-renamed.md) | `node.renamed` — the first addition to the closed vocabulary | Accepted |
| [0032](0032-held-list-grouped.md) | What you are holding is grouped, and can be ticked off in place | Accepted |

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
