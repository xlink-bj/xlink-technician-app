# EQ-02 — Action Workspace Pure Draft Utilities + Quotation Presentation Ownership

**Parent:** [EQ-01 #169](https://github.com/xlink-bj/xlink-technician-app/pull/169), approved engineering HEAD `f0008682fa5142e16d567c25df7864b5840b0185`; prior read-only full CI `39141285478` **SUCCESS**. **Draft / NO MERGE / NO LIVE BUSINESS ACTION.**

## What is changed

**QuotationActionContent.vue:** copied the existing unscoped `<style>` block verbatim into a colocated `QuotationActionContent.styles.css` and replaced it with `<style src="./QuotationActionContent.styles.css"></style>`. The **entire template and TypeScript script remain byte-identical**. The Vue SFC compiles the external style in place; no selector names, token values, cascade semantics or style scope are intentionally altered. Previous SFC ~2,973 lines → ~1,680; ~1,290 CSS lines are now independently owned. This is a **maintainability split**, not a UI redesign.

**Action Workspace:** move five pure helpers (`appointmentValue`, `draftRecordFor`, `dynamicDraftRecordFor`, `mediaTaskMatchesDynamicForm`, `formValueContainsUploadedRef`) plus their private normalization helpers to `action-workspace-draft-utils.ts`, leaving **side effects and Pinia store ownership** in `action-workspace.ts`. Existing function bodies are unchanged. Previously ~2,187 lines → ~2,027; the remaining large store is **recognized pending engineering debt**, not claimed as solved. New direct unit tests check valid appointment and dynamic drafts, incompatible WorkOrder identity, corrupt/unknown fields and server-read-only protection.

## Required tests

- `pnpm verify`: checks boundary, source-ownership rules, typecheck and full Vitest.
- Focused direct pure-helper plus existing `tests/g4d/action-workspace.test.ts`, draft persistence, domain and media queue regression.
- Actual H5 Gallery and WorkOrder List/Detail/Q01 **pixel-equivalent approved Goldens**, 320/375/390; fail on any CSS cascade/layout drift.
- Actual H5 main-App Mock + signing fail-closed flows; external network attempts forbidden.
- H5/MP-Weixin/App builds, no test-only env in output.
- Exactly **7** changed paths: two existing SFC/store files, new CSS, new utility, new direct behavior test, this document and workflow.

## Non-goals

- Not a claim that any business R1 Order/SKU/contract is verified.
- Not a complete Action Workspace refactor or fully separated quotation business coordinators; those require an independent EQ-03 after green EQ-02.
- No changes to order pricing, data models, API requests, role/tenant checks, media upload tasks or persisted draft schema. No Golden updates allowed.
- No permission to merge main, run Production operations or promote a deployment.

## Engineering gates

**Accept only if original visual 3+9 and business integration pass unchanged**, together with pure-helper and full tests. If missing style asset changes the pixel baseline, keep HOLD and fix compilation rather than update Golden. If static string test points to moved code, retarget it to the new owner while keeping its assertion.
