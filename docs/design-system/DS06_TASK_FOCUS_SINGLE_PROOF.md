# DS-06 — One-point Design-to-Code Proof / Work Order Task Focus

**Do not generalize before a real visual signoff.**

## Source of truth
- Repository: `xlink-bj/xlink-technician-app`.
- Real main-App H5 DEV Mock case: work order `MOCK-018` = `演示报价工单`, Workflow current task `报价`, existing action `去下单`.
- Existing business source remains `detailWorkflowUiProjectionFor`, eligibility `currentTask.execution`, production read-only exception and `handleCurrentTaskAction`. All unchanged.
- Scope: ONLY the task-focus block in `src/pages/work-orders/detail.vue`; Work Order Summary, Quick Actions, Tabs and every business API are untouched.

## Industry-grounded design principles
- Apple HIG Buttons: one prominent likely action; minimum 44×44pt hit target; clearly labeled and pressed feedback. Source: https://developer.apple.com/design/human-interface-guidelines/buttons
- Apple HIG Layout: important content should have visual priority, grouped with enough separation and aligned scanning. Source: https://developer.apple.com/design/human-interface-guidelines/layout
- WeUI: consistent mobile interaction primitives (Button, Cell, Dialog, ActionSheet) instead of ad hoc styles. Source: https://github.com/Tencent/weui

## Locked master (390×844 CSS px, DEV mock)
Independent editable HTML reference and 390×844 PNG are delivered with the review. The target panel is ONE bounded design system candidate:
- Width: `viewport - 2 × 13px` = **364px** at 390px. Page owns only the position under summary; never infer Workflow from geometry.
- Panel material: flat deep navy `#162C4A`, radius **19px**, height **169px**, subtle stacked shadow; no gradients, animations, decorative business claims.
- Eyebrow: `当前任务` 12/17px `#B7C8DF`, with a purely decorative 6px source-toned indicator.
- Primary content: *source title*, 25/33px white, ~720 weight; only one visual focal point.
- Action: *source action label*, 51px tall, blue `#2677ED`, 12px radius, right chevron, explicit press and disabled states. Business guard remains caller-owned.
- Disabled: do not permit interaction; preserve exact existing note. No new authoritative action.
- No direct store, session, Workflow, pricing, API or navigation dependency inside the component.

## Triple evidence, not merely CI
1. **Before:** exact original 390×844 H5 DEV screenshot of `MOCK-018`.
2. **Design target:** locally reproducible editable HTML and its deterministic 390×844 rendering. This visual represents one changed region, not a newly designed whole app.
3. **After:** exact-HEAD real uni-app H5 screenshot generated in GitHub Actions, same route/sample/viewport.

Objective module acceptance: 169±0.5px height, RGB `(22,44,74)` surface, 19px radius, 25px title, 51±0.5px action, RGB `(38,119,237)` action; zero horizontal overflow, no failed resources/business writes, original button destination and disabled restrictions intact.

**Important:** numerical geometry PASS proves implementation fidelity, NOT premium aesthetics. Owner judges whether this is genuinely preferable to original or if the master must be redesigned. No Golden promotion or Merge until that decision.

## Reusability gate
After the Owner approves actual H5, consider moving the token group into `mobile-craft-v1.scss` and apply as a single component to a second business task, with no new per-page styles. For now, limit the experiment to this one task.
