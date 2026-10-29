# G4-E Integration + Device Validation — Phase A

## Scope

This phase is read-only. No Survey save, workflow completion, media upload,
Qiniu mutation, watermark mutation, or backend write was performed.

## Accepted baseline

- HEAD: `cb23a2852a9126bf23c087c280fca29c1bfa9f1f`
- Branch: `rebuild/g4e-onsite-inspection`
- Product / Visual baseline: accepted before this validation pass

## Validation execution revision

- Revision: `UNKNOWN`
- Evidence: the available Phase A run record does not bind the DevTools/runtime
  observations to a Git SHA. The accepted baseline above is not treated as the
  execution revision.

## Live/Beta Read

- Required environment: `XLINK_SCHEMA_API_BASE_URL` — ABSENT
- Required environment: `XLINK_SCHEMA_SESSION_REF` — ABSENT
- Result: `LIVE_BETA_READ = BLOCKED_ENV`
- Target: not contacted
- Executed: no live/Beta request was started because the required read-only
  environment contract was unavailable.
- Drift: `UNKNOWN` — no current live payload was captured; this does not
  invalidate the accepted source-backed/deterministic baseline.
- Not revalidated: target work-order, workflow node, active Survey identity,
  current ExtField/FormData, repair-part/region/IS/leakage-cause providers.

## MP-WEIXIN

- DevTools / artifact: AVAILABLE — local WeChat DevTools CLI was found and the real
  `dist/build/mp-weixin` artifact was opened.
- Artifact: valid `app.json`, `app.js`, `app.wxss`; 174 generated files.
- DevTools launch: PASS — the app rendered the login shell without an observed
  runtime exception.
- Route smoke: PASS — `/pages/index/index` and
  `/pages/work-orders/action-workspace` resolved/launched in the DevTools
  runtime. This is route/launch coverage only.
- Authentication: REQUIRED — the runtime stopped at the login boundary.
- Authenticated Survey interaction: `BLOCKED_ENV` — no authenticated session
  was available, so
  the Survey workspace, repair-part selector, Leakage Cause sheet, media
  picker boundary, and sticky Complete layout were not verified.
- Physical MP device validation: `NOT_EXECUTED` — the evidence is from DevTools,
  not a physical device.
- Writes/uploads: NONE.

## App

- App build: `PASS` — `pnpm run build:app` completed successfully at the
  current repository HEAD. This verifies compilation only, not runtime or
  device behavior.
- Runtime smoke: `BLOCKED_ENV` — HBuilderX is installed, but no supported
  device/emulator was available for runtime validation.
- Android: `adb` is installed; no attached devices were reported.
- iOS simulator: `xcrun simctl` is installed; no available simulator was
  reported.
- Native launch, authenticated Survey rendering, scrolling, permissions, and
  safe-area footer behavior were not executed.

## Classification

- Platform defects: NONE observed in the available MP launch boundary.
- Shared UI defects: NOT ASSESSED — authenticated Survey UI was unavailable.
- Business runtime defects: NONE observed; Survey business interaction was not
  entered.
- Contract drift: UNKNOWN — live/Beta read was blocked by missing environment.
- Environment blockers:
  - missing `XLINK_SCHEMA_API_BASE_URL`
  - missing `XLINK_SCHEMA_SESSION_REF`
  - MP authenticated session/login code unavailable in the run
  - no Android device attached
  - no iOS simulator available

## Real mutations

NONE.

## Production readiness

`PARTIAL` — build and limited DevTools route evidence are available, but live
contract revalidation, authenticated Survey interaction, physical-device
validation, and native App runtime smoke remain unverified or blocked.

## Evidence boundary

This artifact distinguishes build verification, MP launch-only smoke, live
contract revalidation, and native App/device validation. It does not claim
authenticated MP PASS, App runtime PASS, live Beta PASS, real media PASS,
Survey Save PASS, Survey Complete PASS, or physical-device PASS.
