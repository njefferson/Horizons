# ADR-0007 · Notification ladder T0 → T3, each tier standing alone

**Status:** Accepted · **Date:** 2026-07-27

## Decision

Four tiers, built in order, each **complete and useful on its own**:

| Tier | What | When | Server |
|---|---|---|---|
| **T0** | Notification permission + app badge + glance surfaces | v1 | none |
| **T1** | `.ics` export with `RRULE` / `VALARM` — the OS calendar notifies | v1 | none |
| **T2** | Cloudflare Worker cron + Web Push, opt-in | v2 | minimal |
| **T3** | Native wrap (Capacitor local notifications) — **and the Worker is deleted** | later | none |

T0's permission request is made **at first run, for badge and storage
persistence**, before any push mechanism exists.

## Why

The app cannot be the thing that reminds you if it only works when you open it.
But it also cannot require a server, because "no server-side user data" is part
of what this app *is* (Doctrine §1).

T1 resolves that tension and is the tier that carries v1. An `.ics` file with
`VALARM` hands the job to the OS calendar — which already has notification
permission, already runs when the app doesn't, and **works on every platform
including iOS in the EU**, where V-03 shows web push is still contradicted
across sources. It is unglamorous and it is the only tier that works everywhere.

T0's permission timing is deliberate and slightly counter-intuitive: iOS is
reported to gate *storage persistence* on notification permission, so asking for
notifications at first run is really asking for the data not to be evicted. The
badge is a genuine benefit, not a pretext — but the persistence is the reason
it happens at Tier 0 rather than when the first reminder is set.

T2 is opt-in and **metadata-only**: subscription endpoint and fire times, generic
payload. The Worker never learns what a reminder is *about*. T3 deletes the
Worker rather than keeping it around, because a server that exists will
eventually be given more to do.

## Consequences

- v1 ships with real reminders and **no server**. This is the point.
- `.ics` generation must handle recurrence and timezones correctly. Headless
  browsers run in UTC, which has produced timezone bugs in a sibling app that
  only appeared in real use — the `.ics` tests must pin a non-UTC zone explicitly.
- A `.ics` export is a **point-in-time snapshot**. If a clock changes in the app
  the exported calendar is stale, and the app must say so honestly rather than
  implying the calendar is live.
- T2 requires a consent record naming exactly what leaves the device
  ([ADR-0015](0015-ai-never-blocks.md) uses the same mechanism).
- V-03 stays open until T2 is actually built, and is re-checked then against
  Apple's own documentation rather than secondary reporting.
- If a user declines notification permission at T0, everything still works.
  Nothing is gated behind it except the badge and, on iOS, persistence — and the
  persistence consequence is stated plainly rather than used as leverage.

## What would overturn it

iOS web push becoming unambiguously reliable everywhere would make T2 more
attractive sooner. It would not remove T1 — the calendar path is the only one
that survives a user who never opens the app.
