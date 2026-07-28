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
export const DEMAND_FREE_KINDS = ['aspiration', 'pebble'] as const satisfies readonly NodeKind[];

export type ClockKind = 'due' | 'start' | 'suspense' | 'review' | 'park';
export type ClarifyRoute = 'do-now' | 'next-action' | 'waiting-for' | 'someday' | 'reference' | 'trash';
export type CaptureSource = 'quick' | 'share-target' | 'url-endpoint' | 'shortcut' | 'focus-interrupt';
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
  /** Per-device monotonic and gap-free, so a shard can prove it is complete. */
  seq: number;
}

type Ev<K extends string, P> = Stamp & { kind: K; node: NodeId | null; payload: P };

// --- A · node lifecycle -----------------------------------------------------
export type NodeCreated      = Ev<'node.created',      { nodeKind: NodeKind; title: string; parent?: NodeId; provenance?: Provenance }>;
export type NodeKindChanged  = Ev<'node.kind.changed', { from: NodeKind; to: NodeKind }>;
export type NodeFieldSet     = Ev<'node.field.set',    { field: string; value: unknown }>;
export type NodeParented     = Ev<'node.parented',     { parent: NodeId; priorParent?: NodeId }>;
export type NodeUnparented   = Ev<'node.unparented',   { priorParent: NodeId }>;
export type NodeTrashed      = Ev<'node.trashed',      { reason?: string }>;
export type NodeUntrashed    = Ev<'node.untrashed',    Record<string, never>>;
export type NodeMerged       = Ev<'node.merged',       { into: NodeId }>;

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
export type DoNowTimed       = Ev<'do-now.timed',       { startedAt: ISODateTime; endedAt: ISODateTime; outcome: 'completed' | 'abandoned' }>;
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
export type RequestDeclined  = Ev<'request.declined',   { person: NodeId; what: string; reason?: string }>;
export type RequestSlotSet   = Ev<'request.slot.set',   { recurrence: string }>;
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
export type TerminologySkinApplied=Ev<'terminology.skin.applied',{ skin: string; vault: VaultId }>;
export type TemplateLoaded   = Ev<'template.loaded',    { template: string; source: string; licence: string }>;
export type ShardCompacted   = Ev<'shard.compacted',    { device: DeviceId; throughSeq: number; archivedTo: string }>;

// --- H · people and journal --------------------------------------------------
export type PersonCreated    = Ev<'person.created',     { name: string }>;
export type PersonLinked     = Ev<'person.linked',      { node: NodeId; person: NodeId; relation: 'opr'|'stakeholder'|'waiting-on'|'requested-by'|'mentioned' }>;
/** Payload is ALWAYS encrypted at rest. There is no plaintext journal event. */
export type JournalEntryWritten = Ev<'journal.entry.written', { ciphertext: string; iv: string }>;
/** Co-occurrence rendering only. No sentiment field exists, and none may be
 *  added — law 7. */
export type JournalTagAttached  = Ev<'journal.tag.attached',  { tag: string }>;

// --- I · menu and re-entry ---------------------------------------------------
export type MenuItemAdded    = Ev<'menu.item.added',    { category: MenuCategory }>;
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

export type AppEvent =
  | NodeCreated | NodeKindChanged | NodeFieldSet | NodeParented | NodeUnparented
  | NodeTrashed | NodeUntrashed | NodeMerged
  | ClockSet | ClockCleared | UpkeepIntervalSet | DoneMarked | DoneUnmarked
  | AnchorDefined | AnchorFired | ReplanRaised | ReplanResolved | ParkSet
  | CaptureRecorded | HeatSet | ClarifyRouted | DoNowTimed
  | BotherReceived | BotherOwned | BotherRouted | AssistOffered | AssistApplied
  | FocusStarted | FocusEnded | InterruptCaptured
  | ResumeCardCreated | ResumeCardSpent | ResumeCardExpired
  | WaitingOpened | WaitingClosed | DependencyDeclared | DependencyReleased
  | SuspenseSet | ProjectRoleSet | OprAssigned | StakeholderAdded | StakeholderRemoved
  | DecisionLogged | DeltaRecorded | StatusReportExported
  | RequestDeclined | RequestSlotSet | CommsSweepScheduled | CommsSweepRan
  | PebbleRaised | PebbleSettled | CapacityDeclared | WipLimitSet | EstimateRecorded
  | VaultCreated | VaultLocked | VaultUnlocked | DeviceRegistered
  | ModuleEnabled | ModuleDisabled | ConsentGranted | ConsentRevoked
  | SnapshotWritten | SchemaMigrated | ExportWritten | ImportSeeded
  | TerminologySkinApplied | TemplateLoaded | ShardCompacted
  | PersonCreated | PersonLinked | JournalEntryWritten | JournalTagAttached
  | MenuItemAdded | MenuItemPromoted | SaveForUpdated
  | LapseMigrationRan | ReentryGreeted | AmnestyOffered | AmnestyAccepted;

export type EventKind = AppEvent['kind'];

/** The closed list, at runtime. An unlisted kind is rejected at the boundary. */
export const EVENT_KINDS = [
  'node.created','node.kind.changed','node.field.set','node.parented','node.unparented',
  'node.trashed','node.untrashed','node.merged',
  'clock.set','clock.cleared','upkeep.interval.set','done.marked','done.unmarked',
  'anchor.defined','anchor.fired','replan.raised','replan.resolved','park.set',
  'capture.recorded','heat.set','clarify.routed','do-now.timed',
  'bother.received','bother.owned','bother.routed','assist.offered','assist.applied',
  'focus.started','focus.ended','interrupt.captured',
  'resume.card.created','resume.card.spent','resume.card.expired',
  'waiting.opened','waiting.closed','dependency.declared','dependency.released',
  'suspense.set','project.role.set','opr.assigned','stakeholder.added','stakeholder.removed',
  'decision.logged','delta.recorded','status.report.exported',
  'request.declined','request.slot.set','comms.sweep.scheduled','comms.sweep.ran',
  'pebble.raised','pebble.settled','capacity.declared','wip.limit.set','estimate.recorded',
  'vault.created','vault.locked','vault.unlocked','device.registered',
  'module.enabled','module.disabled','consent.granted','consent.revoked',
  'snapshot.written','schema.migrated','export.written','import.seeded',
  'terminology.skin.applied','template.loaded','shard.compacted',
  'person.created','person.linked','journal.entry.written','journal.tag.attached',
  'menu.item.added','menu.item.promoted','save-for.updated',
  'lapse.migration.ran','reentry.greeted','amnesty.offered','amnesty.accepted',
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
] as const satisfies readonly EventKind[];

const SILENT_RISK_SET: ReadonlySet<string> = new Set(SILENT_RISK_KINDS);
export const isSilentRisk = (k: EventKind): boolean => SILENT_RISK_SET.has(k);

/** Banned forever. Present so a reviewer sees the refusal, not just its absence. */
export const BANNED_KIND_SUBSTRINGS = ['overdue', 'streak', 'import.merged'] as const;
