# M1-S1 / L01 — Source-verified manual login business preflight

Source of truth: R1 `xlink-app@6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d`, `business/subpackages/login/loginAuth.vue:300–323`, Codex #120 `CONTRACT_MATRIX L01`.

## Narrow scope / provenance

R1's **manually typed** phone login preflight requires an 11-digit mobile string and a six-digit SMS code. Before this PR the real main App `src/features/session/login.ts` only verified nonblank fields, while the H5 login form allowed 32/16 characters. The new `r1-manual-login-preflight.ts` is a pure, side-effect-free validator used at the manual UI's `submit()` before the existing `submitLogin()` call. The login Auth Port/wire endpoint, tenant, token/session, production role, and QUICK login path remain untouched; the "request SMS" button remains disabled.

Contract classification: **R1 SOURCE_VERIFIED / MAIN_APP_CODE_IMPLEMENTED / LIVE_MANUAL_LOGIN_NOT_RUN**. Test phone/code strings are entirely synthetic; not actual user credentials. This does not prove an external SMS sent/received or production authentication.

## Deliberately separate gates

- L02 explicit legal/privacy agreement checkbox remains **OWNER_PRODUCT_DECISION / NOT_IMPLEMENTED**; R1 uses a checkbox but the new product currently uses implicit agreement copy. This PR must not silently decide legal consent behavior or redesign the screen ahead of S2.
- L03 server `success=false`/token shape, reauth/restored session strategy and expired session remain separately tracked; no claim that real persisted login is verified.
- Quick-login continues to use separately DEV-gated preexisting test credentials; new validator covers **manual form only**.
- No Production/Beta login, credentials, Mongo reads, backend changes, writes, PR merge or release.

Verification to record on **exact head**: `pnpm verify`, core unit and H5 main App tests, MP-WEIXIN and native App bundles. No physical runtime acceptance (S3).
