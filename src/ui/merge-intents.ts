// Folding a duplicate (1.7.0, ADR-0053) — the UI for the vocabulary's
// seventh capability that was complete and unreachable: `node.merged` has
// folded and gated since Phase 0 with nothing able to emit it.
//
// A bare `node.merged` is a data-loss verb (scouted, verified): the source's
// children orphan into Review with the words "what it belonged to was let go"
// — a lie, nothing was let go — and its note, demand clocks, and people links
// vanish from every surface, because every projection excludes merged nodes
// and none follows the chain to combine. So the merge INTENT is a batch:
// carried facts first, children re-homed, then the merge. Folding a duplicate
// must never swallow a date (law 3), a note, a person, or a child.
//
// The way back is `node.unmerged` — split back out, gate-cured like untrashed.
// It restores the node's own STANDING, not the world before the merge:
// carried facts and re-homed children stay where the merge put them, and the
// words say so. (Un-carrying would mean deleting facts from the target, and
// this log does not delete.)
//
// These build events; they never touch the store.

import { DEMAND_FREE_KINDS, type AppEvent, type ClockKind, type NodeId } from '../events.ts';
import { fold, noteOf, type NodeState, type State } from '../fold.ts';
import { wouldCycle } from '../dependencies.ts';
import { choosable } from '../composed.ts';
import { localDayKey } from '../time.ts';
import { heldNodes } from '../gate.ts';
import { standingDecline } from '../requests.ts';
import type { StampContext } from './session.ts';

const base = (ctx: StampContext, kind: string, node: string | null, payload: unknown): AppEvent => ({
  id: ctx.id(), vault: ctx.vault, at: ctx.at, device: ctx.device, seq: ctx.seq(),
  kind, node, payload,
} as AppEvent);

/** The demand kinds a merge carries when the survivor lacks them — losing a
 *  hard date to a dedup is the exact class the 1.3.1 belt exists for. */
export const CARRY_CLOCKS: readonly ClockKind[] = ['due', 'start', 'suspense', 'park'];

/**
 * WHAT A FOLD TAKES WITH IT — every field of `NodeState`, named (1.9.2,
 * ADR-0058).
 *
 * This map exists because the alternative failed, repeatedly and predictably.
 * 1.7.0 wrote the carry as a hand-written list; 1.8.0 added `notNow`, 1.9.0
 * added `decisions`, and `feeds` was never in it — none of those releases
 * visited this file, and each omission silently destroyed something on the
 * next fold. The list could not be kept correct by remembering, so it is kept
 * correct by the type system: `Record<keyof NodeState, …>` will not compile
 * until a new field is named here, and the pinned test re-checks the key set
 * at runtime in case a field is ever declared optional.
 *
 * A reasoned `'no'` is a perfectly good answer. The gate's value is that it
 * forces the SENTENCE to be written, not that it forces the carry.
 */
export type Disposition =
  /** Written across, through the ordinary noun for that fact. */
  | { carry: 'state'; via: string; when: string }
  /** Not written; `src/merged.ts` follows the fold at read time. */
  | { carry: 'read'; via: string }
  /** Deliberately left behind, and why. */
  | { carry: 'no'; because: string };

