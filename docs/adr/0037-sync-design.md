# ADR-0037 · Quietkeep Sync — a relay that cannot read, gated so it cannot be turned on by accident

**Status:** Accepted (design) · **Date:** 2026-07-29 · Noah's decision
· **All three open items answered by Noah, 2026-07-29 — see "Noah's answers".**

## Noah's answers, 2026-07-29

1. **The doctrine wording — "make it right."** Done, and it went further than a
   wording tweak: [Doctrine §1](https://github.com/njefferson/noahjefferson/blob/main/DOCTRINE.md)
   now says the DEFAULT of every app keeps the promise absolutely, and any sibling
   that trades a piece of it away is a **separate product with its own honest
   claim** — the default is never weakened to accommodate it. The sharpest of the
   six rules it added: *an id is account-shaped and must be called what it is.*
   Do not say "no account" because the word was technically avoided.
2. **No push. Exchange when the app opens, and it just works.** His words:
   *"Exchange when it opens and just works."* This is a **much smaller build than
   the one this ADR was scoped for** and it removes the entire push tier:
   - no notification permission, no subscription, no VAPID keys, no waking a
     device, and **V-03 is no longer on the path** (it gated push only);
   - the relay becomes a pure transport with no ability to initiate anything.
   The earlier reading — that he wanted push — came from him saying he did not
   want to think about it. That reason is about **his data being current wherever
   he picks up**, which exchange-on-open delivers completely. Push is a different
   want (*a reminder reaching him when Quietkeep is shut*), it is still the job
   the calendar export does today, and **V-14 remains unverified** for it.
3. **NOT a version.** *"No version until I've ensured it actually all works."*
   Consistent with his v1 ruling. Sessions do not number this.

## The constraint that shapes everything, stated plainly

**Exchange-on-open requires a server.** Two devices cannot discover one another
without one, and Safari does not ship the File System Access pickers that would
let [ADR-0003](0003-folder-mirror.md)'s folder mirror do this with no server at
all. So the relay is not a convenience — it is the only available transport, and
it is the first server this project has ever had.

**What keeps the promise intact anyway:** every device keeps its own complete
local log. The relay is a **transport, not a store of record**. That is what makes
end-to-end encryption safe here — if the key is ever lost, nothing permanent is
lost, because no device was ever depending on the relay for its own data. A sync
design where losing a key loses your work would violate law 9 outright; this one
cannot, by construction.



## Decision

Quietkeep Sync ([ADR-0036](0036-two-builds-one-branch.md)) carries devices'
shards between themselves through a **relay that holds only ciphertext**.

1. **Sync at the visibility boundaries, not in the background.** Leaving the app
   uploads; opening it pulls. No Background Sync API, no push, no Apple
   entitlement, no code running while the app is closed.
2. **End-to-end encrypted.** The key is generated on the device, shown once, and
   never sent. The relay stores opaque bytes it cannot read.
3. **Single-writer shards, exactly as [ADR-0035](0035-multi-device-shard-union.md)
   already folds them.** A device uploads only its own events. The relay never
   merges anything and never needs to.
4. **Heavily gated**, per the section below.
5. **Never blocking.** The app is complete offline; a failed sync is a quiet fact
   on a surface, never an error that stops anything. This is law 10's shape
   applied to a non-AI cloud rung.

## Why not background

*"Walk out of my office and pick up on the other device"* is satisfied by syncing
when the app loses and gains visibility:

- leaving the iPad → upload on `pagehide`, with `keepalive` so the request
  survives the page being backgrounded
- opening the iPhone → pull on load

From the user's side that is automatic. **True background execution buys only one
thing**: the phone being current *before* it is opened, which matters for
notifications and not for picking work up. And it costs a great deal — Background
Sync and Periodic Background Sync are not in Safari, so the only way to run code
with the app closed is a Web Push waking the service worker, which needs a
home-screen install, notification permission, a VAPID server and Apple's push
service in the path.

**[V-03](../verifications.md) is still PARTIAL** on whether iOS web push is even
reliably available, and says in terms to re-check it against Apple's own
documentation rather than secondary reporting when T2 is built. That check
happens **before** any push code, not alongside it.

## The gating

Not a toggle. A toggle is one mis-tap.

- **Off by default, and unmentioned** outside a single place in the (i) panel.
- **A disclosure that must be scrolled**, stating the exposure below in the
  user's own words — not a link to it, not a summary.
- **Typed confirmation** to enable. A word, deliberately typed. A mis-tap cannot
  reach it and neither can a screen-reader user's stray activation.
- **The key is shown once**, with "write this down" and the plain statement that
  **there is no recovery**. Losing it makes the synced copy permanently
  unreadable — which is correct behaviour and is said as such, not apologised for.
- **A permanent visible indicator** while it is on: that it is on, what was last
  sent, and when. Never a silent background state.
- **One tap off**, and a separate **erase everything on the relay**. The
  off-switch states what remains where, because "off" and "deleted" are different
  and a person is entitled to know which they got.

## The exposure — what the relay can and cannot see

This is the section the disclosure is written from, and it is deliberately
specific.

**It cannot see** the text, titles, dates, or structure of anything. Those are
ciphertext, and the key never leaves the device.

**It can see**, unavoidably:

- a **sync id**, and the **size** of every blob
- a **timestamp** on every upload and download — therefore **when the app is
  used, how often, and roughly how much is being carried**
- the **IP address** of each request — therefore approximate location, and which
  networks the devices are on

That third and second together are the real cost and are not minimised here: for
this audience, a log of *when you open your planner and how often* is a record of
the shape of your day. It is not content. It is not nothing.

**With push added** (not in this design), Apple's push service additionally sees
the endpoint and the timing of every nudge.

**Two absolutes.** Lose the key and the synced copy is unreadable, permanently.
Leak the key and everything ever synced is readable by whoever has it.

**And the standing risk ADR-0007 named about itself**, which applies here
verbatim: *"a server that exists will eventually be given more to do."* The relay
gets no feature that is not sync, and if the day comes that it does, that is a
new record and not an enhancement.

## Consequences

- **Three things need Noah's word before this ships**, and none is an
  implementation detail:
  1. **The doctrine text.** "No accounts, no telemetry, no server-side user data"
     stays exactly true of Quietkeep and becomes partly false of Quietkeep Sync.
     A sync id is account-shaped. The wording is his.
  2. **[V-03](../verifications.md) re-run** against Apple's own documentation.
     Required only if push is ever added, but recorded now so it is not
     discovered late.
  3. **Whether this is a VERSION** (Doctrine §7, first slot). It changes what the
     app *is* for anyone who opts in. That judgement is his and is not inferred
     from diff size.
- The relay is the only server this project has ever had. It ships with the
  Worker source in this repo, so what it does is readable by the person trusting
  it.
- Sync failing is never an error state. It is a line on a surface saying when the
  last exchange happened, which is also how someone notices they have left
  coverage.
- Nothing in the default build changes. Not one line.

## Status, 2026-07-30

Stages 1 to 3b are built and sitting on `staging` with no triplet bump, because
nothing in them is reachable from a surface and the default build is unchanged:

- `src/exchange.ts` — what a device holds, as coalesced ranges. A per-device
  maximum is not a completeness claim, and treating it as one is silent permanent
  loss: a device holding seq 1, 2 and 5 announces "up to 5", the other side
  believes it, and 3 and 4 are never recovered by anybody.
- `src/seal.ts` — AES-256-GCM, a fresh IV per seal, one refusal message for every
  cause, and the summary sealed as well as the events, because an unsealed summary
  is a per-device write-rate graph and that is telemetry by another name.
- `src/relay.ts` and `relay/worker.ts` — a mailbox per sync id. Append-only, no
  delete route, expiring, and refusing anything not shaped like a sealed message
  so it cannot become a general-purpose host. It cannot prove a body is encrypted
  and is not asked to; it has never held a key.
- `src/sync.ts` — the driver. Ordered so that a death at any point leaves the
  device with strictly more than it had: arrivals are persisted before the mark
  that records them advances, and a chunk that will not open is left in place
  rather than written off, because a newer format means the other device is ahead.

### The fourth thing that needs Noah's word

**How the key reaches the second device.** The crypto is transfer-agnostic, which
is why everything else could be built without settling it. The options, honestly:

- **A pairing file.** Export a tiny file on device one, open it on device two.
  Uses machinery that already exists (the export path, the share sheet, AirDrop),
  works with no camera and no typing, and is the only option that is comfortable
  when the two devices are not in the same room. The cost is that a key in a file
  is a key in Files — it can be backed up to iCloud without anybody deciding to.
- **A typed code.** Forty-four characters, read off one screen and typed into the
  other. Nothing is stored anywhere in between, which is the strongest property on
  offer. It is also the least kind rung for this audience: forty-four characters
  is a working-memory task with no error correction, and getting it wrong produces
  a refusal that cannot say which character was wrong.
- **A QR scan.** Device one shows it, device two's camera reads it. Fastest and
  hardest to get wrong, needs both devices present, needs camera permission, and
  needs a QR encoder in the bundle — the first dependency this app would take on
  for a feature rather than for correctness.

No recommendation is recorded here on purpose. It is a thing Noah has to live
with, and the honest position is that the file is the most practical, the code is
the most private, and the QR is the easiest to get right once.

## What would overturn it

A transport that removes the relay without losing the property — Safari shipping
the File System Access pickers would let ADR-0003's folder mirror do this with no
server at all, and the shard model underneath would not change by a line.
