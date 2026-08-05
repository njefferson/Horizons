// A smaller bite (1.24.0).
//
// `docs/nd-collisions.md` entry 1 — task initiation cost. The knowledge is
// intact and the launch mechanism is not, and the cost is highest when the
// thing is large or vague. It is paid up front, before any progress exists to
// reward it, which is why "it'll only take ten minutes" persuades nobody: the
// ten minutes were never the problem.
//
// The app's own azimuth check already names initiation as one of its thin
// halves. Everything built so far reduces the number of things being decided
// between — one card, two unalike options, a cheap entry price — and none of it
// helps once the one thing on screen is itself too big to begin.
//
// So: name a first physical action, on the offer, without going anywhere.
//
// ## ONE EVENT, AND THE ORDER IS THE WHOLE POINT
//
// `node.created` carries an optional `parent`, so the bite is born already
// under the offered item. That is not tidiness — it is the difference between
// a bite with no clock and a bite with one.
//
// The write gate cures anything left silent by a silent-risk EVENT, and
// `node.created` is one. A bare create followed by a separate `node.parented`
// would be evaluated in between: for that instant the new node is on no
// surface, under no clock and under no parent, so the gate cures it with a
// same-day review clock — and the bite arrives carrying a date nobody chose.
// `fileUnderEvents` records the same trap in `triage-intents.ts` and answers it
// by ordering two events; here one event answers it outright.
//
// ## WHY THE BITE HAS NO CLOCK OF ITS OWN
//
// Write-gate clause (d): a node parented to something under a clock is not
// silent (`gate.ts:61`). The offered item is under a clock BY DEFINITION —
// an arrived clock is why it was offered at all — so the bite is covered the
// moment it exists, and law 1 is satisfied without inventing a date.
//
// That matters beyond the arithmetic. Entry 8 is demand avoidance, and it binds
// self-imposed demands hardest: writing "go for a walk" on a list can make the
// walk impossible. A first step that quietly acquires a due date is a demand
// somebody made of themselves while trying to get unstuck, and it would come
// back tomorrow as a replan card whether or not it was ever the right step. The
// bite rides its parent's clock and asks for nothing.
//
// These build events; they never touch the store.

import type { AppEvent } from '../events.ts';
import type { StampContext } from './session.ts';

const base = (ctx: StampContext, kind: string, node: string | null, payload: unknown): AppEvent => ({
  id: ctx.id(), vault: ctx.vault, at: ctx.at, device: ctx.device, seq: ctx.seq(),
  kind, node, payload,
} as AppEvent);

/**
 * A first physical action, under the thing it belongs to.
 *
 * An ordinary `action` — not a new kind, not a new noun. It completes, decays,
 * renders and can be let go exactly like anything else, which is the same
 * reasoning ADR-0042 used for the comms sweep and ADR-0074 used for
 * arrangements: every projection in this app already knows how to hold it.
 *
 * Empty in, empty out. A blank title would mint a node nobody named, and the
 * surface's own guard says so out loud rather than committing nothing silently.
 */
export const biteEvents = (
  ctx: StampContext, id: string, parent: string, title: string,
): AppEvent[] => {
  const text = title.trim();
  if (!text || !parent || id === parent) return [];
  return [base(ctx, 'node.created', id, { nodeKind: 'action', title: text, parent })];
};