export const MERGE_DISPOSITION: Record<keyof NodeState, Disposition> = {
  // ── Identity and structure. A fold never changes what the survivor IS.
  id: { carry: 'no', because: 'identity: the survivor is the thing that stays' },
  vault: { carry: 'no', because: 'identity: a fold does not move anything between vaults' },
  kind: { carry: 'no', because: 'a fold must never change what the survivor is; the source kind survives in the folded-in row' },
  title: { carry: 'no', because: 'the survivor keeps its own name; the source title survives in the folded-in row and in notNow.what' },
  parent: { carry: 'no', because: 'the survivor keeps its own place; the SOURCE\'s children are re-homed instead' },
  trashed: { carry: 'no', because: 'a fold is not a trashing; legalMergeTargets offers held nodes only' },
  mergedInto: { carry: 'no', because: 'this IS the fold; set on the source by node.merged' },
  stamps: { carry: 'no', because: 'LWW bookkeeping, per field, per node — never transferable' },

  // ── Carried as state: what the thing currently is, or currently demands.
  clocks: {
    carry: 'state', via: 'clock.set / suspense.set / park.set (source: merge:carried)',
    when: 'the four demand kinds only, when the survivor lacks them and can hold them (canHold) — NOT `review`, which is the gate\'s own coverage bookkeeping, and NOT the park of a standing decline, which is the decline\'s mechanism rather than a date about the work',
  },
  fields: {
    carry: 'state', via: 'node.field.set',
    when: 'per CARRY_FIELDS below — `note` joins when both speak; anything unnamed is NOT carried, so a future field is safe by default',
  },
  people: { carry: 'state', via: 'person.linked', when: 'each link the survivor lacks; additive by design' },
  opr: {
    carry: 'state', via: 'opr.assigned',
    when: 'when the survivor has none. REQUIRED, not optional: the opr person LINK is already carried, so leaving n.opr null reproduces the render-contradicts-record shape ADR-0057 was written to kill',
  },
  feeds: {
    carry: 'state', via: 'dependency.declared',
    when: 'each downstream the survivor does not already feed, skipped and STATED when it would make two things each wait for the other',
  },
  after: {
    carry: 'state', via: 'after.set',
    when: 'BOTH directions (1.30.0). Forward: the survivor takes the source\'s antecedent when it has none of its own, the antecedent is alive and unfinished, and it is not the survivor — skipped and STATED when it would make two things each wait for the other. Reverse: anything that was waiting for the SOURCE is re-pointed at the survivor, because an anchor at a merged node confers no coverage, so leaving it would make every step of a routine go silent and take a cure clock the moment its predecessor was folded — the chain destroyed by an act that is meant to preserve it. Unlike `feeds`, the reverse edge is OVERWRITTEN rather than added, because an `after` is single-valued; a later split-out therefore leaves the dependent pointing at the survivor, which is a real but smaller loss than a chain that breaks on every fold',
  },
  leadDays: {
    carry: 'state', via: 'dependency.declared{leadEstimateDays}',
    when: 'with the first carried edge, when the survivor has none. Not carried alone: it means "how long this takes AS A DEPENDENCY", and with nothing downstream there is no dependency for it to qualify',
  },
  intervalDays: { carry: 'state', via: 'upkeep.interval.set', when: 'with comfortWindowDays, when the survivor has neither — a rhythm is a demand-shaped fact and losing it is the class law 3 exists for' },
  comfortWindowDays: { carry: 'state', via: 'upkeep.interval.set', when: 'with intervalDays; same reason' },
  saveTarget: { carry: 'state', via: 'save-for.updated', when: 'with saveSaved, when the survivor has neither — a number a person typed is not the app\'s to drop' },
  saveSaved: { carry: 'state', via: 'save-for.updated', when: 'with saveTarget; same reason' },
  role: { carry: 'state', via: 'project.role.set', when: 'when the survivor\'s is null and it is a container — a silence must not overwrite a statement' },
  waitingOn: { carry: 'state', via: 'waiting.opened', when: 'with the rest of the waiting quartet, when the survivor has no open waiting' },
  waitingFor: { carry: 'state', via: 'waiting.opened', when: 'with waitingOn' },
  waitingSince: { carry: 'state', via: 'waiting.opened', when: 'with waitingOn — the original since, so the age of the wait is not reset by a fold' },
  waitingOutcome: { carry: 'no', because: 'how a PAST wait ended is a record of that wait, not a standing fact; a carried open waiting starts with no outcome' },
  todayFor: {
    carry: 'state', via: 'today.chosen',
    when: 'ONLY when it is the current local day and the survivor is choosable and not already chosen. A stale value is precisely what ADR-0051 makes uncomputable, so it is never carried; the net count is unchanged, so the cap cannot be exceeded',
  },

  // ── Carried by reading: what HAPPENED. See src/merged.ts for why.
  decisions: { carry: 'read', via: 'merged.ts decisionsFor — read through the fold; copying would re-report them and could not be undone' },
  notNow: { carry: 'read', via: 'requests.ts notNowLedger via merged.ts survivorOf — the row says where it lives now; marking the SURVIVOR declined would be the fold deciding the survivor\'s standing' },

  // ── Deliberately left behind.
  pebble: { carry: 'no', because: 'only a `pebble` node carries one, and `legalMergeTargets` allows a pebble to fold only into another pebble — so the survivor always has a weight of its own, and 1.9.2\'s governing rule applies unchanged: the survivor\'s own answer stands and a fold only fills silences. There is no silence here to fill' },
  onMenu: { carry: 'no', because: 'placement is its own verb; a fold must not promote or demote anything' },
  released: { carry: 'no', because: 'putting a thing down is a decision about THAT thing, and a fold is not that decision. legalMergeTargets offers held nodes only, so the survivor was never put down; writing the source\'s put-down onto it would take a live thing out of your hands because something else folded into it' },
  lastDone: { carry: 'no', because: 'a completion is an event about one particular thing, and a fold is not a completion' },
  heat: { carry: 'no', because: 'the source\'s passage through the inbox, not a fact about the work' },
  route: { carry: 'no', because: 'writing the source\'s route onto a clarified survivor would put it back in a queue it has already left' },
  captured: { carry: 'no', because: 'a latch about how the SOURCE arrived; carrying it would put the survivor in triage' },
  sourceTags: { carry: 'no', because: 'capture-time provenance of the source' },
  resumeSpent: { carry: 'no', because: 'a fact about one sitting' },
  resumeFor: { carry: 'no', because: 'a resume card holds one thread; legalMergeTargets refuses cards as targets' },
  resumeCue: { carry: 'no', because: 'the five-word cue belongs to the moment it was written in' },
  interruptedFocus: { carry: 'no', because: 'a fact about one focus session' },
  interruptedAt: { carry: 'no', because: 'a fact about one focus session' },
  ownership: { carry: 'no', because: 'a bother\'s answer to "whose is this"; the flow is not re-entered' },
  botherRouted: { carry: 'no', because: 'a LATCH whose whole purpose is not being asked the same question twice' },
  lastReplan: { carry: 'no', because: 'a decision about one passed date on one thing' },
};

