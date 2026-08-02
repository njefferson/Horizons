// The closed event list, as types.
//
// docs/event-vocabulary.md is the specification; this file is its executable
// form. A writer emitting a kind that is not here is REJECTED, not ignored —
// silent tolerance is how a schema rots (vocabulary §5.1).
//
// Rules that live in the type system rather than in prose:
//   - `node.field.set` carries EXACTLY ONE field. A multi-field event would make
//     per-field last-writer-wins impossible, and LWW is the whole merge
//     mechanism (ADR-0001).
//   - Every event belongs to exactly one vault. Cross-vault references are
//     refused by the gate, not discouraged by convention (ADR-0005).
//   - There is no `overdue` event and there never will be (ADR-0010, law 5).

export type VaultId = string;
export type NodeId = string;
export type DeviceId = string;
export type EventId = string;
export type ISODateTime = string;

export type VaultDomain = 'work' | 'personal' | 'journal';

/** Node kinds. Depth is flexible; the types are fixed (vocabulary §2). */
export const NODE_KINDS = [
  'action', 'outcome', 'project', 'area', 'goal', 'waiting-for', 'upkeep',
  'aspiration', 'bother', 'pebble', 'journal', 'person', 'resume-card', 'anchor',
] as const;
export type NodeKind = (typeof NODE_KINDS)[number];

/** Demand-free kinds cannot carry a clock — ever (law 6, ADR-0014). */
/**
 * Kinds satisfied by law 1 clause (a) — **on a surface** — rather than by a
 * clock, the Menu, or a parent.
 *
 * `person` joins in 0.15.0, and the exemption is EARNED rather than asserted: a
 * person node is a lens onto work, not work, and until the person lens existed
 * there was no surface to be on, so the exemption would have been law 1 defined
 * away. Nothing may be added here on the argument that it "isn't really work" —
 * only on the argument that a surface renders it, and that the surface ships.
 */
/**
 * Kinds that cannot carry a clock, and do not need one to satisfy law 1.
 *
 * `journal` joined in 1.13.0 (ADR-0061). Without it the gate cures a journal
 * entry with a review clock — verified by running it — so every private entry
 * came back at you on a work surface as an untitled thing waiting to be done.
 * A journal entry is not work, and law 6's "acting on one is a deliberate
 * promotion, never an obligation that accrued" is exactly the right reading of
 * it. Same argument that made `person` demand-free when the person lens shipped.
 */
export const DEMAND_FREE_KINDS = ['aspiration', 'pebble', 'person', 'journal'] as const satisfies readonly NodeKind[];

export type ClockKind = 'due' | 'start' | 'suspense' | 'review' | 'park';
export type ClarifyRoute = 'do-now' | 'next-action' | 'waiting-for' | 'someday' | 'reference' | 'trash';
// `sample` is the demonstration set (src/sample.ts). Named rather than folded
// into `quick`, because a capture that says it came from a keystroke when it came
// from a button labelled "sample work" is a small lie in the one place the app
// keeps its history. Additive only, so every log already written stays readable.
export type CaptureSource = 'quick' | 'share-target' | 'url-endpoint' | 'shortcut' | 'focus-interrupt' | 'sample';
export type Heat = 'hot' | 'cold';
export type Capacity = 'low' | 'steady' | 'sharp' | 'unsure';
export type Magnitude = 'pebble' | 'rock' | 'boulder';
export type ProjectRole = 'execute' | 'track';
export type ReplanChoice = 'compress' | 'escalate' | 'renegotiate' | 'new-date' | 'to-menu';
export type MenuCategory = 'read' | 'try' | 'go' | 'make' | 'research' | 'save-for';
export type Ownership = 'mine-to-solve' | 'mine-to-track' | 'not-mine-to-carry';

/** Stamped on every record. `at` is wall clock and is UNTRUSTED for ordering. */
export interface Stamp {
  id: EventId;
  vault: VaultId;
  at: ISODateTime;
  device: DeviceId;
  /** Per-device monotonic, and gap-free over OFFERED events — a gate cure
   *  deliberately shares its cause's seq and a derived id, so replay is
   *  deterministic and a shard proves completeness over offered events while
   *  cures are verifiable by derivation (ADR-0027). */
  seq: number;
}

type Ev<K extends string, P> = Stamp & { kind: K; node: NodeId | null; payload: P };

