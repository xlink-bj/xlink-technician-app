# R1 Order / Contract read reconciliation — 2026-11-04

**Status:** source-audited and locally code-tested; the Owner-authorized bounded Production Order/Contract read **COMPLETED**. R1 login omitted `roleVersion`; the shared session identity represents that field as explicit `null` and still requires the real session, user and current role. One current-role-visible WorkOrder, one type=1 Order and one exact bounded R1 Contract query were verified. The App Production Contract route remains blocked; the one Contract read was performed only by the fixed-scope local audit runner. This is not an Owner business or commercial acceptance.

## Pinned sources

- R1 frontend: `xlink-bj/xlink-app@6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d`, primary Technician pages `business/subpackages/order/placeOrders.vue` and `business/subpackages/serviceAppointment/serviceAppointment.vue`.
- Existing backend: `xlink-bj/xlink-cloud-backend@5fc008d32e771205260f120621c1c4fc62d0824e`, `modulemini/basic/ContractController.java`, `service/basic/ContractServiceImpl.java`, `framework/util/FlipPageInfo.java`, and `framework/mongodb/EMongoTemplate.java`.
- Both checkouts were inspected read-only. No R1 or backend files were changed.

## Confirmed source relationships

1. The R1 WorkOrder detail's Contract list uses `basic/contract/query.do` with `serviceAppointmentId`, `state=1 OR exts.contractStatus=-2`, newest-first. The backend Contract controller adds the current account tenant scope. The primary Technician page is the source for this query; the alternative `workOrderId` page is not interchangeable.
2. The backend treats `_all=1` as “expand rows to total”. A real bound therefore omits `_all` and fixes `page=1, rows=3`. A three-row response is a limited sample, not a complete Contract inventory.
3. R1 Order line fields are historical snapshots. `amount` is the captured unit price and `totalAmount` is the persisted line amount. Current catalog `price` must not fill either field. Package/procedure subtotals may use their R1 minimum-price floor; material, SKU and measure totals use the captured unit amount and quantity. Order-level `originPrice` / `totalPrice` remain separate from row pricing and global discounts/coupons.
4. R1 material SKU rows carry the SKU row ID and parent `spuid`. A returned SKU label or current catalog price alone is not enough to establish a saved Order line's SKU price or parent.

## Implemented read boundary

- The adapter builds only the exact R1 Contract status body above, with no extra filters, query string, `_all`, wider page, or alternate method. The Production transport still rejects `basic/contract/query.do` before network dispatch; the query can run only under the isolated DEV synthetic Contract gate or the specifically authorized local audit runner.
- The reusable in-memory session identity is implemented in `src/shared/session-authorization.ts`. Ordinary role-scoped reads require the actual session reference, user ID and current role ID; they include an R1 role version only if login supplies one. Missing `roleVersion` is represented explicitly as `null`, never inferred from `Role.updateTime`. Signing review retains a separate strict versioned identity requirement. This identity is a cache/read fence, not a permission grant.
- The existing Order path requires a WorkOrder already present in the current authenticated role list and rechecks WorkOrder membership, session, user, role and any supplied role version after the response. This Order guard does not grant Contract API access.
- The adapter first verifies the exact selected `type=1` Order from the same bounded WorkOrder list. It then retains only Contracts whose `serviceAppointmentId` and `orderId` match that WorkOrder and Order. If the Order supplies `contractId`, only that exact Contract ID can be surfaced.
- This check does not establish a persisted relation between a standalone `type=0` Quote and a `type=1` Order. No such linked records were read, so Quote → Order lineage remains unknown.
- Duplicate or malformed IDs and contradictory ownership fail closed. A bounded empty result stays `bounded_unverified`; it does not say that no Contract exists.
- When the DEV synthetic gate is active, only sanitized status metadata is projected. PDF/QR URLs, contact and signer data, raw workflow nodes, and Contract/signature commands are not returned or invoked. Production/Beta business writes remain disabled.
- Order browse now distinguishes captured `amount` and `totalAmount`, checks the R1 package/procedure minimum rules, and marks incomplete or inconsistent line pricing as unsupported. It never presents live catalog `price` as an Order amount.
- A separate local audit runner and request guard were added for the Owner-approved read method. It defaults to zero network. It reads the current role tree once, scans role-visible WorkOrder pages sequentially (`rows=3`), and checks at most three type=1 Orders for each WorkOrder in page order, stopping at the first WorkOrder with a formal Order. If the role-visible list ends first, it stops without a Contract read. It then allows one exact R1 Contract status query (`page=1, rows=3`) for the selected WorkOrder. Repeated role-tree resolution uses an in-memory response from the same run; raw responses and IDs are not persisted. The pagination query is fail-closed on duplicate rows, page errors, unexpected routes and incomplete session/user/role identity. The shared POST transport encodes a bodyless Role-tree request as an empty string; the local guard accepts only that representation or `undefined`, with no extra Role-tree fields. It does not change the App Production route allowlist.

