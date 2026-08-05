# Models for Horizon Alignment — A Survey Against Quietkeep's Laws

A reference document for Quietkeep. The question it answers, as asked: what models exist for working at different horizons? Lines of Effort align an organization's goals with activities across areas, and views of that kind are never offered in planning software. Each horizon is discussed briefly by David Allen, but not in a way that leads to action.

The compatibility filter throughout is the ten product laws (NOTES.md), especially law 4 (higher horizons project lineage and health downward; the runway is the only workspace; the user never climbs), law 5 (one decay primitive; no overdue, no streaks, no red walls), and law 7 (the app plots, the human interprets; descriptive, never prescriptive). ADR-0013 is law 4's full statement; ADR-0038 built its first half (containment, exceptions-first Review). Q-13 — roles are identities that cross multiple areas, modelled as a cross-cutting link in the shape the feeds relation already has — turns out to be the load-bearing observation of this whole survey, because the model the model named first has exactly that shape.

One vocabulary note up front: several of these models are military. Their *shapes* are analysed here freely; the app's voice rule (no military vocabulary in naming or brand copy) means the shapes can ship and the words cannot.

---

## The models

### 1. Lines of Effort and Lines of Operation
**Origin.** U.S. Army and joint doctrine — ADP 3-0 *Operations*, FM 5-0 *Planning and Orders Production*, JP 5-0 *Joint Planning*. A line of operation (LOO) is the older, Jominian form: a physical line of decisive points connecting a force through geography to an objective. A line of effort (LOE) is the generalisation that emerged from stability and counterinsurgency doctrine (FM 3-24's "logical lines of operations," renamed in the 2008 FM 3-0): when position in space stops meaning anything, activities are linked by **logic of purpose** instead — tasks, to intermediate conditions, to an end state.

**The mechanism.** The artifact is the LOE sketch in the operations order: a handful of named lines — *civil security, governance, essential services, economic development* — each running left to right from current conditions through intermediate conditions to the end state, with tasks from **different organizational units** hung on each line. The crucial structural fact: the lines cut *across* the org chart. An engineer battalion, a civil-affairs team, and an infantry company all contribute tasks to the same line while belonging to different areas of the organization. What keeps it alive is the operations process: assessment working groups on a battle rhythm, running estimates per line, and measures of effectiveness (did the condition change?) as distinct from measures of performance (was the task done?).

**Why it leads to action.** Two mechanics, both real. First, **nested purpose**: every task in an order carries a task *and* a purpose ("in order to..."), and purposes nest upward through mission statements to the commander's intent, so the bottom of the organization can read *why* on the same line as *what*. Second, the assessment cadence forces the question "did the tasks on this line actually move the condition?" — which reorders next period's tasks. When it fails, it fails because the assessment rhythm is staff-expensive and degrades into slideware, at which point the lines are decoration over whatever the units were going to do anyway.

**Why software never offers it.** It is a staff product. The lines live in PowerPoint and map overlays, built by a planning staff and kept alive by a commander who enforces the battle rhythm. And the data shape is hostile to task tools: a task can serve two lines, a line crosses every branch of the org tree — this is a **graph over the tree**, and task software is trees.

**Quietkeep compatibility.** This is the survey's central resonance, so it gets stated plainly: **an LOE and a Q-13 role are the same shape.** Roles are defined here as identities that cross multiple areas; doctrine defines an LOE as a purpose-line linking activities across organizational areas to an end state. Both are named cross-cutting lines over a single-parent tree, which is exactly why Q-13 already ruled out modelling roles as containers and named the feeds relation as the shape they ride. What survives: the line as a link-kind (law 4 — an input to ranking and lineage, never a place to work), purpose projected *downward* onto the runway card (the 1.20.0 place line already walks lineage; "what this serves" is the same walk along a different edge), and the MOE/MOP distinction (see model 3). What dies: assessment as RAG staff slides (laws 5, 7), the battle rhythm as a mandatory ritual (the thesis: resurfacing must be structural, not habitual — a container's review clock, which already exists in the vocabulary, is the app's substitute for a staff), and every word of the vocabulary (voice rule).

### 2. Commander's intent and backward planning
**Origin.** Same doctrinal family — ADP 5-0, FM 5-0; intellectual lineage through Auftragstaktik.

**The mechanism.** Commander's intent is a deliberately short statement — expanded purpose, key tasks, end state — meant to be carried in the head, so that when the plan breaks (it will), subordinates can act toward the end state without new orders; the discipline is that each echelon's plan nests inside the intent two levels up. Backward planning (reverse planning) starts from the time of execution and works backward to now, allocating time by the one-third/two-thirds rule so subordinates get most of it.

**Why it leads to action.** Intent is a compression that makes *initiative at the bottom* legal: the top level's contribution to bottom-level behaviour is not a cascade of tasks but a portable test — "does this serve the end state?" Backward planning converts a distant end date into a **start-now fact**: if the ceremony is Friday and the printing takes two days, the latest start is Wednesday, and that arithmetic is what makes a far horizon bite today.

**Why software never offers it.** Intent is authored prose with no schema — software has nowhere to put a *why* that ranks anything. Backward planning does exist in project tools (critical path), but only in the heavyweight Gantt tier that nobody runs their life in.

**Quietkeep compatibility.** Backward planning is **already shipped**: `feeds →` with a lead estimate, computed latest-start, buffer burn, and the auto-replan card on a miss (0.12.0, law 3) is reverse planning, implemented, with the replan card's compress/escalate/renegotiate as the renegotiation step doctrine performs in a huddle. Intent-as-portable-test survives as a stated end on a goal node that lineage projection can print on the runway card (law 4). What dies: nothing here, notably — this is the rare model that is already mostly inside the laws.

### 3. Effects-based thinking (effects versus tasks)
**Origin.** U.S. Air Force, post-Gulf-War — David Deptula's *Effects-Based Operations* (2001); institutionalised at U.S. Joint Forces Command; formally killed for joint land use by Mattis's 2008 memo, which is part of the lesson.

**The mechanism.** The one durable distinction: a **task** is what you do; an **effect** is the change in the system your doing is supposed to produce. Plans written in tasks can be executed to completion while achieving nothing. The doctrine residue that survived Mattis is MOP versus MOE: measuring performance ("we did the thing") separately from effectiveness ("the thing worked").

**Why it leads to action — and how it died.** The distinction disciplines action selection: if the effect is stated, a completed task that didn't move it is visibly not done. It died because the full framework claimed to *model* the effects web (system-of-systems analysis, operational net assessment) — a prediction pretension that exceeded what any staff could know. That is worth keeping as a warning: the descriptive half is gold, the predictive half was the fraud.

**Why software never offers it.** Task tools store tasks; an effect is a claim about the world, unverifiable by the tool, so the field gets dropped. The tools that do store "outcomes" store them as renamed folders.

**Quietkeep compatibility.** The vocabulary already holds this distinction — `outcome` versus `action` are separate node kinds. Both halves of the lesson apply directly: the effects/tasks split is law-7-clean (a stated outcome is the human's claim; the app just holds it and plots what fed it), and the predictive half is exactly what law 7 forbids (no cause attribution — the app never asserts the task *produced* the change). Note the azimuth finding: `outcome` currently holds zero nodes. This model says the noun was right; stage-4 evidence decides whether the control ever earns its place.

### 4. Horizons of Focus — David Allen
**Origin.** *Getting Things Done* (2001) and *Making It All Work* (2008). Six levels: ground (calendar/next actions), 10,000 ft (projects), 20,000 ft (areas of focus and accountability), 30,000 ft (goals, 1–2 years), 40,000 ft (vision, 3–5 years), 50,000 ft (purpose and principles). (The registered marks never appear in-app; this is a reference document.)

**The mechanism — and the critique of it, taken seriously.** Mechanically, there almost isn't one, and that is the finding. The connective tissue Allen offers is: the weekly review reconciles the projects list against the runway, and the higher horizons are to be reviewed "as often as needed" — in practice annually or never. At runtime, GTD's action-selection model is four criteria — context, time, energy, priority — and priority, the only place the horizons could enter, is explicitly delegated to intuition ("trust your gut"). So examine what actually links a 30,000-ft goal to a next action: **no artifact does.** There is no link record from action to area, no computed state on a horizon, no consequence when a goal has nothing feeding it. The horizons are a *reflection prompt* — genuinely valuable as one — mistaken by readers for a system layer. The recorded objection — that it does not lead to actual action — is not a matter of emphasis; it is structurally correct. Three pieces are missing: a link artifact, computed health, and a cadence that doesn't depend on the reviewer's own executive function — which is precisely the capacity Quietkeep's thesis says cannot be relied on.

**Why software never offers it.** GTD software implements the two bottom levels — lists and projects — because those are data. The upper four levels are prose in a book, and every "GTD app" quietly omits them or offers an empty folder named "Areas."

**Quietkeep compatibility.** Law 4 is best understood as the deliberate **inversion** of this model: where Allen asks the user to climb to the horizons on a schedule they must remember, law 4 sends the horizons down — lineage and health projected onto the runway, exceptions computed, and (per the V2 plan) horizon visits themselves modelled as sink-class work on the one decay primitive, so "when do I review my goals?" is answered by the mountain coming to you on a clock. Allen's areas-as-checklist survives, transformed: a quiet area is not a page you visit but an exception Review raises (`src/review.ts`, already built). What dies: the review as a mandatory ritual (thesis; law 8's re-entry path exists precisely because lapse is normal).

### 5. Roles and goals — Stephen Covey
**Origin.** *First Things First* (1994, with A. Roger and Rebecca Merrill) and Habit 3 of *The 7 Habits*. The FranklinCovey paper planner ecosystem is its physical form.

**The mechanism.** The organizing axis is the **role** — not a project, not an area, an identity: parent, spouse, professional, "sharpen the saw" self. Weekly, on a worksheet: list your roles (about seven), choose one or two Quadrant II goals per role ("big rocks"), schedule the rocks into the calendar *first*, fill the gravel around them. The cadence is a weekly planning session, classically Sunday.

**Why it leads to action.** Better than most, mechanically: the translation from role to behaviour is *literal calendar placement*. A role produces a goal produces a block of Tuesday. Nothing is left to intuition at runtime. Where it decays: the entire linkage lives inside the weekly ritual and nowhere else. The roles sheet has no memory, no computed state, no persistence between sessions — it is re-derived from blank every week, so two missed Sundays and the system is not stale, it is *gone*. The guilt of the missed session then does the rest (ADR-0038 names this exact failure for reviews generally).

**Why software never offers it.** FranklinCovey tried — PlanPlus and its descendants — and it never took, because a role is a cross-cutting tag with semantics no task schema carries, and because the product *is* the ritual: software can display the worksheet but cannot hold the Sunday.

**Quietkeep compatibility.** Covey is the closest civilian ancestor of Q-13 — "roles are identities for me, that cross multiple areas" is *First Things First*'s axis, stated cold, sixty years of planner history later arriving at the same noun. What survives: the role as a first-class cross-cutting link (Q-13's settled shape, riding the feeds relation), a role carrying its own review clock (already settled — Q-13's "what is NOT deferred"), and role balance as a **descriptive** attention readout — where attention went per role, plotted, never graded (law 7; ADR-0013 names this readout explicitly). What dies: the mandatory weekly session (thesis), and any per-role quota or "you have neglected Parent this week" copy (laws 5, 7 — that is a rebuke with a spreadsheet behind it).

### 6. OKRs — Objectives and Key Results
**Origin.** Andy Grove's iMBO at Intel; carried to Google in 1999 by John Doerr; canonised in *Measure What Matters* (2018).

**The mechanism.** An Objective (qualitative, inspiring) with 3–5 Key Results (quantitative, gradable 0.0–1.0 at quarter's end). Levels of the organization each write OKRs, nominally *aligned* rather than cascaded — Doerr insists on roughly half bottom-up — on a quarterly cadence with weekly check-ins, plus the CFR companion practice (conversations, feedback, recognition). The artifact is the OKR sheet; the linking is the claim that your KR serves someone's O above you.

**Why it leads to action.** The KR is a number a person can move this week, and the scheduled grading is a forcing function; of everything in this survey it has the most *pressure* per unit of structure. The failure modes are equally well documented and they are the interesting part: **sandbagging** (setting what you'll hit at 0.7 anyway), **cascade theater** (mechanically deriving every level from the level above, producing alignment spreadsheets nobody reads and everyone resents), KR-lists degenerating into task lists with numbers stapled on, Goodhart effects on any KR that matters, and **scoring shame** — the grade migrates into performance evaluation no matter how loudly the book forbids it, at which point people optimise the grade, not the work.

**Why software offers it — the exception that proves the rule.** OKR software is the one alignment category that *thrived* commercially (WorkBoard, Ally, Gtmhub, Lattice, Viva Goals — several since dead or absorbed, which is its own signal). It survived in software precisely because it reduced alignment to numbers, which is the reducible-but-wrong part. The tools become quarterly data-entry ceremonies living in a different tab from the actual work — the strategy/execution gap with a subscription fee.

**Quietkeep compatibility.** Mostly dead on arrival, and by name: grading is a score (laws 5, 7), cascaded targets are prescription (law 7), the quarterly ceremony is a mandatory cadence (thesis; cadences are offered-not-asked per the 2026-08-04 decision). Two fragments survive: the Objective as a stated end that lines of work *feed* (the feeds relation, again), and the honest kernel inside the weekly check-in — "what moved under this goal since last time" — which Quietkeep already computes without scores as the **delta report** (`fold(log up to then)` vs `fold(log)`, ADR-0041) cut at demand-free anchors (ADR-0068).

### 7. Hoshin Kanri and the X-matrix, with catchball
**Origin.** The postwar Japanese quality movement (Bridgestone coined *hoshin kanri* — roughly "direction management" — in 1965; Toyota and HP institutionalised it; the X-matrix form is from the Western lean literature, notably Jackson's *Hoshin Kanri for the Lean Enterprise*).

**The mechanism.** This is the one with a real bidirectional linking artifact, and it deserves the precision. The **X-matrix** is a single page with four edges around an X: 3–5-year breakthrough objectives (south), this year's objectives (west), top-level improvement priorities (north), targets and metrics (east), with owners along the far margin — and in each corner, a **correlation matrix of dots** marking which item on one edge serves which on the adjacent edge. Every long-term objective must trace through dots to an annual objective to a priority to a metric to an owner. **Catchball** is the process that fills it: each level proposes ends, the level below counter-proposes means, and the proposal is tossed back and forth — genuinely bidirectionally — until means and ends agree; then monthly review and an annual PDCA turn at strategy level.

**Why it leads to action.** Two real mechanics. The dots make orphans *visible on one page*: an objective with an empty row is undeniably unsupported, and a priority with no dot upward is undeniably purposeless — the artifact performs orphan detection by construction. And catchball means the executing level **authored its own means**, so commitment at the bottom is real rather than received. When it fails, it fails because the matrix outlives the negotiation: filled in once at an offsite, laminated, wrong by March.

**Why software never offers it.** The X-matrix is a *record of a negotiation*, not a database view; it needs a facilitator and a room. Its correlation matrices are many-to-many — again the graph that breaks the tree. And without the catchball ritual the artifact is a wall poster, so software that renders the matrix without holding the negotiation ships the corpse.

**Quietkeep compatibility.** The correlation-dot insight — **an unsupported objective should be visible without anyone going looking** — is already built: the unfed-goal and quiet-area exceptions in `src/review.ts` are the X-matrix's empty row, computed instead of inked, surfaced exceptions-first instead of poster-first (law 4; ADR-0038). Catchball proper needs two parties; its single-player residue is the replan card's compress/escalate/renegotiate — a negotiation with your past self, forced at the moment a date passes (law 3). The targets edge and the annual ceremony die (laws 5, 7; thesis).

### 8. Balanced Scorecard strategy maps — Kaplan and Norton
**Origin.** Robert Kaplan and David Norton, HBR 1992; the strategy-map form in *Strategy Maps* (2004); the corporate apparatus (Office of Strategy Management) in *The Strategy-Focused Organization*.

**The mechanism.** Four stacked perspectives — learning and growth, internal process, customer, financial — with **explicit cause-and-effect arrows** drawn upward between named objectives: this training improves that process, which improves that customer outcome, which produces that financial result. Each objective carries measures, targets, and initiatives; initiatives are the action layer. Cadence is a quarterly strategy review run by the strategy office.

**Why it leads to action.** In principle, every initiative must justify itself by an arrow-chain to the top — a project with no path onto the map is cut. In practice the arrows are **hypotheses nobody ever tests**, drawn once by consultants; and the scorecard degenerates into a KPI dashboard with traffic lights, because measures fit a database and arrows do not. The arrows — the entire alignment content of the model — are the first thing implementation drops.

**Why software never offers it.** BSC software exists (ClearPoint, QPR) and is uniformly the degenerate form: KPIs and RAG. A cause-and-effect arrow is a *claim*, and dashboards want numbers, so the claim layer evaporates on contact with software.

**Quietkeep compatibility.** RAG and targets: dead, by name (laws 5, 7 — no red walls, no scores). The live fragment is the arrow itself: "this feeds that," explicit, inspectable, walkable — which is the feeds relation, and which law 4 says to project *downward* (the runway card showing its lineage chain) rather than upward into a map you climb to. Quietkeep's advantage over BSC's fate is structural: because the arrow is an event in the log, it cannot be dropped by the dashboard — it *is* the data.

### 9. Theory of Change and logic models
**Origin.** Program evaluation and the nonprofit world — the logframe (USAID, 1969), the Kellogg Foundation logic-model guide, and Theory of Change proper via Carol Weiss and the Aspen Institute roundtable (mid-1990s).

**The mechanism.** The chain: inputs → activities → outputs → outcomes → impact. A logic model fills the boxes forward; a Theory of Change is built **backward** from the long-term outcome, and — its one genuinely distinctive move — writes an explicit **assumption on every arrow**: "this link holds only if X." Cadence is the grant cycle: written for the proposal, revisited for the annual report.

**Why it fails to lead to action.** It is written *for funders*, to justify activities that mostly already exist; almost nothing at the delivery bottom ever consults it. The outputs/outcomes distinction is real and disciplining (it is the effects/tasks split in civilian dress), but the cadence is annual and the audience is external, so the document is upward-facing theater with a good idea trapped inside it.

**Why software never offers it.** It lives in Word documents and evaluation consultancies. Its value is the *reasoning* — the assumptions — and diagramming software renders the boxes while losing exactly that.

**Quietkeep compatibility.** The assumption-on-the-arrow is law-7-clean and quietly powerful: a human-stated "this feeds that, provided X" is descriptive, and when X breaks, the lineage the app plots is where the human sees it. Outputs-versus-outcomes maps onto the existing action/outcome kinds. Impact measurement and the annual-report ceremony die (law 7; thesis).

### 10. Impact Mapping — Gojko Adzic
**Origin.** Adzic, *Impact Mapping* (2012), software delivery; descended from effect mapping in the Swedish agile community.

**The mechanism.** A four-level map built in a facilitated workshop: **Why** (the goal, with a measurable target) → **Who** (actors — the people whose behaviour must change) → **How** (the impacts — the behaviour changes) → **What** (deliverables). The distinctive move is the actor layer: between the goal and the work stands a named human, which is where most plans are silently vague. The map's declared use is **pruning**: a deliverable with no path to the goal does not get built.

**Why it leads to action.** It leads to *less* action, deliberately, and that is its virtue — it is a scope-culling instrument, and the cull is mechanical (no path, no build). It does not drive daily behaviour; it decides what the backlog may contain.

**Why software never offers it.** It is a workshop artifact — alive for an afternoon, stale in a week. Mind-map tools hold the picture, but the links from map leaves to backlog items rot immediately, because they live in two different tools with no shared identity.

**Quietkeep compatibility.** The actor layer resonates with machinery that already shipped: the person lens (`person.linked`, waiting-fors, ADR-0040) makes "a goal reached through a person" expressible today — goal, fed by work, linked to a person. Pruning-by-lineage inverts into what Review already computes: "this feeds nothing" is the orphan/unfed exception (law 4). The numeric target on the Why dies (laws 5, 7); the workshop is replaced by nothing, because the map here would be *emergent from links*, not drawn in a session.

### 11. V2MOM — Marc Benioff
**Origin.** Salesforce, 1999 — the founding one famously drafted on the back of an American Express envelope; described in *Behind the Cloud*.

**The mechanism.** Five headings: Vision, Values, Methods (ordered by priority — the ordering is the point), **Obstacles**, Measures. Every employee writes one, aligned to the company's, and all of them are published internally for anyone to read; refreshed annually.

**Why it leads to action.** Methods are a ranked list of what will actually be done, and the radical-transparency publication makes alignment a matter of reading rather than cascading. The distinctive move is **Obstacles**: the plan names, inside the artifact, what will stop it. Its failure is the annual essay's failure — a wall plaque by June — and Measures drift toward whatever is countable.

**Why software never offers it.** It is a five-heading essay. There is no schema to compute on; Salesforce built internal tooling for its own V2MOMs on its own platform and the form never generalised beyond the company that is culturally required to write it.

**Quietkeep compatibility.** Obstacles is the fragment worth naming: a plan that records what ends it, descriptively, is exactly the **Block register** already open in NOTES.md — one line per ended day, what ended it, always about the app never the person. That is V2MOM's best idea, already running, pointed at the product itself. Measures die as targets (law 5); annual essays die as cadence (thesis).

### 12. The 12 Week Year — Brian Moran
**Origin.** Moran and Lennington, *The 12 Week Year* (2013), from execution-consulting practice.

**The mechanism.** Abolish the annual horizon: run twelve-week "years," each with 2–3 goals decomposed into weekly **tactics written at action granularity**; derive each week's plan from the twelve-week plan; score execution weekly as a percentage of tactics completed (85% is the professed standard); attend a Weekly Accountability Meeting with peers.

**Why it leads to action.** Honestly: because it is a pressure machine. The plan is written in actions from the start, so there is no translation gap at all — and the score plus the peer meeting supply urgency the calendar no longer does. It is the most action-productive model in this survey and the most completely incompatible with this app.

**Why software never offers it.** It largely *is* offerable — templates and apps exist — but the engine is the score and the meeting, and the meeting is human.

**Quietkeep compatibility.** Almost total refusal, by name: execution scoring (laws 5, 7), manufactured urgency (law 5 — a red wall on a schedule), mandatory weekly ceremony with social accountability (thesis; law 8, whose re-entry path exists because lapse is the primary designed case, not a failure to be scored). Two honest fragments: plans decomposed to placed actions rather than prose (which is just containment plus feeds, shipped), and the observation that **shorter horizons shrink projection error** — relevant to lead estimates and nothing else.

### 13. North Star Metric
**Origin.** The growth community around Sean Ellis; formalised in Amplitude's *North Star Playbook* (John Cutler, 2019).

**The mechanism.** One metric that best proxies delivered value (nights booked; time listening), with a small tree of **input metrics** beneath it, each owned by a team; initiatives justify themselves by the input they claim to move, hypothesis attached.

**Why it leads to action.** Work is admitted only with a named input it moves — a clean, legible filter. And it fails the way single metrics fail: Goodhart, surrogation, and — for a person rather than a product — the collapse of a life into a number, which is not a failure mode so much as the premise.

**Why software offers it.** Analytics tools offer it *because it is a number* — the second exception proving the same rule as OKRs: software ships the countable residue of alignment and calls it the thing.

**Quietkeep compatibility.** As a target: dead (laws 5, 7). The inputs-tree stripped of numbers is just descriptive lineage — what feeds what — which is the feeds relation once more.

### 14. Pyramid of Clarity — Asana
**Origin.** Asana (Moskovitz/Rosenstein); the internal framework, later productised as Asana Goals. Mission → strategy → objectives → portfolios/projects → tasks.

**The mechanism.** The notable fact: a mainstream task tool that genuinely shipped the linkage. A task rolls up to a project, a project to a goal; goals show progress computed from what is linked beneath them, plus status updates (on track / at risk / off track).

**Where it stops.** Three places, precisely. The computed health is **completion arithmetic** — percent done — which measures motion, not meaning: a goal can read 80% while every completed task was the easy ones. The status layer is RAG by another name. And the goals live in a **separate tab you must climb to** — the projection runs upward into a view nobody visits, the exact inversion of law 4.

**Why this matters.** Asana is the existence proof that the linkage *can* live in a task tool. It then demonstrates the default failure: given a link, software computes a percentage and paints a colour, because those are the easy implementations.

**Quietkeep compatibility.** The link survives (it is containment plus feeds, shipped); the roll-up percentage and status colours die by name (laws 5, 7); the direction inverts — lineage prints on the runway card (law 4, and 1.20.0's place line is the first production instance of exactly that projection).

### 15. The other software that genuinely tried
**A roster, each taken honestly.**

- **Workflowy / Notion (freeform).** An infinite outline or database can *hold* any horizon structure you care to build, including all six of Allen's levels. Nothing computes: no clocks, no health, no return, no consequence. The structure is exactly as alive as your discipline, which is to say it is Allen's model with better indentation. Freeform is why: a tool that cannot distinguish a goal from a grocery list cannot project anything from one to the other.
- **Amplenote.** The "idea execution funnel" (jots → tasks) with a **Task Score** — a computed composite of urgency and importance that grows as a task ages. Credit where due: it actually computes something. But the something is a score that manufactures urgency by aging (a streak's evil twin — laws 5 and 7 both), and there are no horizons above the task at all.
- **Sunsama.** The most serious attempt to hold the *ritual* in software: guided daily planning, weekly objectives, channels (roughly areas), timeboxing, a shutdown ceremony. It stops at the week horizon, and the ritual is load-bearing — skip it and the day opens with a ceremony demanding to be performed, which for this app's audience is a demand in costume (the PDA reading recorded in nd-collisions and in the 2026-08-04 cadence decision).
- **Complice** (Malcolm Ocean). The closest philosophical cousin in the list. You declare a handful of goals; each day you write today's intentions *against* those goals (colour-typed to them); yesterday is reviewed, not rolled over — it is **anti-backlog by design**, and the goal-to-day linkage is real because it is re-authored daily. Where it stops: the daily re-derivation *is* the system. Lapse, and there is nothing holding anything — the connective tissue was the habit itself, which is precisely the dependence Quietkeep's thesis forbids ("the app cannot depend on the user remembering to review, because that is the exact capacity it is compensating for"). Its momentum displays are law-5 casualties besides.

**The shared lesson.** Every one either computes nothing (freeform), computes the wrong thing (scores), or computes the right thing on a habit that cannot be assumed (Complice, Sunsama).

### 16. Wheel of Life / Level 10 Life
**Origin.** Coaching — attributed to Paul J. Meyer (Success Motivation Institute, 1960s); the Level 10 Life variant via Hal Elrod's *Miracle Morning*, popular in bullet journals.

**The mechanism.** Eight to ten life areas, self-rated 1–10, plotted as spokes on a radar wheel; the readout is the *shape* — lopsidedness seen at a glance; re-rated at intervals.

**Why it fails to lead to action.** It doesn't try to; it produces awareness, and the follow-through ("set a goal for the lowest spoke") is bolted on. But note what it is: a **descriptive balance readout over roles/areas**, human-rated, human-interpreted. That is a rare thing in this survey — a model whose entire content is law-7-shaped.

**Why software never offers it well.** Habit trackers implement it as another metrics dashboard demanding data entry; it thrives in journals precisely because there it is a drawing, not a system.

**Quietkeep compatibility.** The readout shape survives nearly whole, with one correction: the app never computes the rating (a computed life score is law 7 dead, and self-ratings solicited on a schedule are a demand). What the app can plot is **where attention actually went** per role or area — event counts, co-occurrence — leaving the lopsidedness for the human to see and interpret. That is the attention-distribution readout ADR-0013 already names as a consequence of law 4, and it directly answers the recorded question of when to review whether enough energy and effort is going into each — answer: you don't visit; it arrives, and it describes.

### 17. Wardley mapping — noted and set aside
**Origin.** Simon Wardley, mid-2000s. Components on a value chain (vertical) against an evolution axis (horizontal, genesis → commodity). In one breath: it is **situational awareness, not horizon alignment** — it tells you where the pieces of a landscape sit and which way they are drifting, not how today's task serves a five-year purpose — so it answers a different question than the owner asked, and it is out of scope here.

---

## 1. Why planning software never offers these views

The cross-model synthesis reduces to five structural reasons.

- **Task lists are trees; alignment links are graphs.** A line of effort crosses the org chart; a Covey role crosses areas; an X-matrix corner is many-to-many; a task can serve two objectives. Single-parent tree schemas — which is what every task tool ships, Quietkeep's included — structurally cannot hold the cross-cutting line, so the feature is not omitted, it is *impossible* until a link-kind exists beside the tree. Q-13 reached this conclusion independently: a role "structurally CANNOT be a container."
- **Alignment artifacts need a cadence, and software cannot hold a ritual for you.** Every model above stays alive only through a human rhythm — weekly review, Sunday session, catchball, quarterly grading, battle rhythm, WAM. Software can only nag, and nagging is what gets uninstalled. This is the one problem in the list Quietkeep has already solved *in principle*: ADR-0013 puts the clock on the artifact instead of the ritual on the person — the horizon node carries a review clock on the one decay primitive and comes down when ready. The mountain comes to you; no other product in this survey does this.
- **Strategy lives in a different tool than execution, and the alignment dies in the gap.** The LOE sketch is in slides, the OKRs in an OKR tool, the strategy map on a poster — and the work is somewhere else. The link between the two tools is a human's memory. Quietkeep's log-of-record architecture closes the gap by fiat: the arrow is an event in the same log as the task, so there is no second tool to drift from.
- **Scoring is the easy implementation and the wrong one.** When alignment content meets a database, the arrows, purposes, and assumptions (prose, claims) are dropped and the numbers (grades, percentages, RAG) are kept — OKR tools, BSC dashboards, and Asana's roll-ups are the fossil record. The countable residue is what ships, and it is precisely the part laws 5 and 7 refuse.
- **Several artifacts are records of a negotiation, and without the negotiation they are posters.** The X-matrix, the impact map, the theory of change all encode an agreement reached by people in a room. Software that renders the artifact without the agreement ships the corpse. The single-player analogue that *does* survive is renegotiation-with-your-past-self at a forced moment — which is the replan card.

## 2. What survives the laws

The fragments worth stealing, each with the law that admits it and the Quietkeep machinery it rides.

- **The cross-cutting line — and the Q-13 resonance, stated plainly.** An Army line of effort and a the owner-defined role are the *same shape*: a named line that crosses organizational areas, linking activities to an identity or end state, over a tree that cannot contain it. The owner's instinct that LOE-style views belong in a planner and his separate ruling that roles are cross-area identities are one design fact seen from two sides. The **feeds relation** is the existing machinery for exactly that shape (Q-13 says so in terms), and a role/line node carrying its own review clock returns by the same mountain-comes-down mechanism as everything else (law 4; the decay primitive, law 5-compliant because it *is* the one primitive).
- **Downward lineage projection** (nested purpose, BSC arrows, commander's intent). Law 4. Rides the `lineageOf` walk that 1.20.0 put into production for the place line — "in Errands · under Home" extends naturally to "serves ⟨goal⟩" on the runway card, descriptive, never a destination.
- **Computed orphan visibility** (the X-matrix's empty row; impact mapping's pathless deliverable). Law 4, ADR-0038. Already built: stalled, orphaned, unfed-goal, quiet-area in `src/review.ts`, capped at three, exceptions-first. The genuinely unbuilt half — per the azimuth check — is feeding these into surfacing.
- **Backward planning** (FM 5-0's reverse planning). Law 3. Already shipped whole: `feeds →` + lead estimate + computed latest-start + buffer burn + the replan card, which is also the single-player catchball.
- **The descriptive delta instead of the grade** (the honest kernel of the OKR check-in and of the staff-call). Law 7. Rides the delta report (fold-vs-fold, ADR-0041) cut at demand-free anchors (ADR-0068): "what moved under this goal since the anchor" — plotted, never scored.
- **The attention/balance readout** (Wheel of Life; Covey's role balance). Law 7, and named in ADR-0013's consequences. Plots where attention went per role/area; the human reads the lopsidedness. This is the direct structural answer to the owner's recorded "when do I visit whether I'm putting enough energy into each?"
- **Effects versus tasks** (EBO's surviving distinction). Law 7 admits the descriptive half. Rides the existing `outcome`/`action` kinds — vocabulary already present, gated behind stage-4 evidence rather than built on an empty noun.
- **Obstacles named inside the plan** (V2MOM). Law 7. Already running as the Block register — what ended the day, about the app, never about him.

## 3. What is refused, by name

- **Cascaded numeric targets** (OKR cascades, hoshin targets edge, NSM inputs-with-numbers): prescription wearing arithmetic — the app plots, the human interprets (law 7), and a target is a standing demand (law 5).
- **RAG status / traffic lights** (BSC dashboards, Asana status): a red wall on a schedule; no red walls, no "overdue" in any costume (law 5).
- **Scoring of any kind** — OKR grades, 12WY execution percentages, Amplenote task scores, completion roll-ups, computed life ratings: no scores, no streaks, no congratulations (law 5; law 7; ADR-0038's "a congratulation is a score").
- **Mandatory cadences and review rituals** (weekly review, Sunday session, WAM, daily re-derivation, guided ceremonies): resurfacing must be structural, not habitual — the thesis itself; cadences are offered, never asked (the 2026-08-04 ruling; law 8 makes lapse the designed path, not a failure state).
- **Alignment theater** — cascade-for-its-own-sake, the full tree as landing view, promote-buttons for empty altitude nouns: altitude views are inspection modes, not workspaces (law 4), and "building the org chart, not the planner" is ADR-0038's own phrase for it; the azimuth check's eleven empty nouns are the bill for the last time it was ignored.
- **Manufactured urgency** (aging scores, shrunken deadlines as pressure devices): the one decay primitive is the only legal temporality, and it describes readiness, never debt (law 5).

### Critical Files for Implementation
- /home/user/Quietkeep/NOTES.md
- /home/user/Quietkeep/docs/adr/0013-levels-push-down.md
- /home/user/Quietkeep/docs/adr/0038-containment-and-exceptions-review.md
- /home/user/Quietkeep/src/review.ts
- /home/user/Quietkeep/src/tree.ts
