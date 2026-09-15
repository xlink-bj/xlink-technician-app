# AI Engineering Loop

Status: Proposed engineering operating model — documented, not yet enabled for unattended execution  
Program: New Technician / Field Service App  
Applies to: Web ChatGPT, Local Codex, GitHub Issues, Product Owner  

## 1. Purpose

This document defines a durable engineering loop for collaboration between
Web ChatGPT and Local Codex, with GitHub as the shared state, evidence, and
audit layer.

The objective is not to make the project "fully autonomous" by default. The
objective is to make implementation work repeatable, reviewable, recoverable,
and increasingly automatable while keeping product, architecture, safety, and
business decisions under explicit control.

The core loop is:

`PLAN -> EXECUTE -> VERIFY -> EVIDENCE -> REVIEW -> GATE -> NEXT`

For work that is safe to automate, this can become a scheduled asynchronous
loop between Web ChatGPT and Local Codex. For work that requires human product
judgment, especially visual UX, production mutations, or unresolved business
semantics, the loop must stop at a human gate.

## 2. Roles

### Product Owner

The Product Owner owns product intent and final human decisions.

Responsibilities include:

- product scope and priority;
- material UX/product choices;
- acceptance of visual quality where human judgment is required;
- authorization of sensitive or production-impacting actions;
- escalation decisions when the automated loop reaches a hard stop.

### Web ChatGPT

Web ChatGPT acts as planner, architect, reviewer, and gatekeeper.

Responsibilities include:

- read Program Control and active Issue state before material decisions;
- define the current Slice/Gate, scope, non-goals, safety constraints, and
  acceptance criteria;
- produce an execution-ready prompt for Local Codex;
- review repository evidence, code diff, tests, contracts, and Issue evidence;
- return `PASS`, `NEEDS_FIX`, or `BLOCKED`;
- write the next execution instruction after review;
- prevent scope expansion into later Gates or unsupported capabilities.

Web ChatGPT must review repository evidence rather than relying only on the
executor's self-report.

### Local Codex

Local Codex acts as implementation and verification executor.

Responsibilities include:

- execute only the authorized Slice on the explicit branch;
- inspect accepted contracts, reference repositories, and relevant docs;
- implement and test locally;
- build supported targets where required;
- create a focused commit and push it;
- write concise textual evidence to the active GitHub Issue;
- stop after handoff and wait for review unless the task is explicitly running
  under an approved automated-loop protocol.

Local Codex must not promote unresolved assumptions into product, workflow,
contract, or architecture decisions.

### GitHub

GitHub is the durable coordination and audit layer.

GitHub Issues store:

- task definition;
- current state;
- branch and expected starting HEAD;
- constraints and acceptance criteria;
- execution evidence;
- review outcome;
- next-step instructions;
- escalation/hard-stop reason when applicable.

Git commits store the implementation history. Reference repositories remain
read-only unless separately authorized.

## 3. Source-of-truth hierarchy

The loop uses the following precedence:

1. Product Owner / Program Control decisions
2. Active GitHub Issue and accepted Gate constraints
3. Accepted semantic contracts and architecture decisions
4. `AGENTS.md`
5. Task-specific approved Skills and verification documents
6. Executor implementation choices

No lower layer may silently override a higher layer.

## 4. Default human-in-the-loop cycle

The normal project cycle is:

1. GitHub Issue defines a reviewable Slice.
2. Web ChatGPT reads Program Control and active Issue state.
3. Web ChatGPT produces the `Next Prompt for Codex`.
4. Local Codex executes on the authorized branch.
5. Local Codex runs required verification.
6. Local Codex commits and pushes one coherent change set.
7. Local Codex records textual evidence in the Issue.
8. Web ChatGPT audits the actual commit/diff/evidence.
9. Web ChatGPT returns one of:
   - `PASS`
   - `NEEDS_FIX`
   - `BLOCKED`
10. If `NEEDS_FIX`, Web ChatGPT supplies a focused correction prompt.
11. If `PASS`, Web ChatGPT authorizes the next Slice or human gate.
12. Merge or Gate transition occurs only when explicitly authorized.

This model remains the default even if more automation is introduced later.

## 5. State model

A future automated loop should use a small explicit state machine. Recommended
states are:

`READY -> IN_PROGRESS -> VERIFY -> REVIEW -> PASS / NEEDS_FIX / BLOCKED -> DONE`

Meaning:

- `READY`: task is sufficiently specified for execution.
- `IN_PROGRESS`: Local Codex has claimed the task and is executing it.
- `VERIFY`: implementation exists and required local verification is running.
- `REVIEW`: commit/push/evidence are complete and Web ChatGPT review is due.
- `NEEDS_FIX`: review found bounded correctable issues.
- `BLOCKED`: human/product/architecture/safety input is required.
- `PASS`: review accepted the Slice.
- `DONE`: the Slice is closed or incorporated according to Program Control.

The exact representation may later use Issue labels, a structured Issue
section, or another machine-readable convention. This document does not yet
activate such automation.

## 6. Evidence contract

Every meaningful Slice should provide enough evidence for an independent
review. Depending on scope, evidence can include:

- **Code evidence** — branch, previous HEAD, new HEAD, changed files, diff.
- **Verification evidence** — boundary checks, typecheck, unit/integration
  tests, builds, deterministic fixtures.
- **Business-boundary evidence** — which accepted contract/evidence justified
  the behavior and which unsupported capabilities were intentionally omitted.
- **Runtime evidence** — simulator/device/read-only Beta observations where
  required.
- **Visual evidence** — matched-viewport screenshots and Design QA for visual
  frontend work.

