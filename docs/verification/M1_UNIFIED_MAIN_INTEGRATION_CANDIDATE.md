# M1｜统一主干工程候选（DRAFT / 不代表发布就绪）

**2026-10-13 source snapshot.** This is the first deliberately visible **PR to main** for all M1 engineering work. It does NOT approve merging. Existing Issue #33 is authoritative for formal iteration DoD and the 2026-10-12 Owner “engineering first, UX Phase 2” decision.

## Immutable reference and scope

- Observed protected `main`: `c57fb3cc876c8ca3fb133d74dcf4833f8f755b32` (no main mutation).
- **Unified engineering code baseline:** `f5ed0f640986737e6d7bb14f430d3b3edc078d06` (Draft #115, already validated).
- Compare `main → baseline`: **ahead 487 / behind 0**. This reflects historically accumulated, UNMERGED work. **Do not** interpret this number as 487 approved feature milestones or create a single-click merge proposal.
- I2 `f948d837...` (catalog/SKU role-scoped offline tests), I3 `683bb63b...` (price/Order offline golden tests), I7 reconciled history `928efb27...`, I6 Contract mapping `df9021cd...`, I8 engineering evidence `f00d4c5...`, I6 handler proof `30194c2...`, I7 WorkOrder cache scope `f5ed0f6...` are ALL **ancestral** to this baseline.
- **Deliberately excluded** from this merged HEAD: I2 #106 `a950b22...` one-time Production SKU evidence collector (separate authority and no actual run); I4 #111 `4b2572b...` Owner screenshot/prototype approval pack (visual Phase 2). Ancestry exclusion is checked mechanically where full Git objects are available, never inferred from equal file names.
- **Main-facing change policy:** no executable application source code changes after `f5ed0f6`. This Draft PR adds ONLY this document, evidence JSON, one structural gate script, one counterexample unit suite, and a full-history read-only CI workflow.

## Explicit six-stage acceptance truth

| Stage | Engineering candidate | Missing real-world proof |
| --- | --- | --- |
| 登录 | Session Port/role-scoped WorkOrder identity, DEV H5 boot PASS | True R1 active user role/OTP, tenancy and cross-role outcomes |
| 工单 | ServiceAppointment list+detail, synchronous role revocation, fresh-scoped preflight | Actual current tenant role and node visibility; real phone permissions |
| 预约 | Current Action / Workspace + bounded dynamic forms, synthetic journey PASS | Real appointment save and workflow Complete under separately permitted Beta |
| 勘察 | Specialized Survey + generic dynamic form and UI contexts, synthetic journey PASS | Camera/photo/upload/watermark/poor-network on MP/Android/iOS |
| 报价 | SPU/SKU selection, grouped local draft, R1 offline price/Order projection | Active tenant SKU, real pricing, R1 type=0 quotation vs type=1 Order boundary |
| 签约 | Official type=1 Order bounded read, canonical ServiceAppointmentId Contract query source-corrected, DEV handler and intent preflight | Live Contract/signer ACL, org+role identity, actual legal signature, SMS/PDF/async readback |

**All six stage results remain `MOCK_CODE_ONLY` in the machine-readable manifest.** CI proves compiled source and deterministic synthetic behavior; it does **not** certify any true R1 customer, contract or monetary outcome. This document cannot replace `M1_I1_R1_SIX_STAGE_PARITY_LEDGER.md`.

## Specific code safety evidence carried into main candidate

1. [#112](https://github.com/xlink-bj/xlink-technician-app/pull/112) corrects technician R1 `serviceAppointmentId`, OR Contract status predicates and `createTime DESC`. Existing backend `_all=1` cancels `rows=3` DB bounds; both official Order and Contract limited reads now OMIT `_all`.
2. [#114](https://github.com/xlink-bj/xlink-technician-app/pull/114) isolates R1 current WorkflowNode `handlerIds` from mere WorkOrder visibility. Current orgId is not trustworthy and only DEV synthetic preview can trigger an extra node read. All signing/send SMS/Contract mutation commands are still transport-hard-denied.
3. [#115](https://github.com/xlink-bj/xlink-technician-app/pull/115) binds list+detail cache lifetimes to sessionRef/userId/roleId/roleVersion. Stale rows, async results and current customer contact are revoked when user/role changes. Source code tested in the real main App's DEV H5 shell, not in real production.
4. `pnpm verify` includes I8’s six-stage source/permission manifest check. New `check-m1-unified-main-candidate.mjs` adds immutable ancestry, no-extra-code-delta, excluded-probe and signoff checks. The workflow checks out **full Git history, read-only, credentials off**. Counterexample tests validate refusal when live/signing/Owner status is fabricated.

## Baseline CI (not new PR result)

- [Validate #38365405856](https://github.com/xlink-bj/xlink-technician-app/actions/runs/38365405856) on `f5ed0f6`: **98/98 suites, 991/991 tests, TypeScript, MP WEIXIN & App build PASS**.
- [Main H5 #38365405883](https://github.com/xlink-bj/xlink-technician-app/actions/runs/38365405883) on `f5ed0f6`: **2/2 startup, 23/23 main App DEV Mock, 26/26 legacy G4-F PASS**.
- **The main-facing Draft must get new exact-HEAD Validate, H5, Git-ancestry Gate.** Historical CI is not evidence that the new PR is safe.

## Reproducibility and rollback

Full local Git checkout of the Draft integration branch:
```bash
node scripts/check-m1-unified-main-candidate.mjs
pnpm install --frozen-lockfile
pnpm verify
pnpm build:mp-weixin && pnpm build:app
pnpm test:main-h5-boot
pnpm test:main-h5-mock
pnpm test:uni-h5-g4f-review
```

A BLOCKED Git ancestry or suite must be resolved in a new review commit; do not disable tests or change `main`. While this is Draft/unmerged, rollback means abandoning/closing **only** this main-facing candidate, leaving main and all original Draft branches intact. Future approved deployment would need an explicit Owner/Lead release authorization and a separately reviewed revert/roll-forward plan.

## Gate decision

- **Engineering branch readiness**: CODE_PASS only when this exact HEAD has completed new Validate/H5/Git checks.
- **I7 formal**: 1/4; **I8 formal**: 0/4; **M1 formally accepted**: 1/8.
- **Real tenant**: role/Contract/SKU/price and signing NOT_RUN; existing separately authorized Codex-only read-only environment proof has not been performed by this task.
- **Devices**: WeChat Mini Program, Android, iOS physically NOT_RUN (successful bundles ≠ device proof).
- **Owner UX**: I4 high-fidelity review not approved; Product Phase 2 applies.
- **Business writes, legal signature, SMS, PDF, production release and merge to main**: **NOT_APPROVED**, must not be triggered by green CI.

The JSON snapshot `M1_UNIFIED_MAIN_INTEGRATION_MANIFEST.json` is the authoritative machine-readable evidence for this *Draft* only; it never grants backend or tenant rights.
