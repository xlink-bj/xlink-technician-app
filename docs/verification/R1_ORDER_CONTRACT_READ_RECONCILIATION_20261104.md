# R1 Order / Contract read reconciliation — 2026-11-04

**Status:** source-audited and locally code-tested; live Production data verification **NOT RUN**. The Production Contract route remains blocked by the frozen M1-I8 safety baseline. This is not an Owner business or commercial acceptance.

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

- The adapter builds only the exact R1 Contract status body above, with no extra filters, query string, `_all`, wider page, or alternate method. The Production transport still rejects `basic/contract/query.do` before network dispatch; the query can run only under the isolated DEV synthetic Contract gate.
- The existing Order path requires a WorkOrder already present in the current authenticated role list and rechecks WorkOrder membership, session, user, role and role version after the response. This Order guard does not grant Contract API access.
- The adapter first verifies the exact selected `type=1` Order from the same bounded WorkOrder list. It then retains only Contracts whose `serviceAppointmentId` and `orderId` match that WorkOrder and Order. If the Order supplies `contractId`, only that exact Contract ID can be surfaced.
- This check does not establish a persisted relation between a standalone `type=0` Quote and a `type=1` Order. No such linked records were read, so Quote → Order lineage remains unknown.
- Duplicate or malformed IDs and contradictory ownership fail closed. A bounded empty result stays `bounded_unverified`; it does not say that no Contract exists.
- When the DEV synthetic gate is active, only sanitized status metadata is projected. PDF/QR URLs, contact and signer data, raw workflow nodes, and Contract/signature commands are not returned or invoked. Production/Beta business writes remain disabled.
- Order browse now distinguishes captured `amount` and `totalAmount`, checks the R1 package/procedure minimum rules, and marks incomplete or inconsistent line pricing as unsupported. It never presents live catalog `price` as an Order amount.

## Verification performed

- Focused Vitest: **6 files, 94 tests passed** (`quotation-order-read`, Contract boundary, Production read-only, offline fixture, WorkOrder detail semantics, and mobile craft boundaries).
- TypeScript: `pnpm run typecheck` **PASS**.
- `git diff --check` **PASS**.
- `pnpm run verify:full`: **PASS**, 188 files / 1,671 tests plus all repository source, boundary and quality checks.
- Real main-App H5 Playwright: **61 passed, 25 skipped, 0 failed** from the 86-case configured run. It included Contract preview at 375/390 and the 430×932 verified Order → C01 → Order hub return flow. A final targeted rerun after the last adapter changes also passed **4/4**. The browser blocked every external origin; fixture data stayed local.
- Screenshot reviewed at 430×932: `test-results/main-h5-mock/evidence/r1-order-contract/m3-signing-read-430x932.png`. A 375px Contract preview is at `test-results/main-h5-mock/evidence/r1-order-contract/m1-contract-read-375.png`.
- No Production request or business write was issued.

## Outstanding evidence

- Current local browser has no authenticated R1 Technician session, and no current approved WorkOrder/Order/SPU sample IDs were supplied for this check. No live Production read was attempted; the prior bounded SPU approval does not supply a current sample ID or authorize catalog discovery.
- Therefore current tenant payload parity, actual Contract visibility for a technician role, real SKU → Order → Contract linkage, and Quote → Order lineage remain **NOT VERIFIED**. Synthetic fixtures and pinned source do not substitute for that evidence. The Production route gate must not be loosened until the exact sample and live scope are reviewed.
- Before interpreting a live response, provide a current role-visible sample (or use an already-authorized session and exact record IDs) and retain only redacted identity-match outcomes. Never broaden the query to discover a sample.
- No signing, document access, Order/Contract/Workflow mutation, deployment, or main merge is part of this verification.
