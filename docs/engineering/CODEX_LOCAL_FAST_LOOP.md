# Codex Local Fast Loop — XLink Technician App

> **Status:** FL-01 working protocol / review candidate. **Owner:** ChatGPT Lead (routing and acceptance); **Executor:** Codex local (runtime, browser, WeChat DevTools, intranet evidence).  
> **Evidence baseline:** [Issue #209](https://github.com/xlink-bj/xlink-technician-app/issues/209#issuecomment-6360398417), measured on exact `9f02d6fcc3e3e8ab24d825cbf72835fe9f2d8609`, 2026-10-23. **This is not Stage 1 acceptance or Production write approval.**

## 1. Purpose and invariants

Fast Loop is the shortest **safe and honest** route from a task to evidence: **task → correct runtime → existing fixture/auth mode → focused test/interaction → redacted evidence → Lead decision**.

- **Reuse the existing uni-app/Vue3/Vite code and tests.** Do not create another browser app, simulated authentication layer, fixture universe, runner, or second command convention.
- **The whole App matters.** An isolated repeat component passing does not establish Home → List → Detail → Action Workspace. H5 success does not establish WeChat Mini Program (MP) behavior, and simulator success does not establish device UX.
- **Default: DEV synthetic business data, no Production traffic.** Production Auth with Mock business and Production Readonly are separate explicit modes, not transparent fallbacks. Never auto-switch modes to overcome a failing test.
- **No Production business writes, uploads, submit, delete, workflow transition, PDF creation, login bypass or security-gate change under this protocol.** Any separate authorized production activity must use its own narrowly scoped evidence task.
- A failed or skipped test is recorded exactly as such. Never quietly update a selector/expected string to make a gate green before determining intended behavior.

Read alongside: [`AGENTS.md`](../../AGENTS.md), [`EQ03_TEST_LANES_AND_METRICS.md`](./EQ03_TEST_LANES_AND_METRICS.md), and [`G4UX_MOCK_RUNTIME.md`](../ux/G4UX_MOCK_RUNTIME.md). Those files remain authoritative for repository policy, quality gates and Mock runtime details.

## 2. The first 60 seconds

1. **Boundary (0–15s):** Read the current Issue, approved scope and acceptance gate. Declare whether the question is API/schema, interactive behavior, component visual, MP compatibility, or real-device UX. Identify authorization status: `DEV synthetic` / `Auth+Mock` / `Production Readonly`.
2. **Exact checkout (15–30s):** In the intended existing worktree run:

   ```bash
   git status --short
   git branch --show-current
   git rev-parse HEAD
   ```

   Record all three. Do **not** checkout, reset, clean, or overwrite an occupied/dirty worktree just to match a PR; use an already approved isolated worktree if available.
3. **Select one lane (30–45s):** Use the table below. Inspect the nearest source/test/config only; do not re-index the old R1 repository by default.
4. **Confirm guard (45–60s):** Check intended port/process and env **key names**, expected network direction, test fixture, allowed page/route and evidence artifact. For `5173`/`5174`/`5176`, let the Playwright strict-port server own the port. If occupied by an unrelated process, stop and report; do not kill it without authorization.
5. Start the focused test, capture exact SHA, command, runtime, result, trace/screenshot if relevant, and negative network/write evidence. Promote to the next lane only if the task actually requires it.

## 3. Task-to-environment route

| Task | Fastest valid first evidence | Next gate, if needed | What it cannot prove |
| --- | --- | --- | --- |
| R1 workflow, node, FormData, mapping, identity or schema | Version-pinned source, adapter + contract/unit test; only if explicitly authorized, bounded read-only API/DB comparison | Production Readonly evidence review | No UI/UX assertion; DB rows do not prove live UI |
| Home → List → Detail → forms/repeat; navigation, draft/state interaction | **True uni-app main App H5 Mock + Playwright**, focused scenario and network guard | Full main-App H5 Mock; MP build/DevTools for platform-sensitive behavior | Does not prove real login or Production records |
| Layout, spacing, typography structure, responsive states | H5 dev hot reload or main-App Mock fixed viewports, screenshots and click-target assertions | MP layout preview and eventual device | H5 CSS/rendering is not WXSS on device |
| Repeat or another bounded component contract | Existing isolated harness only (`test:r1-main-repeat-ui`) | Real main-App flow | A component harness is not end-to-end navigation |
| WeChat-only lifecycle, routing, input, scroll, safe area, WXSS | `build:mp-weixin`, then WeChat DevTools simulator/CLI on exact build | Physical WeChat device | A clean build is not successful interaction; simulator is not device sign-off |
| Full visual ergonomics: field-worker font, touch size, long titles, keyboard and safe area | Physical device on representative content and task states | Human product acceptance | Browser emulation is insufficient |
| Real API authorization, saved forms, repeat relationship | Explicit Production Readonly scope and current-role object allowlist | Correlated source → authorized API/DB → MP read-only interaction | Never business mutation; not the normal edit loop |

**Promotion ladder:** source/contract → isolated component (if relevant) → true main App H5 Mock → MP build → MP DevTools interaction → physical device UX → separately authorized Production evidence. A specific feature may enter later in this ladder, but a lower rung never substitutes for a higher one.

## 4. Existing commands (do not duplicate)

Run from the recorded worktree; use the repository's installed/pinned package toolchain.

| Lane | Command | Existing fixture/port | Typical use |
| --- | --- | --- | --- |
| Main-App boot | `pnpm run test:main-h5-boot` | True App bootstrap, port `5173`, Playwright | Login-first-paint / boot health / browser errors |
| Main-App Mock | `pnpm run test:main-h5-mock` | **True App** at `5174`, DEV synthetic session, external business traffic blocked | Home/List/Detail/Action Workspace Golden Path |
| Main-App Mock **focused** | `pnpm exec playwright test --config=playwright.main-h5-mock.config.ts tests/h5-main-mock/<target>.spec.ts --grep "<case>"` | Same true App + guard at `5174` | Fast local fault diagnosis; use actual existing filenames/test names |
| Repeat component | `pnpm run test:r1-main-repeat-ui` | Isolated component harness at `5176` | Repeat panel boundary only |
| Local H5 development | `pnpm run dev:h5` | Environment-dependent (no implicit synthetic login) | Manual HMR/UI exploration only after checking active mode |
| Quality boundary | `pnpm run verify:quick` or `pnpm run verify:full` | Non-equivalent to browser/MP/device | Type, unit, package/engineering gates |
| Platform build | `pnpm run build:h5` / `pnpm run build:mp-weixin` / `pnpm run build:app` | Compiled targets differ | Target compilation and code-structure checks |

**Run focused tests while iterating.** Before declaring a main-App regression gate green, run the required full suite and report *all* pass/fail/skip results. Do not use a green targeted run to conceal known red tests. Do not automatically rerun the ~250-second full Mock sweep after each edit.

**Known optional scenario:** Main-App `MOCK-019` continuous journey uses `mock-continuous-journey-entry`. The `MOCK-021` R1 repeat main-App case in `tests/h5-main-mock/r1-repeat-read.spec.ts` requires explicit `VITE_XLINK_R1_MP_UX_FIXTURES=true` and is skipped by default; never silently count that skip as covered.

Playwright configs: `playwright.main-h5-bootstrap.config.ts`, `playwright.main-h5-mock.config.ts`, `playwright.r1-main-repeat-ui.config.ts`. Outputs: their own `test-results/` screenshots/traces/JSON/HTML. Keep real-client screenshots and identifiers in local, access-controlled evidence; only post sanitized summaries.

## 5. Login and data modes — never conflate

### Mode A — DEV synthetic, credential-free main-App E2E (**everyday default**)

- Entry: `test:main-h5-mock` on `5174`, configured by `playwright.main-h5-mock.config.ts` and `src/app/runtime-config.ts`.
- Synthetic session is only accepted for a consistent DEV test combination: `VITE_XLINK_H5_MOCK_E2E=true`, Mock business enabled, `https://example.invalid` as business target, real writes disabled, **no Auth base override**. Keep the existing configuration; do not copy these flags to production builds.
- Real uni-app Home → List → Detail → Action Workspace, but synthetic identity/data. Each clean Playwright browser context starts without previous client state; fixtures, journey and command state remain controlled by `src/adapters/api/mock/`.
- For manual reruns use a new browser context or reset known Mock local storage according to `G4UX_MOCK_RUNTIME.md`. Existing keys include `xlink_technician_business_mock_enabled` and `xlink_technician_business_mock_mode`.
- A successful Mock session is **not** proof of Production authentication, role authorization or real saved records.

### Mode B — authorized local Production Auth + strictly Mock business (**separate on-demand lane**)

- Existing `dev:h5`/DEV configuration can use an explicitly configured `VITE_XLINK_AUTH_API_BASE_URL` for authentication while business read/commands/upload stay routed to Mock with no real fallback (`authOnlyMockBusiness` in `src/app/runtime-config.ts` and composition in `src/app/composition.ts`).
- Use only previously authorized login scope. Confirm effective env/host **without printing values, phone, one-time code, cookie or token**. Follow normal session and role reset rather than borrowing synthetic credentials.
- H5 CORS/login latency against actual intranet host is **UNKNOWN** as of the 2026-10-23 FL-01 evidence. Do not infer it from WeChat domain-debugger behavior or “fix” it by weakening allowlists.

### Mode C — explicit Production **read-only** MP evidence (**never default**)

- Dedicated command: `pnpm run dev:mp-weixin:prod-readonly` (explicit prod mode); Mock is forcibly off, reads constrained by `src/adapters/api/uni-api-read-transport.ts`, business command transport blocked by `src/adapters/api/uni-api-command-transport.ts`.
- Only for separately authorized task, allowed current role, exact work-order/node/form IDs, permitted endpoint and page size. Read saved repeat only via existing explicit read-only UI intent. Do not switch roles, create records, upload, process workflows or fire PDFs.
- Prior read evidence for `#199`/`#205` is reusable; do not routinely relogin or requery Production for visual refinement.
- A production login may establish a session/permission context; that does **not** grant authority for business writes.

### Env resolution/check order

`vite.config.ts` uses Vite `loadEnv(mode, cwd, 'VITE_')` and test `webServer.env` explicitly overrides relevant values. Mode-specific `.env.*.local` can change effective settings. Before starting a test: identify selected mode, installed config file, override keys, Mock/write guards and intended API host **category**, not secrets. Never print `.env.prod.local` contents. Production build must not inject quick-login values.

## 6. R1 Source → adapter → authorized API/DB

1. Identify the **pinned R1 source commit** and specific methods for the contract, then the current adapter/model schema and test. Classify identifiers separately (work-order, outer workflow/node, inner workflow/node, FormData/form definition).
2. Try local contract fixtures first. If authoritative information is missing, propose the **smallest allowed readonly query** with role, exact object/field, route, page limit and sanitized expected shape.
3. Existing paths to reuse, after authorization:
   - `scripts/beta-api-client.mjs`: bounded Beta allowlist.
   - `scripts/verify-g4f-prod-read.mjs`: bounded Production role/work-order readonly checks.
   - `src/adapters/api/uni-api-read-transport.ts`: App read fence.
   - User's existing `xlink-prod-data-analyze` readonly workflow and production data dictionary, **not** a new DB utility.
4. Check source ↔ DB ↔ API identities with precise paths/record counts and redact data. Never bypass permissions, change page caps, extend endpoints or re-purpose credentials. Unknown schema is a blocker, not a reason to fabricate a mapping.
5. Do **not** call these paths from the H5 fast-runner; Production evidence remains an independent gate.

## 7. H5/MP architecture boundary

This repository is **ordinary Vue3 uni-app** using its Vite-based CLI; it is not uni-app(x). H5 renders in the browser, while WeChat MP is compiled into platform WXML/WXSS/JS and uses different native component, routing and lifecycle behavior. Explicit platform adapters/conditional compilation are necessary where behavior differs.

Review guidance: [uni-app compiler](https://uniapp.dcloud.net.cn/tutorial/compiler), [framework](https://uniapp.dcloud.net.cn/frame.html), [platform differences](https://uniapp.dcloud.net.cn/tutorial/platform). A Chromium screenshot can accelerate layout iteration but **cannot close** MP keyboard/scroll/canvas/permission or physical tap/legibility gates. For platform-sensitive UI also inspect the **compiled** WeChat target and actually interact in DevTools.

## 8. Evidence contract and promotion decision

For every local run post a short, sanitized report:

```text
TASK_AND_ACCEPTANCE_BOUNDARY:
EXACT_WORKTREE_BRANCH_SHA_DIRTY:
LANE_AND_AUTH_MODE:              # A, B or C; distinguish local / prior / unknown evidence
EXACT_COMMAND_AND_CONFIG:
FIXTURE_AND_VIEWPORT:
DURATION_AND_CACHE_CONDITION:
RESULT_PASS_FAIL_SKIP:
FIRST_FAILURE_AND_REPRO:
BROWSER_CONSOLE_PAGEERROR_NETWORK: # scopes measured; unknown != zero
ARTIFACTS:                       # local paths / sanitized evidence refs only
EXTERNAL_PRODUCTION_CALLS:
PRODUCTION_BUSINESS_WRITES:
H5_MP_DEVICE_COVERAGE:
NEXT_OWNER_AND_DECISION:
```

Use evidence tags `CODE_VERIFIED`, `LOCAL_RUN_VERIFIED`, `PRIOR_LIVE_EVIDENCE`, `UNKNOWN`. Lead classifies the gate explicitly:

- **PASS:** required scoped tests actually ran, the observed interaction matches expectation, and no relevant failed/skipped required cases.
- **PARTIAL:** lane works but some required paths/skips/gates are untested; describe missing evidence.
- **FAIL:** any required assertion/interaction is red, or security/runtime condition blocks the specified path.
- **BLOCKED:** cannot safely obtain required authorization/environment. Do not change the gate to pass based on a separate lane.

## 9. Recorded baseline and follow-ups (2026-10-23; not permanent allowances)

Two sequential local runs at `9f02d6fc`:

| Suite | Run 1 | Run 2 | Honest status |
| --- | ---: | ---: | --- |
| Main H5 boot | 5.80s, 4/4 | 5.47s, 4/4 | PASS |
| Main H5 Mock | 250.34s, 28 pass / 6 fail / 1 skip | 250.80s, same | **FAIL** |
| Repeat isolated UI | 2.49s, 4/4 | 2.48s, 4/4 | PASS (component only) |

First local boot to visible Login CTA: 1.997s after dependencies were cached; navigation-to-first-paint: 0.914s; warmed same-server reload: 0.182s. These are **not true cold-cache** numbers. Nineteen Mock network evidence artifacts had no reported external attempts/console/page errors; there was **no consistent whole-suite aggregate**, so do not assert global zero.

**Current six main-App failures to diagnose (not ignore):**
- 2 × `m1-r1-contract-preview.spec.ts` expected “步骤 2/3”, actual “当前阶段 02 / 03”. Verify approved product copy before editing.
- 4 × `main-app-quotation.spec.ts` timeout waiting for `[data-testid=app-action-content-heading]`. The shared `AppActionContentHeading.vue` still defines this test ID; inspect actual navigation, descriptors, conditional branches and trace/DOM before altering selectors or UX code.

**Next actions:**
1. Codex local: focused, redacted trace/DOM diagnosis of the 4 missing-heading failures; verify canonical copy behind the other 2. Avoid repeated full ~250s runs until root cause fixed.
2. Lead: independently review diagnosis, approve a scoped correction and tests. Re-run exact affected tests, then a full Mock suite before lifting its FAIL gate.
3. Consider consistent machine-readable first-paint, network and console aggregates **only as a small enhancement to existing Playwright reports**; no second harness.

**Unresolved:** H5 real Auth+Mock CORS/login timings, opt-in `MOCK-021` main-App coverage, physical-device UX. Existing `#205` remains Draft; Stage 1 FAIL; no merge/deploy or Production business write authorized.

## 10. Anti-patterns (stop and report)

- Starting `dev:mp-weixin:prod-readonly` or connecting a real DB as a “fast” default.
- Turning off network/command guards, changing domain/AppID validation persistently or injecting quick-login into a production build.
- Treating H5 pixels or isolated component tests as MP / whole App / user-device acceptance.
- Running the full Mock suite after every small edit **while skipping** the failing browser scenario, or hiding the known six failures.
- Editing brittle assertions/selectors without trace-supported behavioral intent.
- Overwriting worktrees, clobbering review artifacts, printing env values, or creating duplicate Mock architecture.