/** Which `fields` entries a fold carries. Unnamed means not carried — so a
 *  field added later is safe by default rather than silently transferred. */
export const CARRY_FIELDS: Record<string, string> = {
  note: 'copied when the survivor has none, joined when both speak',
};

/** The source has a clock a fold would actually CARRY — `CARRY_CLOCKS` minus
 *  the standing decline's park, which `mergePlan` deliberately never carries
 *  (it IS the decline, not a date about the work). `canHold` counted that park
 *  until 1.17.4, so a source whose only clock was its decline's park had every
 *  Menu and demand-free target withheld — legal folds the gate would have
 *  accepted, refused by the picker alone. One exclusion, asked by both. */
const bringsAClock = (source: NodeState): boolean =>
  CARRY_CLOCKS.some(k => source.clocks[k] && !(k === 'park' && standingDecline(source) !== null));

/**
 * Can this target hold what the source brings across?
 *
 * The gate's own two refusals, stated ONCE in a form both the picker and the
 * carry can ask: a Menu item is demand-free by placement (the Menu belt), and
 * `aspiration`/`pebble` are demand-free by kind (law 6). Asked by
 * `legalMergeTargets` so the pair is never offered, and asked AGAIN at commit
 * time, because a sheet can sit open while the world moves.
 */
export const canHold = (target: NodeState, source: NodeState): boolean =>
  !bringsAClock(source)
  || (target.onMenu === null && !(DEMAND_FREE_KINDS as readonly string[]).includes(target.kind));

/**
 * Where may this node be folded INTO? Held, not itself, not its own
 * descendant (the re-homed children would cycle, and a thing cannot be the
 * same as a part of itself) — and people fold only into people, everything
 * else never into a person: "this task is the same as Ada" is not a sentence.
 */
