// state = fold(log). Pure, deterministic, no clock, no I/O.
//
// Same log => same state, on every device, in any shard arrival order
// (ADR-0001). Nothing here reads `Date.now()`: `now` is injected by callers that
// need it, because a projection that reads the clock cannot be tested at an
// arbitrary moment and grows a timezone bug that only shows up in real use.

import type {
  AppEvent, ClarifyRoute, ClockKind, Heat, ISODateTime, MenuCategory, NodeId, NodeKind,
  ReplanChoice, VaultId,
} from './events.ts';
import { isValidIso } from './time.ts';

export interface Clock {
  kind: ClockKind;
  at: ISODateTime;
  /** Ordering stamp of the event that set it — used for per-field LWW. */
  setBy: Ordering;
  /**
   * Who set it, carried through from `clock.set`. Retained because the difference
   * between a clock the READER chose and one the APP set is load-bearing on three
   * separate surfaces, and it was being lost here — so each of them re-derived it
   * wrongly in its own way.
   *
   * The calendar exported the app's own clocks as appointments. The held list read
   * a cure clock as "ready now" and told Noah a thousand imported things were
   * ready today. Next-up did the same. One field, asked once, instead of three
   * guesses.
   */
  source?: string;
}

/**
 * Is this the cure for a node that was created without a date — a clock carrying no
 * intent at all about when?
 *
 * **A cure inherits the intent of the event it cured**, and the source records which
 * event that was (`gate:${cause.kind}`). That distinction is the whole of this
 * predicate, and getting it wrong in either direction is a real defect:
 *
 * - `gate:clarify.routed`, `gate:replan.resolved`, `gate:menu.item.promoted`,
 *   `gate:capture.recorded`, `gate:resume.card.created` — somebody DID something,
 *   and the cure is how that choice becomes "now". These are demands.
 * - `gate:node.created` — a node exists and nobody said when. That is the only cure
 *   with no intent behind it.
 *
 * I first wrote this as "any `gate:` source", which is the tempting reading and is
 * wrong twice over: it made a deliberately promoted Menu item vanish from Next up,
 * and it stopped a resume card being offered back after an interrupted focus. Both
 * are cures, and both are the mechanism by which a decision takes effect. The tests
 * that caught it were named for older audits, and they were right.
 *
 * A clock with no recorded source counts as somebody's, which is the safe default:
 * every log written before this field existed behaves exactly as it did, and it errs
 * towards showing work rather than quieting it.
 */
export const isAppClock = (c: Clock | undefined | null): boolean =>
  c != null && c.source === 'gate:node.created';

