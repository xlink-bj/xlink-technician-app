# Cross-Platform Visual Calibration

This document records the calibration contract for the development-only Design
System Review App. It does not define product behavior or replace the
normative Design System specification.

## Review hierarchy

1. Design System specification — normative rule.
2. uni-app H5 — primary automated visual reference.
3. MP DevTools — platform-fidelity calibration.
4. Real MP device — final MP platform validation.

H5 and MP do not need pixel identity. Calibration checks hierarchy, density,
control dimensions, interaction grammar, wrapping, overflow, and platform UX
regressions. This is not an aesthetic score.

## Review package

- Source: the same `review-app/` page and
  `__review/design-system-gallery-fixtures.ts` used by uni-app H5.
- MP build: `pnpm run build:mp-weixin-review`.
- DevTools open path: `unpackage/design-system-mp-weixin/`.
- Review page: `pages/design-system/index`.
- Login/API/session/writes: none.
- Required manual MP simulator captures: `01-foundations`, `02-actions`,
  `03-input-textarea`, `04-selection`, `05-action-footer`.

## Calibration surfaces

| Surface | What to compare | Status |
| --- | --- | --- |
| Foundations | typography scale, line height, card spacing/radius, page background | NOT_TESTED |
| Actions | primary, secondary, disabled, loading | NOT_TESTED |
| Input / Textarea | control height, inner padding, placeholder, multiline/auto-height | NOT_TESTED |
| Selection | selector, choice, multi-choice, hierarchical cascade | NOT_TESTED |
| Action Workspace Footer | single/dual action, disabled Complete, Saved state, safe-area composition | NOT_TESTED |

Status vocabulary is intentionally limited to `MATCH`,
`ACCEPTABLE_PLATFORM_DIFFERENCE`, `MATERIAL_DIVERGENCE`, and `NOT_TESTED`.
This source/build slice records `NOT_TESTED` until the five MP simulator
captures are reviewed. A successful MP build is not a device or visual PASS.

## Scope boundary

This package is review infrastructure only. It does not add an MP-specific
Gallery, fixture set, business semantics, UI variant, pixel baseline, or
DevTools automation. Production MP navigation continues to come only from
`src/pages.json`.
