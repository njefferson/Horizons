// Editing an item: dates, repeats, and undo (Phase 3.5).
//
// Until now every node the app could make was a capture, and the only thing it
// could do to one was route it six ways. That is a triage loop, not a planner —
// you could not say "this is due Thursday", could not make anything repeat, and
// could not take back a mistake. The decay primitive shipped with no way to
// reach it: `upkeep.interval.set` had no UI path at all, so the Upkeep surface
// could never populate.
//
// Every intent below is built from events that ALREADY EXIST in
// docs/event-vocabulary.md. The vocabulary is a closed list and the gate refuses
// unknown kinds, so nothing here invents a noun.
//
// These build events; they never touch the store. The surface hands them to
// `session.commit`, which runs them through the gate.

import type { AppEvent, MenuCategory, NodeKind } from '../events.ts';
import type { StampContext } from './session.ts';
import { endOfLocalDay, localDayKey, utcMs } from '../time.ts';
import { CONTAINER_DEFAULT } from '../tree.ts';

const base = (ctx: StampContext, kind: string, node: string, payload: unknown): AppEvent => ({
  id: ctx.id(), vault: ctx.vault, at: ctx.at, device: ctx.device, seq: ctx.seq(),
  kind, node, payload,
} as AppEvent);

/** Whole calendar days between two `YYYY-MM-DD` keys. Plain arithmetic on the
 *  parts — no zone involved, because a key is already zone-resolved. `utcMs`
 *  from time.ts, so a typed year below 100 stays itself (audit: "0099-08-04"
 *  through raw `Date.UTC` became 1999 and raised an instant replan card about
 *  a day nobody chose). */
const daysBetweenKeys = (from: string, to: string): number => {
  const [fy, fm, fd] = from.split('-').map(Number) as [number, number, number];
  const [ty, tm, td] = to.split('-').map(Number) as [number, number, number];
  return Math.round((utcMs(ty, tm, td) - utcMs(fy, fm, fd)) / 86_400_000);
};

/**
 * The instant a `YYYY-MM-DD` from a date input means: the END of that day, in
 * the user's zone.
 *
 * Resolved by probing rather than assuming, because no fixed UTC hour is safely
 * inside the same local day everywhere — offsets run from −12 to +14, so noon
 * UTC on the key date is already the next day in Kiritimati. The probe's own
 * local day is measured and the difference applied.
 */
export function endOfDayKey(dayKey: string, zone: string): string {
  const [y, m, d] = dayKey.split('-').map(Number) as [number, number, number];
  const probe = new Date(utcMs(y, m, d, 12)).toISOString();
  const drift = daysBetweenKeys(localDayKey(probe, zone), dayKey);
  return endOfLocalDay(probe, zone, drift);
}

/**
 * Fixing what you wrote. The one gap that needed the closed vocabulary opened
 * (ADR-0031) — a title is a first-class fact, and `node.field.set` would have
 * stored a shadow title under `n.fields` that no surface ever reads.
 *
 * An unusable title is refused here rather than written: a nameless card is not a
 * correction, it is a thing you can no longer identify.
 *
 * `trim()` alone was NOT enough, and the first version of this claimed otherwise.
 * It strips ECMAScript whitespace only, so a title made entirely of zero-width
 * spaces, control characters or combining marks sailed through and rendered as an
 * empty card (audit). Control and format characters are removed outright — they
 * cannot be seen, and a bidi override can make a title display as something other
 * than what is stored.
 */
export const TITLE_MAX = 500;

export function renameEvents(ctx: StampContext, node: string, title: string): AppEvent[] {
  const clean = cleanTitle(title);
  if (!clean) return [];
  return [base(ctx, 'node.renamed', node, { title: clean })];
}

/** The one definition of a usable title, shared by every writer. Returns '' when
 *  what is left could not be read or identified. */
export function cleanTitle(raw: string): string {
  const stripped = raw
    // \p{Cc} control, \p{Cf} format (zero-width, bidi overrides, soft hyphen)
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .trim();
  if (!stripped) return '';
  // Nothing left that a person could actually see: combining marks and
  // whitespace alone are not a name.
  if ([...stripped].every(c => /[\p{White_Space}\p{Mn}\p{Me}]/u.test(c))) return '';
  // A cap, so one card cannot be thousands of lines tall and push the rest of the
  // list off the screen. Generous: this is a title, not an essay.
  return stripped.length > TITLE_MAX ? stripped.slice(0, TITLE_MAX).trim() : stripped;
}