// --- A · node lifecycle -----------------------------------------------------
export type NodeCreated      = Ev<'node.created',      { nodeKind: NodeKind; title: string; parent?: NodeId; provenance?: Provenance }>;
export type NodeKindChanged  = Ev<'node.kind.changed', { from: NodeKind; to: NodeKind }>;
export type NodeFieldSet     = Ev<'node.field.set',    { field: string; value: unknown }>;
export type NodeRenamed      = Ev<'node.renamed',      { title: string }>;
export type NodeParented     = Ev<'node.parented',     { parent: NodeId; priorParent?: NodeId }>;
export type NodeUnparented   = Ev<'node.unparented',   { priorParent: NodeId }>;
export type NodeTrashed      = Ev<'node.trashed',      { reason?: string }>;
export type NodeUntrashed    = Ev<'node.untrashed',    Record<string, never>>;
export type NodeMerged       = Ev<'node.merged',       { into: NodeId }>;
/** Split a merged node back out (1.7.0, ADR-0053) — the `untrashed` of the
 *  merge family, because a way back that only exists while a sheet stays open
 *  is a promise the trash view already taught us not to make. Silent-risk:
 *  un-merging strips the chain coverage the target conferred, so the gate
 *  cures with a clock in the same transaction. */
export type NodeUnmerged     = Ev<'node.unmerged',     Record<string, never>>;

export interface Provenance { for: 'self' | 'other'; name?: string }

// --- B · temporal (the decay primitive) -------------------------------------
export type ClockSet         = Ev<'clock.set',          { clockKind: ClockKind; at: ISODateTime; source?: string }>;
export type ClockCleared     = Ev<'clock.cleared',      { clockKind: ClockKind }>;
export type UpkeepIntervalSet= Ev<'upkeep.interval.set',{ intervalDays: number; comfortWindowDays: number }>;
export type DoneMarked       = Ev<'done.marked',        { at: ISODateTime }>;
export type DoneUnmarked     = Ev<'done.unmarked',      Record<string, never>>;
export type AnchorDefined    = Ev<'anchor.defined',     { name: string; recurrence: string }>;
export type AnchorFired      = Ev<'anchor.fired',       { anchor: NodeId; at: ISODateTime }>;
export type ReplanRaised     = Ev<'replan.raised',      { passedClock: ClockKind; fed: NodeId[]; suspense?: ISODateTime; daysLeft?: number }>;
export type ReplanResolved   = Ev<'replan.resolved',    { choice: ReplanChoice }>;
export type ParkSet          = Ev<'park.set',           { returnAt: ISODateTime; reason?: string }>;

// --- C · capture and triage -------------------------------------------------
export type CaptureRecorded  = Ev<'capture.recorded',   { text: string; source: CaptureSource; sourceTags?: string[] }>;
export type HeatSet          = Ev<'heat.set',           { heat: Heat }>;
export type ClarifyRouted    = Ev<'clarify.routed',     { route: ClarifyRoute }>;
/** The reverse of a route: the item goes back to the inbox (`route` → null).
 *  `from` records the route being taken back. The undo of a one-tap triage
 *  decision — append-only, so it is an event, not a deletion. */
export type ClarifyReopened  = Ev<'clarify.reopened',   { from: ClarifyRoute }>;
/**
 * A timer ran on a do-now item: when it started and when it stopped, and
 * NOTHING about whether you finished (1.10.0, ADR-0059).
 *
 * `outcome: 'completed' | 'abandoned'` was written here until 1.10.0. Nobody
 * ever saw the word — the log viewer says only that a timer ran — but it was a
 * record of the times you did not finish your own work, kept permanently and
 * carried into every export. `src/requests.ts` and ADR-0056 forbid exactly
 * that, in absolute terms: the do-now offer's "Not now" is "event-free,
 * forever". The button that declined wrote nothing while the timer that you
 * stopped wrote a verdict — same flow, same person, opposite policies.
 *
 * What remains is the `focus.started` / `focus.ended` shape: a span, no
 * judgement. The chosen length is deliberately NOT in the payload, so a
 * shortfall cannot be computed by subtraction — the arithmetic that got the
 * report's "Started" section deleted in 1.9.0.
 *
 * Old events keep their `outcome`; the log is append-only. Nothing reads it.
 */
