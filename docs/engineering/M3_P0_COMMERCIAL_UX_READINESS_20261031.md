# M3-P0 — Business & UX Readiness / First Vertical Slice

> **Status:** M3-P0-A implementation candidate; **not a full M3 exit** or Owner visual sign-off.
> **Base:** `main@789c4c58bcf37aba844a7a43a96c81fcd0030538` (M2-B merged).
> **Scope:** Survey media affordance ↔ Runtime permission consistency; retain the accepted Work Order, Appointment and Q01 visual baselines. No R1 wire, pricing, Production/Beta command or real-data changes.

## The actionable defect

The generic Dynamic Action media renderer used a FormDef row's raw `field.readOnly` to decide whether to draw its add/retry tiles. R1 Workflow instances can independently make a field readonly through `workflowReadOnlyFieldIds`. The authoritative `dynamicActionFieldsFor` / `isWorkflowFieldReadOnly` Runtime projection and `ActionWorkspace.canPickDynamicMedia` correctly reject such a media selection, but the old view could still show a live-looking upload control. A user would only discover that refusal after tapping.

The renderer now checks **the same effective Store capability** for both add and recovery actions; temporary in-flight media operations also suppress competing active pickers. Existing media thumbnails and the readonly status message remain visible. A second guard in `retryDynamicMedia` prevents any caller from using a resumable queue record to bypass current Workflow field restrictions. Normal writable Survey photos, confirmed uploads, and retry semantics are otherwise unchanged.

## Evidence, with explicit boundaries

| Check | Result and meaning |
| --- | --- |
| Workflow-only readonly with editable FormDef metadata | `tests/engineering/eq07-command-state-consistency.test.ts`: effective readOnly=true; add capability=false; choose/retry reject before picker/upload |
| Existing commercial Q03 browser path | `tests/h5-main-mock/q03-commercial-baseline.spec.ts`: source-shaped catalog, 375×667 and navigation/optical centering PASS; no Q03 code modified |
| Owner's new single-device visual viewport | `tests/s2-ux-review/m3-survey-media-430.spec.ts`: **actual uni-app main App**, synthetic MOCK-019, 430×932, clean request/console audit, media add affordances for writable fields PASS; Playwright screenshot attached to report |
| Engineering gate | `CI=true VITE_XLINK_ENVIRONMENT=test pnpm verify:full`: 172 suites / 1,539 tests; module-dependency, ownership, UI governance and source guards PASS |
| Native/WeChat/browser build | Must separately pass H5, MP-WEIXIN and App compilation; builds alone are not physical-device acceptance |
| Production safety | No Production/Beta HTTP operation in these tests; Production business writes remain fail-closed |

### Visual test environment

Chromium 153.0.8010.12 (Playwright v1.63.0 / browser v1243) can be installed from the official Google Chrome for Testing mirror if the default Playwright CDN serves invalid archives. This Linux container also requires a Chinese font (Google Noto Sans CJK SC was used locally) before **any** screenshot can count as a Chinese UI visual check. Set `CI=true` for uni-app dev runs to skip its version-update network probe, which invokes unsupported network-interface detection in this container. Browser availability and Chinese glyph rendering are environment prerequisites, not product-code edits.

The historical detached `g4e-survey` HTML proxy failed to load its fixture **before this change**. It is not the commercial main App and is not substituted for the main App gate. Its fixture repair may be triaged separately; the active M3 verification uses the actual uni-app H5 main shell.

## Remaining M3-P0 track (not claimed complete)

1. **Survey S01–S03:** Product Owner review of real main-App screens and native/WeChat check; add failure/readonly screenshot scenarios only where backed by R1-shaped source semantics. No invisible debug copy in commercial UI.
2. **Quotation Q02/Q03:** Audit grouped detail, catalog, SKU/package transitions and return-state against signed Q01; repair proven interaction/visual defects while retaining price calculation and type=1 Order anti-forgery gates.
3. **Signing C01:** Validate selected real **formal** Order readonly summaries, loading/empty/error and contract unavailability. No synthetic contract granted in Production; no signing, PDF, SMS or write action without separate R1/Beta authorization.

**Exit requirements:** pinned exact HEAD, all safety/build gates, human visual acceptance on the fixed Owner viewport, and explicit distinction between (A) R1-shaped writable Mock, (B) bounded Production read-only and (C) real Beta writes on independently authorized environment. M3-P0-A passing cannot authorize (C).
