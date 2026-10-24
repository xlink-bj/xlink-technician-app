# New App: engineering path when no writable Beta exists

Date: 2026-10-24. Owner: ChatGPT Lead. Status: **engineering continues; live R1 write acceptance remains HOLD**.

## Decision

An isolated writable Beta is **not a prerequisite for building and testing** the New App's functional code. It **is** a prerequisite (or must be replaced by an equivalently isolated, explicitly authorized R1-backed test instance) for proving real write semantics and declaring Stage 1 integration PASS. No Production business write is authorized. Do not rename synthetic tests into "Production verified" or "Beta verified".

Keep two independent gates:

- **Engineering candidate / OFFLINE_FUNCTIONAL:** R1-source-backed request encoders, screen-to-command path, local state change and server-shaped readback, permissions, restart/replay, error UX, H5/MP CI and visual/device Mock tests.
- **R1 live-integrated / WRITE_VERIFIED:** A specific authorized actor/work order/node in an isolated R1-backed data store; exact command, reply, side effects, reload/readback, rollback/reconciliation and device run. This gate cannot be inferred from the former.

## Owner-approved A / B / C execution lanes (2026-10-24)

| Lane | Required exit | Current independently established result |
| --- | --- | --- |
| **A — full protocol-equivalent Mock** | Main-App UI can save/edit, read back and advance each authorized synthetic action with R1-shaped command/status/failure semantics; appointment, survey, dynamic forms, Workflow, quotation/SKU/Order/Contract all accounted for | **IN PROGRESS — not full A.** 019 appointment/survey uses the actual Main App pages and scoped FormData/Process/readback. **A-P0 forms/repeat:** 020/021 Main App detail pages now provide create/edit/delete/finalize through the real Stage 1 transaction coordinator and exact R1-shaped Mock gateway, persistent state, fresh readback and durable replay fence. **A-P0 priced quotation:** 019 Main App quotation workbench now has an isolated, double-confirmed synthetic Order action using the real engine/encoder, Workflow Start → type=1 Upsert → queryById/readback, with strictly Mock-only transport, authenticated actor/role checks and durable duplicate protection. Synthetic, positively priced ordinary materials and procedures make the complete eligible quote path runnable; missing **SKU effective price** remains visibly blocked and is not replaced with zero or a guessed price. The ordinary App business submit remains disabled. Contract/PDF/signature/SMS are not executed. Device/browser visual acceptance and other remaining A items are open; no Production/Beta writes or live R1 parity proof. See `tests/engineering/a-stage-main-app-special-controller.test.ts`, `tests/engineering/a-stage-main-app-quote-order.test.ts`, and the existing protocol suites. |
| **B — Production read-only** | Current role-authorized App pages use official bounded API reads; Production database used only to reconcile semantics and redacted inconsistencies; no business commands/uploads | **PARTIAL, existing read evidence.** #199 and the three-pillar contract matrix verify bounded WorkOrder/Workflow/FormData/Order/Contract shapes, plus explicitly distinct Order query semantics. No new Production network request is required to repeat that historical evidence. Full live App/WeChat read-path UX acceptance remains open; default allowlists must not expand by inference. |
| **C — isolated Beta/test writes** | Owner-approved R1-backed disposable scope, audited FormData/EXTS/Workflow and later commercial actions, server ACK plus fresh authoritative readback and cleanup | **HOLD — no approved writable R1-backed fixture.** Offline stateful shadow and scoped staging gateway exist but remain outside the default App. Production business writes are categorically forbidden. |

These lanes are sequential evidence grades, not three switches that can be enabled at once. A Mock response that passes an adapter is never proof of R1 server persistence, and a read-only Production result never grants a Beta write or a new Production read route.

The implementation should advance through the first gate immediately. A missing Beta affects the **second** gate only; do not let it create artificial blockers for source mapping, offline functionality, regression or UI/UX review preparation.

## Available evidence, ordered by strength