## Verification performed

- Focused Vitest: **7 files, 50 tests passed**, covering canonical session identity, WorkOrder scope invalidation, Order handoff, strict catalog versioning, raw Order transport and the bounded reader request guard.
- `pnpm run verify:r1-order-contract-read -- --preflight-only`: **READY_NO_NETWORK**; zero requests.
- `pnpm run verify:full`: **PASS**, 190 test files / 1,684 tests plus source, boundary, type and quality checks.
- Production-context H5, MP-Weixin and App builds: **PASS**. No WeChat DevTools, native simulator or device session was opened.
- Real main-App H5 Playwright: **61 passed, 25 skipped, 0 failed** from the 86-case configured run, including the 430×932 WorkOrder → Quotation → Order/Contract read-only path and existing dynamic-form scenarios. The suite uses the actual app in DEV Mock; it does not substitute for the separately recorded Production bounded read.
- H5 screenshots generated by the suite include `test-results/main-h5-mock/evidence/r1-order-contract/m3-signing-read-430x932.png` and `test-results/main-h5-mock/evidence/r1-order-contract/m1-contract-read-375.png`; they remain local review artifacts.
- `git diff --check`: **PASS**.
- Latest authorized bounded Production run: login **1**, role-tree read **1**, WorkOrder pages **1** (`rows=3`), type=1 Order queries **1** (`rows=3`), Contract queries **1** (`page=1, rows=3`), unexpected blocked attempts **0**, business mutations **0**. Login returned a technician role but omitted `roleVersion`; the shared identity represented the missing version as `null` and retained session/user/role checks. The first local rerun exposed a request-guard mismatch: the shared POST transport encodes the bodyless Role-tree request as an empty string. That attempt stopped locally before sending the Role-tree request; the exact empty-body representation was added to the guard and regression-tested before the successful run. No session token, raw response, phone number or business IDs were persisted.
- The bounded association checks passed: the selected WorkOrder was role-listed; the selected Order returned as type=1 and matched that WorkOrder; the bounded Contract result matched the WorkOrder and Order, and `Order.contractId` matched the Contract ID exactly. One Contract row was returned, with `state=1`, `exts.contractStatus=10`, and a signed date present. Contract completeness remains **BOUNDED_UNVERIFIED**. Order pricing projection returned 3 lines: 1 supported and 2 unsupported; 1 line carried captured price and SKU/SPU identity. Monetary values and raw business data were not retained. Quote type=0 was not queried.

## Outstanding evidence

- The sample establishes current technician visibility and one exact WorkOrder/Order/Contract identity match. It does not establish Contract inventory completeness, other records, catalog price validity beyond the supported line, tenant-wide parity, or Quote → Order lineage. Quote type=0 was not read.
- The App Production Contract route remains closed. The audit runner's single fixed-scope Contract query does not enable general Contract reads, PDF/QR access, signing actions or business writes. Do not broaden to another role, tenant, endpoint, page size or record-discovery method without separate scope.
- No signing, document access, Order/Contract/Workflow mutation, deployment, or main merge is part of this verification.
