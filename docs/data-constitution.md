# Data constitution

What Wynts stores, what it promises about it, and every way out.

This is a commitment document. It is written so that a future version of this app
can be checked against it, and so that you can leave without asking anyone's
permission.

---

## The promises

1. **Your data is yours.** The [licence](../LICENSE.md) covers the software. It
   makes no claim on the log, the snapshots, or the exports. Nothing you write is
   ours.
2. **It stays on your device** unless you explicitly say otherwise, in a
   consent that names exactly what leaves and where it goes.
3. **There is no account, and no server holding your data** — not encrypted, not
   "anonymised", not at all. There is nothing to breach because there is nothing
   there.
4. **No telemetry. None.** Not usage analytics, not crash reporting, not
   "anonymous statistics to improve the product". If something breaks you may
   *volunteer* a diagnostic report, by choosing to, every time.
5. **Data is never lost to updates.** The log is append-only, migrations are
   additive-only, and a snapshot is exported automatically before any migration —
   without being asked.
6. **Free, permanently.** No subscription, no paid tier, no feature held back, no
   "pro" version. If this app ever stops being maintained, everything below still
   works, because none of it needs us.
7. **You can always leave, and the door does not require us.** Exports are plain
   text you can read with any text editor.

---

## What is stored

Everything is **events** — see [`event-vocabulary.md`](event-vocabulary.md) for
the complete, closed list. State is computed by folding the log; there is no
separate database of current state that could disagree with it.

A record:

```json
{"id":"01J...","kind":"node.created","vault":"work","node":"01J...",
 "at":"2026-07-27T14:02:11.000Z","device":"dev-7f3a","seq":1841,
 "payload":{"nodeKind":"action","title":"…"}}
```

**Where it lives**

| | |
|---|---|
| Primary store | IndexedDB, via Dexie ([ADR-0002](adr/0002-storage-dexie-indexeddb.md)). `localStorage` is **never** used. |
| Optional mirror | A folder you choose, synced by a service you already use. Chromium desktop only ([ADR-0003](adr/0003-folder-mirror.md)). |
| Backups | Files you export, wherever you put them ([ADR-0006](adr/0006-backups-and-import.md)). |

**Partitioned by vault** — work, personal, journal. Every event belongs to
exactly one, and **cross-vault references are forbidden**, not merely
discouraged. People are vault-scoped: the same person in two vaults is two
records, deliberately ([ADR-0005](adr/0005-vaults-and-journal-encryption.md)).

---

## What is never stored

Written down so it can be checked, and so no future feature can add one quietly.
Each is enforced by there being **no event that could carry it** — the vocabulary
is a closed list, so these are structural absences, not policy promises.

- **No sentiment, mood score, or valence.** Journal entries carry tags for
  co-occurrence rendering only. The app plots; you interpret (product law 7).
- **No cause attribution.** The app will show you that a pebble and a low-capacity
  week overlapped. It will never tell you one caused the other.
- **No message content.** The comms sweep schedules *when you look*. It has no
  integration and never sees a message.
- **No location, no contacts, no calendar reading.** The `.ics` export is
  one-way — Wynts writes a file, and never reads your calendar.
- **No behavioural analytics.** Nothing counts how often you open the app, how
  long you looked at a screen, or what you declined. **"Not this" on the Next-up
  card is not recorded as a rejection** — there is no event for it, so no future
  feature can start showing you one.
- **No identifiers that could link installs**, beyond the `deviceId` used to keep
  sync shards apart. It is local, random, and meaningless off your devices.

---

## Formats

**The log** — JSON Lines (`.jsonl`), one event per line, UTF-8. Plain text.
Readable in any editor, greppable, diffable. Chosen for legibility with no tools
at all, and because a truncated file loses one line rather than everything.

**Exports** — immutable and timestamped; an export never overwrites an earlier
one. The filename carries vault, timestamp, and encryption status, so a folder of
backups is legible without opening them. Contents are the **log** plus a snapshot
for fast restore — the full history, not a picture of the current state.

> **Restore must work from the log alone.** The snapshot is an optimisation, and
> there is a test that proves the log suffices, because a snapshot-format bug
> would otherwise stay invisible until the day it matters.

