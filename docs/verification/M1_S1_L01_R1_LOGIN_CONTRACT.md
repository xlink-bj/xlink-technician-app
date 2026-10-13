# M1-S1 / L01 — R1 manual login source contract

**Pinned source:** `xlink-app@6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d`, `business/subpackages/login/loginAuth.vue:300–323`. Codex evidence: #120 L01.

## Business preflight: manual SMS login only

R1 validates mobile format with the exact JavaScript expression `/^1[3-9]\\d{9}$/` and SMS verification code with `/^\\d{6}$/` (R1 method='1'). A non-empty string of 11 digits beginning with 0, 2 or 12 is **not** an R1-valid phone. R1 also checks `loginRead` consent separately.

The actual App manual form previously accepted any nonblank strings and allowed 32/16 input chars. `r1-manual-login-preflight.ts` now enforces both patterns before the manual `submitLogin()` network boundary; actual form limits input to 11/6. This is a source-derived syntax rule, **not** an assertion of Production authentication success or OTP delivery.

## Non-goals, provenance and safety

- Local developer-only Quick Login remains on its existing independent configured input/permission gate; do not enforce the manual R1 regex on its synthetic test data.
- R1 L02 agreement checkbox is not silently added here; requires separate Owner decision and accessible legal documents before launch. The current implicit agreement text is a known UX/compliance gap.
- L03 Production session restoration, response error/identity semantics and R1 password method remain independent S1 issues.
- The SMS-request button stays disabled; no actual SMS issuance, login API invocation, Production data access, role switching, account mutation, backend change, main merge or release.
- Scope confidence: `R1 SOURCE_VERIFIED / APP_CODE_TESTED / LIVE_MANUAL_AUTH_NOT_RUN`.

Exact-head CI: Verify (unit / type / boundaries / MP/App builds) and Main App H5 / G4-F browser regression must finish **PASS** before claiming engineering CODE_PASS. Physical WeChat/Android/iOS validation belongs to S3.
