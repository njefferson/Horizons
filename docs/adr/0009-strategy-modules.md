# ADR-0009 · Minimal invariant core plus toggleable modules

**Status:** Accepted · **Date:** 2026-07-27

## Decision

The app is a **minimal invariant core** — capture → clarify → surface — plus
**toggleable strategy modules**. Modules are enabled **one at a time**, through
progressive disclosure.

Community content — templates, trigger lists, vocabulary skins — is **plain
JSON**, shareable through the repo.

## Why

Choice overload is a real and well-evidenced failure, and a planner that presents
its full feature surface on day one is a planner that gets abandoned on day one.
More specifically: the features in this app are *strategies*, and strategies that
suit one person actively harm another. Pebbles help someone who needs to see
their load; to someone else they are one more thing to maintain.

One-at-a-time is the part that does the work. Offering a settings screen of
fifteen checkboxes is choice overload wearing a customisation costume. A module
arrives when there is a reason for it to arrive, and the previous one has settled.

Plain JSON for community content — rather than a plugin API — because the content
is *content*. A trigger list is a list of prompts. Making it executable would
create a security surface and a support burden for no gain, and it would put
arbitrary code next to the most private data the user has.

## Consequences

- The core must be genuinely useful with **every** module off. If the app is
  weak in that state, the partition is wrong and this ADR is being used as an
  excuse for an unfinished core.
- Module state is an event (`module.enabled` / `module.disabled`), so enabling
  and disabling are in the log and reversible.
- **Disabling a module must never delete its data.** A user turning pebbles off
  and on again a month later finds their pebbles. Law 9 covers this.
- Every module declares what it adds to which surface, so the core does not need
  to know about any specific module.
- Community JSON is **validated on load and never trusted**. It has no access to
  the log. `template.loaded` records its source and its licence.
- The one-at-a-time rule needs a trigger design — what earns the next offer.
  Deliberately unresolved; it needs dogfooding, not a guess, and it must not
  become a nag.

## What would overturn it

Finding in dogfooding that the core-plus-modules seam adds more complexity than
the disclosure saves. That is a real risk and the thirty-day gate is where it
would show up.