// The note cleaner lives in src/note.ts — the importer writes notes too, and
// two cleaners is how the same file imports differently from how it types.
// Re-exported so the sheet imports its intents from one place.
import { cleanNote } from '../note.ts';
export { cleanNote, NOTE_MAX } from '../note.ts';

/**
 * "Keep this with it." Rides `node.field.set{field:'note'}` — the noun has been
 * in the vocabulary since Phase 0 with per-field LWW already folding; this is
 * the first surface to write it for a person (1.4.0). An EMPTY value is legal
 * and is the honest "remove the note": the log records that it was taken off,
 * rather than pretending it was never there.
 */
export const noteEvents = (ctx: StampContext, node: string, text: string): AppEvent[] =>
  [base(ctx, 'node.field.set', node, { field: 'note', value: cleanNote(text) })];

/**
 * "When or where do you mean to do this?" — the situation, in their words.
 *
 * Rides the same noun as the note and for the same reason: `node.field.set`
 * carries exactly one named field, so this costs the closed vocabulary nothing.
 * An empty value is the honest removal, exactly as with the note.
 *
 * CLEANED BY `cleanNote`, NOT BY A FORMAT RULE. The evidence for
 * implementation intentions rests on SELF-generated plans, so the app takes
 * whatever the person writes: it does not require "when", does not rewrite it
 * into an if-then, and does not refuse a sentence for being the wrong shape.
 * Validating the form would be the app generating the plan by correction.
 */
export const situationEvents = (ctx: StampContext, node: string, text: string): AppEvent[] =>
  [base(ctx, 'node.field.set', node, { field: 'situation', value: cleanNote(text) })];

/**
 * "Wait for this to be finished first." / "Stop waiting." (1.30.0.)
 *
 * The one anchor in the app that is not a date. Everything that makes it safe —
 * the antecedent must exist, be alive, be unfinished, be a kind that can be
 * finished, and close no loop — is enforced at the write gate rather than here,
 * because the gate is the only write path and a check in an emitter is a check
 * the importer and the merge path do not get.
 */
export const afterEvents = (ctx: StampContext, node: string, after: string): AppEvent[] =>
  [base(ctx, 'after.set', node, { after })];

export const clearAfterEvents = (ctx: StampContext, node: string): AppEvent[] =>
  [base(ctx, 'after.cleared', node, {})];

/**
 * "This one is for today." / "Not today after all." (1.6.0, ADR-0051.)
 * The day is stamped from the CONTEXT's clock and zone — the user's day, not
 * UTC's — and the choice expires by projection at midnight: `composedFor` is
 * the only reader and answers only for the current day. Not silent-risk: a
 * choice adds no coverage and removes none.
 */
export const chooseTodayEvents = (ctx: StampContext, node: string): AppEvent[] =>
  [base(ctx, 'today.chosen', node, { day: localDayKey(ctx.at, ctx.zone) })];

export const releaseTodayEvents = (ctx: StampContext, node: string): AppEvent[] =>
  [base(ctx, 'today.released', node, { day: localDayKey(ctx.at, ctx.zone) })];

/** Turn an optional module on or off (1.6.0 — the first emitters for two
 *  Phase-0 nouns). A decision, recorded; the log viewer already has the words. */
export const enableModuleEvents = (ctx: StampContext, module: string): AppEvent[] =>
  [base(ctx, 'module.enabled', null as never, { module })];

export const disableModuleEvents = (ctx: StampContext, module: string): AppEvent[] =>
  [base(ctx, 'module.disabled', null as never, { module })];

/** "This is due Thursday." A real, hard date — the immovable kind that Next-up
 *  ranks above everything computed. */
export const setDueEvents = (ctx: StampContext, node: string, dayKey: string): AppEvent[] =>
  [base(ctx, 'clock.set', node, {
    clockKind: 'due', at: endOfDayKey(dayKey, ctx.zone), source: 'detail:due',
  })];

/**
 * Taking a date off again.
 *
 * `clock.cleared` is silent-risk, and this is the one place where the gate's
 * generic cure is exactly the right answer rather than a fallback: removing a
 * date should hand the thing back to you today to decide about, which is
 * precisely the same-day review clock the gate attaches. A test asserts the node
 * does not go silent, so the reliance is checked rather than assumed.
 */
