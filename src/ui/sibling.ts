// Where the other edition lives.
//
// [ADR-0036](../../docs/adr/0036-two-builds.md): *"Each build's (i) panel links
// the other and states its own posture plainly."* This works out the link.
//
// ## Why it is derived and not written down
//
// Because a written-down URL would be a fourth unverified constant, and this
// repo has already been bitten once today: `RELAY_HOST` briefly held a guess at
// a workers.dev subdomain, passed every gate, and would have shipped an app
// dialling a hostname that does not resolve.
//
// The two editions are deployed as two Cloudflare Pages projects whose names
// differ by one suffix, so their hostnames differ by the same suffix at every
// stage at once:
//
//   staging.quietkeep.pages.dev  <->  staging.quietkeep-sync.pages.dev
//   quietkeep.pages.dev          <->  quietkeep-sync.pages.dev
//
// Deriving it means the staging build links to staging and the production build
// links to production, with nothing to keep in step by hand and no way for the
// two to drift apart.
//
// **It returns null rather than guessing.** On localhost, a custom domain, or
// anywhere else this pattern does not hold, there is no sibling to point at and
// the surface simply says nothing. A link that 404s is worse than no link: it
// reads as "the thing is broken" rather than "you are not on the site".

const PLAIN = 'quietkeep.pages.dev';
const SYNC = 'quietkeep-sync.pages.dev';

/**
 * Is this host exactly one of ours, or a subdomain of it?
 *
 * ANCHORED TO THE END, and that is not pedantry. The first version of this used
 * `includes`, and its own test caught what that means:
 * `quietkeep.pages.dev.evil.test` contains `quietkeep.pages.dev`, so a page
 * served from somebody else's lookalike domain would have been told it was the
 * default edition and rendered a link to `quietkeep-sync.pages.dev.evil.test` —
 * this app inviting a person to a hostile clone of itself, in its own voice, in
 * the panel where it explains how careful it is with their data.
 */
const isOurs = (hostname: string, base: string): boolean =>
  hostname === base || hostname.endsWith(`.${base}`);

/** Which edition is this hostname? `null` when the question does not apply. */
export function editionOf(hostname: string): 'default' | 'sync' | null {
  // Sync FIRST: its host ends in the plain one's suffix pattern too, and asking
  // the other way round would call every sync build a default build.
  if (isOurs(hostname, SYNC)) return 'sync';
  if (isOurs(hostname, PLAIN)) return 'default';
  return null;
}

/**
 * The other edition's origin, or null if it cannot be known from here.
 *
 * Pure and given the hostname, so it is testable without a browser — and so the
 * cases that matter (localhost, an unexpected host) are exercised rather than
 * assumed.
 */
export function siblingOrigin(hostname: string, protocol = 'https:'): string | null {
  const edition = editionOf(hostname);
  if (edition === null) return null;
  // Only the TRAILING base is swapped, for the same reason the match is
  // anchored: a replace anywhere in the string would rewrite a host that merely
  // contains ours.
  const [from, to] = edition === 'sync' ? [SYNC, PLAIN] : [PLAIN, SYNC];
  const other = hostname.slice(0, hostname.length - from.length) + to;
  return `${protocol}//${other}`;
}

/** What the default build says about the one that syncs. States the trade, in
 *  that order: what it adds, then what it gives up. Somebody reading this is
 *  being offered a weaker privacy posture and is entitled to see that second
 *  rather than find it later. */
export const SYNC_INVITE_WORDS =
  'If you use Quietkeep on more than one device, there is a second version — Quietkeep Sync — where two devices keep each other up to date. '
  + 'It is a separate app with its own copy of your work, so moving across is an export and an import, once. '
  + 'It gives up the thing this one is strictest about: it can reach a handover point on the internet, where this app can reach nothing at all.';

/** What the sync build says about the plain one. The same trade read the other
 *  way, and never phrased as a downgrade — the default is the more principled
 *  build and saying so is the honest framing. */
export const PLAIN_INVITE_WORDS =
  'This is Quietkeep Sync. The plain Quietkeep is the same planner without any of this: it cannot contact anything at all, and the browser is what stops it rather than a setting. '
  + 'It is the better choice if you only use one device.';
