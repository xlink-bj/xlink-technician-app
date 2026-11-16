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
