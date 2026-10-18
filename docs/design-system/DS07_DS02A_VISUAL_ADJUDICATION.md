# DS-07 Commercial UI — DS02A Visual Baseline Adjudication

**Decision status: OWNER REVIEW REQUIRED — existing Golden unchanged.**
This is a **visual-change evidence package**, not automatic screenshot acceptance or a claim of zero regressions.

## Scope / exact evidence

- Earlier comparison point: Draft [#153](https://github.com/xlink-bj/xlink-technician-app/pull/153) HEAD `5574e018e1f3d099fc17cd0ae5e10b6257105f38`, [DS02A run 39039276259](https://github.com/xlink-bj/xlink-technician-app/actions/runs/39039276259).
- Current comparison point: Draft [#159](https://github.com/xlink-bj/xlink-technician-app/pull/159) pre-additional-test HEAD `1ebe56bc74c6063038f5392cc64b7b787c25c9c8`, [DS02A run 39048281225](https://github.com/xlink-bj/xlink-technician-app/actions/runs/39048281225).
- Both runs: **List PASS at 320/375/390**; **Detail and Quote FAIL at 320/375/390** (six out of nine main-App snapshots fail). Gallery gate is separately preserved.
- Compared archived **actual PNGs to actual PNGs**, not just workflow outcomes. The six committed Golden files have identical SHA-256 bytes in both archives. These are screenshot comparisons at **844px height** with the same 320/375/390 widths. RGB exact-pixel mismatch is diagnostic, not Playwright's perceptual threshold.

| Scene | Width | Early actual vs current actual, differing pixels | Current actual vs committed Golden |
| --- | --- | ---: | ---: |
| Detail | 320 | **0.0%** | 36.2% |
| Detail | 375 | **0.0%** | 34.9% |
| Detail | 390 | **0.0%** | 34.3% |
| Quote | 320 | **1.1%** | 81.4% |
| Quote | 375 | **1.0%** | 82.0% |
| Quote | 390 | **0.9%** | 81.8% |

## Observed visual causes — inspect images, not snapshots alone

**Detail:** previous Golden rendered the active task as a pale bordered card. The current real App displays a dark navy task panel with a more prominent full-width primary action, while the remaining work-order summary and tabs retain corresponding information.

**Quote (Q01):** previous Golden showed an older stacked multi-section grouped form (维修部位 → 选择产品), while the current App renders a sequential first-step composition with progress 01/03, “填写维修部位” and fixed bottom Save/Next actions. This is a material redesign, not font antialiasing noise. The new treatment and large layout changes explain why naive pixel diff is unsuitable as the sole pass criterion.

**Attribution:** the same six failures existed on #153, *before* C4.A and C4.B. In particular, Detail actual PNGs are byte-equivalent at all three widths across the compared runs. Quote actual PNGs differ only ~1% of RGB pixel coordinates. This supports a historical Golden lag, but **does not certify visual quality** and does not automatically approve a new Golden.

## Signing visual scope and truthfulness

- The actual authenticated official-order read page at `signing-order-read` fails closed for a forged Order ID; prior C4.B test at 320/375/390 protects this path.
- Isolated DEV `signing-mock-review` offers **synthetic** pending / signed / failure / expiry scenarios. Its “已签署” is a **UI mock concept**, not `contractStatus`, an accepted e-signature, or proof of any production Contract.
- New `tests/h5-main-mock/ds07c4b-signing-state-visual.spec.ts` captures **pending and synthetic signed visuals** at 320/375/390, checks failures/expiry/no-records, disables both preview and signature actions, and fails if the browser attempts an external request.
- **Real backend-signed Contract success visual remains NOT VERIFIED**, because no authorized/verified signed production Contract fixture was supplied. Never forge one to turn this gate green.

## Owner decision record — pending

1. **Detail commercial layout**: approve current dark active-task card / strong CTA, or request specific revision. No Golden updates pending decision.
2. **Quote Q01 layout**: approve step-first progression and footer action hierarchy, or request specific revision. No Golden updates pending decision.
3. **Signing**: review synthetic signed/pending screenshots as **layout evidence only**. Later validate a real signed Contract solely from an approved, authorized read-side fixture; business signing commands must remain blocked.

**Release policy:** Do not approve snapshots, set `H5_VISUAL_OWNER_APPROVAL=ACCEPTED`, merge stacked PRs, or claim production signing parity from this document alone. Retain red CI as an explicit unresolved baseline gate until Owner adjudication.
