# Work Order refresh navigation guard

Baseline main: `61df38305030e25347e51619e62ab30382e11e7b`. This private slice is separate from the frozen Survey conditional candidate. No API permissions, listed-ID guard, request protocol, grants, contact/accept handlers or workflow actions change.

## Behavior

The normal list retains cards while a fresh page-one search/refresh is pending. Its API correctly revokes old list membership immediately. Previously a cached card still advertised navigation and could enter a detail permission-denied state before the fresh response arrived.

A single page predicate now controls taps, hover, link role, aria-disabled and the shared card's interactive presentation. Cached cards cannot navigate until a successful fresh list has established membership. Failure removes old cards; detached handlers cannot navigate a removed row. Session/role changes retain their existing invalidation rules. The store exposes only its existing append intent as a computed read state: already listed cards remain usable during same-intent pagination. Adapter authorization remains authoritative in every case.

## Verification

The actual compiled page template and tap handlers run against the actual Pinia list store. Baseline RED: four failures plus one append control pass. Corrected behavior: five passes covering repeated taps, successful recovery, failed refresh, removed rows, append, role and logout. A first post-fix run used an unavailable Vitest matcher; its harness failure is preserved, then replaced with equivalent supported assertions. Related page/detail/session regressions passed 86 tests including these five.

A private no-write normal App test restored only the previously verified isolated Java test composition and its existing 17-object Mongo data. It logged in normally, read the existing image, used visible Back and visible search, delayed an unchanged real Java response containing that work order, and clicked the disabled card twice. No detail request or navigation occurred while held. After release it navigated and read the same image, then repeated normal Back/read successfully. 49 real Java HTTP responses, one normal login, zero business-write/upload/token/Process requests. Raw BSON remained 17 objects; only Account login metadata changed. Image and node raw BSON hashes were identical. Push audit at the actual business Webapp classloader remained clean, followed by audited shutdown and cleanup. No seed, picker, upload, creation, EXTS or workflow replay occurred. This result uses the explicitly derived isolated backend composition, not an original complete backend build or production validation.

New project H5 also covers held success and held failure/retry through normal UI with fully intercepted synthetic APIs. All external requests and business writes are blocked. Default opt-in skips are not PASS. Final merged-tree `VITE_XLINK_ENVIRONMENT=test VITE_XLINK_ENABLE_REAL_WRITES=false pnpm run verify:full` passed: 294 files / 4804 tests plus typecheck, boundary/dependency and quality gates. The first full run had 4803 passes and one stale source-string assertion requiring the previous guard line; that static contract now follows the unified predicate, alongside the independent behavior tests. Its original failure is retained. No product source changed for that test adaptation.

Affected synthetic H5 passed 18 unique cases: new refresh success/failure 2, existing detail lifecycle 2, existing authority 10, existing categories 4. The authority group's first launch had two Chromium `ERR_NETWORK_CHANGED` errors loading local JS before login; nine other cases passed, and that single environment-failed case passed a bounded isolated recheck with identical assertions. That failure remains recorded, not relabeled PASS. Together with the separate real Java read-only case, this is 19 passing unique cases, not one uninterrupted all-green run. No skips are counted. A private real-H5 testDir and a one-case grep discovery error both stopped before business HTTP; their harness failures remain recorded.

Serial release-profile H5, MP-WEIXIN and App builds passed on the same product bytes. Native runtime and commercial visual acceptance were not exercised. A 430×932 interaction QA capture checks the pending card's disabled presentation and successful recovery; no layout or CSS changed.

## CI and limits

The frozen Survey workflow is unchanged. Future minimal CI wiring would add one sequential scoped-job step setting `XLINK_H5_REFRESH_NAVIGATION=true`, `VITE_XLINK_ENVIRONMENT=test`, `VITE_XLINK_R1_MP_UX_FIXTURES=false` and run `pnpm exec playwright test --config config/playwright/work-order-refresh-navigation.config.ts`, with `test-results/work-order-refresh-navigation/` in the existing always archive. It requires no new permissions, secrets, triggers or budget. That wiring is a recommendation only, not part of this candidate.

No production/Beta/Qiniu requests, native runtime, deployment, new remote candidate CI or commercial visual acceptance are claimed. This change does not repair or alter backend authorization. The original direct-hash and visible-search failure evidence remains preserved separately; normal Back itself did not trigger that refresh race.