export type DoNowTimed       = Ev<'do-now.timed',       { startedAt: ISODateTime; endedAt: ISODateTime }>;
export type BotherReceived   = Ev<'bother.received',    { text: string }>;
export type BotherOwned      = Ev<'bother.owned',       { ownership: Ownership }>;
export type BotherRouted     = Ev<'bother.routed',      { route: ClarifyRoute | 'park' }>;
export type AssistOffered    = Ev<'assist.offered',     { rung: 'template' | 'workers-ai' | 'byok' | 'manual'; suggestions: string[] }>;
export type AssistApplied    = Ev<'assist.applied',     { accepted: string[]; rejected: string[] }>;

// --- D · focus and resumption ------------------------------------------------
export type FocusStarted     = Ev<'focus.started',      { node: NodeId }>;
export type FocusEnded       = Ev<'focus.ended',        { reason: 'completed' | 'switched' | 'abandoned' | 'interrupted' }>;
export type InterruptCaptured= Ev<'interrupt.captured', { text: string; duringFocus: NodeId | null }>;
export type ResumeCardCreated= Ev<'resume.card.created',{ forNode: NodeId; cue: string | null }>;
export type ResumeCardSpent  = Ev<'resume.card.spent',  Record<string, never>>;
export type ResumeCardExpired= Ev<'resume.card.expired',{ toReviewQuestion: boolean }>;

// --- E · work domain ---------------------------------------------------------
export type WaitingOpened    = Ev<'waiting.opened',     { person: NodeId; forWhat: string; since: ISODateTime }>;
export type WaitingClosed    = Ev<'waiting.closed',     { outcome: string }>;
export type DependencyDeclared=Ev<'dependency.declared',{ feeds: NodeId; suspense: ISODateTime; leadEstimateDays: number }>;
export type DependencyReleased=Ev<'dependency.released',{ feeds: NodeId }>;
export type SuspenseSet      = Ev<'suspense.set',       { at: ISODateTime; label?: string }>;
export type ProjectRoleSet   = Ev<'project.role.set',   { role: ProjectRole }>;
export type OprAssigned      = Ev<'opr.assigned',       { person: NodeId }>;
export type StakeholderAdded = Ev<'stakeholder.added',  { person: NodeId }>;
export type StakeholderRemoved=Ev<'stakeholder.removed',{ person: NodeId }>;
export type DecisionLogged   = Ev<'decision.logged',    { text: string; at: ISODateTime; meeting?: string }>;
export type DeltaRecorded    = Ev<'delta.recorded',     { since: 'anchor' | 'export'; text: string }>;
export type StatusReportExported=Ev<'status.report.exported',{ format: 'clipboard'|'markdown'|'print'|'csv'; scope: string }>;
/** Declining someone's request is a decision worth keeping (the Not Now
 *  ledger, ADR-0056). `person` is null when nobody has said who — the
 *  `waitingOn` precedent: an ordinary state, not a defect. `what` is the
 *  title SNAPSHOT at decline time (the consent-sentence rule: the record
 *  survives a later rename). `reason` is a fixed provenance string
 *  ('detail' | 'bother'), never free text. */
export type RequestDeclined  = Ev<'request.declined',   { person: NodeId | null; what: string; reason?: string }>;
/** The one request slot (stimulus control, ADR-0056). `node: null`.
 *  `recurrence` is 'weekly:mon'…'weekly:sun'; '' clears the slot (the
 *  note-field precedent: an empty value is an honest removal). An
 *  unrecognised string reads as no slot — refused, never guessed. */
export type RequestSlotSet   = Ev<'request.slot.set',   { recurrence: string }>;
/** How long a timer runs when you start one, in whole minutes (1.10.0). A
 *  preference about how you work, so it travels with the log like the request
 *  slot rather than sitting on one device. `node: null`. */
export type TimerLengthSet   = Ev<'timer.length.set',   { minutes: number }>;
export type CommsSweepScheduled=Ev<'comms.sweep.scheduled',{ at: ISODateTime }>;
export type CommsSweepRan    = Ev<'comms.sweep.ran',    { at: ISODateTime }>;

// --- F · load and capacity ---------------------------------------------------
export type PebbleRaised     = Ev<'pebble.raised',      { magnitude: Magnitude; affects: NodeId[] }>;
export type PebbleSettled    = Ev<'pebble.settled',     Record<string, never>>;
export type CapacityDeclared = Ev<'capacity.declared',  { level: Capacity }>;
export type WipLimitSet      = Ev<'wip.limit.set',      { limit: number }>;
export type EstimateRecorded = Ev<'estimate.recorded',  { durationMinutes: number; basis: 'guess' | 'prior' }>;

