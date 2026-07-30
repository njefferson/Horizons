# Running the relay: what to watch, and how

The relay is a Cloudflare Worker plus one KV namespace. It holds sealed chunks
for a while so a second device can pick them up. It is not part of Quietkeep and
losing it costs nobody their work — every device keeps its complete local log.

This is the operator's page: how to see what is happening, and what to do when
something is.

## The status page — open it any time

  https://quietkeep-relay.noah-jefferson.workers.dev/status

It is plain text and carries no sync id, so it is safe to open, bookmark, or
share. It tells you three things:

- **the relay is up** (the page loads at all),
- **storage is reachable** (it did a cheap read to check), and
- **in words**, what a sync failure most likely means and that nothing is lost.

If your devices cannot sync:

- **the page loads** → the daily limit has most likely been reached. It resets on
  its own at 00:00 UTC. Nothing you wrote is lost. If it keeps happening on quiet
  days, something is flooding the relay — see below.
- **the page does not load** → the relay itself is unreachable. Your data is still
  safe on your devices; sync resumes when the relay is back.

## The three failure signals, in plain terms

When a device tries to sync and cannot finish, it says so, and the cause is one
of these — all of them keep your data and recover on their own:

- **"could not reach the handover point"** — offline, or the relay is down.
- **"busy, try again shortly"** — the per-device rate limit tripped (rare in
  normal use; means many requests from one address in a short window).
- **"reached its daily limit"** — the account-wide write budget for the day is
  spent. Resets at 00:00 UTC.

## The write-rate alert — one dashboard step (operator to confirm)

The relay deliberately keeps NO request logs — a log would record sync ids, which
are a per-household activity trace, and that is the telemetry this project does
not have. So the true write-rate lives only in Cloudflare's own metering, and the
alert is a Cloudflare **Notification** rather than anything in the code.

To set it up (about two minutes, once):

1. Cloudflare dashboard → **Notifications** → **Add**.
2. Choose **Workers KV** (or the closest "usage / limit" notification your plan
   offers) and point it at the `quietkeep-relay-CHUNKS` namespace.
3. Set it to email you when daily writes approach the free-plan limit.
4. Add your email as the destination.

That is the "someone is burning the quota while I am not looking" alert. It is the
one place the real rate is visible, and it reaches you rather than waiting for you
to check.

**This is a manual step the session token cannot perform (Doctrine §10).** It is
listed here for Noah to do and confirm; nothing in the repo can do it for him.

## What a flood can and cannot do

The relay's address is public (it is in the Sync edition's security policy), so a
stranger can POST to it. A per-address rate limit bounds one attacker, but a
**distributed** flood from many addresses can still spend the day's write budget
and stall sync for every household until the reset.

- It is **availability only**. No data is read, changed, or lost — the contents
  are sealed and every device keeps its own copy.
- It **self-heals** at 00:00 UTC.
- The response is NOT to upgrade to Cloudflare's paid plan to escape the throttle:
  on the paid plan the same junk traffic becomes a metered bill instead of a free
  error. The response is the notification above, plus rotating the relay or the
  pairing if it is sustained and targeted.

## Revocation (Replace the key)

Replacing a key on a device mints a new key and a new mailbox, AND empties the old
mailbox via the relay's DELETE route — so a device still holding the old key
cannot collect the last weeks of backlog. If the replacing device is offline at
the time, the old backlog expires on its own within a month instead. The one thing
no relay can undo is what a dropped device has already pulled onto itself.