export interface NodeState {
  id: NodeId;
  vault: VaultId;
  kind: NodeKind;
  title: string;
  parent: NodeId | null;
  trashed: boolean;
  mergedInto: NodeId | null;
  clocks: Partial<Record<ClockKind, Clock>>;
  onMenu: MenuCategory | null;
  lastDone: ISODateTime | null;
  comfortWindowDays: number | null;
  intervalDays: number | null;
  /** Triage state (Phase 2). `heat` from the heat pass; `route` from clarify —
   *  a non-null route means the item has been clarified and left the inbox. */
  heat: Heat | null;
  route: ClarifyRoute | null;
  /** Retained from capture so clarify ordering can run a `boss`-tagged item
   *  hotter (build-plan item 16). */
  sourceTags: string[];
  /** True once the node entered as a capture (or interrupt-capture). This is
   *  what makes it an INBOX item — the clarify queue is captures-not-yet-routed,
   *  NOT "any unrouted node", so a person/anchor/bother/promoted-Menu node never
   *  pollutes triage. A latch: set true at genesis, never cleared. */
  captured: boolean;
  /** A resume card that has been picked up, or that went cold. Either way the
   *  thread is no longer waiting for you, so it stops being offered. A latch. */
  resumeSpent: boolean;
  /** For a `bother`: whose it is, once that has been said, and whether the flow
   *  has terminated. `botherRouted` is a LATCH — a bother leaves the flow once
   *  and does not re-enter it, because being asked the same question twice about
   *  the same worry is the thing the flow exists to stop. */
  ownership: string | null;
  botherRouted: boolean;
  /** For a `save-for` Menu item: what it costs and what is put by. Either may be
   *  null — a save-for with no target is an ordinary wish, and demanding a number
   *  before you may want something would be the app deciding what counts as a
   *  real plan. Never derived: both are set by hand, per the vocabulary. */
  saveTarget: number | null;
  saveSaved: number | null;
  /** For a project: `execute` (you do it) or `track` (you carry it, someone else
   *  does it). Null until anyone has said, which means execute by default —
   *  stated rather than stored, so an unanswered question is not a decision. */
  role: string | null;
  /** The one person responsible. Not a list: "who is running this" has exactly
   *  one answer or it has none, and a shared OPR is how a thing ends up with
   *  nobody running it. */
  opr: NodeId | null;
  /**
   * Who this is with, and in what capacity.
   *
   * A LIST, because one piece of work can involve several people in different
   * ways — the person who owes it to you is rarely the person who asked for it.
   * `relation` is the vocabulary's closed set: opr | stakeholder | waiting-on |
   * requested-by | mentioned.
   */
  people: { person: NodeId; relation: string }[];
  /** For a `waiting-for`: what is owed and since when. `waitingOn` is the person
   *  node; null means nobody has said who, which is an ordinary state and not a
   *  defect — the route is one tap and asking who at that moment would make it
   *  three. */
  waitingOn: NodeId | null;
  waitingFor: string | null;
  waitingSince: ISODateTime | null;
  /** How a waiting-for ended, once it has. */
  waitingOutcome: string | null;
  /** For an interrupt captured during a focus session: which node was being
   *  worked on, and when. Together they say which SESSION it belongs to — a
   *  node id alone would make yesterday's interruptions reappear inside today's
   *  focus on the same piece of work. */
  interruptedFocus: NodeId | null;
  interruptedAt: ISODateTime | null;
  /** For a `resume-card`: the node whose thread it holds. Null on everything
   *  else. Without it the card knows it is a card and nothing more. */
  resumeFor: NodeId | null;
  /** The five-word "I was about to…" cue, and it is SKIPPABLE — null is a
   *  valid, unremarkable value that is never nagged about. Someone interrupted
   *  mid-thought frequently cannot produce one, which is the whole situation. */
  resumeCue: string | null;
  /** The last forward choice made about a passed date (ADR-0012). A record of a
   *  decision, never a record of a failure. */
  lastReplan: ReplanChoice | null;
  /**
   * What this node FEEDS — the downstream things that cannot happen until it
   * does (build-plan item 27, and the missing half of ADR-0012's assembled
   * context). A list, because one piece of work can feed several.
   *
   * The edge lives on the UPSTREAM node, pointing forward, because that is the
   * direction the question is asked in: "if I do not do this, what breaks?"
   */
  feeds: NodeId[];
  /** How long this takes, in whole days, when it was declared as a dependency.
   *  It is what turns a downstream date into an upstream one: latest-start is
   *  the commitment minus this. Null when nobody has said. */
  leadDays: number | null;
  /** Arbitrary fields set via node.field.set, each with its own LWW stamp. */
  fields: Record<string, { value: unknown; setBy: Ordering }>;
  /** Ordering stamp of the last event that touched each structural field. */
  stamps: Record<string, Ordering>;
}

export interface State {
  nodes: Map<NodeId, NodeState>;
  vaults: Map<VaultId, { name: string; domain: string }>;
  devices: Set<string>;
  /**
   * Highest seq folded per device.
   *
   * **This does NOT prove a shard is complete, and an earlier version of this
   * comment said it did.** It is a maximum, so a log holding d1's seq 1, 2 and 5
   * — because 3 and 4 were in a transfer that failed halfway — reports 5 and
   * thereby claims to have events it does not. A device announcing that to
   * another device is told nothing in return, and 3 and 4 are lost by everybody,
   * silently, with the coverage gauge still reading zero.
   *
   * It is fine for what it is actually used for: proving a snapshot covers a
   * prefix of the log this device wrote itself, where seq is contiguous by
   * construction (ADR-0027). **For deciding what to exchange with another device,
   * use `src/exchange.ts`, which describes contiguous RANGES held and cannot make
   * that claim falsely.**
   */
  seqByDevice: Map<string, number>;
  eventCount: number;
  /**
   * The one thing being worked on right now, or null.
   *
   * State-level and not a node field, because "focused" is a property of the
   * SESSION rather than of the work — two nodes can never both be it, and
   * modelling it per-node would make that expressible. LWW over the same
   * ordering as everything else, so two devices that both started a focus
   * converge on the later one rather than on whichever folded last.
   */
  focus: { node: NodeId; startedAt: ISODateTime } | null;
  /** Ordering of the last event that moved `focus`, so it folds LWW. */
  focusStamp: Ordering | null;
  /** When a status report was last handed over. The provenance the delta reads
   *  from — MAX rather than last-folded, so a shard arriving out of order cannot
   *  wind the mark backwards and re-report a fortnight of changes. */
  lastReportAt: ISODateTime | null;
  /** The per-device high-water mark that report went out with, or null for a
   *  report written before marks existed. Copied, never aliased. */
  lastReportMark: Record<string, number> | null;
  /**
   * When anything last happened, across the whole log.
   *
   * A MAXIMUM, like `lastReportAt` and for the same reason: a shard delivering
   * older history must not make it look as though you were away since then. It
   * lives in state rather than in a preference because a preference would
   * survive an import that replaced the very history it describes.
   */
  lastActivityAt: ISODateTime | null;
}