**Journal** — encrypted at rest with WebCrypto, and **its exports are encrypted
too**. Encryption shipped in the same release as the journal and was never
retrofitted; in an append-only store, plaintext written before a retrofit stays
in the log and in old backups permanently, so the first moment is the only moment.

> **If you forget the journal passphrase, the journal is gone.** We cannot
> recover it — there is no key escrow and no reset, because either would mean we
> could read it. This is said before you set a passphrase, not afterwards.

**Calendar** — `.ics` with `RRULE` and `VALARM`, so your OS calendar does the
reminding. A point-in-time snapshot: change a date in Wynts and the exported
calendar is stale until you re-export. The app says so rather than implying the
calendar is live.

**Community content** — plain JSON. Templates, trigger lists, and vocabulary
skins are *data*, never code. They are validated on load, never trusted, and have
no access to your log.

---

## The ways out

Every one of these works offline, with no account.

1. **Export a vault** — a `.jsonl` file you can read yourself.
2. **Export everything** — all vaults, one operation.
3. **Point at a folder** and let your own sync service hold a live mirror
   (Chromium desktop).
4. **Read the raw store** — it is IndexedDB in your browser, and browser dev
   tools open it without us.
5. **Read the format** — [`event-vocabulary.md`](event-vocabulary.md) documents
   every event completely. Anyone can write an importer for another tool, and we
   would rather they did than that you felt stuck.

**Import always seeds a fresh store. It never merges.** Merge is where backup
tools destroy data quietly, and asking you to resolve a conflict between two
versions of a note from eight months ago is asking an unanswerable question
([ADR-0006](adr/0006-backups-and-import.md)).

---

## Diagnostics

If something breaks, you may **choose** to copy a diagnostic report. It is
generated on request, shown to you in full before it goes anywhere, and you send
it — nothing transmits by itself. Because the log *is* the history, an exported
segment is a complete reproduction case, so we never have to ask you to remember
what you did.

---

## AI and consent

Every assisted flow has a working offline rung that needs no network and no
account ([ADR-0015](adr/0015-ai-never-blocks.md)). Cloud rungs are **opt-in**, and
the consent names exactly what leaves the device — **the literal sentence you
agreed to is stored**, so the record survives a later change in wording.

Consent is per-scope and revocable at any time, immediately, without explanation.

**AI never writes to your data silently.** Every AI-derived value is confirmed by
you and tagged with its provenance, so you can always tell what you wrote from
what was suggested.

---

## What this is not

**Wynts is a personal app.** It is not designed for, tested on, or approved for
government-furnished equipment, and **nothing in it is a control for classified,
controlled, or otherwise restricted information.**

It has no accreditation, no security categorisation, and no assurance process behind
it. It was built by one person for their own use and shared because it might help
someone else.

> Some managed devices would likely refuse to grant a web app persistent storage, which
> would get in the way of using it there. **That is an expectation, not a tested
> control, and this document does not rely on it.** Nobody has verified it, and an
> unverified technical guess is not a safeguard — see
> [V-06](verifications.md) for why it is written down but not leaned on. The scope
> statement above is the actual answer.

## The work vault

The vault split is a **convenience for keeping content separate**, not a policy
boundary. Work and personal material tend to want different exports, different
audiences, and different moments — so the app makes that easy.

**What goes in it is the user's judgement**, exactly as with any other personal app on
any other personal device. Wynts does not inspect, classify, or police what you
write, and it could not do so meaningfully if it tried.

What the design does guarantee:

- The work vault is **separate at the schema level**, and cross-vault references are
  refused by the write gate rather than discouraged by convention.
- It **exports separately**, so a work export cannot carry personal content — the
  boundary holds where it matters most, at the moment data leaves.
- People in the work vault are distinct records from the same humans elsewhere.
- Nothing in it goes anywhere without the network consent described above, and by
  default nothing goes anywhere at all.

---

## If this app is abandoned

A commitment that costs nothing to make and matters most when it is needed:

- Your data is **already on your device** in a documented plain-text format. It
  does not become inaccessible because we stopped.
- The app is a **static PWA**. An installed copy keeps working with no server,
  because there was never a server.
- The **format is documented here and in
  [`event-vocabulary.md`](event-vocabulary.md)** thoroughly enough to write an
  importer without our help.
- The source is available under [its licence](../LICENSE.md).

There is no kill switch, no licence check, no phone-home. There is nothing we
could turn off that would stop your copy working.
