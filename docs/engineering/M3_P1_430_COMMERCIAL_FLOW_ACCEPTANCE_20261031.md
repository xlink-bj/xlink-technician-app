# M3-P1 — 430×932 Commercial Journey / Acceptance Evidence

> **Status:** local H5 Mock engineering acceptance PASS; **not** Product Owner visual sign-off, native WeChat device acceptance, Production live-read acceptance, or permission to write business data.
> **Base:** `main@9b59f7b464b24f71d5a74e2ed6b4153fc596c1fd` after M3-P0-A/B/C.
> **Change boundary:** one additive commercial-flow browser spec and an H5-only navigation-height correction for Appointment and its confirmation page. No R1 API/wire, Workflow, prices, SKU contract, authorization, schema or Production/Beta command changed.

## Business path and identity gates

The main uni-app H5 shell uses synthetic `MOCK-019` at one Owner viewport, **430×932**:

1. **Appointment:** choose `需要上门`, pick a calendar day and time slot, persist local appointment notes, inspect the customer-facing confirmation, then return to edit. Do **not** invoke the real appointment-confirm command.
2. **Survey:** enter the next task for the same work order, verify saved appointment context, choose a repair part, confirm two editable media pickers, and enter measured area `18.5`. This is form and media-affordance acceptance, **not** a fabricated completed survey; mandatory media is not uploaded.
3. **Quotation:** carry appointment/survey context into the quotation workspace, create a repair group, select a source-shaped package and material/SKU choices, wait until the debounced `草稿已保存` indicator is visible, hard-reload, then explicitly resume the persisted local quotation from the Order hub. The persisted draft is labelled **非正式订单**; it is never treated as a formal order.
4. **Signing anti-forgery:** navigate with a forged `orderId` for `MOCK-019`; the readonly signing page must block it.
5. **Independent formal Order:** from the separate synthetic `04009` work order, navigate to its **verified** formal Order `BJ202610260001`, inspect matched contract `HT202610260001`, and assert signing/contract write controls remain disabled.

All screenshots come from the real uni-app main H5 page at 430×932, with Noto Sans CJK SC installed for Chinese glyph rendering. The browser test aborts any external origin request, records browser-console/page errors, and asserts zero. The DEV-only QA launcher is never present in commercial screenshots. Screens are attached to Playwright results, and local output lives under the ignored `.review/m3-p1/` directory:

| Screenshot | Business state | Engineering visual review |
| --- | --- | --- |
| `01-appointment-430x932.png` | Visit choice, selected time, saved local note and footer | H5 footer fully visible; customer data synthetic/masked |
| `01a-appointment-confirmation-430x932.png` | Date/time, customer summary and two actions | Both footer actions visible within viewport; confirmation submit remains Runtime-gated |
| `02-work-order-survey-430x932.png` / `03-survey-430x932.png` | Work Order task and survey fields | No debug text in commercial form; required media is not forged |
| `04-quotation-430x932.png` | Grouped catalog/package/material local draft | Business amount/order identity not invented; draft is not a formal Order |
| `05-forged-order-blocked-430x932.png` | Forged Order identity | Fail-closed readonly error, no verified Order |
| `06-signing-readonly-430x932.png` | Independent formal Order and matched contract | Status, Order/contract identity and `全程只读` clearly visible |

## H5-only defect fixed

The shared `ActionWorkspaceShell` initially used `height: 100vh` for Appointment and confirmation. In uni-app H5, `uni-page-head` already occupies **44px** above that page: the footer was clipped below the 430×932 visible area despite functional click targets. A scoped `h5NavigationFit` prop now subtracts the header only on Appointment and its confirmation. The existing Survey and Q01 rules remain unchanged, as does the MP/App height. The new Playwright spec asserts the entire footer is in the viewport on both pages, making this regression detectable automatically.

## Verified gates and boundaries

| Gate | Evidence |
| --- | --- |
| `tests/h5-main-mock/m3-p1-commercial-journey-430.spec.ts` | PASS, 430×932 real H5 + local synthetic fixture, zero external HTTP, zero page/console errors |
| Existing M3 Q02/Q03 and C01 browser regressions | PASS together with new spec: **3/3** Playwright scenarios |
| `CI=true VITE_XLINK_ENVIRONMENT=test corepack pnpm run verify:full` | PASS: 173 Vitest files / **1,546 tests**, M1/M2 dependency and ownership guards, UX governance, Vue typecheck and EQ01 static quality gate |
| Release H5 / MP-WEIXIN / App builds | **PASS** (all three); H5 QA-route exclusion, MP QA-route exclusion, MP bootstrap and emitted WXSS guards PASS. Compilation is not physical-device acceptance |
| Product Owner visual sign-off against accepted R2 | **PENDING** — engineering screenshot review cannot replace Owner acceptance |
| Native WeChat DevTools, iPhone 14 Pro 430×932 | **NOT RUN here** — requires the Mac/WeChat native simulator |
| Live Production read-only request against scoped authenticated user | **NOT RUN** — this worktree has no authorized Production credentials; synthetic tests are not live evidence |
| Beta/Production business writes | **NOT AUTHORIZED / NOT ATTEMPTED** |

### Reproduction

```bash
# Requires Playwright v1.63 browser 1243 and fonts with CJK glyph support.
CI=true PLAYWRIGHT_BROWSERS_PATH=/path/to/browser-cache \
  corepack pnpm exec playwright test \
  --config config/playwright/main-h5-mock.config.ts \
  tests/h5-main-mock/m3-p1-commercial-journey-430.spec.ts \
  tests/h5-main-mock/m3-quotation-navigation-430.spec.ts \
  tests/h5-main-mock/m3-signing-read-430.spec.ts
CI=true VITE_XLINK_ENVIRONMENT=test corepack pnpm run verify:full
```

## Remaining acceptance before M3-P1 final close

1. On the Mac, set the WeChat DevTools simulator to **iPhone 14 Pro, 430×932** and compare the same Appointment, confirmation, Survey, Q02/Q03 and C01 screens against accepted R2 commercial screenshots. Explicitly check fixed footer, scrolling, touch targets, safe area, Tab alignment, no developer controls, and no visual difference between business Mock and real read-only rendering.
2. In the already authorized Production read-only environment, verify login/session and scoped Work Order → source-backed Order → matching contract read; confirm zero mutating business commands/uploads. Do not create or sign orders, appointments or Survey media on Production.
3. Record Product Owner visual approval separately from CI and compile gates. Only after these checks may M3-P1 be marked fully accepted; a Draft PR or passing local H5 suite is not an Owner sign-off.
