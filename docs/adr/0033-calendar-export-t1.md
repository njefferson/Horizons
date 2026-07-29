# ADR-0033 · The calendar file is all-day events with a relative alarm

**Status:** Accepted · **Date:** 2026-07-29

## Decision

T1 ([ADR-0007](0007-notification-tiers.md)) ships as `src/ics.ts` — a pure
`toCalendar(state, nowIso, zone)` producing RFC 5545 text. Four choices inside it
are the decision:

1. **All-day events** (`DTSTART;VALUE=DATE:YYYYMMDD`), so the file contains **no
   `VTIMEZONE` and no `TZID` at all**.
2. **A relative alarm**, `TRIGGER;RELATED=START:PT9H`, rather than an absolute one.
3. **What goes in is `heldGroups`' `ready`/`soon`/`later`** — not a second rule.
4. **A stable `UID` per node**, `<nodeId>@quietkeep`.

## Why

**All-day, because a clock in this app is an end-of-local-day instant.** Emitting
it as a timed event would put every reminder at 23:59 — technically correct and
useless. A `DATE` value has no offset to get wrong, which removes the entire
class of timezone bug the `.ics` was most likely to carry, and removes the need
to emit a `VTIMEZONE` block whose correctness nothing here could check. The date
itself comes from `localDayKey` (`src/time.ts`), already verified against an
independent bisection oracle across 10,220 zone-days ([V-13](../verifications.md)).

**A relative alarm, because it is resolved in the reader's own local time by the
calendar.** `PT9H` from the start of an all-day event is 9am *where they are*,
without this file naming a zone. An absolute `TRIGGER` would need a zone and would
be wrong the moment someone travelled. **The `VALARM` is the entire point of the
feature** — an event without one is a diary entry, and a diary entry does not
remind anybody. The tests assert one alarm per event, always.

**One definition of what belongs in it.** The calendar carries exactly the groups
the held list calls `ready`, `soon` and `later`. Completed work, Menu items
(demand-free by law 6) and anything still in triage are absent — but that is
decided *once*, in `held.ts`, and read here. A second rule would eventually
disagree with the first, and the user would have a calendar quietly contradicting
the app.

**A stable UID, because re-importing is the normal case.** ADR-0007 requires the
file be treated as a snapshot, which means people will export again. Without a
stable UID every export adds a second copy of every event, and a calendar that
duplicates on every refresh is one nobody keeps using.

**Escaping and folding are load-bearing, not housekeeping.** Captured text is
stored verbatim and reaches the generator unfiltered — the share target composes
title/text/url with **newlines**, and a bare newline in a property value
terminates the property and corrupts everything after it. Folding is at 75
**octets** on a code-point boundary: folding by character count would split a
multi-byte character and produce invalid UTF-8 rather than merely a long line. A
test builds an event from `a;b,c\d\nSUMMARY:INJECTED\nEND:VEVENT` and asserts the
file still holds exactly one event.

**The snapshot is stated, not implied.** ADR-0007 requires the app say so rather
than implying the calendar is live. `X-WR-CALNAME` carries the date it was made,
every `DESCRIPTION` says the calendar will not follow later changes, and the
surface repeats it in plain words under the button.

## Consequences

- `test/ics.test.ts` is pinned to **America/Denver and Pacific/Kiritimati (UTC+14)**
  — build-plan item 30 requires a non-UTC zone in so many words, because headless
  browsers run in UTC and that has hidden timezone bugs in a sibling app.
- The smoke walk downloads the real file, unfolds it, and asserts one `VALARM` per
  `VEVENT`, all-day dates, the snapshot date, that a **completed** item is absent,
  and that `export.written{scope:'calendar'}` is recorded **once, after** the file
  existed — the deliver-then-record ordering an earlier audit forced.
- Made to fail first (§6): folding by characters, emitting a timed `DTSTART`, and
  dropping the `VALARM` each fail their tests.
- **No vocabulary change was needed.** `export.written` already carries a
  free-form `scope`; `exportFilename` gained an extension parameter.
- **The button is never disabled.** With nothing to send it stays reachable and
  says so when pressed — a disabled control is invisible to a keyboard user and
  explains nothing.
- T0's badge lands with it (`navigator.setAppBadge`), counting **only** the
  `ready` group: a badge showing everything you hold is a number that never falls,
  which is a nag rather than information.

## What would overturn it

A device reading showing the OS calendar does not fire these alarms as expected —
which is the only verification that counts here, and which CI structurally cannot
provide. If all-day events prove too coarse in real use (a thing genuinely needed
at 14:00), the answer is a timed event **with** a `VTIMEZONE`, and that is a
larger decision than it looks: it reopens every timezone question this design
closed by construction.