Issue comments should remain concise textual evidence. Large local review
artifacts should remain untracked unless explicitly requested.

## 7. Automation architecture — future option

For non-visual, low-risk work, the existing collaboration model can evolve
into an asynchronous automated loop:

`Web ChatGPT scheduled reviewer <-> GitHub Issues <-> Local Codex scheduled runner`

GitHub remains the protocol boundary between the two systems. Direct process
coupling is not required.

A possible execution cycle is:

1. An Issue is in `READY` or `NEEDS_FIX`.
2. A Local Codex scheduled runner scans eligible Issues.
3. Codex claims one task, records its run identity and starting HEAD, then
   moves it to `IN_PROGRESS`.
4. Codex executes, verifies, commits, pushes, records evidence, and moves the
   task to `REVIEW`.
5. A Web ChatGPT scheduled reviewer scans `REVIEW` tasks.
6. Web ChatGPT verifies the declared HEAD and repository evidence.
7. Web ChatGPT writes either:
   - `PASS` plus next authorized step;
   - `NEEDS_FIX` plus a bounded correction instruction;
   - `BLOCKED` plus the required human decision.
8. Local Codex may pick up `NEEDS_FIX` on the next scheduled run.
9. A `PASS` task may advance only within the authority explicitly granted by
   Program Control.

This is a design option for later pilot work. It is not currently enabled by
this document.

## 8. Required safeguards for unattended execution

Before any unattended pilot is enabled, the automation must include at least
these controls.

### Claim / lease

A runner must record a unique run/claim identifier before execution so two
runners cannot work the same task concurrently.

Recommended claim metadata:

- Issue number;
- branch;
- run ID;
- starting HEAD;
- claim timestamp;
- expected task state.

A stale claim must not be silently reused.

### HEAD integrity

Review must be anchored to the exact declared commit. If the branch HEAD has
moved unexpectedly, review must stop rather than silently reviewing a different
change set.

### Bounded retries

An automated Slice must have a maximum number of `NEEDS_FIX -> execution ->
REVIEW` cycles, for example two or three. Exceeding the limit should transition
to `BLOCKED` for human review.

### Scope lock

An automated executor may change only files/capabilities inside the authorized
Slice unless the Issue explicitly permits a supporting change. Unexpected
contract, dependency, infrastructure, or architecture expansion should stop the
run.

### Deterministic handoff

Each automated execution must report at minimum:

- previous HEAD;
- new HEAD;
- changed files;
- verification results;
- safety boundary result;
- Issue state transition.

## 9. Hard-stop conditions

Automation must stop and request human review when work requires any of the
following unless explicitly pre-authorized:

- material product-scope decision;
- unresolved business semantics;
- new or changed backend/API contract;
- database/schema migration with meaningful risk;
- permission/auth/security policy change;
- production or Beta business mutation;
- real customer action or communication;
- credential or secret handling beyond an accepted mechanism;
- destructive Git operation;
- reference-repository write;
- major architecture change;
- new dependency with non-trivial architectural/security impact;
- repeated unexplained test/build failure;
- conflict between Program Control, accepted contracts, and observed behavior;
- any condition where the executor would need to guess rather than implement
  an accepted decision.

## 10. Visual frontend exception

Visual frontend implementation is not considered safely unattended by default.
Human visual review remains a first-class gate.

For G4-UX and similar work, the accepted workflow is defined by:

`skills/xlink-r2-frontend-qa/SKILL.md`

That workflow requires R2/reference inspection, semantic classification,
matched-viewport rendering, screenshot comparison, self-iteration, and Product
Owner/Web ChatGPT review.

Automation may perform the local implementation/Design-QA loop, but final
visual acceptance should remain human-gated unless the Product Owner later
changes this policy.

## 11. Suitable candidates for an automation pilot

A first pilot should be deliberately low risk and have explicit acceptance
criteria. Suitable examples include:

- focused documentation governance;
- deterministic test additions;
- type/boundary fixes;
- small adapter normalization corrections backed by existing contracts;
- CI/build fixes with clear root cause;
- bounded refactors with unchanged behavior;
- implementation of an already accepted semantic contract where no new product
  decision is required.

A pilot should not begin with production mutations, business-ambiguous workflow
logic, or visual product acceptance.

## 12. Relationship to current project governance

This engineering loop does not replace existing governance.

- Issue #1 remains Program Control.
- Current Gate/Slice Issues remain the execution and evidence ledger.
- `AGENTS.md` remains the persistent repository safety/engineering rule set.
- `skills/xlink-r2-frontend-qa/SKILL.md` remains the frontend visual QA
  workflow.
- Accepted architecture and semantic contracts remain authoritative.
- `main` remains stable; material work continues on explicit branches.

The loop is an operating model layered on top of these controls, not a new
source of business truth.

## 13. Adoption plan

Current state:

- human-in-the-loop collaboration: **ACTIVE**;
- GitHub Issue evidence/review protocol: **ACTIVE**;
- local frontend Design-QA loop: **ACTIVE for G4-UX**;
- unattended Web ChatGPT <-> Local Codex scheduled loop: **NOT ENABLED**.

Recommended future sequence:

1. keep using the current human-reviewed loop;
2. select one low-risk non-visual Slice as an automation pilot;
3. define machine-readable Issue state/claim conventions;
4. add bounded retry and HEAD-integrity controls;
5. run the pilot under observation;
6. evaluate correctness, recovery behavior, duplicate-execution prevention,
   audit quality, and escalation behavior;
7. expand scope only after the pilot is accepted.

The goal is progressive automation with durable control, not maximum autonomy
as an end in itself.
