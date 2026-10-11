# M1 P1.8 — WorkOrder-scoped type=1 Order review read boundary

**Scope:** New App repository only, based on [Draft #87](https://github.com/xlink-bj/xlink-technician-app/pull/87) exact `5afecb5765a0ea18124fe1a3b8f4dcfd1a8c0cb0`. Related #39 Signing, #41 Quotation Owner UX, #75 SKU server ACL.

## Source defect and design response

The **existing** `QuotationOrderReadPort.getQuotationOrderById(id)` maps a relatively complete object: `bjProducts`, edit `replaceSnapshot`, customer-related fields and media references. That is appropriate for the *existing guarded Quotation submission/readback/edit contract*, but must **never** be borrowed as a Signing read port. Its arguments contain no WorkOrder identity; the backend `basic/order/queryById` ownership policy has not been source-verified, so calling it directly from Signing could access a foreign Order before a client post-check.

We add a separate **noncommercial** read contract, `readScopedTypeOneOrderForSigningReview(workOrderId, orderId)`, returning `ScopedSigningOrderReviewRead`. The only business object crossing this port is a sanitized `QuotationOrderBrowseItem` plus literal `contractReadAuthorized:false`, `signingAuthorized:false`. The existing Quotation edit/readback contract remains unchanged.

## Default-deny admission

- The new port **cannot dispatch by default**. Existing `createQuotationOrderReadAdapter(transport, isListed)` caller has no third `getCurrentAuthorizationIdentity()` provider, so the new method always rejects before transport.
- A future explicitly reviewed caller would need to supply a current **ephemeral authenticated session/user/role/version fingerprint**, and `isWorkOrderListedForCurrentSession(workOrderId)` must pass before and after the single `basic/order/queryById` request. Only IDs with bounded `[A-Za-z0-9_-]` shape pass; no listing, auth fingerprint, arbitrary id or stale role => no result.
- **Return validation:** requested Order ID exactly equals returned `_id`, `Order.type===1` and `Order.serviceAppointmentId===requestedWorkOrderId`. Identity and listed WorkOrder must remain valid after the await.
- **Data minimization:** no raw `bjProducts`, `replaceSnapshot`, source PDF URLs, `qiniuList`, phone, personally identifiable fields or unreviewed Contract data are projected. The presence of a quotation PDF yields only `present_no_access` for display. Backend exceptions and malformed payload messages are sanitized.
- **Never** creates an Order, Contract, Workflow transition, electronic signature, SMS or PDF; does not infer that `Order.type=1` is itself proof of permission to sign.

## What is NOT claimed

**Client preflight is not server authorization.** Even the scoped method issues `basic/order/queryById` when a future caller supplies both admission inputs; its server-side `Order` ownership enforcement is still UNKNOWN. **Do not wire the method into a Production/Beta Signing UI** or supply a Production identity callback until the backend ACL/role audit and separately approved bounded read gate. In the current composition, the identity provider is deliberately **absent**. This is a safely non-executable adapter seam, not actual Production signing read access.

The existing `getQuotationOrderById` is separately needed for quotation submit/edit/readback, where the Business E2E write gate remains closed. This patch does not silently alter that original behavior. The historical Signing Mock is still separate, synthetic, no network.

## Automated acceptance

`tests/g4f/quotation-order-signing-read-boundary.test.ts` covers: fail closed with no provider; WorkOrder not listed; malformed/foreign ids; sanitized successful projection; exact Order identity; foreign owner/type0/unknown type; role/session/version changes during await; lost WorkOrder authorization during await; thrown error redaction; only one authorized read URL and zero Contract/Sign/PDF/Workflow requests; noninterference with the original Quotation `getById` method.

Full exact-head check is mandatory: Vitest, strict TypeScript, architecture and UX boundaries, WeChat MP + App builds, **actual** main H5 DEV Mock Quotation→Signing and four-screen Owner visual prototype, G4-F legacy H5. All remain Draft; no Production/Beta business read/write, no device test, no merge.

## Next gate

1. **Backend #39:** verify `basic/order/queryById` authenticated principal/tenant/current role/authorized ServiceAppointment/Order ownership *before* database fetch; verify Contract queryById binds explicit authorized `OrderId` and applicant/recipient/Workflow actor. Confirm whether PDF preview, status readback or send calls have side effects.
2. **Backend #75:** WorkOrder-to-Material SPU entitlement, role+tenant filtered GoodsService and CodeService, before live SKU readers.
3. **Owner #41:** visual approval of Workbench→Catalog→Configure→Return before commercial Quotation UX implementation; this patch doesn't change UI.
4. **Native #64:** real WeChat/Android/iOS runtime QA remains NOT RUN.

**Gate:** `SCOPED_ORDER_DISPLAY_READ_CODE_PENDING_CI / DEFAULT_DENY / BACKEND_ORDER_ACL_UNVERIFIED / SIGNING_DISALLOWED / DRAFT_NO_MERGE`.
