# Stage A — P1 functional recovery, mobile UX and evidence matrix

Date: 2026-10-24. Branch/PR: Draft #217. Owner: ChatGPT Lead.

## Final exact-source acceptance update (2026-10-25)

This section supersedes the historical *status at authoring* rows and Mac
handoff instructions below. The engineering/Mock gate and the later commercial
visual gate are deliberately separate, as the Owner has directed Stage A
functional closure **before** the dedicated UX/UI phase.

- **Code baseline:** `d822bb77670df66b60368b2c3090a191dd063d53`, Draft
  [#217](https://github.com/xlink-bj/xlink-technician-app/pull/217). On this
  exact code, all four applicable CI lanes passed: [Validate](https://github.com/xlink-bj/xlink-technician-app/actions/runs/40191966481),
  [Main H5 UX](https://github.com/xlink-bj/xlink-technician-app/actions/runs/40191966540),
  [DS02A](https://github.com/xlink-bj/xlink-technician-app/actions/runs/40191966438),
  [M1 S2 Focus](https://github.com/xlink-bj/xlink-technician-app/actions/runs/40191966511).
- **Mac native:** [375×667 DEV Mock WeChat DevTools `MP_DEVICE_PASS`](https://github.com/xlink-bj/xlink-technician-app/pull/217#issuecomment-6398597783),
  subsequently [accepted by the Lead for this scoped simulator gate](https://github.com/xlink-bj/xlink-technician-app/pull/217#issuecomment-6398758924).
  MOCK-020/021 save/edit/delete/complete/relaunch and right-edge layout
  passed; the application-component WXSS selector warnings were absent.
  MOCK-019 ¥107 local Order was already verified in the preceding native run.
- **Viewport scope:** **375×667 is the only Stage A native acceptance size.**
  The previous 390×844 H5 evidence remains valid but another native device
  size, physical handset and compatibility sweeps are deliberately deferred.
- **Boundary:** A PASS here is *offline source-shaped Mock functionality*,
  never an assertion that arbitrary Production workflows, effective SKU prices,
  actual signing/PDF/SMS or R1 business writes were exercised. Owner commercial
  UX/UI review is the subsequent product phase, not a retroactive Stage A
  code/contract blocker. See `A_STAGE_ENGINEERING_EXIT.md` for the complete
  scenario and evidence ledger.

## The three A-P1 gates

1. **P1-R / Error and recovery:** duplicate tap, timeout or missing ACK, role switch, reload/re-entry, incomplete readback and corrupt local receipt must produce a clear operator state. Only *confirmed completed* receipts may be reconciled using fresh Mock reads. An ambiguous request is never automatically replayed or unlocked.
2. **P1-U / Mobile UX:** run the actual uni-app Main App (not an isolated component demo) at **375×667** and **390×844**, and test the compiled MP-WEIXIN app in WeChat DevTools on the Mac. Screenshots must show task context, CTA reachability, long-text wrapping, errors and the status after reload.
3. **P1-E / Evidence chain:** each operation must link a Main App tap to exact R1-shaped command, persisted Mock effect, independent readback and named tests. Missing SKU price, signing and Production/Beta write permission are **explicit blocked outcomes**, not gaps to fill with invented behavior.

The user-facing Mock warning must remain subordinate to the primary on-site technician task but unambiguous (`未提交后台`). Approved Login/WorkOrder/Appointment visuals are preserved. Neither H5 build nor screenshots grant commercial UX acceptance.

## R1-shaped operation → readback → test traceability

The following are **synthetic** work orders, never Production identities. The source contracts are shared with the real adapters, but Mock persistence is not proof of R1 server behavior.

| ID / real App action | Exact command transport boundary | Persisted Mock state + independent readback | Automated evidence |
| --- | --- | --- | --- |
| **019-A** Appointment submit | `biz/extForm/upsert/...` scoped appointment FormData → `workflow/process` | 019 persisted Appointment FormData, stage changes to Survey only after saved ID and Detail re-read | `tests/g4ux/mock-journey-closure.test.ts`; `tests/h5-main-mock/mock-business-closure.spec.ts` |
| **019-S** Survey completion | source Survey FormData upsert → `workflow/process` | 019 Survey FormData and stage Quotation, earlier Appointment values still scope-bound | same suites; `tests/h5-main-mock/m1-i7-six-stage-integration.spec.ts` |
| **020-C/E** Forms add/edit | `biz/extForm/upsert/mock-form-definition-inspection` → `workflowNode/updateExts/mock-workflow-node-020-forms` | Complete `formList` EXTS plus exact FormData `query`, summary-only edits preserve title and unrelated EXTS fields | `tests/engineering/a-stage-main-app-special-controller.test.ts`; `tests/engineering/a-mock-special-forms-repeat-protocol.test.ts`; P1 H5 `020 forms` |
| **020-D/F** Forms soft delete/finalize | `workflowNode/updateExts/...` → FormData soft-delete, or `workflow/process` after saved IDs | EXTS marks row `-1`, FormData soft-deleted; finalize re-reads source node `state=10` | same suites; P1 H5 `020 forms` |
| **021-C/E/D/F** Repeat add/edit/remove/finalize | `biz/extForm/upsert/mock-form-definition-inspection`, `biz/extForm/remove/mock-form-definition-inspection`, `workflow/process` with comma-joined server IDs | Scoped `biz/extForm/query/...` by workflow run, persisted remaining IDs, source node state 10 | special-controller/protocol suites; P1 H5 `021 repeat` |
| **019-Q** Priced ordinary Material + procedure | real quotation validation/hydration/pricing/encoder → `workflow/startWorkflow/order/null/mock-workflow-definition-019-order` → `basic/order/upsert` type=1 | Synthetic child Workflow + Official Order, `basic/order/queryById` with exact id; restart receipt prevents duplicate | `tests/engineering/a-stage-main-app-quote-order.test.ts`; `tests/g4f/mock-journey-order-protocol.test.ts`; P1 H5 `019 priced quotation` |
| **019-SKU?** SKU without authorized effective price | no Order command; local draft only | blocked engine, no payload, no synthetic or real Order | quote-order controller tests; `tests/g4f/quotation-engine.test.ts` |
| **019-C** Contract/sign/PDF/SMS | **no command authorized** | isolated signing read/contract review only; never claim an actual signed contract | `tests/h5-main-mock/mock-business-closure.spec.ts`; signing boundary tests |

## Failure/recovery acceptance

| Fault or event | Expected operator UI and state | Technical fence / evidence |
| --- | --- | --- |
| Double tap while saving | Second tap blocked, one persisted FormData or Order | controller-level `inFlight`; special P1 concurrency regression |
| ACK lost **after** FormData mutation | Pending warning; save/finalize blocked across controller restart; do **not** clear or re-send | durable `may_have_dispatched`; special P1 lost-ACK regression |
| Confirmed completed mutation, but local receipt removal fails | Operator can re-enter original text and press **只读核对并恢复**; only if fresh FormData + EXTS/list exactly matches is the **local receipt** cleared | special P1 completed-receipt recovery regression; no command dispatch in recovery |
| ACK lost **after** Order Upsert | UI offers **只读核对订单记录**; matching synthetic ID/owner/workflow/prices shown, but replay lock retained even after page reload | quote P1 lost-ACK regression checks one persisted Order |
| Missing / conflicting Order readback | Present `未确认`/`不一致`, keep lock; absence of data is **not** proof a write did not occur | `verifyPending()` checks exact read and amount |
| Account/role changes in-flight | No cross-role readback, retry, or receipt clearing | actor identity/version revalidation per step; negative role tests |
| Corrupt or unreadable receipt | Fail closed; no creation CTA | quote-corrupt-receipt test, R1 transaction receipt validator |
| SKU price not authorized | No `type=1` payload or Order command, clear pricing block | quote controller + engine tests |

## Screenshot and platform evidence slots

`tests/h5-main-mock/a-stage-p1-acceptance.spec.ts` uses the **real** Main App, no external network, fixture IDs 019/020/021 and the two mobile sizes. Each result attaches named Chromium screenshots to the separate `Validate Main H5 UX` Draft PR artifact `draft-a-stage-p1-h5-<run_id>`; the prior Mock closure artifact remains independently preserved:

- `a-p1-forms-saved-375/390`, `a-p1-forms-complete-375/390`;
- `a-p1-repeat-complete-375/390`;
- `a-p1-quotation-ready-375/390`, `a-p1-order-readback-375/390`.

The 020/021 rows are enabled **only** in this separate CI step with `VITE_XLINK_R1_MP_UX_FIXTURES=true`; other screenshot suites retain the approved 12-row baseline. The CI step must actually succeed on the final exact HEAD before marking `H5_INTERACTIVE_PASS`. The screenshots are code/test evidence, **not** an R2 comparative visual acceptance.

| Gate | Acceptance | Status at authoring |
| --- | --- | --- |
| Offline controller and fault regression | All scoped P1 tests pass, no Production requests/writes | `PASS` — 11 focused / 1,453 full Vitest tests and `pnpm run verify`, 2026-10-24 |
| H5 375×667 / 390×844 | New Main App click journeys and PNGs in GitHub Actions | `PENDING_CI` (local Chromium unavailable) |
| H5 / MP-WEIXIN / App compilation | `pnpm run build:h5`, `build:mp-weixin` including bootstrap check, and `build:app` | `BUILD_PASS` — three local builds, 2026-10-24; native simulator not yet inspected |
| WeChat DevTools simulator and hand operations | 020/021 and 019 Mock pages operated on a Mac with screenshots and network inspection | `NEEDS_MAC_DEVTOOLS` — **not silently PASS** |
| Commercial visual acceptance | Owner approves matched viewports, page hierarchy, touch targets and error states | `WAITING_FOR_OWNER` |
| Production / isolated Beta write parity | Separate authorized R1 instance and independent server readback | `HOLD`, no business write authorization |

## Mac / WeChat DevTools handoff (Codex-only environment work)

1. Use the exact reviewed PR HEAD; keep `VITE_XLINK_ENVIRONMENT=dev`, `VITE_XLINK_MOCK=true`, `VITE_XLINK_H5_MOCK_E2E=true`, `VITE_XLINK_R1_MP_UX_FIXTURES=true`, and `VITE_XLINK_ENABLE_REAL_WRITES=false`. Never use Production credentials for this step.
2. Import the new project's MP output into WeChat DevTools. Check the built package is registered correctly and inspect the Network panel for **zero** external business requests.
3. In 375×667 and 390×844-equivalent simulator sizes, navigate from the real Home/List to `MOCK-020` and `MOCK-021`; save/edit/delete/finalize, reload and confirm the status. For `MOCK-019`, traverse Appointment → Survey → priced ordinary quotation → separate Mock order confirmation and readback. Check that a SKU without price and all real signing/contract commands stay disabled.
4. Capture synthetic-only screenshots and a concise issue list under a local untracked `.review/a-stage-p1/`. Inspect for clipping, keyboard overlap, fixed footer, status hierarchy, 44px-equivalent touch targets and the visibility of the recovery CTA. Do **not** upload raw screenshots, PII, cookies or device logs to GitHub.
5. Return an explicit `MP_DEVICE_PASS` / `MP_DEVICE_HOLD` with screen IDs and failure reproduction, plus whether the Owner has reviewed visuals. Do not claim real R1 write parity.

Unapproved R2 Live reference screenshots, real customer data and Production/tenant effective SKU prices are never fabricated. `R2_REFERENCE_SCREENSHOT=NOT_SAVED / NO_APPROVED_SESSION` until a safe authorized comparison is available.