export const clearDueEvents = (ctx: StampContext, node: string): AppEvent[] =>
  [base(ctx, 'clock.cleared', node, { clockKind: 'due' })];

/**
 * "Not before Thursday." The defer verb (1.3.0) — and the schema finished this
 * feature before any surface asked for it: `start` has been a ClockKind since
 * the vocabulary was written, the importer already writes start clocks from
 * OmniFocus defer dates, and `soonestDemand` counts them — so a future start
 * groups "Coming up" and returns as "Ready now" on the day, while a PASSED
 * start raises no replan card (HARD is due/suspense only). Exactly defer
 * semantics, zero fold changes. This emitter is what makes the stored dates
 * visible, settable, and clearable at last.
 */
export const setStartEvents = (ctx: StampContext, node: string, dayKey: string): AppEvent[] =>
  [base(ctx, 'clock.set', node, {
    clockKind: 'start', at: endOfDayKey(dayKey, ctx.zone), source: 'detail:start',
  })];

/** Take the "not before" off. Silent-risk like every clear — the gate re-cures
 *  with a same-day clock if this was the only thing covering it. */
export const clearStartEvents = (ctx: StampContext, node: string): AppEvent[] =>
  [base(ctx, 'clock.cleared', node, { clockKind: 'start' })];

/**
 * "About twenty minutes." The one v1 data commitment that was never met:
 * NOTES.md carries "duration estimates are logged from v1... impossible to
 * backfill later", and `estimate.recorded` had no emitter anywhere. Logged,
 * displayed nowhere — the learning is v2; the data cannot wait for it.
 */
export const estimateEvents = (ctx: StampContext, node: string, minutes: number): AppEvent[] =>
  [base(ctx, 'estimate.recorded', node, { durationMinutes: minutes, basis: 'guess' })];

/**
 * "New project named ⟨what you just typed⟩" — create the container and file
 * under it, one gated commit (1.3.0). ADR-0013's own consequence: "creating a
 * goal or area must be cheap and optional." Filing an imported backlog is
 * exactly where the destination usually does not exist yet, and the old
 * journey — leave the sheet, capture, triage it, make it a project, reopen,
 * pick — was nine taps and a lost train of thought. The gate cures the fresh
 * container with a same-day clock precisely as it cures any creation.
 */
export function createParentEvents(
  ctx: StampContext, node: string, title: string, priorParent?: string | null,
): AppEvent[] {
  const clean = cleanTitle(title);
  if (!clean) return [];
  const parentId = ctx.id();
  return [
    base(ctx, 'node.created', parentId, {
      nodeKind: CONTAINER_DEFAULT, title: clean, provenance: { for: 'self' },
    }),
    base(ctx, 'node.parented', node, {
      parent: parentId, ...(priorParent ? { priorParent } : {}),
    }),
  ];
}

/**
 * "This one repeats." The only path to the decay primitive
 * ([ADR-0010](../../docs/adr/0010-decay-primitive.md)) — an interval, a comfort
 * window of its own, and a review clock so the thing is covered under law 1 and
 * actually comes back when it says it will.
 *
 * The kind change is emitted only when it is a change; re-emitting it for a node
 * that is already an upkeep would be a no-op event, and the log should not carry
 * claims about changes that did not happen.
 */
export function makeRepeatEvents(
  ctx: StampContext,
  node: string,
  fromKind: NodeKind,
  intervalDays: number,
  comfortWindowDays: number,
): AppEvent[] {
  const out: AppEvent[] = [];
  if (fromKind !== 'upkeep') {
    out.push(base(ctx, 'node.kind.changed', node, { from: fromKind, to: 'upkeep' as NodeKind }));
  }
  out.push(base(ctx, 'upkeep.interval.set', node, { intervalDays, comfortWindowDays }));
  // Covered, and due when the interval says. Without this the gate would cure
  // the kind change with a same-day clock, which would bring a monthly thing
  // back this evening — legal, but wrong.
  out.push(base(ctx, 'clock.set', node, {
    clockKind: 'review', at: endOfLocalDay(ctx.at, ctx.zone, intervalDays), source: 'detail:repeat',
  }));
  return out;
}

