# Engineering Closure C2 — Action Workspace Reactive Read Model Extraction

**Base:** Closure C1 Draft #191, exact `ac715c96c36af1fe6caa4fc7be1a6bf092358aa3`. **Scope:** a bounded, behavior-preserving refactor; no backend/Adapter/Workflow command changes, live reads/writes, Golden changes, price-rule changes, or merge.

## Actual change

Previous `src/features/work-orders/action-workspace.ts` mixed mutable state, asynchronous command ownership, and ~26 computed UI selectors. C2 extracts those selectors into `src/features/work-orders/action-workspace-read-model.ts`.

The new dependency-injected **read-only projection layer** owns:
- Appointment visit intent, conditional datetime applicability and field roles;
- Dynamic Form visibility, unsupported field and normalization readiness;
- Survey leakage-cause options, selected IDs, visibility/read-only state;
- Media in-flight/pending eligibility and complete-form `canSubmit`.

The existing Workspace retains the **only** business mutation lifecycle owner: FormData saveOnly, Workflow Complete, media queue, Order submission, role/session fences, navigation and draft finalization. The existing template/Pinia public fields are returned unchanged. An extracted state projection is **not** a new business command API or domain authorization source.

## Benefits and measurable scope

1. **Change isolation:** UI-facing selectors no longer need edits inside the high-risk asynchronous, side-effectful Workspace state machine.
2. **Unit-testability:** Direct reactive tests cover missing forms, changing appointment applicability, authoritative FormData gating and unsupported fields without setting up network/fake navigation or full Pinia.
3. **Fail-closed parity:** No submission is enabled merely by loading a form; dynamic submit still requires saved FormData ID, successful normalization, no pending media/unsupported fields, reconciliation and enabled workflow action.
4. **Controlled rather than cosmetic splitting:** no commercial UI/Vue template changes, no backend R1 command, no removal of valid Action APIs, no snapshot updates. This is a focused reduction; it does **not** claim to have eliminated all 2,000+ line module debt.

## Acceptance at a single commit

- New read model tests, P0 EQ07 race, EQ08 shared Form Runtime, R1 conditional Appointment, EQ09 actor scope and original Action Workspace tests all pass.
- Root `pnpm check:engineering-ownership`, critical and full tests, types, H5/MP-Weixin/App builds, original H5 six-stage Mock and both approved Gallery/Business Goldens all pass.
- Diff only in: `src/features/work-orders/action-workspace.ts`, `src/features/work-orders/action-workspace-read-model.ts`, `tests/engineering/closure-c2-read-model.test.ts`, this doc and one C2 CI workflow.
- No main merge, deployment, Production/Beta business writes, new SKU effective price calculations or unsafe appointment `need=0` encoding.

## Remaining explicit engineering debt

`action-workspace.ts` still owns substantial command orchestration and media upload lifecycle; it should **not** be split broadly without behavior-backed tests for each independent write state machine. C2 does not change FormData/Workflow ownership or server idempotency guarantees.

**Gate status:** Await exact-head CI and Lead review.
