# Build plan

Architecture and build sequence for v1. Written **after** the decisions
([`adr/`](adr/)) and the event vocabulary, because both constrain this and neither
should be reverse-engineered from code.

Ordering principle throughout: **what does day one of the dogfood gate need?**
Not what is most interesting to build, and not what demos best.

---

## 1 · Stack and reference platform

Static PWA, no build step where avoidable — the family standard, and it survives
abandonment ([`data-constitution.md`](data-constitution.md)).

> **The reference platform is a personal iPad**, installed to the Home Screen from
> Safari (Noah, 2026-07-27). Every budget is measured there, every surface is designed
> for touch at that size first, and **the folder mirror does not exist there** — so
> export/import via Files carries the whole sync and durability story
> ([ADR-0004](adr/0004-ios-path.md)). Desktop is a secondary environment that may gain
> the mirror; nothing may depend on it.
>
> This is a personal app. It is **not for government-furnished equipment** — see
> [`data-constitution.md`](data-constitution.md).

- ****Language**** — TypeScript. The event vocabulary is a discriminated union; types are what stop an unlisted `kind` reaching the log.
- ****Storage**** — IndexedDB via Dexie ([ADR-0002](adr/0002-storage-dexie-indexeddb.md))
- ****UI**** — Decide at build start. Bias to the smallest thing that does real keyboard/focus/dialog semantics well. Whatever it is, it must not fight `<dialog>`, `:focus-visible`, or `rem` sizing (Doctrine §4).
- ****Deploy**** — Cloudflare Pages, `staging` → `main` (Doctrine §7)
- ****Tests**** — Property tests over synthetic logs + headless walk of the built app

**Dependencies stay few.** Dexie earns its place because raw IndexedDB's failure
modes corrupt data rather than throwing. Each further dependency needs that
standard of justification.

---

## 2 · Module boundaries

Five layers. **Dependencies point one way only.** The write gate is not
bypassable, including by tests — a test helper that writes around the gate stops
the property tests proving the property that matters most
([ADR-0011](adr/0011-no-silent-nodes-gate.md)).

```
┌─ surfaces ────────── Dump · Clarify · Work · Review · (Rest)
│                      Read state. Emit intents. Never touch the log.
├─ projections ─────── pressure · Next-up · gauge · exceptions · buffer burn
│                      Pure functions of state + now. Computed, never stored.
├─ fold ────────────── snapshot + tail → state
│                      Pure. Deterministic. Same log ⇒ same state, everywhere.
├─ write gate ─────── THE ONLY WRITE PATH. Law 1 enforced here, in-transaction.
└─ store ───────────── Dexie · shards · snapshots · export/import
```

**`now` is injected, never read from the clock inside a projection.** Pressure,
replan raising, and re-entry all depend on current time; a projection that reads
the clock itself cannot be tested at an arbitrary moment and will grow a
timezone bug that only appears in real use. A sibling app has already paid for
this one — and headless browsers run in UTC, so the tests must pin a non-UTC zone
explicitly or they will pass while the user's evening reads as 3 AM.

**Modules** ([ADR-0009](adr/0009-strategy-modules.md)) register surface
contributions. The core never imports a module.

---

## 3 · The critical path

### Phase 0 — Spine

Nothing is trustworthy until this is done, and everything after it is cheap by
comparison.

1. **Event types** — the vocabulary as a discriminated union, one type per `kind`.
2. **Store** — Dexie schema, `persist()` request, `deviceId`, gap-free `seq`.
3. **Fold** — pure, deterministic, `(at, device, seq)` ordering, per-field LWW.
4. **Write gate** — every `Silent? yes` event and its cure, in-transaction.
5. **Snapshot + tail** — startup path. Measure cold start from here on.
6. **Export / import** — import seeds fresh. Restore-from-log-alone test.
   **On the reference platform this is the entire durability story**, so it is built
   here in Phase 0, not deferred — including the Restore-on-empty action
   ([ADR-0004](adr/0004-ios-path.md)).
