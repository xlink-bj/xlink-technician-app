# G4-F Phase 1H — Quotation Engine Completion

Status: implementation evidence for Web Review; no quotation/order mutation was executed.

## Scope and source provenance

- Technician implementation BASE: `50ab6431f74bba81c0de58eec41bc6498c75fc19`.
- R1 front-end source: local `main` snapshot `6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29`, `business/subpackages/order/placeOrders.vue` (`amountToFixed`, `submitOrder`, `fillOrder`, `calcTotalPrice`, `openPackage`, `packagesConfirm`, and type-1 request construction).
- Backend source: local `main` snapshot `5fc008d32e771205260f120621c1c4fc62d0824e`, `Order.java`, `OrderController.upsert`, and `OrderServiceImpl.upsert` / Order PDF projection.
- The inspected reference worktrees contain unrelated local files; none were read as contract evidence or modified. Their remotes could not be revalidated from the available GitHub account during this slice, so the source SHAs above are the precise local evidence snapshots, not a claim of fresh remote-head verification.
- No Beta or Production API was contacted.

## Pricing Authority Matrix

| Rule | Evidence in active R1 client source | Classification | Phase 1H behavior |
|---|---|---|---|
| Package base/unit price | `calcTotalPrice()` starts from `item.price`; type-1 composition stores row `amount` and `totalAmount` separately. | `CLIENT_SOURCE_VERIFIED` | Read current package price during hydration; no price is persisted in draft. |
| Package selected-material markup | R1 sums selected package material `exts.price` values greater than zero, adds them to package `price`, then multiplies by package quantity. | `CLIENT_SOURCE_VERIFIED` | Pricing uses only currently hydrated selected rows and their `exts.price`. |
| Package minimum price | R1 applies `minimumPrice` when package amount × quantity is below the minimum. | `CLIENT_SOURCE_VERIFIED` | Apply that floor; source-precision minimum is retained until R1 aggregation rounding. |
| Procedure guide unit price | R1 uses `guideUnitPrice × number`; each submitted row carries unit `amount` and computed `totalAmount`. | `CLIENT_SOURCE_VERIFIED` | Current provider value is hydrated; row total follows R1 amount rounding. |
| Procedure minimum total | R1 substitutes `minimumGuideTotalPrice` when guide price × quantity is lower. | `CLIENT_SOURCE_VERIFIED` | Apply the source minimum; do not infer one when absent. |
| Direct Material price | R1 uses `price × number` when no SKU rows are present; otherwise it calculates from SKU rows. | `CLIENT_SOURCE_VERIFIED` for the direct non-SKU branch | Direct price is allowed only when current material has no `spuId`; SPU/SKU-dependent rows fail closed. |
| Measure / 机措 guide unit price | R1 uses `guideUnitPrice × number`; no minimum is applied in the inspected calculation. | `CLIENT_SOURCE_VERIFIED` | Use current hydrated guide unit price and R1 rounding. |
| Category, group, and gross totals | R1 rounds row/category values with `amountToFixed`, sums categories into each repair-part group, then aggregates groups. | `CLIENT_SOURCE_VERIFIED` | Deterministic category → group → gross aggregation; these are local estimates, not server-authoritative totals. |
| Discount, coupon, preferential amount | R1 has discount/coupon/preferential calculations, but Phase 1H draft has no verified input model or user intent for them. | `UNRESOLVED` | Excluded from calculation. Encoder uses only the neutral no-discount/no-coupon representation already supported by the type-1 construction path; no discount behavior is implemented. |
| Server recalculation / authoritative pricing | `OrderServiceImpl.upsert` stores the supplied `totalPrice` and `bjProducts`; inspected backend path has tenant pre-script execution whose arbitrary behavior is not established here. The PDF projection reads category `totalAmount` values; that is not proof of server-side price validation. | `UNRESOLVED` | Never call totals server-authoritative. Real writes remain unauthorized. |

### Money precision