export function legalMergeTargets(state: State, n: NodeState): NodeState[] {
  const beneath = new Set<NodeId>([n.id]);
  // Explicit queue over the parent index, cycle-safe like every walk.
  const queue: NodeId[] = [n.id];
  const byParent = new Map<NodeId, NodeId[]>();
  for (const x of state.nodes.values()) {
    if (!x.parent) continue;
    let arr = byParent.get(x.parent);
    if (!arr) byParent.set(x.parent, arr = []);
    arr.push(x.id);
  }
  while (queue.length > 0) {
    const cur = queue.pop()!;
    for (const kid of byParent.get(cur) ?? []) {
      if (!beneath.has(kid)) { beneath.add(kid); queue.push(kid); }
    }
  }
  return heldNodes(state)
    .filter(t => !beneath.has(t.id))
    .filter(t => (n.kind === 'person' ? t.kind === 'person' : t.kind !== 'person'))
    // A pebble folds only into a pebble, and nothing else folds into one
    // (1.15.0, ADR-0065) — the `person` rule above, for the same reason. A
    // pebble is LOAD, not work: "this task is the same as the weight I am
    // carrying" is not a sentence, and neither is its reverse. Two pebbles CAN
    // be one weight said twice, so that direction stays open.
    .filter(t => (n.kind === 'pebble' ? t.kind === 'pebble' : t.kind !== 'pebble'))
    // JOURNAL ENTRIES AND ANCHORS: the same rule, added by the seam audit
    // (1.17.3) — 1.13.0 and 1.17.0 each added a not-work kind without revisiting
    // this list, exactly as 1.15.0 had to for pebbles. The stated rationale
    // applies word for word: "this task is the same as my private entry" is not
    // a sentence, and folding work INTO one was worse than a refusal — the gate
    // ACCEPTED it, the work left every list (mergedInto), the survivor was
    // excluded from every list by kind, and the gauge still read zero because
    // law 1 rides the chain to a demand-free survivor. A titleless journal even
    // sorted FIRST in the picker, as "(untitled)" at the top. Nothing folds
    // into either, and neither folds into anything.
    .filter(t => t.kind !== 'journal' && n.kind !== 'journal')
    .filter(t => t.kind !== 'anchor' && n.kind !== 'anchor')
    // Never offer what the gate must refuse (ADR-0038). Until 1.9.2 this
    // stopped at the three filters above, so a source carrying a date could be
    // folded into a Menu item or a demand-free kind and be rejected AFTER the
    // user had picked — by the Menu belt and the law-6 branch respectively.
    .filter(t => canHold(t, n))
    // A wish may fold into a wish, and a wish into work. Work never folds into
    // a wish: that is a DEMOTION, and the app already has a verb for it (route
    // to the Menu) which sheds the date where you can see it happen.
    .filter(t => t.onMenu === null || n.onMenu !== null)
    // A resume card is a way back into a thread, not a thing that survives.
    .filter(t => t.kind !== 'resume-card')
    .sort((a, b) => (a.title || '').localeCompare(b.title || ''));
}

/**
 * The whole fold, one gated commit: carry what the survivor lacks, re-home
 * the children, then merge. Order matters — the carries and re-homes must
 * land while the source is still an ordinary node, and the Menu-belt sees
 * only the final state either way.
 */
export interface MergePlan {
  events: AppEvent[];
  /** What could not come across, so the confirmation can SAY so. */
  skipped: { feeds: NodeId[]; after: NodeId[] };
}

