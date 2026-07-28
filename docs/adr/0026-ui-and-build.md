# ADR-0026 · No framework, and one build step

**Status:** Accepted · **Date:** 2026-07-28

The build plan left two things "decide at build start". This is that moment.

## Decision

**1. No UI framework.** Surfaces are written against the platform: real
`<button>`, real `<dialog>`, real `<form>`, `:focus-visible`, `rem` sizing, and
`textContent` for anything the user typed.

**2. One build step — esbuild**, pinned, stripping types and bundling
`src/ui/app.ts` into a single ES module at `public/app.js`. It is the only build
step, it transpiles nothing down (`--target=es2022`, which the reference platform
already runs), and its output is **not committed**.

## Why no framework

Build-plan §1 asked for *"the smallest thing that does real keyboard/focus/dialog
semantics well"* and required that it must not fight `<dialog>`, `:focus-visible`
or `rem` sizing. Nothing does those better than the platform that defines them,
and every framework that gets close does so by re-implementing them — which is
where the accessibility bugs in this class of app come from.

The surfaces here are also small. Dump is a form, a list, and a live region. A
framework would be more code than the thing it renders.

**This is not a permanent vow.** If a surface arrives that genuinely needs
managed state, that is a new decision with a new record. What is permanent is the
requirement it would have to meet: it may not degrade dialog, focus, or text-size
behaviour, and `ACCESSIBILITY.md` is the test.

## Why a build step at all, in a family that avoids them

Honestly: because **TypeScript was chosen deliberately and browsers cannot strip
types.** Those two facts are incompatible without a step, and the type system is
not decoration here — the event vocabulary is a closed discriminated union, and
types are what stop an unlisted `kind` reaching the log ([ADR-0001](0001-event-sourced-log.md),
build-plan §1). Giving that up to avoid a build would be trading the stronger
guarantee for the weaker one.

**What the family standard actually protects is unaffected.** The concern behind
"no build step where avoidable" is survivability — [`data-constitution.md`](../data-constitution.md)
promises that an installed copy keeps working with no server and that the data
outlives the app. Both still hold: the deployed artifact is a static PWA, an
installed copy needs nothing, the log is plain JSONL, and the source is one
`npm ci && npm run build` from running. A build step is a cost to a *contributor*,
not to a user, and not to someone recovering their data in ten years.

**It stays minimal on purpose.** One dependency, pinned exactly (Doctrine §16.1).
No transpiling to older syntax, no polyfills, no plugins, no framework compiler.
If this ever needs a config file, that is a signal to re-read this record.

## Consequences

- **`public/app.js` is generated and gitignored.** A generated artifact in the
  tree drifts from its source and then starts getting hand-edited.
- **The deploy builds it** — `.github/workflows/deploy.yml` runs `npm ci &&
  npm run build` before the Pages step. Without that the shell would ship with no
  app, which is worse than shipping nothing.
- **`npm run smoke` is a gate**, because the unit tests cannot see any of this.
  They prove the spine folds in Node; they cannot prove the bundle loads, that
  Dexie opens in a browser, that the gate runs on the write path the UI uses, or
  that a captured thought comes back. The walk asserts the promise, not the
  plumbing — capture something, reload the whole page, and it is still there.
- **The walk was made to fail before being trusted** (Doctrine §6): dropping the
  `session.commit` call while leaving the "Held." confirmation in place produced
  a failure and exit 1. That is the exact defect ADR-0008's commit-before-confirm
  rule exists to prevent, and the gate catches it.
- **The walk pins a non-UTC timezone** (`America/Denver`). Headless browsers run
  in UTC and would pass a test that breaks the moment a real user's evening reads
  as 3 AM (build-plan §2).
- `localStorage` stays banned. The per-keystroke draft lives in an **additive**
  Dexie v2 `kv` store — scratch, not history. A keystroke is not an event, and
  flooding the log with them would make the history unreadable for no gain.

## What would overturn it

For the framework: a surface that cannot be built well against the platform, with
the specific failure named. For the build: TypeScript ceasing to be the language,
or browsers gaining type stripping — at which point this record is obsolete
rather than wrong.