export const emptyState = (): State => ({
  nodes: new Map(),
  vaults: new Map(),
  devices: new Set(),
  seqByDevice: new Map(),
  eventCount: 0,
  focus: null,
  focusStamp: null,
  lastReportAt: null,
  lastReportMark: null,
  lastActivityAt: null,
});

/** (at, device, seq) — `at` first, device as a deterministic tiebreak. */
export type Ordering = readonly [ISODateTime, string, number];
const orderingOf = (e: AppEvent): Ordering => [e.at, e.device, e.seq];

export function compareOrdering(a: Ordering, b: Ordering): number {
  if (a[0] !== b[0]) return a[0] < b[0] ? -1 : 1;
  if (a[1] !== b[1]) return a[1] < b[1] ? -1 : 1;   // deterministic on every device
  return a[2] - b[2];
}

export const compareEvents = (a: AppEvent, b: AppEvent): number => {
  const c = compareOrdering(orderingOf(a), orderingOf(b));
  if (c !== 0) return c;
  // Total order, always. Without this final tiebreak, two events with equal
  // (at, device, seq) — a cure and its cause by design (ADR-0027), or two
  // sessions sharing one device id by accident — fold in storage order, and
  // "same log, same state" quietly becomes "same log, same state, usually".
  // The audit refuted determinism on exactly this. Cure ids derive from their
  // cause's id, so a cure always sorts immediately after its cause.
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
};

/** True when `next` may overwrite a field last written at `prev`.
 *  Ties go to `next`: processing order is total (compareEvents), so on equal
 *  stamps the later-sorted event — deterministically the cure, whose id sorts
 *  after its cause's — wins. Strict `<` here made a cure that shares its
 *  cause's stamp lose to it, which the audit showed silently disables cures
 *  that touch the same field as their cause. */
const wins = (prev: Ordering | undefined, next: Ordering): boolean =>
  prev === undefined || compareOrdering(prev, next) <= 0;

/** Assign without prototype traps: `field: "__proto__"` must become an own,
 *  enumerable, serialisable key — never the object's prototype. The gate also
 *  refuses those names at the boundary; this is the second lock. */
const setField = (obj: Record<string, unknown>, key: string, value: unknown): void => {
  Object.defineProperty(obj, key, { value, writable: true, enumerable: true, configurable: true });
};

/**
 * COPY-ON-WRITE. fold never mutates its base: the first touch of a node in
 * this fold call replaces it with a deep-enough clone. Without this, every
 * NodeState is shared by reference across folds — the gate's interim folds
 * wrote into the caller's live state, and a REJECTED commit left the effects
 * of never-appended events behind (audit finding 1, severe).
 */