export function mergePlan(
  ctx: StampContext, state: State, source: NodeState, target: NodeState,
): MergePlan {
  const out: AppEvent[] = [];

  // Demand clocks the survivor lacks — each through its own canonical noun.
  for (const k of CARRY_CLOCKS) {
    const c = source.clocks[k];
    if (!c || target.clocks[k]) continue;
    // A STANDING DECLINE's park is not a date about the work — it IS the
    // decline, put there by the decline intent's deliberate park. Carrying it
    // handed the survivor the decline's mechanism without its record: live
    // work went quiet with nothing on any surface saying why (1.9.2). The
    // decline itself is preserved by the ledger reading through the fold.
    // An ordinary park — a real "come back to this on Thursday" — still comes.
    // `standingDecline`, the same predicate `bringsAClock` asks (1.17.4), so
    // the picker and the carry cannot disagree about which park this is.
    if (k === 'park' && standingDecline(source) !== null) continue;
    if (k === 'park') {
      out.push(base(ctx, 'park.set', target.id, { returnAt: c.at, reason: 'merge:carried' }));
    } else if (k === 'suspense') {
      out.push(base(ctx, 'suspense.set', target.id, { at: c.at }));
    } else {
      out.push(base(ctx, 'clock.set', target.id, { clockKind: k, at: c.at, source: 'merge:carried' }));
    }
  }

  // The note: copied when the survivor has none, joined when both speak —
  // overwriting either would be the merge deciding whose words mattered.
  const srcNote = noteOf(source);
  const tgtNote = noteOf(target);
  if (srcNote && srcNote !== tgtNote) {
    out.push(base(ctx, 'node.field.set', target.id, {
      field: 'note', value: tgtNote ? `${tgtNote}\n\n${srcNote}` : srcNote,
    }));
  }

  // People links the survivor lacks — additive by design, so this is safe.
  for (const link of source.people) {
    if (target.people.some(x => x.person === link.person && x.relation === link.relation)) continue;
    out.push(base(ctx, 'person.linked', target.id, {
      node: target.id, person: link.person, relation: link.relation,
    }));
  }

  // Children re-home to the survivor — a bare merge orphans them into Review
  // with words that call a fold a trashing.
  for (const child of state.nodes.values()) {
    if (child.parent !== source.id || child.trashed || child.mergedInto) continue;
    out.push(base(ctx, 'node.parented', child.id, {
      parent: target.id, priorParent: source.id,
    }));
  }

  // ── The rest of what the survivor currently IS, per MERGE_DISPOSITION.
  // Each fills a silence and never overwrites an answer the survivor already
  // gave — the 1.7.0 rule, now applied to every field rather than to four.

  // Who is running it. The opr person LINK is already carried above, so
  // leaving `n.opr` null would render one thing and record another — the exact
  // shape ADR-0057 was written to kill.
  if (source.opr && !target.opr) {
    out.push(base(ctx, 'opr.assigned', target.id, { person: source.opr }));
  }

  // The rhythm. A demand-shaped fact: losing it to a dedup is the class law 3
  // exists for. Both numbers travel together or neither does.
  if (source.intervalDays !== null && source.comfortWindowDays !== null
    && target.intervalDays === null && target.comfortWindowDays === null) {
    out.push(base(ctx, 'upkeep.interval.set', target.id, {
      intervalDays: source.intervalDays, comfortWindowDays: source.comfortWindowDays,
    }));
  }

  // What it costs and what is put by — numbers a person typed by hand.
  if (source.saveTarget !== null && source.saveSaved !== null
    && target.saveTarget === null && target.saveSaved === null) {
    out.push(base(ctx, 'save-for.updated', target.id, {
      target: source.saveTarget, saved: source.saveSaved,
    }));
  }

  // Track vs execute. A silence must not overwrite a statement.
  if (source.role && !target.role && (target.kind === 'project' || target.kind === 'area' || target.kind === 'goal')) {
    out.push(base(ctx, 'project.role.set', target.id, { role: source.role }));
  }

  // Who it is with. Carries the ORIGINAL `since`, so the age of a wait is not
  // reset by a fold. Known and stated edge: if the survivor is not a
  // `waiting-for`, `isOpenWaiting` will not count it — a fold must never
  // change the survivor's kind, so this is a downgrade, not a loss, and the
  // confirmation says so.
  // "No open waiting" — the disposition's own words. This tested bare
  // `!target.waitingOn` until the seam audit (1.17.3), and `waiting.closed`
  // sets `waitingOutcome` without clearing `waitingOn` — so a survivor whose
  // wait had already CLOSED blocked the carry, and folding a still-open
  // duplicate into it silently dropped the open wait: the person disappeared
  // from "with other people" with no record anywhere, the swallow the file
  // header forbids. A closed wait is an ANSWERED question, not a standing one.
  if (source.waitingOn && !source.waitingOutcome
      && !(target.waitingOn && !target.waitingOutcome)) {
    out.push(base(ctx, 'waiting.opened', target.id, {
      person: source.waitingOn,
      forWhat: source.waitingFor ?? '',
      since: source.waitingSince ?? ctx.at,
    }));
  }

  // Its place in TODAY, and only when that place is today. A stale value is
  // precisely what ADR-0051 makes uncomputable, so it is never carried; the net
  // count is unchanged, so the cap cannot be exceeded.
  const todayKey = localDayKey(ctx.at, ctx.zone);
  if (source.todayFor === todayKey && target.todayFor !== todayKey && choosable(target)) {
    out.push(base(ctx, 'today.chosen', target.id, { day: todayKey }));
  }

  // ── What it FEEDS, and what feeds it (1.9.2). Both directions were lost:
  // the survivor did not feed what the source fed, and an upstream's
  // latest-start fell from a real number to silence because `dependencyView`
  // drops a merged downstream. That is the assembled-context half of law 3.
  //
  // Cycles are checked against the ACCUMULATING batch, not prior state: two
  // edges can be individually acyclic and jointly cyclic. A merge batch is
  // tiny, so re-folding locally is cheap and removes the whole class of
  // "produces a batch the gate must refuse".
  let sim = fold(out, state);
  const skippedFeeds: NodeId[] = [];
  const declare = (on: NodeId, feedsId: NodeId, lead: number | null): void => {
    const payload: Record<string, unknown> = { feeds: feedsId };
    if (lead !== null) payload['leadEstimateDays'] = lead;
    const e = base(ctx, 'dependency.declared', on, payload);
    out.push(e);
    sim = fold([e], sim);
  };

  // Forward. `leadDays` rides the first carried edge only, and only when the
  // survivor has none — it means "how long this takes AS A DEPENDENCY", so
  // with nothing downstream there is no dependency for it to qualify.
  let leadToCarry = target.leadDays === null ? source.leadDays : null;
  for (const f of source.feeds) {
    if (f === target.id || sim.nodes.get(target.id)?.feeds.includes(f)) continue;
    const down = state.nodes.get(f);
    if (!down || down.trashed || down.mergedInto) continue;
    if (wouldCycle(sim, target.id, f)) { skippedFeeds.push(f); continue; }
    declare(target.id, f, leadToCarry);
    leadToCarry = null;
  }

  // Reverse. Never `dependency.released` on the old edge: releasing it would
  // make an unmerge permanently lose the split-out node's upstream. A dangling
  // edge is invisible (dependencyView drops merged downstreams) and revives
  // correctly on a split, which is strictly the better failure.
  for (const up of state.nodes.values()) {
    if (up.trashed || up.mergedInto || up.id === target.id) continue;
    if (!up.feeds.includes(source.id) || up.feeds.includes(target.id)) continue;
    if (wouldCycle(sim, up.id, target.id)) { skippedFeeds.push(source.id); continue; }
    declare(up.id, target.id, null);
  }

  // ── WHAT IT WAITS FOR, and what waits for IT (1.30.0). The same two
  // directions, and the same reason: an anchor pointing at a merged node
  // confers no coverage, so a chain folded halfway through would go silent step
  // by step and be cured into a pile of dateless cards — an act meant to
  // preserve work destroying the one structure that says what order it goes in.
  const skippedAfter: NodeId[] = [];
  // Forward: the survivor takes the source's antecedent only into a silence.
  if (source.after && !target.after) {
    const a = state.nodes.get(source.after);
    const alive = a && !a.trashed && !a.mergedInto && !a.lastDone && source.after !== target.id;
    if (alive) {
      // Would it close a loop? Walk forward from the proposed antecedent; the
      // walk guards itself so a loop already in the store terminates.
      const walked = new Set<NodeId>();
      let cur: NodeId | null = source.after;
      let loops = false;
      while (cur && !walked.has(cur)) {
        if (cur === target.id) { loops = true; break; }
        walked.add(cur);
        cur = sim.nodes.get(cur)?.after ?? null;
      }
      if (loops) skippedAfter.push(source.after);
      else {
        const e = base(ctx, 'after.set', target.id, { after: source.after });
        out.push(e);
        sim = fold([e], sim);
      }
    }
  }
  // Reverse: everything that was waiting for the source now waits for the
  // survivor. Overwritten, not added — an `after` is single-valued.
  for (const dep of state.nodes.values()) {
    if (dep.trashed || dep.mergedInto || dep.id === target.id) continue;
    if (dep.after !== source.id) continue;
    const walked = new Set<NodeId>();
    let cur: NodeId | null = target.id;
    let loops = false;
    while (cur && !walked.has(cur)) {
      if (cur === dep.id) { loops = true; break; }
      walked.add(cur);
      cur = sim.nodes.get(cur)?.after ?? null;
    }
    if (loops) { skippedAfter.push(dep.id); continue; }
    const e = base(ctx, 'after.set', dep.id, { after: target.id });
    out.push(e);
    sim = fold([e], sim);
  }

  out.push(base(ctx, 'node.merged', source.id, { into: target.id }));
  return { events: out, skipped: { feeds: skippedFeeds, after: skippedAfter } };
}

/**
 * The whole fold as one gated batch. `mergePlan` is the full answer — what to
 * write AND what could not come across — because a skip that is not said out
 * loud is the silent swallow this release exists to end.
 */
export const mergeEvents = (
  ctx: StampContext, state: State, source: NodeState, target: NodeState,
): AppEvent[] => mergePlan(ctx, state, source, target).events;

/** Split back out. One event; the gate re-covers it in the same transaction. */
export const unmergeEvents = (ctx: StampContext, node: string): AppEvent[] =>
  [base(ctx, 'node.unmerged', node, {})];

// `foldedInto` moved to `src/merged.ts` in 1.9.2: `delta.ts` needs it, and
// core may not import `src/ui/`. Re-exported here so the existing callers and
// tests keep their import site.
export { foldedInto, foldedIntoDeep } from '../merged.ts';