// --- G · structure and store -------------------------------------------------
export type VaultCreated     = Ev<'vault.created',      { name: string; domain: VaultDomain }>;
export type VaultLocked      = Ev<'vault.locked',       { method: 'passphrase' }>;
export type VaultUnlocked    = Ev<'vault.unlocked',     { method: 'passphrase' }>;
export type DeviceRegistered = Ev<'device.registered',  { device: DeviceId; label: string }>;
export type ModuleEnabled    = Ev<'module.enabled',     { module: string }>;
export type ModuleDisabled   = Ev<'module.disabled',    { module: string }>;
/** `whatLeaves` is the literal sentence the user agreed to, stored so the record
 *  survives a later copy change (ADR-0015). Not a flag. */
export type ConsentGranted   = Ev<'consent.granted',    { scope: string; whatLeaves: string; rung: string }>;
export type ConsentRevoked   = Ev<'consent.revoked',    { scope: string }>;
export type SnapshotWritten  = Ev<'snapshot.written',   { upToSeq: number; reason: 'periodic' | 'pre-migration' }>;
export type SchemaMigrated   = Ev<'schema.migrated',    { from: number; to: number }>;
export type ExportWritten    = Ev<'export.written',     { at: ISODateTime; scope: string; encrypted: boolean }>;
/** Seeds a FRESH store. There is deliberately no `import.merged` — adding one
 *  would break law 9 (ADR-0006). */
export type ImportSeeded     = Ev<'import.seeded',      { fromExport: string; at: ISODateTime }>;
/**
 * A copy from ANOTHER DEVICE was folded in — the multi-device path (ADR-0035).
 *
 * This is not `import.merged`, which is banned and always will be. That name
 * means resolving two versions of one state, and there is no honest way to do
 * it. This is the union of SINGLE-WRITER SHARDS, which is what ADR-0003 has
 * always said the fold is: each device only ever writes its own events, so two
 * shards cannot contradict each other about what happened — only about what is
 * currently true, which the existing per-field last-writer-wins already settles.
 */
export type ShardFolded      = Ev<'shard.folded',       { fromDevice: DeviceId; taken: number; skipped: number; at: ISODateTime }>;
export type TerminologySkinApplied=Ev<'terminology.skin.applied',{ skin: string; vault: VaultId }>;
export type TemplateLoaded   = Ev<'template.loaded',    { template: string; source: string; licence: string }>;
export type ShardCompacted   = Ev<'shard.compacted',    { device: DeviceId; throughSeq: number; archivedTo: string }>;

// --- H · people and journal --------------------------------------------------
export type PersonCreated    = Ev<'person.created',     { name: string }>;
export type PersonLinked     = Ev<'person.linked',      { node: NodeId; person: NodeId; relation: 'opr'|'stakeholder'|'waiting-on'|'requested-by'|'mentioned' }>;
/** Payload is ALWAYS encrypted at rest. There is no plaintext journal event. */
/**
 * One journal entry, sealed (1.13.0, ADR-0061).
 *
 * The payload IS `seal.ts`'s envelope — `v` the format marker, `iv` the fresh
 * per-message nonce, `ct` the ciphertext with GCM's tag included. The
 * vocabulary called the third field `ciphertext` from the first draft; nothing
 * ever emitted this noun, so it takes the name the code already uses rather
 * than a translation layer between two names for one thing.
 *
 * **The fold never reads this.** It cannot — it has no key, and it must stay a
 * pure function of the event set whether the journal is unlocked or not. The
 * journal surface reads the log directly and opens entries in the UI, which is
 * the log-viewer pattern and is also why search cannot index the journal:
 * there is nothing in state to index.
 */
export type JournalEntryWritten = Ev<'journal.entry.written', { v: number; iv: string; ct: string }>;
/**
 * How this journal's key is derived (1.13.0). Written ONCE, when the passphrase
 * is first set, and `node: null`.
 *
 * The salt is not a secret and is in the log in the clear on purpose: it must
 * travel to a second device, because the whole point is that the same
 * passphrase opens the journal there too. The iteration count travels with it
 * so a later release can raise the work factor and still open what an earlier
 * one sealed — law 9 applied to a number that looks like configuration and is
 * actually part of the data.
 */
export type JournalSealed    = Ev<'journal.sealed',     { salt: string; iterations: number }>;
/** Co-occurrence rendering only. No sentiment field exists, and none may be
 *  added — law 7. */