/**
 * "Stop repeating." There is no event that un-sets an interval, and inventing
 * one would mean opening the closed vocabulary for something already expressible:
 * an interval of 0 folds to `intervalDays = 0`, which `pressureOf` reads as "no
 * cadence" and returns null for. The kind moves back so the item leaves the
 * Upkeep chips.
 *
 * The `done.unmarked` is load-bearing, not tidying. An interval of 0 makes the
 * item non-recurring, and a non-recurring item that has EVER been completed is
 * finished for good — so stopping the repeat on something already ticked off
 * once would silently retire it. Worse, before the guards agreed, such an item
 * became un-completable and un-dismissable: it rode its old cure clock for ever
 * and Done did nothing. Clearing the completion is what keeps it live and
 * ordinary, and the audit found this exact shape.
 */
export const stopRepeatEvents = (ctx: StampContext, node: string, toKind: NodeKind = 'action'): AppEvent[] => [
  base(ctx, 'upkeep.interval.set', node, { intervalDays: 0, comfortWindowDays: 0 }),
  base(ctx, 'node.kind.changed', node, { from: 'upkeep' as NodeKind, to: toKind }),
  base(ctx, 'done.unmarked', node, {}),
];

/** "I marked that done by mistake." Not silent-risk: the node keeps whatever
 *  coverage it had, and simply stops counting as finished. */
export const undoneEvents = (ctx: StampContext, node: string): AppEvent[] =>
  [base(ctx, 'done.unmarked', node, {})];

/** "Actually, I still want that." Gated — an untrashed node needs somewhere to
 *  be, and the gate gives it a clock in the same transaction. */
export const untrashEvents = (ctx: StampContext, node: string): AppEvent[] =>
  [base(ctx, 'node.untrashed', node, {})];

/**
 * Taking something off the Menu and making it real work.
 *
 * Deliberately a PROMOTION, never an obligation that accrued (law 6,
 * [ADR-0014](../../docs/adr/0014-demand-free-types.md)): a Menu item sat there
 * carrying no clock and no demand, and it only becomes a demand because someone
 * chose it. The gate cures the promotion with a clock.
 */
export const promoteFromMenuEvents = (ctx: StampContext, node: string, toKind: NodeKind = 'action'): AppEvent[] =>
  [base(ctx, 'menu.item.promoted', node, { toKind })];

/** Putting something on the Menu from the detail sheet — the same demand-free
 *  landing the someday/reference routes use. */
export const toMenuEvents = (ctx: StampContext, node: string, category: MenuCategory = 'read'): AppEvent[] =>
  [base(ctx, 'menu.item.added', node, { category })];

/**
 * Declare that this node FEEDS another — the dependency edge (build-plan item
 * 27). The lead estimate is how long THIS takes, which is what turns the
 * downstream date into an upstream one.
 *
 * The edge is stored on the upstream node pointing forward, because that is the
 * direction the question gets asked in: "if I do not do this, what breaks?"
 *
 * Not silent-risk: an edge adds no coverage and removes none. What it does add
 * is a reason, which is why the gate refuses one that names a missing target or
 * closes a loop.
 */
export const declareFeedsEvents = (
  ctx: StampContext, node: string, feeds: string, leadEstimateDays: number,
): AppEvent[] => [{
  id: ctx.id(), vault: ctx.vault, at: ctx.at, device: ctx.device, seq: ctx.seq(),
  kind: 'dependency.declared', node,
  // No `suspense` (1.17.4): this builder used to fill that slot with its own
  // stamp time — a value that MEANS nothing (suspense clocks come solely from
  // `suspense.set`, and no fold case reads this field) and was written only
  // because the declaration wrongly required it. The field is optional now
  // and nothing writes it.
  payload: { feeds, leadEstimateDays },
} as AppEvent];

/** Withdraw the edge. Not a deletion of history — the declaration stays in the
 *  log, as everything does; this says it no longer holds. */
export const releaseFeedsEvents = (
  ctx: StampContext, node: string, feeds: string,
): AppEvent[] => [{
  id: ctx.id(), vault: ctx.vault, at: ctx.at, device: ctx.device, seq: ctx.seq(),
  kind: 'dependency.released', node, payload: { feeds },
} as AppEvent];

