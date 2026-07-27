# ADR-0016 · Never use the GTD® marks; all trigger-list content original

**Status:** Accepted · **Date:** 2026-07-27

## Decision

- **Never use the marks GTD® or Getting Things Done®** — not in the UI, not in
  the README, not in marketing copy, not in metadata, not in a code comment that
  might be read as an affiliation claim.
- **All trigger-list content must be original.** The published lists are
  copyrighted and are not to be reproduced or lightly paraphrased.
- Vocabulary that is genuinely generic — *Inbox*, *Next action*, *Waiting For*,
  *Someday/Maybe*, *Reference* — is used freely, because those are ordinary
  English descriptions of ordinary things.

## Why

Two separate legal facts, often conflated:

**Trademark.** "Getting Things Done" and "GTD" are registered marks. Using them
in a product implies affiliation or endorsement. There is none, and implying it
is both a legal exposure and — more to the point — untrue. Doctrine §5: labels
stay honest.

**Copyright.** The published trigger lists are creative compilations. The *idea*
of prompting recall with a list of life areas is not protectable; a particular
list's selection, wording, and arrangement is. Copying one is straightforward
infringement, and paraphrasing it item-by-item while keeping the structure is the
same act with extra steps.

Writing original lists is also just better here. This app has an explicit
audience, and a trigger list written for that audience will surface different
things than a general-purpose business one from 2001.

## Consequences

- The node kind is `outcome`, not `project`, for the multi-step-personal-result
  sense — and `project` is reserved for the work-grade entity. The rename is
  partly to avoid a collision and partly so no term reads as borrowed.
- Trigger lists are written from scratch, for this audience. They ship as plain
  JSON community content ([ADR-0009](0009-strategy-modules.md)) and each declares
  its own licence.
- Community-contributed lists are **checked for copied content before merging**.
  A contributor pasting a published list is the likely failure mode, and it
  becomes this repo's problem the moment it is merged.
- [`planning-for-humans.md`](../planning-for-humans.md) may **cite** the
  methodology as prior art — citation is not use of a mark, and pretending the
  influence isn't there would be its own dishonesty. It describes; it never
  claims compatibility, certification, or endorsement.

## What would overturn it

Nothing realistic. An explicit licence from the mark holder, which is not being
sought.
