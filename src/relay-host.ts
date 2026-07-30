// The one line that is the Sync edition's entire network exposure.
//
// [ADR-0036](../docs/adr/0036-two-builds.md): *"The sync build's `_headers` names
// the relay host **in one place**, so the whole network exposure of that edition
// is one reviewable line."* This is that line, and `public-sync/_headers` is
// generated from it by `tools/editions.mjs` so the two cannot drift — a CSP that
// allowed a host the app does not use, or a host the CSP does not allow, are both
// states that have to be impossible rather than merely unlikely.
//
// It is a DEFAULT, not a lock: a pairing file carries its own host (`pairing.ts`),
// so somebody running their own relay pairs to it and this value is never
// consulted. What the CSP allows is a separate question from what the app dials,
// and only the CSP is a guarantee.

/**
 * The relay this build dials unless a pairing file names another.
 *
 * **It reads `UNSET`, and that is a true statement rather than a placeholder
 * nobody got round to.** There is no relay deployed yet: the Cloudflare
 * credential this repo holds can publish Pages but has no Workers permissions,
 * so `.github/workflows/relay.yml` cannot create the KV namespace the relay
 * stores chunks in. That workflow says exactly which two permissions to add and
 * fails before creating anything.
 *
 * It briefly held a GUESS at the workers.dev URL. A guess is worse than nothing
 * here: the format check passes, the sync edition builds, the CSP permits the
 * host, and the app dials into the void — a build that is broken in the one way
 * that produces no error anywhere. So while this is unset, `tools/editions.mjs`
 * does not build the Sync edition at all, and nothing ships that claims to sync.
 *
 * The value to put here is printed by the relay workflow's final step, on a run
 * that actually deployed. Not before.
 */
export const RELAY_HOST = 'UNSET';

/** Is this a real host, or the placeholder? Used by the edition gate, and by the
 *  surface so it can say "no handover point is set" rather than fail obscurely. */
export const relayIsSet = (host: string = RELAY_HOST): boolean =>
  /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(\/|$)/.test(host) && !host.includes('UNSET');