/**
 * "This is bigger than one step."
 *
 * The act that turns a captured line into something that can HOLD work. Until
 * this existed the app had a parent field nothing could set, so law 4 had no
 * levels to push down through and Review's stalled half could never fire.
 *
 * `project` and not `outcome`, deliberately: an outcome is a stated result, and
 * naming the result is a separate act of thinking. A control that picked one for
 * you would be putting words in your mouth at the exact moment you were trying
 * to find them.
 *
 * Silent-risk — a kind change can strip a role — so the gate cures it. That is
 * its job, not this module's.
 */
export const makeContainerEvents = (
  ctx: StampContext, node: string, fromKind: NodeKind,
): AppEvent[] =>
  fromKind === CONTAINER_DEFAULT ? [] : [{
    id: ctx.id(), vault: ctx.vault, at: ctx.at, device: ctx.device, seq: ctx.seq(),
    kind: 'node.kind.changed', node, payload: { from: fromKind, to: CONTAINER_DEFAULT },
  } as AppEvent];

/**
 * Put something under something else.
 *
 * `priorParent` is carried because the vocabulary asks for it and because a log
 * that says only where a thing went cannot answer where it came from — and
 * "where did this used to live" is a question people actually ask after a
 * reorganisation they half remember.
 */
export const parentEvents = (
  ctx: StampContext, node: string, parent: string, priorParent?: string | null,
): AppEvent[] => [{
  id: ctx.id(), vault: ctx.vault, at: ctx.at, device: ctx.device, seq: ctx.seq(),
  kind: 'node.parented', node,
  payload: { parent, ...(priorParent ? { priorParent } : {}) },
} as AppEvent];

/** Take it back out. It stands on its own again — and because losing a parent is
 *  silent-risk, the gate gives it a clock of its own in the same transaction. */
export const unparentEvents = (
  ctx: StampContext, node: string, priorParent?: string | null,
): AppEvent[] => [{
  id: ctx.id(), vault: ctx.vault, at: ctx.at, device: ctx.device, seq: ctx.seq(),
  kind: 'node.unparented', node, payload: { ...(priorParent ? { priorParent } : {}) },
} as AppEvent];

/**
 * Say who a piece of work is with.
 *
 * Two events, one transaction: the person node if they are new, and the link.
 * The person is a NODE like everything else — vault-scoped, so the same human in
 * two vaults is two nodes, deliberately (the vocabulary says so, and it is the
 * only way a work vault and a personal one can hold the same name without
 * leaking one into the other).
 *
 * For a waiting-for this ALSO opens the wait, which is what makes "how long have
 * I been owed this" answerable at all. Clarify's route is a single tap and asking
 * who at that moment would make it three, so the answer is offered here instead —
 * and a waiting-for nobody has named stays perfectly usable.
 */
export function linkPersonEvents(
  ctx: StampContext, node: string, person: string, relation: string,
  opts: { createNamed?: string; openWaiting?: boolean; forWhat?: string } = {},
): AppEvent[] {
  const out: AppEvent[] = [];
  const mk = (kind: string, n: string | null, payload: unknown): AppEvent => ({
    id: ctx.id(), vault: ctx.vault, at: ctx.at, device: ctx.device, seq: ctx.seq(),
    kind, node: n, payload,
  } as AppEvent);
  if (opts.createNamed) out.push(mk('person.created', person, { name: opts.createNamed }));
  out.push(mk('person.linked', node, { node, person, relation }));
  // "They are running it" is an OPR assignment, and the vocabulary has a noun
  // for exactly that. The link alone left `n.opr` unset — opr.assigned had no
  // emitter anywhere — so the portfolio printed "nobody named yet" about people
  // the user had named (audit). The fold now also reads the link (healing old
  // logs); this writes the honest noun going forward.
  if (relation === 'opr') out.push(mk('opr.assigned', node, { person }));
  // The same shape for "they care how it goes" (1.9.0, ADR-0057): the fold
  // reads the LINK as well, so every stakeholder linked since 0.15.0 already
  // shows without anything being re-entered; this writes the honest noun
  // forward, and the two can never disagree because they fold identically.
  if (relation === 'stakeholder') out.push(mk('stakeholder.added', node, { person }));
  if (opts.openWaiting) {
    out.push(mk('waiting.opened', node, {
      person, forWhat: opts.forWhat ?? '', since: ctx.at,
    }));
  }
  return out;
}