| Evidence | What it can prove | What it cannot prove |
|---|---|---|
| R1 source code / already audited endpoint contracts | Exact request construction, client intent and branching | Server-specific side effects, permissions or runtime data quirks |
| Owner-scoped Production **read-only** samples (existing #199 evidence) | Observed data shape, runtime IDs, current field applicability and lifecycle | Any write result or unobserved node/button behavior |
| Stateful, test-only R1 shadow protocol | That the New App sends correct request sequences, updates a changing synthetic state, reads back, and fences uncertain retries | That a real R1 server commits the same state or has the same atomicity |
| Real WeChat/H5 **Mock** device journey | Pages, navigation, accessible controls, feedback and platform rendering | Server-side FormData/Workflow/Order/Contract persistence |
| Explicitly authorized isolated R1-backed write + readback | Actual end-to-end command and persistence semantics | Any other actor, work order, node or operation beyond the granted scope |

## Concrete implementation sequence, without Beta

1. **Protocol and evidence freeze.** Keep real endpoint/identity/field evidence in source-backed contracts, not guessed normalized names. For Production reads, use only already approved role-listed work-order and exact IDs, minimum response fields, no unrestricted enumeration. Retain schema fingerprints and sanitized discrepancy descriptions; do not commit customer fields, credentials or raw response payloads.
2. **Stateful shadow closure.** Drive the *real* Stage 1 command encoder, scoped gateway, receipt and authoritative R1 readback parser against a disposable in-memory protocol double. Simulate backend state changes, stale reads, wrong identity, lost ACK after commit, denial and partial completion. Reject unknown R1 operations; the double is not a replacement backend or a hidden production write switch. Test: `tests/engineering/r1-stage1-no-beta-shadow.test.ts`.
3. **Main App Mock golden path.** Continue the real App H5 and WeChat developer-tool journeys from login/list/detail through appointment/survey/quotation/Order/SKU/Contract. Show `Mock · 未提交后台` prominently. For unsupported button/sign/PDF/business command, show a safe disabled/unknown state with an explanation, never a pretend confirmation or signature. Existing test: `tests/h5-main-mock/mock-business-closure.spec.ts`.
4. **Parity matrix and errors.** Track each real workflow action as `SOURCE_MAPPED → OFFLINE_FUNCTIONAL → READ_VERIFIED → WRITE_VERIFIED → DEVICE_VERIFIED`; maintain separate flags for backend contract, platform rendering and permission. Record actual R1 discrepancies (#199) rather than making `clearOrderFieldQuery` and `basic/order/query` equivalent, or guessing a child form as `repeat`.
5. **R1-backed closeout when an environment exists.** Smallest possible isolated copy/service with synthetic records and a disposable test role is acceptable; it need not be a long-lived shared Beta. Require separate written Owner authorization for exact host, actor/role, work order, runtime node, permitted command list, retention, observation and rollback. Run **one** audited command chain, validate its authoritative readback, then expand only if it passes. Never substitute Production write access as a shortcut.

## Fail-closed invariants for offline acceptance

- Forms: save must preserve full EXTS and full prior FormData identities, then read back both the exact FormData and work-order/node EXTS; unknown fields are not discarded.
- Repeat: no accidental single-form fallback, no invented node type; a batch carries unique R1 FormData IDs and exact workflow run.
- Workflow: each write step rechecks actor, role, role-listed work order, node source and lifecycle; unknown/cancelled/invisible nodes are inert.
- Network: a command may have been applied even if the ACK is lost. Preserve the durable receipt and prevent automatic replay until authoritative evidence or manual reconciliation.
- Commercial: quote/Order/SKU/Contract display may use source-backed read models, but order modifications, signing, PDF and media side effects remain unavailable without confirmed contracts and command authorization.
- Environment: even a developer flag must never activate R1 writes in Production. Default App composition stays unmounted from the isolated pilot executor.

## A closeout remaining scope (current branch)

| Gate | 019 DEV Mock slice | Required before **A PASS** |
| --- | --- | --- |
| Appointment / Survey | Source-shaped save → exact FormData query → Process → exact detail readback; actor scope guard, reload recovery and replay rejection tested | Re-run real H5/MP device path; validate required fields and R1 option/visibility branch behavior end-to-end |
| Other dynamic/repeat/EXTS | **A-P0 Mock path implemented.** Source 020/021 exact gateway and coordinator are connected to detail-page record list + editor + deletion/finalize confirmations. Full EXTS, readback, local durable receipts and role switching guards are covered by new Main App controller tests. | H5 viewport/MP DevTools gesture-level acceptance and permission/error copy; baseline read-only records cannot be removed through this synthetic UI; Production-only quirks not inferred |
| Quotation / SKU / Official Order | **A-P0 priced non-SKU Mock path implemented.** 019 workbench offers a separately gated synthetic create command; prices come only from Mock catalog's mapped R1 fields; real quote engine/order encoder/command and read adapters, persisted child Workflow and Order, queryById reconciliation, restart/idempotency guard. Generic product-review submit remains disabled; unverified SKU effective price is blocked. | H5/MP gesture-level acceptance; add verified SKU effective-price calculation only when the source contract is evidenced; no inference of PDF/contract/signature side effects |
| Contract / signing | Bounded synthetic official Order/Contract read review | Closed Mock state transitions only for R1-mapped and legally safe actions; unsupported signature/PDF/SMS stay explicitly disabled |
| Cross-platform visual | Prior H5 019 golden evidence exists; current branch unit tests and H5/MP build can run | H5 browser screenshots and interactive checks at both viewports, WeChat DevTools device run and Owner UX sign-off independently recorded |

The main 019 DEV Mock path uses protocol-shaped **synthetic** writes; it is deliberately
not the server's authoritative R1 Workflow. This upgrades the old local-only
stage handoff but does not lift any real write gate or authorize `main` merge.

**2026-10-24 A-P1 evidence update:** the 020/021 forms and 019 quotation UIs now expose
fail-closed pending-receipt/readback guidance, confirmed local-receipt recovery
without command replay, and clearer synthetic Order labeling. The cross-page
operation → command → Mock persistence → readback → regression trace and the
two-viewport H5 CI screenshot gate are enumerated in
`docs/engineering/A_STAGE_P1_ACCEPTANCE_EVIDENCE.md`. Local full verification
and H5/MP-WEIXIN/App builds passed; real Chromium H5 CI and Mac WeChat DevTools
gesture-level review remain independent gates, as do Owner visual acceptance
and all live R1 write verification.

## Acceptance labels and next external input

Do not declare Stage 1 PASS because all offline gates turn green. The most accurate interim label is **`OFFLINE_FUNCTIONAL / LIVE_WRITE_UNVERIFIED`**. It allows engineering to move ahead, and makes the final risk explicit.

When an R1-backed test instance becomes possible, ask the environment owner for only:

1. Exact isolated HTTPS base URL and proof it cannot target Production data;
2. Disposable technician/role identity and role-listed test WorkOrder + action-node IDs;
3. Narrow allowlist of FormData/EXTS/Workflow actions to execute;
4. Observability, cleanup, rollback and post-command readback procedure.

If none of these exists, continue the offline work. Explicitly keep E2–E5 live write acceptance, Stage 1 PASS and release approval blocked; do not invent a completion date for the live-integrated gate.

## Verification without Beta

```
VITE_XLINK_ENVIRONMENT=test pnpm exec vitest run tests/engineering/r1-stage1-no-beta-shadow.test.ts
VITE_XLINK_ENVIRONMENT=test pnpm exec vitest run tests/engineering/a-stage-main-app-special-controller.test.ts tests/engineering/a-stage-main-app-quote-order.test.ts
VITE_XLINK_ENVIRONMENT=test pnpm run test
pnpm run typecheck
pnpm run check:boundaries
CI=1 pnpm run build:h5
CI=1 pnpm run build:mp-weixin
```

The stateful shadow test performs zero network requests and zero filesystem/business writes other than test runner files. It is not a live pilot and cannot resolve the unresolved real `button` ExtField behavior or Order list divergence.