7. **Vaults** — required on every event; cross-vault refusal in the gate.

**Phase 0 exit criteria — all four, or it is not done:**
- Property test: arbitrary valid event sequences fold to **zero silent nodes**.
  Made to **fail once** against a deliberately silent node before being trusted
  (Doctrine §6 — a suite that has never been red proves nothing).
- Fold is deterministic across shard arrival orders — shuffle and re-fold.
- Round-trip: export → fresh store → import → **identical state**.
- Restore works from the log with the snapshot deliberately discarded.

### Phase 1 — Capture

Capture before anything that displays it. An app that captures and does nothing
else is already useful to the gate; the reverse is not true.

8. Dump surface — zero-chrome, one line per card, per-keystroke drafts.
9. Write path measured **cold, < 2 s, on the iPad** — the reference platform, not a
   desktop. Keyboard path included. This is a test, not an aspiration: a budget met on
   a laptop and missed on the actual device was never enforced.
10. `/capture?text=` endpoint — visible confirm, undo, and **only** able to
    create one unclarified inbox item. It can set no clock, route nothing,
    complete nothing, delete nothing ([ADR-0008](adr/0008-capture-endpoints.md)).
11. Manifest `shortcuts`; Web Share Target (feature-detected, Chromium).
12. Interrupt gesture (pin + capture) available from every screen.

### Phase 2 — Clarify

13. Heat pass — two-tap hot/cold.
14. Clarify — one card, six forced routes, every route terminating legally.
15. Two-minute timer on Do now.
16. Source tags, including the hotter `boss` run.

### Phase 3 — Work mode

The first point the app is worth opening in the morning.

17. Decay primitive — pressure computed from `(last_done, comfort_window, now)`.
    **Continuous. No thresholds in storage. No `overdue` anywhere**
    ([ADR-0010](adr/0010-decay-primitive.md)).
18. Next-up — hard landscape > resume cards > pressure rank. **"Not this" cycles
    freely, records nothing.**
19. Capped list of 5 behind it.
20. Upkeep chips above threshold.
21. Coverage gauge — tappable, showing each item's return date.
22. ~~Comms-sweep chip on focus-exit ramps.~~ **Done, 0.17.0.** Deferred out of
    Phase 3 with a reason (it needed focus ramps, Phase 4); those shipped in
    0.14.0, so the reason was spent.

### Phase 4 — Focus and resumption

23. Focus anchor — manual, one tap.
24. Auto-paired resume cards; skippable five-word cue.
25. Resume cards rank above pressure in Next-up.
26. ~~Unspent cards → day-end review question.~~ **(done, 1.6.0 — the session
    close asks the one question; `toReviewQuestion` finally set true by it,
    ADR-0052)**

### Phase 5 — Time and dependency

27. `dependency.declared` → latest-start, buffer burn.
28. **Replan cards** — auto-conversion on a passed clock, context assembled,
    three forward options, capped on the surface
    ([ADR-0012](adr/0012-no-past-bucket.md)).
29. T0 — permission, badge, glance surfaces. On iPadOS this is also what storage
    persistence is reported to depend on ([V-00](verifications.md)), so it is not
    optional polish.
30. T1 — `.ics` with `RRULE`/`VALARM`. **This is the notification path**, not a stepping
    stone to T2: it is the only mechanism that fires when the app is closed on the
    reference platform. **Tests pin a non-UTC timezone.**

### Phase 6 — The work half

Where the gate is actually won or lost. Without this the desk paper stays. Runs on the
personal iPad like everything else — there is no separate work-machine configuration
to build or verify.

31. ~~`project` extended attributes — OPR, stakeholders, suspense list, decision log.~~ **(done — OPR 0.16.0, suspense 0.16.0, stakeholders and the decision log 1.9.0, ADR-0057)**
32. `role: Execute | Track`. **Track emits no next actions** — Waiting-Fors and
    Upkeep check-ins only, so children must re-home on the role change.
