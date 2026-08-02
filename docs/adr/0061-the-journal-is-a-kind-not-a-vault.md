# ADR-0061 · The journal is a kind, not a vault

**Status:** Accepted · **Date:** 2026-08-02 ·
**Supersedes the vault split of** [ADR-0005](0005-vaults-and-journal-encryption.md)

## Context

ADR-0005 partitioned data into vaults by life-domain — work, personal, journal —
and made the journal vault the thing that carries passphrase encryption. Its
overturn clause reads, in full: *"Nothing about the vault split."*

Two things happened after it was written.

**Q-10 (2026-07-29) closed vaults as a mechanism.** Noah asked whether anything
scoped a projection by vault; the answer was no, nothing ever had. The
recommendation against building them is worth quoting because its reasoning is
what decides this record: *"a hard vault split forces Next up to pick a side, and
'one thing, chosen for you' across the whole of someone's life is the app's
central promise. Two vaults are two apps, and then you have to remember to check
both, which is exactly the failure this app exists to prevent."*

**And ADR-0005 was never amended**, so the two records have contradicted each
other ever since — one saying the journal is a vault, the other saying vaults
are not being built.

## Decision

**The journal is a `NodeKind` with an encrypted payload.** Noah, 2026-08-02:
*"Kind plus encryption sounds best."*

### Why Q-10's objection does not reach the journal, and why a lens never could

Q-10's argument is entirely about **work versus home**, where both sides hold
work that must come back to you. Splitting those means two queues to remember.
**The journal holds nothing that returns.** Nothing in it is on a surface, under
a clock, or asking. The "two apps, remember to check both" failure has nothing to
attach to.

And the lens Q-10 recommended instead was never an option here, which is worth
stating so it is not proposed again: **a lens filters what you look at; the fold
still reads everything.** Encryption changes what the fold *can* read. Those are
different mechanisms at different layers, and only one of them satisfies
ADR-0005's binding.

So the real question was narrow: does the journal need the vault, or is the kind
enough? The vault buys exactly one thing a kind does not — the gate's existing
cross-vault refusal, so nothing can reference a journal entry. That is
replaceable with a kind check. Building user-facing vault machinery for one
consumer is not.

### What survives from ADR-0005, unchanged

- **Journal payloads are `{ciphertext, iv}` at rest**, and the fold cannot read
  them.
- **Encryption ships in the same release as the journal, or the journal does not
  ship.** Retrofitted encryption leaves plaintext in an append-only log forever;
  the only moment encryption can be complete is the first moment. This release
  honours it.
- **A forgotten passphrase means the journal is gone**, said plainly before the
  passphrase is set. The text lives in `PASSPHRASE_WARNING` in `src/journal.ts`,
  beside the derivation it describes, so the sentence and the mechanism cannot
  drift apart.
- **Search cannot index journal plaintext.** Now true by construction rather than
  by discipline — see below.

### The fold never touches ciphertext

An entry is a node (`node.created{nodeKind:'journal'}` +
`journal.entry.written`), and the journal surface reads the **log** directly and
opens entries in the UI — the log-viewer and per-node-history pattern from 1.4.0.

This is the load-bearing choice. It means no new `NodeState` field, so no
`MERGE_DISPOSITION` entry and no three-place ceremony; the fold stays pure and
readable whether the journal is open or not; and **there is nothing in state for
search to index**, which is a stronger guarantee than remembering to exclude it.

An entry is created with **no title**. A title would be plaintext in the log, and
there is no version of "just the first few words" that is safe.

### `journal` is demand-free

Verified by running the gate: without `journal` in `DEMAND_FREE_KINDS` the cure
gives every private entry a review clock, so it comes back on a work surface as
an untitled thing to be done. It is now demand-free, the same argument that made
`person` so — law 6's *"acting on one is a deliberate promotion, never an
obligation that accrued."*

**The coverage gauge still counts journal entries, and that is deliberate.** The
gauge proves law 1 over *every* node; excluding a kind from a proof is how law 1
gets defined away, which is precisely the merged-node finding of the 1.3.1 audit.
The held list excludes them, because that list is the todo list and a private
entry is not work you are holding.

### The key

PBKDF2-SHA-256, 600,000 iterations, recorded here as ADR-0005 requires.
Argon2id is the better primitive and is not in WebCrypto; shipping a WASM build
of it would trade this app's no-dependency property — the reason it can be
audited, loads instantly and keeps working unmaintained — for a marginal gain
against an attacker who must already hold the device's storage.

The **iteration count is stored with the salt**, not hard-coded, so a later
release can raise it and still open what an earlier one sealed. A count *below*
the floor is refused rather than honoured: a record carrying `iterations: 1`
would make the key cheap while everything still appeared to work.

The salt is in the log in the clear, on purpose — it must reach a second device,
or the same passphrase would not open the journal there.

The derived key is **not extractable** and lives in a closure for the life of an
unlock. Closing drops it; a reload starts closed. There is no "stay open".

### Refused in this release, and said rather than half-built

- **No passphrase change.** It would mean re-sealing every entry, which in an
  append-only log means writing every entry again.
- **No tags.** `journal.tag.attached` stays unemitted; what may ever be rendered
  from tags is constrained by law 7 and is its own decision.
- **No search, no counts, no analytics of any kind.**

## Consequences

- `vault.locked` / `vault.unlocked` are superseded and unemitted. They stay in
  the vocabulary because removing a name from an append-only log is destructive
  for no gain — but an unlock is a session fact, not a durable one.
- The `vault` field stays on every event and the gate's cross-vault refusal stays
  enforced. Both cost nothing and removing either would be a destructive schema
  change (Q-10's own reasoning).
- Unlocking **proves the key against a real entry** before reporting success. A
  wrong passphrase derives a perfectly valid key that opens nothing, so unlocking
  on derivation alone would show an empty journal — which reads as *your entries
  are gone*.

## What would overturn this

- **A second consumer for vaults.** If work/home separation is ever built as a
  partition rather than the lens, the journal should join it rather than keep a
  parallel mechanism.
- **Evidence that entries need to be findable.** They are unfindable by design,
  and if that makes the journal useless in practice the answer is a decrypted
  in-memory index built at unlock — never plaintext in the log.
- **Not by "the vault would have been tidier."** It would; it was also machinery
  for one consumer, and Q-10 closed it for the general case.