export type JournalTagAttached  = Ev<'journal.tag.attached',  { tag: string }>;

// --- I · menu and re-entry ---------------------------------------------------
export type MenuItemAdded    = Ev<'menu.item.added',    { category: MenuCategory }>;
/** Taken off the Menu WITHOUT being promoted to work (`onMenu` → null). The
 *  reverse of `menu.item.added` — how a someday/reference route is sent back to
 *  the inbox. `from` records the category it left. Distinct from
 *  `menu.item.promoted`, which turns a wish into a demand and changes the kind;
 *  this changes nothing but the placement. */
export type MenuItemRemoved  = Ev<'menu.item.removed',  { from: MenuCategory }>;
export type MenuItemPromoted = Ev<'menu.item.promoted', { toKind: NodeKind }>;
export type SaveForUpdated   = Ev<'save-for.updated',   { target: number; saved: number }>;
/** The lapse ritual. Named `lapse.migration.ran` and NEVER bare `migration.*`,
 *  which would collide with schema migration in the most data-critical part of
 *  the system (vocabulary §I). */
export type LapseMigrationRan= Ev<'lapse.migration.ran',{ absenceDays: number; itemsTriaged: number }>;
/** Bounded BY SCHEMA: at most three triage items. There is no shape this could
 *  take that shows the backlog (law 8). */
export type ReentryGreeted   = Ev<'reentry.greeted',    { absenceDays: number; shown: { nextUp: NodeId | null; triage: NodeId[]; gauge: number } }>;
export type AmnestyOffered   = Ev<'amnesty.offered',    { scope: string }>;
export type AmnestyAccepted  = Ev<'amnesty.accepted',   { scope: string }>;

// --- K · composed today (1.6.0, ADR-0051) ------------------------------------
/** A hand-chosen "this is for today". `day` is the LOCAL day key it was chosen
 *  for; the choice EXPIRES BY PROJECTION — the only reader answers for the
 *  current day, so "chosen yesterday and not done" is structurally
 *  uncomputable (laws 3 and 5). Nothing here is a score. */
export type TodayChosen      = Ev<'today.chosen',       { day: string }>;
export type TodayReleased    = Ev<'today.released',     { day: string }>;

// --- J · wholesale acts (1.5.0) ----------------------------------------------
/** The receipt written FIRST in each chunk of a bulk act, so the log explains
 *  the pile of ordinary events that follows it — without this, a wholesale
 *  filing reads as 1,222 unexplained `node.parented` rows. `scope` is the
 *  LITERAL sentence the user saw and agreed to (the `consent.granted`
 *  `whatLeaves` precedent: a bare key cannot reproduce what was agreed to once
 *  the copy changes); `verb` is the machine name; `count` is THIS chunk's
 *  items. Not silent-risk — the constituent events carry their own risk and
 *  their own cures. `node` is null: the receipt is about the act, not a node. */
export type RangeActed       = Ev<'range.acted',        { scope: string; verb: string; count: number }>;

export type AppEvent =
  | NodeCreated | NodeKindChanged | NodeFieldSet | NodeRenamed | NodeParented | NodeUnparented
  | NodeTrashed | NodeUntrashed | NodeMerged | NodeUnmerged
  | ClockSet | ClockCleared | UpkeepIntervalSet | DoneMarked | DoneUnmarked
  | AnchorDefined | AnchorFired | ReplanRaised | ReplanResolved | ParkSet
  | CaptureRecorded | HeatSet | ClarifyRouted | ClarifyReopened | DoNowTimed
  | BotherReceived | BotherOwned | BotherRouted | AssistOffered | AssistApplied
  | FocusStarted | FocusEnded | InterruptCaptured
  | ResumeCardCreated | ResumeCardSpent | ResumeCardExpired
  | WaitingOpened | WaitingClosed | DependencyDeclared | DependencyReleased
  | SuspenseSet | ProjectRoleSet | OprAssigned | StakeholderAdded | StakeholderRemoved
  | DecisionLogged | DeltaRecorded | StatusReportExported
  | RequestDeclined | RequestSlotSet | TimerLengthSet | CommsSweepScheduled | CommsSweepRan
  | PebbleRaised | PebbleSettled | CapacityDeclared | WipLimitSet | EstimateRecorded
  | VaultCreated | VaultLocked | VaultUnlocked | DeviceRegistered
  | ModuleEnabled | ModuleDisabled | ConsentGranted | ConsentRevoked
  | SnapshotWritten | SchemaMigrated | ExportWritten | ImportSeeded | ShardFolded
  | TerminologySkinApplied | TemplateLoaded | ShardCompacted
  | PersonCreated | PersonLinked | JournalEntryWritten | JournalSealed | JournalTagAttached
  | MenuItemAdded | MenuItemRemoved | MenuItemPromoted | SaveForUpdated
  | LapseMigrationRan | ReentryGreeted | AmnestyOffered | AmnestyAccepted
  | RangeActed | TodayChosen | TodayReleased;

