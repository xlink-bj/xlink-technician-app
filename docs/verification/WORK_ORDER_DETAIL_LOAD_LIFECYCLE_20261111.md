# Work Order detail route lifecycle — local verification

Baseline: `bc17b5bd50be4d3b0f99038c17dbc669506061fa`. Private candidate; no commit, push, remote CI, deployment or real backend operation was performed for this slice.

## Problem and change

The shared detail store rejected every load while any detail was loading. In the normal App, opening slow A, using browser Back to the list, then opening B left B without a request. An old A result could still own the shared store. A read-port throw also escaped with the store stuck loading.

Only concurrent requests for the same ID remain suppressed. A different ID advances the existing generation, so late success, failure and session-invalid results cannot update or invalidate the newer route. Synchronous and asynchronous read-port throws become a generic retryable read error before the existing generation and identity checks. Exception text is not returned. API/listed-ID/role/session authorization, detail mapping, layout and business commands are unchanged.

## Actual verification

- New actual Pinia tests: baseline 6 FAIL / 5 PASS; candidate 11 PASS. Includes duplicate same-ID suppression, A/B races, stale session failure, stale rejection, clear, nonreactive role/logout changes, malformed route and retry ownership.
- Related detail, authorized-list and Production-read boundaries: the command including those 11 cases passed 144 tests in 5 files. A separate session/category-lifecycle command passed 68 tests in 4 files. These are 212 distinct tests, not 212 plus the 11.
- `pnpm run typecheck`: exit 0. `git diff --check`: pass.
- Normal App H5 at 430×932, business Mock off, all API responses synthetic and all external requests blocked: baseline 1 FAIL / 1 NOT_RUN, because B actual request count was 0. Candidate 2 PASS, exit 0, 9.1 seconds. Both cases use login → real list → held A → browser Back → listed B; B request and rendering precede release of A. Late A success and an actual HTTP 401 both leave B rendered, with one login and no session logout. No store injection or custom test page.
- The baseline stopped at the first failure and reported one additional teardown error from the still-held request. This is retained with the original red evidence, not presented as a separate product finding or a passing run.
- Default main-H5 discovery without opt-in skips these two scenarios. Dedicated execution requires `XLINK_H5_DETAIL_LIFECYCLE=true` and `config/playwright/work-order-detail-lifecycle.config.ts`.

The isolated config uses the existing read-only runtime branch named `prod`, but its API/auth base is loopback only. This is not Production testing. Actual normal API/listed-ID provenance is exercised; no permission bypass parameters are introduced. Request ledgers and screenshots/trace remain local test evidence.

## Boundaries

Real Java/Mongo, Production/Beta, native runtime, business writes and remote CI are NOT_RUN. Full suite and three builds were deliberately not repeated for this small follow-up; prior media-tree results are separate historical evidence. This author verification does not turn the supplied Node probe into a project test or imply independent RELEASE of all accumulated private media changes.

The separate media-support delta only moves the two synthetic loopback receiver commands into `tests/support/normal-r1-image-receiver.mjs`. It does not alter this store fix or the frozen media product semantics.