33. Person lens — owed-me / owed-them / their projects with delta / their
    requests / open threads.
34. Anchors and delta computation. **(half done — the delta shipped 0.16.0, ADR-0041; ANCHORS DEFERRED, ADR-0057: an anchor node would be silent under law 1 today, and `anchor.fired` carries no watermark, so its delta cut would be the degraded one. Needs a gate change plus a shipped surface, in a release of its own.)**
35. Status report generator — clipboard / Markdown / print / CSV.

### Phase 7 — Review

36. ~~The four exceptions: stalled · orphan · dormant · unsupported goal.~~
    **(done, 1.6.0 — dormant ships as "quiet area", unsupported as "unfed
    goal"; the classes partition so a node is never listed twice)**
37. **Short-ranked, top handful only.** An exhaustive exception list is a backlog
    ([ADR-0013](adr/0013-levels-push-down.md)).
38. Attention-distribution readout — descriptive, never prescriptive.
39. ~~Full alignment tree **on request**, never the landing view.~~ **(done,
    1.6.0 — behind its control, per-branch cap 25 with true totals, rows are
    doors to the sheet and nothing else)**

### Phase 8 — Gate readiness

40. ~~Session close screen — a win and a green gauge (peak-end).~~ **(done,
    1.6.0 — the gauge speaks in WORDS, never colour, per B-02; the second
    rider on the comms chip's ramp, ADR-0052)**
41. Accessibility pass against every binding in
    [`ACCESSIBILITY.md`](../ACCESSIBILITY.md), both themes.
42. Cold-start and capture-budget measurement **on the iPad**.
43. **[V-00](verifications.md) checked** — Home Screen install, `persist()` true, and
    still true the next morning. If persistence cannot be relied on, export/import is
    the durability story and the app must **say so** rather than implying the local
    store is safe. Settle this before the gate starts, not during it.

Then the thirty days begin.

---

## 4 · Testing

**Property tests over synthetic logs** are the highest-value tests here, because
the invariants are properties rather than examples.

- **No silent nodes** — For any valid event sequence, fold ⇒ every node satisfies law 1
- **Fold determinism** — Shuffled shard arrival ⇒ identical state
- **LWW convergence** — Two divergent device logs ⇒ same state on both after union
- **Round-trip** — export → import → identical state
- **Additive migrations** — Every historical log version folds on current code
- **No banned vocabulary** — `overdue`, `late`, `missed`, `streak` absent outside their prohibitions
- **Gauge honesty** — Gauge reads 0 for any gate-produced state — non-zero is a gate bug

**Discipline, from the family's record:**
- **Make each new test fail once** before trusting it.
- **A flaky test needs a real sample.** 3-of-6 versus 1-of-6 is noise. Raising a
  timeout and seeing failures increase *rules out* timeout as the cause.
- **A diagnostic selector that matches decoration reports success falsely.** If a
  test counts elements, prove it counts the right ones.
- **Automated a11y audits silently decline to check** transformed content —
  contrast drops into `incomplete`, not `violations`. A green axe run over a
  transformed surface proves nothing; measure explicitly.
- **Verify at the scale the user sees** — the full surface, not the crop that
  demonstrates the fix.

**Diagnostics, not telemetry.** A user's exported log segment is a complete
reproduction case. Voluntary, shown in full before it leaves, never automatic.

---

## 5 · CI gates

> **Status, 2026-08-01 (1.9.1).** Live in `spine.yml`: typecheck, tests, the
> changelog/triplet gate, build, the headless smoke walk, the rendered-app a11y
> gate, the brand gate, the banned-vocabulary grep, **the closed-event-list
> check** and **the write-gate-bypass check** — plus five gates this list never
> mentioned and which have been running all along: `storage:check`
> (localStorage is banned outright), `headers:check` (the default build can
> reach nothing but itself), `editions:check` (the sync module is absent from
> the default bundle), `workflows:check`, and `thesis:check`.
>
> **Still not built, named honestly:** grayscale legibility. The escape clause
> it used to carry — "no pressure surface exists to render" — had gone stale:
> pressure words ship on Next up, the behind list, and the detail sheet. The
> true reason is narrower and better — pressure rides on **position and text
> only**, because B-01's fill bar and luminance ramp were never built, so there
> is no hue to strip. The check becomes meaningful the day a hue-bearing
> pressure surface ships, and it lands in that commit (B-08's rule).
>
> **And one claim below was simply wrong.** Check 3 named four banned words;
> `npm run vocabulary` greps two. `overdue` and `streak` have no legitimate use
> and are gated at the source. `late` and `missed` DO have legitimate uses —
> nearly every occurrence in `src/` is a comment explaining that the app never
> says them — and a grep cannot tell a prohibition from a violation. What
> matters is that a person never SEES one, so that is what is now checked, on
> the rendered page, in the smoke walk.

Each exits non-zero. A gate that warns is not a gate.

1. **Contrast** — computed over every declared fg/bg pair, both themes. **New
   pairs are added to the gate in the same commit that introduces them.**
2. **Grayscale legibility** — pressure surfaces rendered without hue must stay
   readable. This is the machine-checkable form of "meaning survives a grayscale
   render" (binding B-01).
3. **Banned vocabulary** — `overdue` and `streak` are gated at the source
   (`npm run vocabulary`); all four, including `late` and `missed`, are gated
   on the RENDERED page by the smoke walk, which is where it matters and where
   a comment about a prohibition cannot be mistaken for one.
4. ~~**Closed event list** — no emitted `kind` absent from the vocabulary.~~
   **(built 1.9.1 — `npm run events:check`: both directions, plus the Silent?
   column against `SILENT_RISK_KINDS`.)**
5. ~~**Write-gate bypass** — nothing outside the gate imports the store's write API.~~
   **(built 1.9.1 — `npm run writegate:check`: an allowlist carrying a reason
   per entry, and a stale entry fails too. Five modules write raw today and
   every one of them now says why.)**
6. **Viewport matrix** — including small-phone-at-200%-text. No fixed size may
   ignore available space; no floor may exceed it (binding B-04).
7. **Cold-start budget** — capture interaction under 2 s.

---

## 6 · Release

Doctrine §7. Every product change lands on `staging`, and promotion needs Noah's
explicit "promote" on his actual device — never a session's read that it looks
ready. Docs-only changes may skip the gate.

Releases are **version.capability.iteration**, one kind each, with the
service-worker cache name carrying the same triplet and bumped together.
**Names are earned, and Noah says when** — never invented, never a placeholder,
and not a field to fill at every bump.

---

## 7 · Open before code starts

- ****Q-02 — the name**** — A new name is wanted. Nothing in the schema, vocabulary, or formats encodes it, so this is copy, not a refactor. Does not block Phase 0.
- ****Q-04 — Pages subdomain + §10 metadata**** — Blocking on deploy. Downstream of the name.
- ****V-00 — iPadOS persistence**** — Needs the real device. Highest-value open check; settle before Phase 8.
- ****UI approach**** — Decide at build start against the §4 constraints above. Touch-first at iPad size.
- ****Journal key derivation**** — Argon2id vs PBKDF2 and its parameters. Record as an ADR when chosen (v1.5 — [ADR-0005](adr/0005-vaults-and-journal-encryption.md)).
- ****"Stale store" definition**** — For the iOS Restore prompt. Must not fire on a device simply used less often ([ADR-0004](adr/0004-ios-path.md)).
- ****Module offer trigger**** — What earns the next module offer. Needs dogfooding, not a guess, and must not become a nag.
