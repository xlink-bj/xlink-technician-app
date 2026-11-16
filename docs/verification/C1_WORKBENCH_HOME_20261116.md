# C1 task-first workbench candidate — 2026-11-16

Scope: authenticated Home and its necessary read/navigation adapters only. Base: `cd030e62920f8e004d5921b797d0b4a5b3ff801f`. The explicit task authorization supersedes AGENTS.md's older main-only policy: this candidate is on `codex/c1-task-first`, pending independent review before main integration. Notification/My visuals, login markup, backend and production deployment are outside this change.

## Behavior and evidence boundaries

- Brand header, actual session name/role, local date, four todo categories, one prominent task, two linked DEV appointments, work selection shortcuts and month summary. Yuhong and XLink map shared layout to their existing independent tokens.
- Production has no verified aggregate/calendar/month contract. Counts display `—`, and calendar/month are explicitly `未接入`; a readable current-page order is labelled `当前可查看工单`, with no appointment or priority claim. Failed, empty, unknown and loading states are distinct.
- Synthetic metadata is gated by DEV + dev environment + existing H5 Mock E2E switch + data mode. Its counts come from category queries. Default counts are 1/0/1/2, two appointments at 10:00/14:00, and zero completed fixture IDs. The page clearly says `演示数据`; there is no invented 18-order completion history.
- The 10:00 appointment points to existing survey-success order 017 and active inspection node; 14:00 points to existing order 002 and its current node. Mock list rows use the mutable detail fixtures so completed/inactive tasks disappear. Metadata grants no permission.
- Task clicks refresh ordinary list membership and check the current session scope and detail accessibility before navigation. Work shortcuts first replace the root with the existing role-visible list, filtered over currently loaded rows; the banner states this limitation. Detail pages retain all action/record authorization. No context-free submission, dispatch, amount, approval or new acceptance-write capability is introduced.
- Root replacement and detail back stack are retained. Hidden Home clears its data instead of issuing background reads that could invalidate another page's authority. Session/role/source changes invalidate previous data and late responses. My retains confirmation/logout; the duplicate Home logout is removed. The devReview fragment attribute fix remains.

## Verification

At candidate preparation, full `pnpm run verify` passed: 375 files, 6,752 tests, including typecheck, UI/token/architecture/Mock parity checks. Both brands compiled H5, MP-Weixin and App; MP bootstrap/WXSS/binding and release QA-exclusion checks passed. Ordinary non-Mock H5 startup/login passed 4 tests. Logs and exact-SHA final browser outcomes are delivered separately in the Library review archive, not inferred from this document.

Reproduce C1 real-H5 journeys and screenshots with:

```sh
VITE_XLINK_BRAND=yuhong pnpm exec playwright test --config config/playwright/c1-workbench.config.ts
VITE_XLINK_BRAND=xlink pnpm exec playwright test --config config/playwright/c1-workbench.config.ts
XLINK_H5_AUTHORITY_REVOCATION=true pnpm exec playwright test --config config/playwright/work-order-authority-revocation.config.ts
```

Run the two C1 commands sequentially in a shared workspace. Local container runs used `PW_EXECUTABLE_PATH=/usr/bin/chromium` because the provisioned Chrome channel is absent; CI uses its pinned Playwright browser. Initial concurrent runs encountered trace-file cleanup ENOENT after functional assertions, so final results must come from the serial reruns. Prior assertion failures exposed and led to fixing mock node alignment and outdated Home logout/request-count assumptions; they are not counted as passes.

C1 tests exercise 430x932 and 360x932, all four category and work-entry journeys, exact next/schedule IDs, real construction-record reading, duplicate taps, root stack depth, long text/touch targets, error/empty/missing/non-Mock states, stale role responses and logout. Existing root navigation, appointment, brand/login and read-authority tests remain in the acceptance set. Authority assertions explicitly allow the two required page-one reads (Home and independently authorized list) while rejecting unauthorized page-two requests and stale results.

No real production reads/writes, native WeChat/App device tests or deployment occurred. MP/App compilation is not native acceptance. Owner commercial review and exact-SHA CI remain integration gates; this document does not authorize pushing main.

## Independent-review P2 follow-up

The task handler previously cleared Home before navigation and let a rejected navigation driver escape, leaving the still-visible page idle without recovery. The follow-up catches that rejection and exposes a reloadable error only while the originating Home/identity generation remains current. Hide, unmount and role changes invalidate the generation; a late callback cannot overwrite a refreshed Home or release a newer task's navigation lock. Reload clears the old feedback before retrying the same task.

Added six tests executing the actual SFC setup/lifecycle: next/schedule failure and retry, leave-return and role-away-return races with a newer pending task, and hidden/unmounted callbacks. Added four real-H5 cases using the actual `uni.navigateTo` failure callback, covering both task entry points, successful retry to the same order and late failures after navigation/role changes. Existing main-shell cases run alongside them in both themes. No visual/token change, backend change or modification to the five governance-owned test files is included in this follow-up.

## Integration candidate based on ad5b5ce9

The original candidate was merged with main `ad5b5ce9ea7377c346be4c9b7f0f5ece137e6bca` using a normal merge, preserving all eight upstream commits and both candidate commits. There were no textual conflicts. The overlapping Mock router retains the upstream FormDef capability naming/flags and the C1 list projection; upstream CI, documentation and test renames are retained. No upstream visual files were changed by those eight commits.

The five governance-owned tests (`brand-survey-host`, `existing-image-upload`, `m1-r1-contract-preview`, `map-bizselect-scalar-edit`, `mock-order-feedback`) are taken byte-for-byte from this main baseline. In particular the candidate's earlier two logout-selector edits in `existing-image-upload.spec.ts` are not carried forward: its final compatible version remains the governance owner's responsibility. This is an explicit integration coordination gate, not a claim that the older attachment test passes with C1.

Integration verification reruns both brands' actual Home/root/login/task/error/lifecycle flows and read-authority regressions, plus typecheck and focused read/navigation/Mock-parity tests. One additional Home H5 regression injects only a read-port `session_invalid` result and verifies actual session teardown, cleared Home facts and normal Login rendering. No authentication implementation or production operations are changed. Final exact-SHA results and protected-file blob hashes are supplied in the integration review archive. No main push is authorized by this candidate record.

A final remote recheck found governance commit `543719291a56b690d9a12c520d023fdfe512a414`. It changes only three test/CI configuration files to run existing-image cases in their scoped fixture. This commit is merged intact as well. Application and all test-body blobs are unchanged from the first integration candidate; C1 and authority test discovery still selects the same 20 and 10 cases per brand. Final-head expiry regressions and configuration discovery supplement the unchanged-application dual-brand runtime results. The five governance test bodies still exactly match latest main; C1 compatibility of the old Home logout selector in the existing-image body remains an explicitly coordinated owner item.