/**
 * It arrived.
 *
 * `waiting.closed` is silent-risk and the gate re-clocks it, exactly like a
 * completion — a thing that stops being owed to you does not stop being yours.
 *
 * It does NOT mark the node done, and that is the whole point: a thing arriving
 * is not a thing finished. The signed form landing on your desk is the moment
 * the work becomes possible, not the moment it is over. Marking it done here
 * would file away the very item you were waiting to be able to act on.
 *
 * `outcome` says how it ended and never how long it took: this app keeps score
 * on nobody's behalf, least of all on someone else's.
 */
export const closeWaitingEvents = (
  ctx: StampContext, node: string, outcome = 'arrived',
): AppEvent[] => [{
  id: ctx.id(), vault: ctx.vault, at: ctx.at, device: ctx.device, seq: ctx.seq(),
  kind: 'waiting.closed', node, payload: { outcome },
} as AppEvent];

/**
 * Someone else is doing this.
 *
 * `project.role.set` is silent-risk and gated: a tracked project emits no next
 * actions, so its children stop being offered as work and the gate re-clocks
 * anything that would otherwise go quiet. That is the point of the role, not a
 * side effect of it.
 */
export const setTrackRoleEvents = (
  ctx: StampContext, node: string, role: 'execute' | 'track',
): AppEvent[] => [{
  id: ctx.id(), vault: ctx.vault, at: ctx.at, device: ctx.device, seq: ctx.seq(),
  kind: 'project.role.set', node, payload: { role },
} as AppEvent];

/** The date you owe somebody an answer. A hard date like `due` — it raises a
 *  replan card when it passes, because a promise you have not kept to another
 *  person is exactly the kind of date law 3 exists for. */
export const setSuspenseEvents = (
  ctx: StampContext, node: string, dayKey: string, label?: string,
): AppEvent[] => [{
  id: ctx.id(), vault: ctx.vault, at: ctx.at, device: ctx.device, seq: ctx.seq(),
  kind: 'suspense.set', node,
  payload: { at: endOfDayKey(dayKey, ctx.zone), ...(label ? { label } : {}) },
} as AppEvent];

/**
 * The two numbers on a save-for.
 *
 * Both by hand, per the vocabulary's own note — *"target, saved — both manual"*.
 * The app derives nothing here: a number it worked out would be a projection
 * about somebody's money, which is not a thing it knows anything about, and a
 * projected date would turn a wish into a commitment nobody made.
 *
 * `null` for either is a legal, ordinary answer. A save-for with no target is a
 * perfectly good wish, and requiring a number before you may want something
 * would be the app deciding what counts as a real plan.
 */
export const setSaveForEvents = (
  ctx: StampContext, node: string, target: number | null, saved: number | null,
): AppEvent[] => [{
  id: ctx.id(), vault: ctx.vault, at: ctx.at, device: ctx.device, seq: ctx.seq(),
  kind: 'save-for.updated', node, payload: { target, saved },
} as AppEvent];

/**
 * Take somebody off the list of who cares how a thing goes (1.9.0, ADR-0057).
 *
 * The only noun in the whole vocabulary that subtracts a person link, so the
 * fold scopes it hard — person AND relation. The record keeps that they were
 * on it; this is state, not history.
 */
export const removeStakeholderEvents = (
  ctx: StampContext, node: string, person: string,
): AppEvent[] => [base(ctx, 'stakeholder.removed', node, { person })];

/**
 * Log what was decided (1.9.0, ADR-0057).
 *
 * `cleanNote` rather than a cleaner of its own — ADR-0047's rule that two
 * cleaners is how one file comes to import differently from how it types.
 * Prose keeps its newlines; control and format characters go.
 *
 * An empty decision writes NOTHING. Unlike a note, where an empty box is the
 * honest removal of a note, there is no such thing as removing a decision —
 * so there is nothing for an empty one to mean.
 *
 * `meeting` is deliberately not written: nothing in the app resolves a
 * meeting name yet. The fold reserves the field so an import or a later
 * shard can carry one (law 9).
 */
export function logDecisionEvents(
  ctx: StampContext, node: string, text: string,
): AppEvent[] {
  const clean = cleanNote(text);
  if (!clean) return [];
  return [base(ctx, 'decision.logged', node, { text: clean, at: ctx.at })];
}
