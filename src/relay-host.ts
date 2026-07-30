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
 * **Read from a deploy, not guessed.** Relay run 5 published the worker and
 * printed this URL, with the `CHUNKS` KV namespace created and bound.
 *
 * This value briefly held a GUESS — `quietkeep-relay.noahjefferson.workers.dev`,
 * which is wrong: the account's subdomain has a hyphen. Every gate passed it.
 * The format check passed, the sync edition built, the CSP permitted the host,
 * and the app would have dialled a hostname that does not resolve — broken in
 * the one way that produces no error on any device. It was set back to `UNSET`
 * until a deploy log said otherwise, and that is the rule this constant lives
 * under: **an unverified URL here is worse than a missing one, because it
 * silences the check that would have caught it.**
 */
export const RELAY_HOST = 'https://quietkeep-relay.noah-jefferson.workers.dev';

/** Is this a real host, or the placeholder? Used by the edition gate, and by the
 *  surface so it can say "no handover point is set" rather than fail obscurely. */
export const relayIsSet = (host: string = RELAY_HOST): boolean =>
  /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(\/|$)/.test(host) && !host.includes('UNSET');
