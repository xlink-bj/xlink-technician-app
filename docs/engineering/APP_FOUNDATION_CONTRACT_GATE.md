# App Foundation Contract Gate — R1 Technician integration

Status: **engineering review candidate; not Production-verified or release-ready**.
Scope baseline: Stage 1 `9f02d6fc` (Draft PR #205). This gate hardens its read boundaries without merging Stage 1, changing R1/backend contracts, or authorizing business writes. The independent Fast Loop Mock baseline (#211) is a separate Draft change, not an implicit dependency installed by this branch.

## 1. Boundary map: where each kind of truth lives

| Boundary | Owner/source in this repo | Required invariant | Evidence lane |
| --- | --- | --- | --- |
| Session, user, current role and roleVersion | `src/shared/state/session.ts`, `src/app/composition.ts` | No cross-identity store/cache reuse; Production role scope includes sessionRef, userId, roleId, roleVersion | `tests/g4f/m1-i7-work-order-read-scope.test.ts` |
| Work Order list and detail | `src/adapters/api/technician-api.ts` → `src/features/work-orders/list.ts`, `detail.ts` | List IDs are authoritative; returned detail identity must match requested and previously role-listed ID; no stale role result | `tests/g4c/work-order-detail.test.ts`, `tests/g4f/production-read-only.test.ts` |
| Workflow main/child nodes | `src/adapters/api/technician-api.ts`, `src/runtimes/workflow` | Keep source `nodeType`; child `Workflow.parentFlowNodeId` is **not** child `WorkflowNode.parentWorkflowNodeId`; never invent unsupported transitions | `tests/engineering/r1-stage1-live-read-contract.test.ts` |
| Form definition / saved FormData / repeat list | `src/adapters/api/technician-api.ts`, `src/features/work-orders/action-workspace.ts` | Definition from the queried URL where omitted; explicit contradictions fail; Production repeat list is bounded and role/detail-proven; no arbitrary saved record read | `tests/engineering/r1-stage1-live-read-contract.test.ts`, `tests/g4f/production-read-only.test.ts` |
| Quote catalog and official Order | `src/adapters/api/quotation-catalog-api.ts`, `quotation-order-api.ts`; `src/features/work-orders/quotation` | Catalog scope from persisted ServiceAppointment `serviceType` / `exts.sourceType`, not display labels; official Order ID and owner are checked before use; never synthesize SKU or price | `tests/g4f/quotation-order-read.test.ts`, quotation-specific suites |
| Browser/MP/native capabilities | `src/adapters/platform`, `src/adapters/api/uni-api-read-transport.ts`, command transport | H5 and MP are not interchangeable evidence; Production auth + readonly boundaries are separate from DEV synthetic Mock; blocked workflows stay blocked | `tests/h5-main-mock`, WeChat DevTools and physical-device review |

Source pinning and legitimate wire shapes remain in `docs/engineering/R1_STAGE1_FUNCTIONAL_CANDIDATE.md`, Issue #198 and Issue #199. When backend evidence conflicts with tests, record the exact sanitized response shape and ask for a contract decision; do **not** silently broaden parsers or relax Production transport allowlists.

## 2. New adapter-level invariants

These checks intentionally duplicate critical *consumer* checks at the API boundary, where future screens and stores can also benefit:

1. Reject a Work Order list row when both `id` and `_id` exist but disagree. Never publish a partially normalized page.
2. Reject a Work Order detail response whose explicit `id` / `_id` conflicts with the route/request ID. In Production require an explicit source Work Order identity; a fallback to the requested ID is **not** identity proof for child-read authorization.
3. If Production role scope is missing, do not issue a Work Order list request; if session/role scope changes during an in-flight list or detail read, return `authorization_denied` without data and without seeding downstream child/repeat read authority.
4. Reject official quotation `queryById` when any returned `id` / `_id` conflicts with the requested Order ID. Existing caller checks for Order `type` and `serviceAppointmentId` ownership remain mandatory.

All tests use synthetic identities and injected transports. These are **contract-safety** tests, not evidence that a specific real R1 tenant response is correct. Normal authenticated Production reads remain read-only; there is no new endpoint, data write, role switch, auth bypass, or Mock promotion.

## 3. Fast Loop gate for subsequent foundation changes

Run from repo root with dependencies from the checked-in lockfile:

```sh
pnpm run verify:quick
```

The `quick` gate runs architecture/boundary/critical-behavior checks, TypeScript, and targeted Vitest suites for Work Order identity, role-scope invalidation, source-mapped workflow/form reads, Production read restrictions and quotation data. GitHub `Validate / quick` runs these same targeted core suites on every Draft PR. Run `pnpm run test` and relevant H5/MP builds as wider regression; always report failures, and do not rewrite a red baseline as PASS.

For an individual change: identify its source/API evidence → write a synthetic failing boundary test → implement the narrowest adapter/store fix → rerun `verify:quick` → perform the relevant H5/MP or authorized readonly check → submit Draft PR with exact commit/check results. Never substitute H5 screenshot evidence for WeChat real-device UX approval.

For containerized builds affected by Node `os.networkInterfaces()` / `uv_interface_addresses` in DCloud's online version-check path, the installed Uni CLI's `checkUpdate` returns early when `CI=1`. Verified **locally in this container** with `CI=1 VITE_XLINK_ENVIRONMENT=test corepack pnpm run build:h5`, `build:mp-weixin` (including `verify-mp-app-bootstrap.mjs`), and `build:app`. This is a build-environment workaround, **not** an authentication bypass, a change to Production configuration, or proof of physical-device behavior. Keep Mac/WeChat real-device evidence separate.

## 4. Evidence and acceptance — keep the gates independent

| Gate | Meaning | Current conclusion |
| --- | --- | --- |
| `CODE_PASS` | Changed code meets local checks/CI on its exact SHA | Evaluate per Draft PR, not inherited from another PR |
| `SOURCE_MAPPED` | Behavior traced to pinned R1/frontend/backend source and known contract | Relevant Stage 1 flow shapes documented, not blanket coverage |
| `MOCK_FUNCTIONAL` | Deterministic synthetic interactions pass | #211 main H5 Mock suite passed independently; not real API proof |
| `REAL_READ_VERIFIED` | Authorized Production read returns expected sanitized record, with role and actual device/browser evidence | #199 main repeat list was observed in WeChat simulator for one saved record; scope is limited |
| `REAL_WRITE_VERIFIED` | Explicitly authorized backend business commands safely reconciled | **NOT VERIFIED**; writes remain forbidden here |
| `DEVICE_UX_VERIFIED` | Physical WeChat device pass for font, tap targets, long title, layout | **NOT VERIFIED**; Stage 1 remains FAIL |
| `RELEASE_READY` | Independent gates all accepted by Lead/Owner | **NO**; no merge or deployment authorization |

## 5. Next foundation review slices (independent, reversible)

1. **API schema parity**: one route at a time, compare source-mapped types and saved-list/detail behavior to *sanitized* authorized readonly responses; missing contradictions become fixtures, not guessing. Codex helps only for Mac/intranet/DevTools evidence the Lead cannot reach.
2. **Action Workspace seams**: inspect large orchestrator `src/features/work-orders/action-workspace.ts` by responsibilities (node eligibility → form/runtime → draft → command → receipt) and extract only where a new capability requires it; retain state/identity boundaries and action-area semantics. No speculative mass refactor.
3. **Cross-platform proof**: for contract-affecting slices run TypeScript/unit/H5 first, then build MP-WEIXIN and perform simulator or physical-device checks in the local Mac environment. Record UI-device findings separately; do not delay backend contract work for cosmetic polish.

Owner roles: **ChatGPT Lead** develops/reviews/tests and maintains Draft PRs; **local Codex** assists only with inaccessible Mac/WeChat DevTools/intranet data, and reports sanitized reproducible evidence. **Human Lead** decides Production access expansions, real writes, device UX acceptance, and merges/deploys.

## 6. Saved FormData identity gate (follow-on Draft)

R1 has **two different exact-saved-record read routes**; they must obey the same identity rule without changing either API:

| R1 read route | Legitimate source shape | Evidence needed to expose values |
| --- | --- | --- |
| Ordinary `forms` / `repeat`: `POST biz/extForm/query/{definitionId}` filtered by `_id` | Bounded list of saved FormData rows; definition may be omitted in the row | Exactly one returned record with the requested ID and no contradictory `id` / `_id` / `dataId` or definition aliases |
| Construction acceptance FormDefinition `3285058246984486156`: `GET biz/extForm/findByIdWithWorkflow` | One saved FormData object (R1-specific exception) | Returned ID must equal the requested `dataId`; the same alias and definition checks apply |

For both routes, contradictory top-level `workflowRunId` / `runId` / `workflowId` aliases are mapping failures. A single alias or omitted optional workflow ID retains its original meaning. These are **synthetic contract tests**, not evidence that a Production tenant was queried. `readDynamicForm` and its Action Workspace consumers keep their separate workflow, scope and write gates. The source route distinction is documented in `R1_STAGE1_FUNCTIONAL_CANDIDATE.md` and exercised in `tests/engineering/r1-stage1-form-detail-read-contract.test.ts` and `r1-stage1-live-read-contract.test.ts`, now included in Fast Loop and GitHub `quick`.
