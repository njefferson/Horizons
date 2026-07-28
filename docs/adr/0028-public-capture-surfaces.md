# ADR-0028 · Public capture surfaces, behind a strict CSP

**Status:** Accepted · **Date:** 2026-07-28

## Decision

Three URL-reachable entrances land in the same capture as the in-app line, and a
strict Content-Security-Policy ships in the same change that opens them:

- **`/capture?text=`** — the documented public endpoint (ADR-0008).
- **Web Share Target** — `?title=&text=&url=` from the OS share sheet, composed
  into one item (Chromium; feature-detected by the manifest, absent elsewhere).
- **Manifest shortcut** `?capture=1` — opens focused on an empty line, captures
  nothing.
- **`public/_headers`** carries `default-src 'none'` with `'self'` allowances and
  nothing inline.

## Why together

The endpoint and the CSP are one decision because the endpoint is the reason the
CSP became urgent: `/capture?text=` is **the first surface a hostile link can
reach**, and a link that can put text on the screen is a link worth hardening the
page against. Shipping the input without the policy would be opening a door and
ordering the lock separately.

**The endpoints do exactly one thing, by construction.** Each calls the same
`captureEvent` every other entrance uses and hands the result to the gate. None
can set a clock, route, complete, or delete — not by a check that could be
forgotten, but because the only event they can emit is `capture.recorded`, and
the gate cures that into a single unclarified item. The confirmation is visible
and carries an undo, so a drive-by capture is never silent (a link cannot write
to your data without you seeing it) and never permanent (one tap removes exactly
the node it made). The query is scrubbed with `history.replaceState` before
anything else, so a refresh cannot re-fire it and the text does not linger in
history.

**Text is text.** Captured content is stored verbatim and rendered with
`textContent`, never `innerHTML` — the property the smoke walk proves by feeding
the endpoint `<img src=x onerror=…>` and asserting it neither executes nor is
escaped away.

**Why a strict CSP is possible here when the hub could not have one.** The hub
carries its content model as an inline `<script>`, so `script-src 'self'` would
gut it. Quietkeep loads one external module and one stylesheet and builds DOM
without `innerHTML`, so `default-src 'none'; script-src 'self'; style-src 'self'`
costs nothing. The one place it bit was the *test tooling* — the accessibility
gate injects axe as a script, which the policy refuses — and that is the CSP
working, so a11y bypasses CSP to instrument the page while smoke runs under it.

## Consequences

- **The CSP is verified, not hoped.** `tools/serve.mjs` applies `_headers` to
  every response, so `smoke.mjs` and `a11y.mjs` exercise the app under the real
  policy; smoke fails on any console error, and a CSP violation is a console
  error. A policy nobody ran the app under is the V-10 shape.
- **The share target composes rather than concatenates blindly** — title, text
  and url are trimmed and the empty ones dropped, so a share with only a URL is
  one clean line, never `undefined\nundefined\nhttps://…`.
- **The undo is a `node.trashed`, through the gate** — the log explains the
  removal like everything else; there is no out-of-band delete.
- Smoke covers all three entrances, the scrub, the no-re-capture-on-refresh
  property, the hostile-text inertness, and the undo removing exactly one node.

## What would overturn it

A platform gaining a share/shortcut mechanism that cannot round-trip through a URL
would need its own entrance — but it would still land in `captureEvent` and still
be gated. The invariant is that every public surface can only create one
unclarified item; the transport is replaceable.