function ensureNode(s: State, id: NodeId, vault: VaultId, touched: Set<NodeId>): NodeState {
  let n = s.nodes.get(id);
  if (!n) {
    n = {
      id, vault, kind: 'action', title: '', parent: null,
      trashed: false, mergedInto: null, clocks: {}, onMenu: null,
      lastDone: null, comfortWindowDays: null, intervalDays: null,
      heat: null, route: null, sourceTags: [], captured: false, resumeSpent: false,
      resumeFor: null, resumeCue: null, interruptedFocus: null, interruptedAt: null,
      people: [], waitingOn: null, waitingFor: null, waitingSince: null, waitingOutcome: null,
      role: null, opr: null, saveTarget: null, saveSaved: null,
      ownership: null, botherRouted: false,
      lastReplan: null,
      feeds: [],
      leadDays: null,
      fields: {}, stamps: {},
    };
    s.nodes.set(id, n);
    touched.add(id);
    return n;
  }
  if (!touched.has(id)) {
    const clone: NodeState = {
      ...n,
      clocks: { ...n.clocks },
      fields: { ...n.fields },
      stamps: { ...n.stamps },
      // sourceTags is the one mutable-array structural field; the top-level spread
      // would alias it, holing copy-on-write for it alone (audit: a derived-state
      // mutation would rewrite base history). Clone it like the other containers.
      sourceTags: [...n.sourceTags],
      // Copied, not aliased. The lesson the hub records: a mutable field needs
      // copy-on-clone, copy-on-store-from-payload AND default-on-deserialise.
      feeds: [...n.feeds],
      // Same rule, same reason: `people` is a mutable array on a structural
      // field, so a bare spread would alias it into the base state.
      people: [...n.people],
    };
    s.nodes.set(id, clone);
    touched.add(id);
    return clone;
  }
  return n;
}

/**
 * Fold a batch of events into state.
 *
 * Sorts by (at, device, seq) first, so shards arriving in ANY order — or the
 * same shard replayed twice — produce identical state. A device's own events
 * still fold in seq order regardless of clock skew, because seq is the final
 * tiebreak within a device.
 */
