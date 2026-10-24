# New App: engineering path when no writable Beta exists

Date: 2026-10-24. Owner: ChatGPT Lead. Status: **engineering continues; live R1 write acceptance remains HOLD**.

## Decision

An isolated writable Beta is **not a prerequisite for building and testing** the New App's functional code. It **is** a prerequisite (or must be replaced by an equivalently isolated, explicitly authorized R1-backed test instance) for proving real write semantics and declaring Stage 1 integration PASS. No Production business write is authorized. Do not rename synthetic tests into "Production verified" or "Beta verified".

Keep two independent gates:

- **Engineering candidate / OFFLINE_FUNCTIONAL:** R1-source-backed request encoders, screen-to-command path, local state change and server-shaped readback, permissions, restart/replay, error UX, H5/MP CI and visual/device Mock tests.
- **R1 live-integrated / WRITE_VERIFIED:** A specific authorized actor/work order/node in an isolated R1-backed data store; exact command, reply, side effects, reload/readback, rollback/reconciliation and device run. This gate cannot be inferred from the former.

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
VITE_XLINK_ENVIRONMENT=test pnpm run test
pnpm run typecheck
pnpm run check:boundaries
CI=1 pnpm run build:h5
CI=1 pnpm run build:mp-weixin
```

The stateful shadow test performs zero network requests and zero filesystem/business writes other than test runner files. It is not a live pilot and cannot resolve the unresolved real `button` ExtField behavior or Order list divergence.
