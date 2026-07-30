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
 * Deployed by `.github/workflows/relay.yml`, which prints the URL it published
 * to. While this reads `UNSET` the Sync edition does not build: `tools/editions.mjs`
 * refuses it, because a sync build that cannot reach a relay is a sync build that
 * silently does not sync, and that is the failure this project keeps finding.
 */
export const RELAY_HOST = 'https://quietkeep-relay.noahjefferson.workers.dev';

/** Is this a real host, or the placeholder? Used by the edition gate, and by the
 *  surface so it can say "no handover point is set" rather than fail obscurely. */
export const relayIsSet = (host: string = RELAY_HOST): boolean =>
  /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(\/|$)/.test(host) && !host.includes('UNSET');