R1 helper is `Number((+money).toFixed(2))` with a zero fallback. Phase 1H mirrors this exact JavaScript behavior at the same row/category/group/gross boundaries. It does not introduce decimal-scale restrictions, a new currency model, or a different rounding mode. Preview precision is two decimals; encoded amount precision follows the R1 calculated row/category values. The binary floating-point behavior of JavaScript `toFixed` is intentionally preserved for parity (for example, `1.005` follows the runtime's `toFixed(2)` result).

## Validation contract

`validateQuotationDraft()` is a domain function separate from Vue. It returns structured issues with phase/code, field, group identity, and selection identity where applicable. It verifies:

- non-empty repair-part path, part description, and positive finite engineering quantity;
- at least one selected category in every group;
- when there is no configured Package, at least one Procedure and one Material (Measure alone cannot satisfy this rule);
- positive finite quantity for every selected item;
- a configured Package has provider-backed component identities and at most one selected material per exact layer value;
- a restored schema-v2 Package without configuration is blocked until the user explicitly reconfigures it.

No decimal scale or business-specific quantity rounding is inferred.

## Provider hydration

`hydrateQuotationDraft()` receives only the grouped draft, Work Order-derived `QuotationCatalogContext`, and the read-only `QuotationCatalogReadPort`. It requests only catalog kinds present in the draft, matches exact provider IDs and kind, and fails closed on unavailable, missing, or mismatched identity. For each configured Package it reads current Package Detail and verifies detail identity plus every selected child row by provider component/reference ID, catalog ID, and exact layer value. It never replaces a vanished selection with a similarly named item. It does not mutate the composition store or persist commercial data.

Draft schema remains v3. Provider price/cost values are transient hydrated data and do not enter `quotationDraftRecordFor()` output.

## Pricing behavior

Implemented source-backed rules:

- Package standard path: `(package.price + sum(selected material exts.price where > 0)) × quantity`, then `minimumPrice` floor.
- Package `pricingMethod === '1'`: blocked; SKU pricing is outside this phase. Missing pricing method is also blocked.
- Procedure: `guideUnitPrice × quantity`, then `minimumGuideTotalPrice` floor.
- Direct Material: `price × quantity`, only when no SPU/SKU identity is present.
- Measure: `guideUnitPrice × quantity`.
- Totals are returned per selection, per category/group, and overall. Missing/invalid price is not treated as zero.

Two deliberate encoder boundaries remain fail-closed: SKU-based Package rows cannot be priced here, and configured Package material quantities are not encoded because active R1 derives them with `ceil(package quantity × coefficient / material spec)`, a calculation the Issue explicitly did not authorize. Such a Package may have a local price preview from source-backed fields, but it cannot produce a ready Order payload. This is not synthetic fallback.

Discount/coupon/preferential behavior and server-side authoritative recalculation remain `UNRESOLVED`, and are not implemented.

## Official Order type=1 encoder

`encodeR1OfficialOrderType1()` is a pure function. It independently revalidates hydrated group readiness and recalculates/compares the supplied pricing result before returning `ready`; inconsistent or incomplete data returns structured blocking issues. Its sanitized shape is:

```text
type: 1
serviceAppointmentId
productIds: "[]"
bjProducts: JSON.stringify({
  orderList: [{
    repairParts, constructionLocation?, partDescription, maintainAreaNum,
    projPackages, procedures, materials, measures, totalAmount
  }],
  addItems, deleteItems, otherItemsAmount, preferentialAmount
})
originPrice / totalPrice (local calculated gross)
neutral no-discount fields
exts: serviceAppointmentNum?, serviceType, sourceType?, neutral coupon fields
```

`constructionLocation` is included only when the complete code-value path resolves through the supplied verified options. No construction-site, age-limit, owner PII, coupon selection, workflow ID, `isCreateBjdPDF`, SKU, or `skuCode` is fabricated. These omitted values and tenant-specific pre-script behavior remain outside this local encoder contract. The encoded object is an in-memory preview only; it is not sent anywhere.

Backend source confirms `Order.type=0` is the quote/demo type and `Order.type=1` is the official-order type. `OrderController.upsert` delegates to `OrderServiceImpl.upsert`; that path requires an existing active ServiceAppointment and persists Order state, updates appointment totals/payment state, and may generate documents/messages when `isCreateBjdPDF` is supplied. Accordingly the Phase 1H app adds no command or transport for it. Legacy `creatQuotation`, quote writes, workflow process/complete, confirmations, and Production/Beta activity remain out of scope.

## Test matrix evidence

| Issue #25 item | Regression evidence |
|---:|---|
| 1–11 | `tests/g4f/quotation-engine.test.ts` validation cases 1–11 |
| 12–17 | `tests/g4f/quotation-engine.test.ts` hydration cases 12–17 |
| 18–24 | `tests/g4f/quotation-engine.test.ts` pricing/rounding cases 18–24 |
| 25 | engine test 25; existing `tests/g4f/quotation-composition.test.ts` persistence exclusion assertion |
| 26 | engine test 26 |
| 27–32 | engine tests 27–32; H5 request guard in `tests/h5-review/g4f-quotation-phase1b.spec.ts` |
| 33 | existing Phase 1F unit/H5 tests in `tests/g4f/quotation-foundation.test.ts` and `tests/h5-review/g4f-quotation-phase1b.spec.ts` |
| 34 | existing Phase 1G tests in `tests/g4f/package-configuration.test.ts` and `tests/h5-review/g4f-quotation-phase1b.spec.ts` |
| 35–37 | existing schema-v2/v3 and flat-v1 recovery tests in `tests/g4f/quotation-composition.test.ts` |
| 38–40 | Phase 1H H5 test verifies local-only readiness/blocking copy, missing current source prices, no calculated gross when blocked, no submit/save CTA, and no external network |

The 37 new engine unit tests and existing Phase 1F/1G/draft-codec regressions together cover the 40-item contract. H5 uses deterministic synthetic rows and the existing Mock/source-backed app path; no real customer data is used.

`tests/g4f/quotation-catalog-read.test.ts` also verifies that the R1-backed adapter retains Package `pricingMethod` and Material `spuId`, which the engine requires to distinguish supported direct-price paths from SKU-dependent paths. Unrelated raw commercial fields remain excluded by the kind-specific adapter mapping.

## Verification results

| Command | Result |
|---|---|
| `pnpm run verify` | PASS — boundaries, UI governance, G4-F guards, typecheck, 39 Vitest files / 439 tests. |
| `pnpm run test:uni-h5-g4f-phase1b-review` | PASS — 7 browser tests, including the Phase 1H readiness/blocking scenario. |
| `pnpm run test:h5-review` | PASS — 32 browser tests; Chromium `153.0.8010.12`. |
| `pnpm run test:uni-h5-review` | PASS — 4 browser tests. |
| `pnpm run test:design-system-review` | PASS — 4 browser tests. |
| `pnpm run build:uni-h5-g4f-review` | PASS. |
| `pnpm run build:mp-weixin-review` | PASS. |
| `pnpm run build:mp-weixin` | PASS. |
| `pnpm run build:app` | PASS. |
| `pnpm run check:g4f-phase1b` | PASS — includes Phase 1H engine/write-boundary invariants. |
| `git diff --check` | PASS. |

The H5 harness tests used only synthetic/source-backed Mock rows, confirmed no unexpected external network requests, and added no visual-regression baseline. Browser console/page errors were zero for the tested Phase 1H scenario.

## Safety statement

No business write was executed.

- Production/Beta requests: none.
- Quote/order create/update/send/confirm: none.
- `basic/order/upsert` / `creatQuotation`: not implemented or called.
- Workflow process/complete: not implemented or called.
- Customer actions, media upload, credentials, and G4-G: none.
- No changes were made to the R1 or backend reference worktrees.
