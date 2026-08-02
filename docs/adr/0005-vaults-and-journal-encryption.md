# ADR-0005 · Vaults per life-domain; journal encryption ships with the journal

**Status:** Accepted; **the vault split is superseded by
[ADR-0061](0061-the-journal-is-a-kind-not-a-vault.md)** · **Date:** 2026-07-27

> **Superseded in part, 2026-08-02 (1.13.0).** The journal is a `NodeKind` with
> an encrypted payload, not a vault — Noah's decision, because this record's own
> overturn clause says nothing overturns the vault split, so no session could
> make that call. **Everything else here still binds and is not loosened:** the
> `{ciphertext, iv}` at-rest shape, the rule that encryption ships in the same
> release as the journal or the journal does not ship, and that a forgotten
> passphrase means the journal is gone and must be said plainly before the
> passphrase is set. The reasoning below is left exactly as written.

## Decision

Data is partitioned into **vaults** by life-domain: work, personal, journal.
Every event belongs to exactly one vault. **Person nodes are vault-scoped** — the
same human appearing in the work vault and the personal vault is two nodes, on purpose.

The journal vault supports **optional passphrase encryption via WebCrypto**,
covering its exports as well as its store.

> **Binding:** journal encryption ships **in the same release as the journal
> itself**. It is never retrofitted. If encryption is not ready, the journal is
> not ready.

## Why

The work/personal split is not cosmetic. The work vault holds suspenses, OPR
names, and status content; the personal vault holds aspirations and bothers.
Mixing them means every export, every screen share, and every glance at the app in
a meeting leaks across a boundary that matters.

**It is a convenience boundary, not a policy one** (Q-03, answered 2026-07-27). The
app does not police what goes into a vault — that is the user's judgement, as with any
personal app. What the split guarantees is that the boundary *holds* once drawn:
separate exports, refused cross-references, distinct person records.

**Person nodes are vault-scoped because a name is not the same fact in both
places.** A colleague who is also a friend has two relationships, two sets of
open threads, and — critically — two different sets of things it is appropriate
to have written down. Unifying them would be technically tidier and would leak
the personal note into the work status report.

Encryption ships with the journal because retrofitted encryption has a
characteristic failure: the plaintext from before the retrofit is still in the
log, still in old exports, still in `archive/`, forever. In an append-only store
that is not a bug to fix later — it is permanent. The only moment encryption can
be complete is the first moment.

## Consequences

- The vault is a required field on every event, not an optional tag.
- Cross-vault references are **forbidden**, not merely discouraged. The write
  gate enforces it. A dependency cannot reach across vaults.
- Journal payloads are `{ciphertext, iv}` at rest. The fold cannot read them
  without an unlock, so journal-derived views are unavailable while locked, and
  that must be a calm state rather than an error.
- **Search cannot index journal plaintext.** Accepted.
- Key derivation from passphrase (Argon2id or PBKDF2 with a high work factor —
  decide during build, record the parameters). **A forgotten passphrase means the
  journal is gone**, and this must be said plainly before the passphrase is set,
  not buried in a help page.
- The journal is v1.5. This ADR binds its release, not its schedule.

## What would overturn it

Nothing about the vault split. The encryption *mechanism* may change if WebCrypto
gains better primitives; the "ships together" rule cannot change, because it
stops being available the moment the journal ships without it.
