# R1 L02 — Manual authentication consent boundary

Parent R1 P1 [Draft #179](https://github.com/xlink-bj/xlink-technician-app/pull/179) pinned `1082a24d27c0e09e3c5faaec8fca38e140cc0f60`. R1 original: `xlink-app@6c0a97b/business/subpackages/login/loginAuth.vue:324–349`, which requires an affirmative privacy/user-agreement checkbox before `index/phoneLogin.do` dispatch. **Source-backed policy requirement** does not justify reusing the legacy FSgo legal domain in XLink's new App.

## Implemented, synthetic only

- Manual login has explicit consent `checkbox-group` and independent readable Privacy/User Agreement routes. URLs come **only** from `VITE_XLINK_PRIVACY_POLICY_URL` and `VITE_XLINK_USER_AGREEMENT_URL`. Both require HTTPS, no embedded userinfo, unsafe ports, fragments, or reserved invalid hosts. The new `/pages/legal/legal` route shows configured policy content in `web-view` (WeChat domains must be registered by the Owner).
- When either URL is missing, manual login fails closed with `policy_unavailable` and **zero Auth Session transport calls**. Checkbox has no viable acceptance when the documents are absent. An unchecked form fails with `consent_required`.
- Feature boundary `submitR1ManualLogin` calls existing `submitLogin`/Session Port only after both policies and explicit acceptance; consent/URL is **not** added to phone-login payload, persisted token or session.
- Existing DEV-only Quick Login remains a **separate path**; password login and SMS-send button remain unavailable until R1 Auth method & side-effect source evidence and real environment permissions can be verified. This does not claim login flow is now R1-equivalent.
- Unit tests cover malformed/unapproved URLs, lack of consent/docs, zero Auth dispatch, positive synthetic delegation and quick-login isolation. H5 browser tests render the real uni-app manual Login page with **all external requests blocked**, two viewports and missing-policy failure. Test does not send OTP or touch production.
- All original 12 Goldens and previously approved H5 Mock six-stage flows remain regression gates. No backend, schema, non-login functionality, production calls or main merge.

## Configuration gates to be addressed by Owner before actual login release

1. Approve XLink legal entity, Privacy and User Agreement contents and HTTPS hosting. **Do not copy old R1/FSgo URLs without legal confirmation.** Configure both URLs as public Vite build settings. Legal Web-view domain access must be configured in the WeChat developer platform for MP-weixin.
2. Confirm R1 token/tenant/method mapping, password support and SMS request path with authorized tests. Do not enable `获取验证码` based on a guessed service.
3. Only after both policy links work in each device and corresponding auth contract tests pass, can legal/manual login UX be considered usable. Current H5 with no settings intentionally displays `登录协议尚未配置`.
4. The separate Production read-only Quick Login exception does not authorize business writes, contract signing or role changes.

**Acceptance is engineering gate PASS, NOT login real-account parity.** Any local simulator issue should link the pinned source line and redact identity/OTP.
