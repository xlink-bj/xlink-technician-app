# C3 / C4 / G3 — Architecture Ownership and Engineering Closure

> **Scope:** Incremental engineering refactor on top of `main@ab1d39c0a9f153d3310f01b70be784893b67c41e`, reviewed 2026-10-30. Merge and exact-HEAD CI evidence are recorded in the implementing PR; this page is not a deployment, device-acceptance or business-write authorization.
>
> **Authorities:** [Target Architecture](../architecture/TARGET_ARCHITECTURE.md), [Code Organization](CODE_ORGANIZATION_STANDARD.md), [Quality Gates](QUALITY_AND_ENVIRONMENT_GATES.md), [CI Fast Lane](CI_FAST_LANE_GOVERNANCE_20261030.md), and [AGENTS.md](../../AGENTS.md).

## 1. C3 — Action Workspace final bounded extraction

Prior merged cuts: A routes/read projections (#245), B mutation checkpoints (#247), C1 queue recovery (#248), C2 media dispatch (#249), D1 eligibility (#250), D2 quotation Order-edit authority preflight (#251).

The final D3 cut puts the **read-only mutation-receipt recovery** behind `action-workspace-form-recovery.ts`. The coordinator:

- Reads a scoped, durable receipt, never dispatches or retries a business write.
- Blocks ambiguous/non-`form_saved` states and mismatched saved FormData IDs; rereads only the exact saved identity.
- Checks the session/request lease after every asynchronous read and returns `stale` rather than mounting an old form.
- Leaves user-facing lifecycle/error state, original Work Order detail retention, draft restore, media restore, quotation submission, commands and public Store facade in `action-workspace.ts`.

The Store remains a large workflow **orchestrator by design**, not an accidental generic mapping layer. Further movement of submission/repair paths is explicitly **not** authorized merely to decrease line count. C3 acceptance is behavioural preservation plus clear owner boundaries, not a fixed LOC target.

## 2. C4 — R1 Adapter mapping ownership

Before: `src/adapters/api/technician-api.ts` combined ~2,096 lines of normalized data mapping, role-scoped read transport and authorization-sensitive request orchestration.

After this change, the existing **public `technician-api.ts` adapter remains the sole transport entry point** (~933 lines). Pure R1 normalization is split into:

| Module | Explicit owner |
| --- | --- |
| `read-models/ids.ts` | Opaque R1 IDs and required/optional identity extraction |
| `read-models/work-order.ts` | Work Order list/detail projections, service-part and contact rendering, nested Workflow run consistency |
| `read-models/work-order-activity.ts` | Historical activity display mapping (not command authorization) |
| `read-models/workflow.ts` | Workflow definition/node identities, handlers, visibility evidence and child-node normalization |
| `read-models/form.ts` | FormDefinition fields, visibility, FormData saved-record identities and values |
| `read-models/code-options.ts` | Code, dynamic and cascade option mapping |

R1 URL, method, request body/query, pagination, role-scoped ID allowlist, Production read-only, child Workflow authorization and error translation stay in `TechnicianApiReadAdapter`. No backend or Mock wire fixture was changed. The existing Mock transport uses the same semantic Adapter/Port path.

**Contract matrix (automated evidence):**

| Read domain | Success | Fail-closed / stale |
| --- | --- | --- |
| Work Order | List/detail, nested workflow, masked Production contacts | Conflicting IDs, parent/run mismatch, role-scope change |
| Workflow | Definition, child nodes, repeat forms | Duplicate node identity, foreign run, missing parent authority |
| Form | Definition and FormData identity, field metadata, values | Contradictory saved aliases, foreign definition, ambiguous data/field |
| Code/Activity | Dynamic/cascade codes, display activities | Malformed option envelope, unknown activity type |
| Action form recovery | No receipt or exact saved readback | Ambiguous receipt, mismatched saved ID, session switch during read |

Baseline suites remain authoritative; new direct suites: `tests/engineering/c3d3-action-form-recovery.test.ts` and `tests/engineering/c4-read-model-boundaries.test.ts`. The regression paths still go through `TechnicianApiReadAdapter` and the real Action Workspace Store.

## 3. G3 — CI and governance disposition

- PR L1: measured 42-second CI-only Fast Lane pilot in #252; **this is not yet an observed p95 for real code changes**.
- `main` L3: full Validate verify + MP-WEIXIN/APP frontend builds on every push; H5 main App real-browser gate nightly/manual (normal main-push H5 `skipped` is expected, not PASS).
- Risk exceptions: authorization, quotation pricing/write/readback, R1 API wire, signing and major Workflow changes must run appropriate exact-head full H5/visual/safety checks **before merge**. An explicitly marked `[L3-H5]` PR title activates the two full Main H5 browser jobs on that PR without changing ordinary PR latency. This refactor touches R1 read mapping and form recovery, so it is high-risk for test selection even though it creates no new write capability.
- Observe the first real-code PR sample, then two more (UI and quotation safety), and the next scheduled H5 run before closing CI observation #253. Record p50/p95 only after samples exist.
- [C1 native APP release absence check #240](https://github.com/xlink-bj/xlink-technician-app/issues/240) remains **NOT_RUN / Mac-HBuilderX dependent**. Compilation is not native device/package acceptance.
- Do not delete the 47-workflow historical inventory based on workflow count. Consolidation requires observed trigger, required-check and coverage equivalence; any further CI edits need a separate risk-reviewed PR.

## 4. Non-goals and rollback

No commercial Vue templates/CSS/Golden edits, no schema change, no Production/Beta business write or upload, no deployment, no direct main force-push, and no change to R1 business contract.

One implementing PR includes the bounded C3 service, C4 pure mapper modules, direct tests and G3 documentation. Reverting that squash merge restores the previous import/ownership layout without needing data migration or backend rollback. Native device acceptance and future business-write Beta remain separate explicit Owner gates.
