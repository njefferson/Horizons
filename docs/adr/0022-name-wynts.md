# ADR-0022 · The name is Wynts

**Status:** **Superseded by [ADR-0023](0023-name-wynts-withdrawn.md)** — withdrawn
2026-07-28, it sounds like *wince* · **Date:** 2026-07-28
**Supersedes:** [ADR-0021](0021-name-reopened.md)

> **This record was wrong, and the way it was wrong is the useful part.** Every check
> below is a REGISTRY check. Not one of them says the word out loud. The table is
> otherwise accurate — npm, GitHub and the App Store really were clear — which is
> exactly why it read as conclusive. Saying it aloud is now check #1.

## Decision

The app is **Wynts** — Noah's coinage, an acronym hidden inside a word:

> **W**hat **Y**ou **N**eed **T**o **S**ee

Tagline and epigraph unchanged: *"Out of sight. Never out of mind."* /
*"It holds the rest, so you can rest."*

## Why it works where twenty-three others did not

**It names the promise, not a metaphor for the promise.** Every optics candidate
described *seeing*; the horology ones described *mechanism*. Wynts describes what
the app actually delivers — the right thing, surfaced, at the moment it is needed.
That is law 1 and law 2 stated as a name.

**A coinage was the only category left.** Twenty-three candidates died, and the
pattern was consistent: single evocative words in class 9 are exhausted. What
survives is compounds, coinages, and slightly-odd words. Wynts is the first
candidate to pass *every* check available (see below) rather than merely survive
one.

**The hidden acronym is the structure in its right place.** Noah wanted a name
that encodes the machinery; PDC was rejected because a bare three-letter acronym
is the register of the workplace this app exists to be a relief from
([ADR-0020](0020-name-perennial.md) graveyard). Buried inside a pronounceable
word, the same idea costs nothing: it reads as a name, and whoever asks gets a
small reward for asking.

**It collides with nothing in this app's own vocabulary** — the trap that killed
*Lens* (the person lens), *Gauge* (the coverage gauge) and *Alignment* (the
alignment tree). Checking a candidate against our own spec is now the FIRST check,
because it is a grep and it is free.

## What was checked, and by what instrument

- **npm registry**
  - Instrument: direct query — authoritative
  - Result: `wynts`, `wynt`, `wynts-app`, `usewynts` **all free**
- **GitHub**
  - Instrument: repo search API — authoritative
  - Result: one hit, a personal profile-config repo (`Wyntsoyal`). No project.
- **App Store**
  - Instrument: web search
  - Result: **nothing named Wynts**; nothing in productivity
- **Unscoped name + software**
  - Instrument: web search
  - Result: nothing named Wynts
- **This app's own spec**
  - Instrument: `grep`
  - Result: no occurrences — no internal collision
- **Framework vocabulary**
  - Instrument: reading
  - Result: not a term of art anywhere (unlike *Detent*)

**Not checked, and still owed on Noah's device:** the App Store search from a real
device, and a USPTO knockout in classes 9 and 42 if he wants one. Both are blocked
from a session — proven, not assumed ([V-05](../verifications.md)).

## Consequences and known costs

- **The phonetic neighbourhood is busy.** Nothing is named Wynts, but one letter
  away sits **WYNT** (a community-hub app on Google Play), plus Wynta (iGaming
  SaaS), Wynter (B2B research), Wynk Music, Wynd Technologies. For a free
  noncommercial planner against a community-hub app the trademark risk is low;
  the real cost is that someone half-remembering the name may land on a neighbour.
  Accepted knowingly.
- **Pronunciation is not self-evident** — *WINTS* or *WHYNTS*. A name people say
  aloud needs one answer, and a name whose pronunciation people guess at gets said
  wrong forever. **Open for Noah** (Q-08); recorded in the README once he rules.
- **It carries no meaning on first contact.** That is the trade a coinage makes:
  ownable and clearable, but opaque until explained. For a personal free tool
  whose primary user is its author, that cost is small and the "inside knowledge"
  is the point.
- **Nothing in the schema, the event vocabulary, or the file formats encodes the
  name** — true since ADR-0018 and still true. The rename was a copy pass and no
  refactor, which is exactly what made three name changes affordable.
- **"Horizons" survives as domain vocabulary and that is deliberate.** Product law
  4 — *higher horizons project lineage and health downward* — and the
  *horizon-integrity engine* keep the word. It is standard planning terminology,
  not branding. A CI check asserts these survived the rename, because a careless
  global replace would silently destroy an invariant's own statement.
- `LICENSE.md`'s Required Notice URL still points at `njefferson/Horizons` **on
  purpose**. It moves in the same commit as the GitHub repo rename; changing it
  earlier would aim the notice at a 404.

## What would overturn it

A USPTO knockout returning a live mark in class 9 or 42, or an App Store search
on Noah's device finding something the web did not. Nothing else — the caveats
above are recorded and accepted.
