# CLAUDE.md — Quietkeep

> **Inherits the Universal App Doctrine** — the canonical copy lives in the hub
> repo at [`njefferson/noahjefferson/DOCTRINE.md`](https://github.com/njefferson/noahjefferson/blob/main/DOCTRINE.md).
> It is the single source of truth for the rules shared across all of Noah's
> apps: product values, taste, accessibility, honesty, verification, release
> discipline & taxonomy, licensing (PolyForm Noncommercial), privacy, the
> permanent **AskUserQuestion ban** (§0), and the **repo-metadata confirm rule**
> (§10). **Where anything below overlaps the Doctrine, the Doctrine wins.** This
> file keeps only what is specific to this repo. Never fork the doctrine here —
> link to it. The cross-app [`LESSONS.md`](https://github.com/njefferson/noahjefferson/blob/main/LESSONS.md)
> lives in the hub too; append to it from this repo's sessions, never copy it.

## What this repo is
**Quietkeep** — a free, local-first planner for neurodivergent users. Static PWA,
no accounts, no telemetry, no server-side user data. Deployed to Cloudflare Pages.

Tagline: *"Out of sight. Never out of mind."*
Epigraph: *"It holds the rest, so you can rest."*

## Read these first, in this order
1. [`NOTES.md`](NOTES.md) — the repo source of truth: thesis, the ten product
   laws, the frozen v1 scope, open questions, Project facts.
2. [`docs/adr/`](docs/adr/) — every settled architectural decision, one per file.
3. [`docs/event-vocabulary.md`](docs/event-vocabulary.md) — the complete event
   noun list. **All application state folds from this.** Nothing is stored that
   is not an event named here.
4. [`docs/verifications.md`](docs/verifications.md) — what has actually been
   checked and what merely looks checked. Consult before assuming a platform fact.

## Rules specific to this app
- **The ten product laws in `NOTES.md` are invariants.** Violating one is a
  defect, not a trade-off. Two carry teeth in code: *no silent nodes* (every node
  is on a surface, under a clock, on the Menu, or parented to something under a
  clock — the write boundary refuses anything else) and *no past bucket* (a
  passed date auto-converts to a present replan card; there is no archive state).
- **No "overdue" anywhere** — not in the schema, not in a variable name, not in
  copy. One decay primitive `(last_done, comfort_window, rising pressure)` runs
  everything temporal. No streaks, ever.
- **Data is never lost to updates.** Append-only log, state = fold(log),
  migrations additive-only, auto-export a snapshot before any migration, import
  always seeds a fresh store and never merges.
- **AI never blocks.** Every assisted flow has a working offline rung. Cloud
  rungs require explicit consent naming exactly what leaves the device.
- **Never use the GTD®/Getting Things Done® marks.** Trigger-list content must be
  original — the published lists are copyrighted.
- **Voice:** adult, calm, shame-free, civilian. No military vocabulary in naming
  or brand copy. Never childlike or mascot-cute. No diagnosis-flavoured copy, no
  sentiment scoring, no cause attribution.
- **No spiral. Anywhere.** Not in the identity, not in a loading state, not in an
  illustration. **A spiral is loss of control and it is anxiety-laden** — it is the
  shape of tightening inward with no way out, and it names the condition this app
  meets people in. It belongs beside *no red walls* and *no streaks* as something
  the product structurally cannot say ([ADR-0025](docs/adr/0025-visual-identity.md)).
- **The voice rules bind the artwork, not only the words.** Check a mark against
  the audience's own vocabulary, not only against other logos. "Does this look like
  something else" is a collision check, and it is a lesser question than "what does
  this mean to the people who will use it".
- **Storage is IndexedDB via Dexie.** `localStorage` is banned outright.

## Branches & releases
`staging` and `main` only. Ignore any harness-designated `claude/*` branch
(Doctrine §11). Every product change lands on `staging` and waits for Noah's
on-device pass and his explicit "promote" (Doctrine §7). Docs-only changes — this
file, `NOTES.md`, `ACCESSIBILITY.md`, anything in `docs/` — may skip the staging
gate.

Release taxonomy and the `version.capability.iteration` triplet are Doctrine §7.
The service-worker cache name carries the same triplet and is bumped with it.

## Accessibility
WCAG 2.2 AA target, COGA-informed. [`ACCESSIBILITY.md`](ACCESSIBILITY.md) is the
append-only register and it already records the design-time colour bindings —
read it **before** writing any UI. Pressure and decay never ride on hue; the
contrast gate is computed in CI and exits non-zero, and new foreground/background
pairs are added to the gate in the same commit that introduces them.

## Anything he pastes is a code block (Doctrine §2)
Handoff prompts, commands, configs, a message to send on — if the next thing
that happens to it is *copy*, it ships as **one fenced code block**, not prose,
not a blockquote, not styled markdown. Rendered formatting does not survive
being copied back out, and selecting prose by hand on an iPad is a fight. The
test is not "is it readable" but "what does he do with it next".

## No tables, anywhere (Doctrine §2)
Markdown tables do not render on Noah's iPad — they arrive as pipes and dashes
and the content is lost. **Never put one in anything he reads**: chat, commit
messages, PR bodies, `NOTES.md`, `CHANGELOG.md`, plan files, or anything under
`docs/`. Headed lists or one fact per line instead. The repo was converted in
full on 2026-07-29; do not reintroduce one.

## Repo metadata (manual, confirm — see Doctrine §10)
Description / website / topics / social-preview are GitHub-UI steps the session
token cannot perform. List the exact values and ask Noah to confirm each; never
report Quietkeep "set up" while any is unconfirmed.