export type EventKind = AppEvent['kind'];

/** The closed list, at runtime. An unlisted kind is rejected at the boundary. */
export const EVENT_KINDS = [
  'node.created','node.kind.changed','node.field.set','node.renamed','node.parented','node.unparented',
  'node.trashed','node.untrashed','node.merged','node.unmerged',
  'clock.set','clock.cleared','upkeep.interval.set','done.marked','done.unmarked',
  'anchor.defined','anchor.fired','replan.raised','replan.resolved','park.set',
  'capture.recorded','heat.set','clarify.routed','clarify.reopened','do-now.timed',
  'bother.received','bother.owned','bother.routed','assist.offered','assist.applied',
  'focus.started','focus.ended','interrupt.captured',
  'resume.card.created','resume.card.spent','resume.card.expired',
  'waiting.opened','waiting.closed','dependency.declared','dependency.released',
  'suspense.set','project.role.set','opr.assigned','stakeholder.added','stakeholder.removed',
  'decision.logged','delta.recorded','status.report.exported',
  'request.declined','request.slot.set','timer.length.set','comms.sweep.scheduled','comms.sweep.ran',
  'pebble.raised','pebble.settled','capacity.declared','wip.limit.set','estimate.recorded',
  'vault.created','vault.locked','vault.unlocked','device.registered',
  'module.enabled','module.disabled','consent.granted','consent.revoked',
  'snapshot.written','schema.migrated','export.written','import.seeded','shard.folded',
  'terminology.skin.applied','template.loaded','shard.compacted',
  'person.created','person.linked','journal.entry.written','journal.sealed','journal.tag.attached',
  'menu.item.added','menu.item.removed','menu.item.promoted','save-for.updated',
  'lapse.migration.ran','reentry.greeted','amnesty.offered','amnesty.accepted',
  'range.acted','today.chosen','today.released',
] as const;

const KIND_SET: ReadonlySet<string> = new Set(EVENT_KINDS);
export const isKnownKind = (k: string): k is EventKind => KIND_SET.has(k);

/**
 * Events that can leave a node SILENT — failing law 1's four-way test. Each one
 * must be inspected by the write gate and either cured or rejected, in the same
 * transaction. This is the machine-checkable form of the Silent? column in
 * docs/event-vocabulary.md (ADR-0011).
 */
export const SILENT_RISK_KINDS = [
  'node.created', 'node.kind.changed', 'node.unparented', 'node.untrashed',
  'clock.cleared', 'done.marked', 'replan.resolved',
  'capture.recorded', 'clarify.routed', 'bother.received', 'bother.owned',
  'interrupt.captured', 'waiting.closed', 'dependency.released',
  'project.role.set', 'request.declined', 'menu.item.promoted',
  // Undo's two reversers. Sending a routed card back to the inbox, or taking an
  // item off the Menu, can each leave a node with no clock and no surface — the
  // gate cures both with the same same-day clock a fresh capture gets.
  'clarify.reopened', 'menu.item.removed',
  // Coverage can be REMOVED at a distance: trashing or merging a parent
  // orphans children whose only claim was that ancestor's clock, and
  // re-parenting can move a node under an unclocked parent. All three were
  // absent from this list and the gate never looked (audit, severe).
  'node.trashed', 'node.merged', 'node.parented',
  // Splitting a merged node back out strips the chain coverage its target
  // conferred (1.7.0) — cured like untrashed, with a clock of its own.
  'node.unmerged',
] as const satisfies readonly EventKind[];

const SILENT_RISK_SET: ReadonlySet<string> = new Set(SILENT_RISK_KINDS);
export const isSilentRisk = (k: EventKind): boolean => SILENT_RISK_SET.has(k);

/** Banned forever. Present so a reviewer sees the refusal, not just its absence. */
export const BANNED_KIND_SUBSTRINGS = ['overdue', 'streak', 'import.merged'] as const;
