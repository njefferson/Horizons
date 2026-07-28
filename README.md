# Quietkeep

**Out of sight. Never out of mind.**

> *It holds the rest, so you can rest.*

A free, local-first planner for people whose memory for intentions does not run
on willpower. It is built on one promise: **anything you put in comes back to
you.** Not because you remembered to look, but because the app is structurally
incapable of letting something go quiet.

> **Status: early — capture works.** The event-sourced spine and the first
> surface (capture, with the ⓘ panel and export) are live at
> **[quietkeep.pages.dev](https://quietkeep.pages.dev)**. Clarify, work mode, and
> everything after are still to come. The design record — decisions, the event
> vocabulary everything folds from, and the reasoning — is in this repository.
> See [`NOTES.md`](NOTES.md) for where things stand.

## What it is

- **Free**, and permanently so. No accounts, no subscription, no upsell.
- **Local-first.** Your data lives on your device. There is no server holding it,
  because there is no server.
- **No telemetry.** None. Not anonymised, not aggregated, not "to improve the
  product." If something breaks you may *volunteer* a diagnostic report.
- **Offline.** A static PWA. The network is never on the critical path.
- **Yours to leave.** Every byte exports to plain files you can read without us.

## What it refuses to be

- It will not score your mood, infer why you did or didn't do something, or use
  language borrowed from a diagnosis. It plots; you interpret.
- It has **no streaks and no overdue state.** A missed day is not a broken chain,
  and a passed date is not a failure to be filed away — it becomes a live card
  asking what you'd like to do now.
- It has **no archive of things you let slip.** There is no past bucket.
- It does not treat rest as a lapse. Coming back after a while away is a designed
  path, not an exception, and what greets you is bounded — never the backlog.
- It does not assume willpower is a tank that empties. The research that claimed
  so did not replicate, and nothing here is built on it.

## Documentation

| | |
|---|---|
| [`NOTES.md`](NOTES.md) | Source of truth — thesis, the ten product laws, frozen v1 scope, open questions |
| [`docs/planning-for-humans.md`](docs/planning-for-humans.md) | Why every feature exists, mapped to the finding behind it and how well established that finding is |
| [`docs/data-constitution.md`](docs/data-constitution.md) | What we store, what we promise, and every way out |
| [`docs/event-vocabulary.md`](docs/event-vocabulary.md) | The complete event list that all state folds from |
| [`docs/adr/`](docs/adr/) | Architecture decision records |
| [`docs/build-plan.md`](docs/build-plan.md) | Architecture and build sequence |
| [`docs/verifications.md`](docs/verifications.md) | What has been checked, and what only looks checked |
| [`ACCESSIBILITY.md`](ACCESSIBILITY.md) | Append-only accessibility register |
| [`CHANGELOG.md`](CHANGELOG.md) | What changed, written for the person using the app. Generated — the app's ⓘ panel shows the same notes |

## Accessibility

WCAG 2.2 AA is the target, with COGA-informed patterns for the cognitive load
this app exists to reduce. Pressure and time are never encoded by colour alone.
Shared statement across all of these apps:
**[noahjefferson.pages.dev/accessibility](https://noahjefferson.pages.dev/accessibility)**

Found a barrier? That is a bug report, and it is welcome.

## Licence

[PolyForm Noncommercial 1.0.0](LICENSE.md) — use it, change it, share it; don't
sell it. **Your data is not covered by the licence, because it isn't ours.**

---

One of the free web apps at **[noahjefferson.pages.dev](https://noahjefferson.pages.dev)**.