export function fold(events: readonly AppEvent[], base: State = emptyState()): State {
  const s: State = {
    nodes: new Map(base.nodes),
    vaults: new Map(base.vaults),
    devices: new Set(base.devices),
    seqByDevice: new Map(base.seqByDevice),
    eventCount: base.eventCount,
    focus: base.focus,
    focusStamp: base.focusStamp,
    lastReportAt: base.lastReportAt,
    lastReportMark: base.lastReportMark ? { ...base.lastReportMark } : null,
    lastActivityAt: base.lastActivityAt,
  };

  const ordered = [...events].sort(compareEvents);
  const touched = new Set<NodeId>();

  for (const e of ordered) {
    const o = orderingOf(e);
    // Every event is activity, whatever it is. Taken as a maximum so a shard of
    // older history cannot make it look as though you have been away since then.
    if (isValidIso(e.at) && (!s.lastActivityAt || e.at > s.lastActivityAt)) s.lastActivityAt = e.at;
    s.devices.add(e.device);
    const seen = s.seqByDevice.get(e.device);
    if (seen === undefined || e.seq > seen) s.seqByDevice.set(e.device, e.seq);
    s.eventCount++;

    switch (e.kind) {
      case 'vault.created':
        s.vaults.set(e.vault, { name: e.payload.name, domain: e.payload.domain });
        break;

      case 'node.created': {
        const n = ensureNode(s, e.node!, e.vault, touched);
        if (wins(n.stamps['kind'], o)) { n.kind = e.payload.nodeKind; n.stamps['kind'] = o; }
        if (wins(n.stamps['title'], o)) { n.title = e.payload.title; n.stamps['title'] = o; }
        if (e.payload.parent !== undefined && wins(n.stamps['parent'], o)) {
          n.parent = e.payload.parent; n.stamps['parent'] = o;
        }
        break;
      }
      // Renaming competes with capture.recorded / node.created for the SAME
      // stamped key, so a stale rename can never beat a newer title. Not
      // silent-risk: a title carries no coverage (the gate refuses a rename of a
      // node that does not exist, so it cannot mint one either).
      //
      // HONEST LIMIT, since an earlier version of this comment overclaimed: two
      // events sharing an exact (at, device, seq) tie are resolved by processing
      // order, so an incremental fold and a full replay could in principle
      // disagree about which title wins. `nextSeq` and the device tiebreak make
      // that tie unreachable today — but "a replay is deterministic" was too
      // strong a thing to write, and the next reader would have trusted it.
      case 'node.renamed': {
        const n = ensureNode(s, e.node!, e.vault, touched);
        if (wins(n.stamps['title'], o)) { n.title = e.payload.title; n.stamps['title'] = o; }
        break;
      }
      case 'node.kind.changed': {
        const n = ensureNode(s, e.node!, e.vault, touched);
        if (wins(n.stamps['kind'], o)) { n.kind = e.payload.to; n.stamps['kind'] = o; }
        break;
      }

      // These CREATE nodes too. Missing them here meant a captured item never
      // existed in state, so the gate saw nothing to cure and the item went
      // silent — caught by the no-silent-nodes property test, which is exactly
      // what it is for.
      case 'capture.recorded': {
        const n = ensureNode(s, e.node!, e.vault, touched);
        n.captured = true;   // a latch, not LWW — genesis of an inbox item
        if (wins(n.stamps['kind'], o)) { n.kind = 'action'; n.stamps['kind'] = o; }
        if (wins(n.stamps['title'], o)) { n.title = e.payload.text; n.stamps['title'] = o; }
        // Copy the payload array — storing the log event's array by reference
        // holes copy-on-write (audit): a later mutation of live state would
        // rewrite an "immutable" log event, and vice versa.
        if (wins(n.stamps['sourceTags'], o)) { n.sourceTags = [...(e.payload.sourceTags ?? [])]; n.stamps['sourceTags'] = o; }
        break;
      }
      case 'interrupt.captured': {
        const n = ensureNode(s, e.node!, e.vault, touched);
        n.captured = true;   // an interrupt-capture is an inbox item too
        if (wins(n.stamps['kind'], o)) { n.kind = 'action'; n.stamps['kind'] = o; }
        if (wins(n.stamps['title'], o)) { n.title = e.payload.text; n.stamps['title'] = o; }
        // What it pulled you off, and when. Genesis facts, so they are latched
        // at first write rather than fought over by LWW: an interrupt belongs to
        // the session it happened in, for ever.
        if (n.interruptedFocus === null) {
          n.interruptedFocus = e.payload.duringFocus ?? null;
          n.interruptedAt = e.at;
        }
        break;
      }
      case 'bother.received': {
        const n = ensureNode(s, e.node!, e.vault, touched);
        if (wins(n.stamps['kind'], o)) { n.kind = 'bother'; n.stamps['kind'] = o; }
        if (wins(n.stamps['title'], o)) { n.title = e.payload.text; n.stamps['title'] = o; }
        break;
      }
      // A link is ADDITIVE and idempotent, not LWW: two devices each linking a
      // different person to the same node must end with both links, and linking
      // the same person twice must not produce two rows. Last-writer-wins on a
      // list would silently drop one device's answer.
      case 'person.linked': {
        const n = ensureNode(s, e.payload.node ?? e.node!, e.vault, touched);
        const rel = e.payload.relation;
        if (!n.people.some(x => x.person === e.payload.person && x.relation === rel)) {
          n.people = [...n.people, { person: e.payload.person, relation: rel }];
        }
        break;
      }
      case 'waiting.opened': {
        const n = ensureNode(s, e.node!, e.vault, touched);
        if (wins(n.stamps['waiting'], o)) {
          n.waitingOn = e.payload.person ?? null;
          n.waitingFor = e.payload.forWhat ?? null;
          n.waitingSince = e.payload.since ?? e.at;
          n.waitingOutcome = null;      // reopening clears how the last one ended
          n.stamps['waiting'] = o;
        }
        break;
      }
      case 'waiting.closed': {
        const n = ensureNode(s, e.node!, e.vault, touched);
        if (wins(n.stamps['waiting'], o)) {
          n.waitingOutcome = e.payload.outcome ?? 'closed';
          n.stamps['waiting'] = o;
        }
        break;
      }
      // Both numbers set by hand, per the vocabulary's own note ("target, saved
      // — both manual"). A number this app derived would be a projection about
      // somebody's money, which is not a thing it knows anything about.
      case 'bother.owned': {
        const n = ensureNode(s, e.node!, e.vault, touched);
        if (wins(n.stamps['ownership'], o)) { n.ownership = e.payload.ownership; n.stamps['ownership'] = o; }
        break;
      }
      // A latch, like `captured`. Once a worry has been through the flow it does
      // not go back in — being asked the same question twice about the same
      // thing is exactly what the flow exists to stop.
      case 'bother.routed': {
        const n = ensureNode(s, e.node!, e.vault, touched);
        n.botherRouted = true;
        // Routing it to the inbox is what MAKES it an inbox item. `captured` is
        // the latch the clarify queue reads, and a bother never sets it at
        // genesis — deliberately, because a worry must not be asked "what is the
        // next step" before it has been asked whose it is.
        //
        // Without this the choice hint promised "it goes to your inbox" and
        // nothing arrived: the kind changed and triage, which asks about
        // `captured`, never saw it (smoke).
        if ((e.payload as { route?: string }).route === 'inbox') n.captured = true;
        break;
      }
      case 'save-for.updated': {
        const n = ensureNode(s, e.node!, e.vault, touched);
        if (wins(n.stamps['save-for'], o)) {
          const t = e.payload.target, v = e.payload.saved;
          n.saveTarget = typeof t === 'number' && Number.isFinite(t) ? t : null;
          n.saveSaved = typeof v === 'number' && Number.isFinite(v) ? v : null;
          n.stamps['save-for'] = o;
        }
        break;
      }
      case 'project.role.set': {
        const n = ensureNode(s, e.node!, e.vault, touched);
        if (wins(n.stamps['role'], o)) { n.role = e.payload.role; n.stamps['role'] = o; }
        break;
      }
      case 'opr.assigned': {
        const n = ensureNode(s, e.node!, e.vault, touched);
        if (wins(n.stamps['opr'], o)) { n.opr = e.payload.person; n.stamps['opr'] = o; }
        break;
      }
      // A suspense is a CLOCK — the date you owe somebody an answer — and it
      // folds into the same `clocks` map every other date does. Its own event
      // exists because setting one is a different act from scheduling work, but
      // one date living in two places is how the calendar and the list come to
      // disagree, so there is exactly one home for it.
      case 'suspense.set': {
        const n = ensureNode(s, e.node!, e.vault, touched);
        if (wins(n.stamps['clock:suspense'], o)) {
          n.clocks = { ...n.clocks, suspense: { kind: 'suspense', at: e.payload.at, setBy: o } };
          n.stamps['clock:suspense'] = o;
        }
        break;
      }
      // State-level: WHEN a report last left, which is the provenance "what has
      // changed since I last told anyone" reads from. The log is the only place
      // that fact can honestly live — a preference would survive an import that
      // replaced the very history it describes.
      case 'status.report.exported': {
        if (!s.lastReportAt || e.at > s.lastReportAt) {
          s.lastReportAt = e.at;
          // The per-device high-water mark the report went out with, when it
          // carries one. This is what makes the next delta a question about what
          // was REPORTED rather than about the clock — a shard can deliver work
          // stamped before your last report that you had never seen (audit).
          const hw = (e.payload as { upToSeqByDevice?: Record<string, number> }).upToSeqByDevice;
          s.lastReportMark = hw ? { ...hw } : null;
        }
        break;
      }
      case 'person.created': {
        const n = ensureNode(s, e.node!, e.vault, touched);
        if (wins(n.stamps['kind'], o)) { n.kind = 'person'; n.stamps['kind'] = o; }
        if (wins(n.stamps['title'], o)) { n.title = e.payload.name; n.stamps['title'] = o; }
        break;
      }
      case 'anchor.defined': {
        const n = ensureNode(s, e.node!, e.vault, touched);
        if (wins(n.stamps['kind'], o)) { n.kind = 'anchor'; n.stamps['kind'] = o; }
        if (wins(n.stamps['title'], o)) { n.title = e.payload.name; n.stamps['title'] = o; }
        break;
      }
      case 'resume.card.created': {
        const n = ensureNode(s, e.node!, e.vault, touched);
        if (wins(n.stamps['kind'], o)) { n.kind = 'resume-card'; n.stamps['kind'] = o; }
        // WHAT it is for, and the five-word cue. Folding only the kind left the
        // card an empty shell: Next up could rank it and had nothing to name,
        // so "where you left off" pointed at nothing at all.
        if (wins(n.stamps['resumeFor'], o)) { n.resumeFor = e.payload.forNode; n.stamps['resumeFor'] = o; }
        if (wins(n.stamps['resumeCue'], o)) { n.resumeCue = e.payload.cue ?? null; n.stamps['resumeCue'] = o; }
        break;
      }
      // Focus is a property of the session, not of a node. `focus.ended` clears
      // it unconditionally: there is only ever one, so an end that names no node
      // can only mean the one that was running.
      case 'focus.started': {
        if (wins(s.focusStamp ?? undefined, o)) {
          s.focus = { node: e.payload.node, startedAt: e.at };
          s.focusStamp = o;
        }
        break;
      }
      case 'focus.ended': {
        if (wins(s.focusStamp ?? undefined, o)) { s.focus = null; s.focusStamp = o; }
        break;
      }
      // Both fell to `default:` before, so a spent or expired card stayed on the
      // work surface for ever — and ADR-0030's claim that ranking "already knows
      // where resume cards go" was false, because nothing could retire one.
      case 'resume.card.spent':
      case 'resume.card.expired': {
        const n = ensureNode(s, e.node!, e.vault, touched);
        n.resumeSpent = true;   // a latch, like `captured`
        break;
      }
      case 'node.field.set': {
        // Exactly one field per event — this is what makes per-field LWW work.
        const n = ensureNode(s, e.node!, e.vault, touched);
        const cur = Object.hasOwn(n.fields, e.payload.field) ? n.fields[e.payload.field] : undefined;
        if (wins(cur?.setBy, o)) setField(n.fields, e.payload.field, { value: e.payload.value, setBy: o });
        break;
      }
      case 'node.parented': {
        const n = ensureNode(s, e.node!, e.vault, touched);
        if (wins(n.stamps['parent'], o)) { n.parent = e.payload.parent; n.stamps['parent'] = o; }
        break;
      }
      case 'node.unparented': {
        const n = ensureNode(s, e.node!, e.vault, touched);
        if (wins(n.stamps['parent'], o)) { n.parent = null; n.stamps['parent'] = o; }
        break;
      }
      case 'node.trashed': {
        const n = ensureNode(s, e.node!, e.vault, touched);
        if (wins(n.stamps['trashed'], o)) { n.trashed = true; n.stamps['trashed'] = o; }
        break;
      }
      case 'node.untrashed': {
        const n = ensureNode(s, e.node!, e.vault, touched);
        if (wins(n.stamps['trashed'], o)) { n.trashed = false; n.stamps['trashed'] = o; }
        break;
      }
      case 'node.merged': {
        const n = ensureNode(s, e.node!, e.vault, touched);
        if (wins(n.stamps['mergedInto'], o)) { n.mergedInto = e.payload.into; n.stamps['mergedInto'] = o; }
        break;
      }

      // Clocks carry a TOMBSTONE: set and cleared share one stamped key per
      // clock kind, so a clear is a fact with an ordering, not a hole. Without
      // it, fold was non-commutative — a later-folded clock.set with an
      // earlier ordering resurrected a cleared clock, the gate's incremental
      // model disagreed with the store's sorted fold, and a gate-approved
      // sequence read "1 silent" after reload (audit, severe). The fallback to
      // the clock's own setBy keeps pre-tombstone snapshots folding correctly.
      case 'clock.set': {
        const n = ensureNode(s, e.node!, e.vault, touched);
        const key = `clock.${e.payload.clockKind}`;
        const prev = n.stamps[key] ?? n.clocks[e.payload.clockKind]?.setBy;
        if (wins(prev, o)) {
          n.clocks[e.payload.clockKind] = {
            kind: e.payload.clockKind, at: e.payload.at, setBy: o,
            ...(typeof e.payload.source === 'string' ? { source: e.payload.source } : {}),
          };
          setField(n.stamps, key, o);
        }
        break;
      }
      case 'clock.cleared': {
        const n = ensureNode(s, e.node!, e.vault, touched);
        const key = `clock.${e.payload.clockKind}`;
        const prev = n.stamps[key] ?? n.clocks[e.payload.clockKind]?.setBy;
        if (wins(prev, o)) {
          delete n.clocks[e.payload.clockKind];
          setField(n.stamps, key, o);
        }
        break;
      }
      case 'park.set': {
        const n = ensureNode(s, e.node!, e.vault, touched);
        const prev = n.stamps['clock.park'] ?? n.clocks['park']?.setBy;
        if (wins(prev, o)) {
          n.clocks['park'] = { kind: 'park', at: e.payload.returnAt, setBy: o };
          setField(n.stamps, 'clock.park', o);
        }
        break;
      }
      case 'upkeep.interval.set': {
        const n = ensureNode(s, e.node!, e.vault, touched);
        if (wins(n.stamps['interval'], o)) {
          n.intervalDays = e.payload.intervalDays;
          n.comfortWindowDays = e.payload.comfortWindowDays;
          n.stamps['interval'] = o;
        }
        break;
      }
      case 'done.marked': {
        const n = ensureNode(s, e.node!, e.vault, touched);
        if (wins(n.stamps['lastDone'], o)) { n.lastDone = e.payload.at; n.stamps['lastDone'] = o; }
        break;
      }
      case 'done.unmarked': {
        const n = ensureNode(s, e.node!, e.vault, touched);
        if (wins(n.stamps['lastDone'], o)) { n.lastDone = null; n.stamps['lastDone'] = o; }
        break;
      }

      case 'menu.item.added': {
        const n = ensureNode(s, e.node!, e.vault, touched);
        if (wins(n.stamps['menu'], o)) { n.onMenu = e.payload.category; n.stamps['menu'] = o; }
        break;
      }
      // Off the Menu, WITHOUT promoting to work — the reverse of menu.item.added,
      // used to send a someday/reference route back to the inbox. Competes for
      // the same stamped key as added and promoted, so LWW settles a race between
      // two devices. Unlike promoted it leaves the kind untouched: taking a wish
      // back off the list is not the same act as deciding to do it.
      case 'menu.item.removed': {
        const n = ensureNode(s, e.node!, e.vault, touched);
        if (wins(n.stamps['menu'], o)) { n.onMenu = null; n.stamps['menu'] = o; }
        break;
      }
      case 'menu.item.promoted': {
        const n = ensureNode(s, e.node!, e.vault, touched);
        if (wins(n.stamps['menu'], o)) { n.onMenu = null; n.stamps['menu'] = o; }
        if (wins(n.stamps['kind'], o)) { n.kind = e.payload.toKind; n.stamps['kind'] = o; }
        break;
      }

      // The decision itself. A replan CARD is computed (ADR-0034), but the choice
      // a person made about it is a fact, and state should be able to answer
      // "what did I decide about this" without re-reading the whole log.
      // The dependency edge, and the lead time that turns a downstream date into
      // an upstream one. Both live on the upstream node.
      case 'dependency.declared': {
        const n = ensureNode(s, e.node!, e.vault, touched);
        const feeds = e.payload.feeds;
        // Idempotent: declaring the same edge twice is one edge, not two. Two
        // devices can legitimately declare it independently (ADR-0035).
        if (feeds && !n.feeds.includes(feeds)) n.feeds = [...n.feeds, feeds];
        const lead = e.payload.leadEstimateDays;
        if (Number.isFinite(lead) && lead > 0 && wins(n.stamps['lead'], o)) {
          n.leadDays = lead;
          n.stamps['lead'] = o;
        }
        break;
      }

      case 'dependency.released': {
        const n = ensureNode(s, e.node!, e.vault, touched);
        const from = (e.payload as { feeds?: string }).feeds;
        // Releasing a named edge removes that one; releasing none removes all,
        // which is what "this no longer feeds anything" means.
        n.feeds = from ? n.feeds.filter(f => f !== from) : [];
        break;
      }

      case 'replan.resolved': {
        const n = ensureNode(s, e.node!, e.vault, touched);
        if (wins(n.stamps['replan'], o)) { n.lastReplan = e.payload.choice; n.stamps['replan'] = o; }
        break;
      }

      case 'heat.set': {
        const n = ensureNode(s, e.node!, e.vault, touched);
        if (wins(n.stamps['heat'], o)) { n.heat = e.payload.heat; n.stamps['heat'] = o; }
        break;
      }
      case 'clarify.routed': {
        const n = ensureNode(s, e.node!, e.vault, touched);
        if (wins(n.stamps['route'], o)) { n.route = e.payload.route; n.stamps['route'] = o; }
        break;
      }
      // Undo of a route: back to the inbox. Competes for the SAME stamped key as
      // clarify.routed, so a later reopen beats an earlier route and a later
      // route beats an earlier reopen — the same per-field LWW everything else
      // uses, which is what makes undo safe on a synced log rather than a local
      // trick. `captured` is a latch and stays true, so the item re-enters the
      // clarify queue exactly as it left it.
      case 'clarify.reopened': {
        const n = ensureNode(s, e.node!, e.vault, touched);
        if (wins(n.stamps['route'], o)) { n.route = null; n.stamps['route'] = o; }
        break;
      }

      default:
        // Every other kind is recorded in the log and contributes to history,
        // but does not change the structural projection Phase 0 computes.
        // Later phases add projections over these; the log already holds them.
        break;
    }
  }

  return s;
}
