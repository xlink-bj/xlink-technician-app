# G4-F — R1 Quotation Domain Reverse Engineering

**Status: READY_FOR_LEAD_DOMAIN_REVIEW**

**Scope: source audit + bounded Production API structural reads; no product implementation, no quote/workflow/business mutation, no merge.**

## 1. Evidence boundary and provenance

| Source | Revision / status | Evidence classification |
| --- | --- | --- |
| R1 frontend | `xlink-app` `6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d` | `SOURCE_VERIFIED` |
| Backend | `xlink-cloud-backend` `5fc008d32e771205260f120621c1c4fc62d0824e` | `SOURCE_VERIFIED` |
| New App review snapshot | `xlink-technician-app` PR #42 request-time HEAD `599945780d7c7724ec864b25845832954a148554` | `SOURCE_VERIFIED` for that snapshot only |
| Production API | Approved local Production profile; only the scoped routes listed below | `PROD_API_SHAPE_VERIFIED` |
| Production MongoDB | No query performed; no dedicated, pre-proven read-only DB role was established for this audit | `BLOCKED_SCOPE` |

The canonical Production business dictionary was read before interpreting Production data: `xlink/docs/z.其它/业务字典-生产统计口径.md`. The checked-in Production application DB configuration is not treated as proof of a read-only Mongo principal and was not used to connect.

No raw response, customer value, record ID, literal price, credential, cookie, token, full API URL, or complete `bjProducts` document was written to this repository. Production observations below are structural counts, field-presence counts, and primitive type summaries only. Do not treat these bounded samples as universal schema or business truth.

### Production request accounting

The final successful bounded run made **10 HTTP requests**: one authorized login plus nine reads: role tree, one role-scoped Work Order page (maximum three rows), one list-derived Work Order detail, one type-1 Order query scoped to that list-derived Work Order (maximum one row), four catalog lists, and one detail for a package returned by the package list.

Two earlier harness iterations were stopped by the local route/body guard before the attempted read reached Production. One earlier iteration had already completed its login and one role-tree read before the next request was blocked. Across the three runs: **3 login requests, 10 successful read requests, 2 locally blocked attempts, 13 Production HTTP requests total**. Login-time account/session permission-context persistence was within the explicit authorization. **Production business mutation requests: 0.**

`function/changeRole`, Order/workflow mutations, upload, coupon, customer interaction, and arbitrary-ID Order reads were not called. No additional Production request is needed for this report.

## 2. Executive findings

R1 is a stateful Order composition workflow, not a generic catalog picker. Its central persisted shape is one `Order` containing a serialized `bjProducts.orderList[]` of repair-part groups, with separate package, procedure, material, and measure collections. Package material layers and direct Material SPU/SKU selection have different identity and configuration rules.

The Lead’s model-level findings are supported by pinned source. Two important refinements emerged:

1. **Price override path is source-verified.** R1’s four `queryWithRank` controller methods inject `form=mini`; the client need not send that parameter explicitly. Backend `GoodsServiceImpl.queryWithRank()` uses it to project service/package/procedure/measure pricing. This corrects the earlier source-only concern that the R1 call might omit the flag.
2. **`sourceType` presence is security/data-scope significant.** R1 constructs catalog requests with a `sourceType` property. Backend `GoodsServiceImpl` branches on `params.containsKey("sourceType")`, changing organization/belong-to filtering. The new App maps `ServiceAppointment.exts.sourceType`, but omits the request property when its value is absent. R1’s actual wire behavior for missing/empty values was not proven; do not assume omission and empty string are equivalent.

The current App’s grouped model and package-layer bridge preserve important architecture, but the reviewed snapshot is not full R1 behavior parity: dynamic `order` ExtField validation is not represented by the fixed App validator; Material SKU/attribute hydration is not in the current approved Production read boundary; several R1 category filters are absent/deferred; and R1’s create path has workflow, coupon, PDF/message, and ServiceAppointment side effects that remain unverified by live writes.

## 3. R1 process and state model

```text
Work Order / current placeOrder action
  → initialize serviceType + sourceType + workflow identifiers
  → load dynamic order ExtFields and code dictionaries
  → validate visible placeOrder fields
  → create/edit a repair-part group
  → open one of four catalog categories
  → filter/search/select
      ├─ Package: detail → select one material per populated layer → configured bundle
      ├─ Procedure: repairProcedure type → quantity
      ├─ Material: SPU → attributes/SKU → per-SKU quantity
      └─ Measure: category list → quantity
  → close catalog; derive group warranty from selected packages
  → recalculate visible totals and serialized amount projection
  → validate/encode Order.type=1
  → for new workflow order: start child workflow, then upsert Order
  → backend may create documents/messages and update Work Order aggregate state
  → later workflow-controlled signing/contract; separate from quotation composition
```

R1 `placeOrders.vue:initData()` reads `type`, Work Order/order identity, `serviceType`, `sourceType`, workflow definition/node context, and edit flags. Main Work Order call sites pass `ServiceAppointment.serviceType` and `ServiceAppointment.exts.sourceType`; Order edit passes corresponding Order context. `getFields()` queries active `colName=order`, mobile-detail `showList=4` ExtFields, then separates `showType=placeOrder` from `showType=submitOrder` and applies service/person-type rules.

Before opening the catalog, `onSelectionOpen()` initializes switch defaults and validates required visible fields, conditional `showField/showValue`, phone/ID formats, and file URL values. It then snapshots the group context (`repairParts`, `partDescription`, `constructionSite`, `maintainAreaNum`) and four category collections. On leaving the picker, selected package warranty determines the group warranty ceiling/value; without a package, behavior depends on service/source type and may require manual warranty choice.

R1’s top-level `formData` and `orderList` group state are related but distinct: Work Order/order dynamic ExtFields live in `formData/exts`; item composition and repair-part grouping live in `orderList`. The new App validator currently covers group repair path, description, engineering quantity, package configuration, and selection quantity; it is not a generalized dynamic ExtField schema validator.

### Core relationship and cardinality

```text
ServiceAppointment 1 ── N Order(type=1)
Order 1 ── 1 serialized bjProducts payload
bjProducts 1 ── N orderList repair-part groups
group 1 ── N package / procedure / material / measure entries
Package 1 ── N procedure/material/measure component rows
Material SPU 1 ── N SKU rows (separate direct-material path)
```

One Order may therefore contain multiple repair-part groups. Do not normalize it to one Order per part, or treat a package’s component rows as independent direct Material selections.

### Canonical redacted structure

The following is a type/shape sketch from source, not a Production record. Optional fields vary by action and selected item.

```ts
Order = {
  type: number,                         // place_order target is type 1
  serviceAppointmentId: string,
  originPrice?: number,
  totalPrice?: number,
  exts?: Record<string, unknown>,       // dynamic order fields/context
  bjProducts: string,                   // serialized JSON at backend entity boundary
}

parse(bjProducts) = {
  orderList: Array<{
    repairParts: string[],
    partDescription?: string,
    constructionSite?: string,
    maintainAreaNum?: string,
    agelimit?: number,
    projPackages: { totalAmount: number, data: PackageSelection[] },
    procedures:   { totalAmount: number, data: ProcedureSelection[] },
    materials:    { totalAmount: number, data: MaterialOrSkuSelection[] },
    measures:     { totalAmount: number, data: MeasureSelection[] },
    totalAmount: number,
  }>,
  addItems: { totalAmount: number, data: unknown[] },
  deleteItems: { totalAmount: number, data: unknown[] },
  otherItemsAmount: number,
  preferentialAmount: number,
}

PackageMaterialSelection = {
  materialId: string,
  coefficient?: number,
  coefficientUnit?: string,
  number?: number,
  material: { _id: string, spec?: string, materialUnit?: string, ... },
  exts: { layer?: string | number, price?: number, ... },
}

DirectMaterialSkuSelection = {
  _id: string, spuid?: string, number: number,
  price?: number, exts?: { attributeValues?: Record<string, unknown>, ... },
}
```

This shape deliberately does not assert that every old Order contains every group/category field or that `bjProducts` is always valid JSON. The new read adapter must reject malformed required structures or preserve them as visibly unsupported/read-only rather than silently filling defaults.

## 4. Entity/data dictionary

This is a field/relationship dictionary, not a dump of Production values.

| Entity / layer | Source fields and types | Meaning / transformation | Evidence status |
| --- | --- | --- | --- |
| Work Order (`ServiceAppointment`) | `_id` identity; `serviceType` string; `exts.sourceType` string-like; workflow/node runtime data | Supplies catalog context and action/workflow ownership. R1 entry routes pass service/source values into the order page. New App detail maps `serviceType` and `exts.sourceType` into `quotationCatalogContext`. | Source verified; one Production list-derived detail supplied a usable catalog context, values kept in memory. |
| Dynamic order fields | ExtField `name`, `nameDisp`, `type`, `required`, `valueOption`, `frontEndConfig`; values in form data / Order `exts` | `colName=order`; `showList=4`; runtime `showType=placeOrder`/`submitOrder`; service/person type and `showField/showValue` affect display/validation. File values are flattened during encoding. | R1 source verified; sanitized tenant-wide active Production shape captured (32 rows). Work-order-specific effective `placeOrder` set and provider values remain unknown; see [capture](G4F_ACTIVE_ORDER_EXTFIELD_SCHEMA_SHAPE.md). |
| Repair-part group | `repairParts` path; `partDescription`; `constructionSite`; `maintainAreaNum`; `agelimit`/`agelimitMax`; category collections | One `orderList` row is a business grouping context. Area is text in R1; package/procedure quantity may initialize from it. | Source verified; Production sample’s one type-1 Order normalized to one group. |
| Package | `_id`, `name`, `type`, `agelimit`, `price`, `minimumPrice`, `unit`, descriptions/images; applicability in `exts.repairParts` or `exts.constructionParts`; construction method; `spuCode`; pricing method branch | Filtered by service-specific repair/construction parts and optional age. Package detail components configure a bundle; package base/markup/floor are separate from direct material pricing. | Source verified. Production normalized list: 27 rows; `price` and `minimumPrice` numeric on 27/27; normalized `pricingMethod` absent in this projection. |
| Package component rows | component reference; `number`; `coefficient`; `coefficientUnit`; `order`; `layer`; component price; embedded item | `findById` resolves package procedure/material/measure references. R1 orders materials by layer and requires one selection per populated layer. | Source verified. Production detail: 2 procedure, 5 material, 0 measure rows; all five material rows exposed string `layer`, numeric coefficient, string coefficient unit, numeric component price, and embedded item. |
| Procedure | identity/name/content; unit; `guideUnitPrice`; `minimumGuideTotalPrice`; `exts.repairProcedure`; images/description | Filtered by `repairProcedure` dictionary (not repair-part taxonomy); selected quantity may initialize from group area. | Source verified. Production normalized list: 66 rows; both price fields numeric on 66/66. |
| Direct Material / SPU | SPU identity, `code`, `type`, `materialUnit`, `spec`, `specUnit`, image and service-price fields; sales attributes come from material ExtFields/code options | R1 opens a distinct specification flow; selects attribute values, loads SKU rows by `spuid`, then updates per-SKU quantity and derived SPU total. | Source verified. Production normalized list: 89 rows; code string on 80/89, type numeric on 89/89, materialUnit string on 89/89, specUnit string on 88/89; no normalized `spuId` field in this adapter projection. This does not prove the raw wire field is absent. SKU route was not called. |
| SKU | SKU identity; parent `spuid`; attribute values in `exts`; `price`, spec/unit, quantity | R1 matches selected attribute values against each SKU and persists separate SKU rows under a material SPU before flattening/rehydration. | Source verified; Production SKU rows not read. |
| Measure (机措) | identity/name; unit; `guideUnitPrice`; `cost`; possibly minimum-guide field | Its own category and price semantics; not a generic procedure/material. | Source verified. Production normalized list: 4 rows; guide price numeric 4/4; `minimumGuideTotalPrice` and `cost` absent in this normalized sample. |
| Order / payload | `type=1`; `serviceAppointmentId`; `originPrice`, `totalPrice`, `otherAmount`, `preferentialAmount`, `discount`, description; `exts`; `bjProducts` | `bjProducts` is serialized JSON in the source model; it contains `orderList`, add/delete item arrays and amount components. R1 reads by queryById for edit; new App uses bounded list-scoped reads and projects rows into a read-only model. | Source verified. Production API sample: one type-1 row; adapter normalized one group with one package line and no procedure/material/measure lines. Raw `bjProducts` was not persisted or directly represented by the normalized shape. |

### Field flow: source → read adapter → draft → encoder

| Business value | R1/backend source | New App normalized read | Local draft | Type-1 encoder projection |
| --- | --- | --- | --- | --- |
| Catalog scope | `ServiceAppointment.serviceType`, `exts.sourceType` | `QuotationCatalogContext.serviceType/sourceType`; sourceType optional | Not copied into group rows | Included in payload `exts` when present; catalog requests include sourceType only when present. This property-presence difference is a P0 unknown. |
| Repair-part group | R1 form/group: `repairParts`, `partDescription`, `constructionSite`, `maintainAreaNum`, warranty | Repair-part code options may be used for labels; no dynamic field model | `QuotationGroup`: `repairParts[]`, `partDescription`, `maintainAreaNum` | `bjProducts.orderList[]`: group path, description, area, kind-specific category arrays and amounts. `constructionSite`/warranty are not fully represented by the current draft. |
| Package | raw `_id/name/type/agelimit/price/minimumPrice/unit/exts` | `QuotationPackageRead`: `id/name/type/ageLimit/price/minimumPrice` plus common fields; `pricingMethod` currently read from embedded `exts.pricingMethod` | package selection: `catalogId/label/unit/quantity` + configured component identities/layers; no price snapshot | Package row includes base amount, markup, floor, quantity and hydrated child rows; missing price/configuration blocks encoding. |
| Package child material | child `materialId`, embedded `material`, `coefficient`, `coefficientUnit`, `number`, `exts.layer`, `exts.price` | `QuotationPackageMaterialRead`: reference/embedded material, coefficient/unit, exact layer value and component markup | selected configuration retains provider child/reference identity, label/unit, and layer; coefficient and commercial fields are rehydrated, not snapshotted in the selection | selected component rows are rebuilt from hydrated detail, preserving layer/coefficient/unit and per-row `exts.price`; no inferred layer/order. |
| Procedure | `_id`, `name`, `unit`, `guideUnitPrice`, `minimumGuideTotalPrice`, `exts.repairProcedure` | `QuotationProcedureRead` with only Procedure-specific price fields | id/label/unit/quantity | `procedures.data[]` with quantity and amount from the authorized price projection. R1 repairProcedure filter is not yet reproduced. |
| Direct Material/SPU/SKU | Material SPU identity/spec/type + ExtField sales attributes; SKU identity, `spuid`, attributes, price, quantity | `QuotationMaterialRead` preserves `spuId` only when the adapter receives it | direct selection has catalog ID/label/unit/quantity; no selected SKU/attribute map | If normalized item has SPU identity, encoder blocks it as an unsupported SKU path rather than encoding an ordinary scalar row. |
| Measure | `_id/name/unit/guideUnitPrice/cost` | `QuotationMeasureRead` with Measure-specific fields | id/label/unit/quantity | `measures.data[]` with its own amount semantics. |
| Amounts | R1 `calcTotalPrice()` and `fillOrder()` compute separate projections; Order top-level amount fields | Catalog prices hydrate into pricing inputs; source price fields remain kind-specific | Monetary values are not stored on `QuotationDraft` | Encoder writes separate top-level `originPrice/totalPrice` and group/category amounts; do not collapse the two rounding paths. |
| Dynamic ExtFields | `ExtField` definition + formData values serialized to Order `exts` | No corresponding generalized quotation ExtField read/runtime in the reviewed snapshot | Not present in `QuotationDraft` | Not encoded, so no parity claim until contract and ownership are deliberately resolved. |

**Presence/nullability rules:** R1 dynamic requiredness is configuration-driven (`required` plus visibility condition), so there is no global “all form values are non-null” rule. New App catalog adapters require item identity and name; unit/specification/descriptions and commercial fields are optional and omitted when absent. Package child rows require either a child reference ID or an embedded item; layer is optional and retained exactly when present (no position-based inference). `spuId` and SKU attribute data are optional in the read type; an SPU-bearing direct Material is blocked by the encoder until the SKU path is supported. Missing prices remain missing and block price-dependent encoding rather than defaulting to zero.

### R1 catalog filtering and selection semantics

All four R1 list calls use `_all=1`, active state, `serviceType`, `sourceType`, sort `order,_id` ascending. Each response is projected to a kind-specific item snapshot and selected rows are preserved when refreshing the current group.

| Category | Filter/search model | Selection/configuration |
| --- | --- | --- |
| Package | Part applicability uses `repairParts` for selected service types and `constructionParts` otherwise; optional warranty-age filter; name search. | Opens package detail, displays included components/layers; one material per populated layer; configured package is committed as a bundle. |
| Procedure | `repairProcedure` dictionary, with matching against `exts.repairProcedure`; name/content search. This is distinct from part eligibility. | Quantity/stepper; area-derived initialization where applicable. |
| Material | R1 `type1` taxonomy, or `type2` for refresh service; search name/code; item displays spec and material unit. | If spec selection is required, open SPU→attribute→SKU flow; selected SKU rows carry their own quantities. |
| Measure | Separate category list; search and quantity selection. | Guide price × quantity in R1 display calculation. |

The current App has a category browser, package detail/layer configuration, and grouped selection model. It does not establish full R1 filter parity for package part/warranty, procedure type and material type in the reviewed snapshot; direct Material SPU/SKU selection is not enabled in the approved Production read boundary. These are compatibility gaps, not reasons to collapse the four domains into one generic “item” filter.

## 5. Money, price, quantity, warranty provenance

### R1 price projection

- Package: base `price` plus positive selected component material `exts.price` markup, multiplied by quantity, with `minimumPrice` floor.
- Procedure: `guideUnitPrice × quantity`, with `minimumGuideTotalPrice` floor.
- Direct Material: selected SKU `price × quantity` when SKU rows exist; otherwise item price × item quantity.
- Measure: `guideUnitPrice × quantity`.
- Top-level adjustments include add/delete items, coupon value, discount, preferential amount, and other amount.
- Group/order serialization uses its own category/group amount projection. R1 `calcTotalPrice()` and `fillOrder()` apply rounding at different stages; equality to the cent is not an invariant. Phase 1H’s two-projection separation must remain intact.

### Price source correction

The Lead’s original question about a missing client `form` field is resolved at source level: the R1 `ProjPackageController`, `ProcedureController`, `MaterialController`, and `MeasureController` each inject `form="mini"` in their `queryWithRank` handler. `GoodsServiceImpl.queryWithRank()` then:

- keeps tenant and active-state criteria;
- when `sourceType` is present, rewrites it to `sourceTypeList` filtering and supplies current-org/tenant scope while disabling the generic org/belong filters;
- for `form=mini`, maps Material `servicePrice` to returned `price`, and zeroes fields not intended for the mini client;
- overlays approved organization-operation price-body values for Procedure and Measure guide/minimum price;
- overlays approved Package price/minimum price.

Therefore the source supports an R1 mini-client price projection; it is **not** correct to say that the override cannot run merely because the Vue request object does not contain `form`. Production structural reads confirmed the relevant normalized price fields exist with numeric types in the sampled lists, but did not capture values or prove any individual row’s exact price-body provenance, approval history, freshness/versioning, or equality to R1 UI. No price version/revision token was identified in the normalized shape; this is not proof no raw/back-end revision exists.

### Quantity and warranty

R1 may initialize Package and Procedure quantity from `maintainAreaNum`; other quantities are individually controlled. Package component coefficient, coefficient unit, material specification, layer, and quantity are coupled in package pricing/encoding. The active non-SKU package branch derives component quantity from package quantity, coefficient and material spec (with ceiling behavior); the explicit SKU pricing branch is conditional on `pricingMethod == '1'` and selected SKU rows. Missing/non-`1` pricing method follows the ordinary path in the accepted Phase 1H source-parity decision; SKU/material-use inference remains fail-closed.

When leaving selection, R1 derives warranty from selected package warranty, using the minimum among selected packages; no-package behavior is service/source-specific. Do not derive warranty solely from a generic “selected package count” or apply it before the group is finalized.

## 6. Production API structural observations

| Read | Sanitized result |
| --- | --- |
| Work Order list/detail | One bounded role-scoped page; one list-derived detail used to derive catalog context. IDs and values stayed in memory. No workflow-stage conclusion is made from this audit output. |
| Existing Order | One bounded `type=1` query for the list-derived Work Order; one row returned and accepted by the adapter. Normalized shape: one group, one package line, zero direct Procedure/Material/Measure lines. This cannot validate direct SKU/SPU edit/hydration. |
| Package list/detail | 27 normalized list rows; list-derived detail succeeded; two procedure components, five material components, zero measure components. Layer/coefficient/unit/component-price/embedded-item shapes were present as described above. |
| Procedure list | 66 normalized rows; guide and minimum-guide price fields numeric in all sampled rows. |
| Material list | 89 normalized rows; structural presence counts as in the dictionary. Adapter-normalized `spuId` absent in all rows; raw response was not retained, so absence may be projection-related. |
| Measure list | 4 normalized rows; guide price numeric in all; no normalized minimum-guide or cost field in the sample. |

Structural samples do not prove record-wide completeness, price correctness, package availability for every service/source type, complete SKU data, or active `placeOrder` workflow behavior.

## 7. R1 vs new App parity matrix (reviewed PR #42 snapshot)

| Behavior | R1 evidence | New App snapshot | Status / impact |
| --- | --- | --- | --- |
| Work Order context | Entry receives service type, source type, node/workflow context | WorkOrder adapter maps service type and `exts.sourceType` to catalog context | `PARTIAL`: mapping exists; source-type absent/empty semantics differ or remain unknown. |
| Dynamic order fields | Runtime ExtFields with showList/showType, service/person conditions, required and conditional validation | Fixed group validator for repair path/description/area/package config/quantity | `DIFFERENCE`, P0: no proof all configured required fields are collected/validated before catalog or completion. |
| Repair-part grouping | `orderList[]` contains independent groups and four category lists | `QuotationDraft.groups[]` with repair path, description, area and typed selections | `PARITY` at composition-model level; broader field and warranty parity incomplete. |
| Package applicability/warranty | Service-type-dependent repair/construction part filter; age filter; min selected warranty | Package browser/detail and layer configuration; filter/warranty coverage is not full R1 parity | `PARTIAL`: wrong package eligibility or warranty can mislead selection. |
| Procedure taxonomy | Filtered through `repairProcedure` code dictionary and `exts.repairProcedure` | Direct provider selection exists; reviewed catalog UX does not reproduce this taxonomy | `DIFFERENCE`: user may not find the expected subset; taxonomy must not be replaced with repair parts. |
| Direct Material | `type1/type2` filter; SPU→attribute options→SKU; per-SKU quantities | Read catalog model and direct selection bridge exist, but SKU/SPU route and attribute hydration remain deferred/blocked | `UNSUPPORTED/PARTIAL`: SKU-bearing material choice cannot be claimed equivalent. |
| Package composition | Package detail + each populated layer selected; component coefficients, spec and bundle code | Package detail/layer configuration and typed component model exist | `PARTIAL`: key layer contract exists; SKU-specific bundle path and exact production SKU path are not live-verified. |
| Price | R1 mini list projection and two separate total projections | Kind-specific catalog pricing model and Phase 1H price projections; unknown inputs blocked | `PARTIAL`: source mapping is credible; no row-value cross-check or price freshness proof. |
| Save/workflow | New type-1 path may start child workflow then upsert; edit can use same Order | Real business submit remains gated; Phase 1I safeguards exist | `NOT_LIVE_VERIFIED`: production writes forbidden; Beta flow remains separate gate. |
| Order read/edit | R1 uses `basic/order/queryById` for edit | App limits reads to current-session list-authorized Work Order and checks Order ownership; read-only view currently does not establish full edit hydration | `PARTIAL`: safer ownership boundary, but same-ID real edit not validated. |
| Images | R1 maps catalog images into product tiles/detail | New catalog UI supports available image presentation but current Production normalized shape/evidence is not a completeness proof | `PARTIAL/UNKNOWN`: visual asset reachability and missing-image states need product review. |

## 8. API side-effect and authorization matrix

“Read” below means source inspection found no business mutation on the successful method path; the current Production allowlist remains narrower than every route that R1 uses.

| Route / operation | Source behavior | Audit use / decision |
| --- | --- | --- |
| `index/phoneLogin.do` | Auth/session setup; may persist permission context | Used only under explicit login-context authorization. No business object write is counted as authorized. |
| `function/queryTreeByRoleId` | Role-tree read | Bounded read used. |
| `function/changeRole` | Writes account permission role | Forbidden; not called. |
| `basic/serviceAppointment/query` or workflow-list variant | Role-scoped list read | One bounded page; route chosen by existing adapter evidence. |
| `basic/serviceAppointment/queryById/{id}` | Work Order detail read | One list-derived detail only. Do not use arbitrary IDs or the legacy permission bypass. |
| `biz/extField/query` | ExtField controller injects current account tenant and calls `extFieldService.query`; read path | R1 uses it for order and material field definitions. Not called in this Production audit; active action schema remains unknown. |
| `i/code/selectCode.do`, `i/code/selectMultistageCode` | Code-config controller delegates to code-service selection methods; source path reads dictionary/options | R1 uses option and cascade providers. No Production code dictionary request in this audit. |
| `basic/order/query` | Controller injects current tenant unless caller supplies the bypass flag; accepts `notFilterBelongTo`, `notFilterOrgId`, `notFilterTenantId` which disable corresponding scope filters | Used only with exact list-derived Work Order ID, `type=1`, page 1 and row limit 1. None of the bypass flags was sent. |
| `basic/order/queryById` | Controller delegates to `OrderServiceImpl.queryById`, which performs `findById`; no explicit tenant/ownership check is visible in this path | Not called in Production; current App blocks it for Production browsing. |
| Four catalog `queryWithRank` routes | List/read, but sourceType changes data scope; mini form changes price projection | One bounded call per kind using detail-derived context and exact allowlisted body. |
| `biz/projPackage/findById/{id}` | Resolves package child lists; no explicit per-record tenant guard is visible in the examined method | Called only for an ID returned by the just-read allowed package list. Arbitrary ID use remains prohibited. |
| `basic/material/query` (SKU) | Material controller delegates to `GoodsService.queryWithRank`; R1 filters active rows by `spuid`. This is distinct from `queryWithRank`’s R1 list endpoint and does not receive the controller-injected `form=mini` projection. | Not called; not in the accepted Production allowlist. SKU price and scope contract remain unverified in Production. |
| `workflow/startWorkflow/...`, `basic/order/upsert`, coupon use, PDF/message paths | Mutation/business side effects | Not called; no Production write authorization. |
| MongoDB | No proven RO DB principal for this audit | No connection and no queries; `BLOCKED_SCOPE`. |

Backend source shows `OrderServiceImpl.upsert()` is not a simple record write: it can initialize order state and metadata; later code paths create quotation/warranty PDF artifacts, send a Message, update ServiceAppointment aggregate/order fields and invoke SLA-related behavior. R1’s new type-1 branch may call `workflow/startWorkflow/order/...` before `basic/order/upsert`; coupon use is a separate request before upsert. These operations are not atomic as one client request. The accepted no-blind-retry/readback boundary is therefore essential; no live write/rollback/reconciliation assertion is made here.

## 9. Source risks and non-copyable R1 defects

- **Assignment bug:** `placeOrders.vue` contains `else if ((type = '1'))`; it assigns instead of compares. Do not reproduce; use explicit typed intent.
- **Removal timing risk:** one remove path recalculates outside the asynchronous confirmation callback; verify cancel/confirm state rather than copying this timing.
- **Dormant package SKU path:** R1 contains a package SKU helper whose mapped rows omit a field later used for grouping; its UI entry is commented while active package selection uses `openPackage()`. Treat the helper as legacy/dormant evidence, not proof of the active path.
- **By-ID authorization:** Order queryById and package detail source paths do not show sufficient standalone tenant/ownership checks; list-derived provenance is necessary for bounded reads.
- **Price source:** source proves the `mini` price projection and its conditional approved price-body overlays, not that every Production value is current, approved, complete, or equal to the R1 user-visible price.

## 10. Critical delta shortlist

### P0 — before claiming correct/complete quotation composition

1. **Dynamic ExtField contract:** obtain the current active `placeOrder` `colName=order` schema safely when available; map required/conditional fields and their option providers into a validated action contract. The current App’s fixed group validator is not evidence of equivalence. Acceptance: every visible required field is present, provider-backed, conditionally validated, encoded, and round-tripped by synthetic contract tests; hidden conditional fields do not block.
2. **Catalog scope parity for sourceType:** prove R1’s actual wire behavior for missing, empty, and populated sourceType, then make App request semantics match without broadening visibility. Acceptance: tests distinguish property-absent from property-present-empty and assert the intended backend branch; missing required context fails closed if business scope cannot be proven.
3. **Order/model decode truth:** Production API sample covers one package-only row, not direct SKU materials or all group variants. Preserve unknown fields as unsupported/read-only; do not infer SKU identity or hydrate editable draft from a partial Order.

### P1 — functional parity and field usability

4. Restore/explicitly defer R1 filters: package part applicability and warranty age, Procedure `repairProcedure`, Material type1/type2. Use separate per-kind taxonomies.
5. Complete direct Material SPU→attribute→SKU read/config contract only after the read route is source-scoped and approved; current Production allowlist did not include it.
6. Verify package SKU branch, component coefficient/spec quantity, composite identity and bundle round-trip using synthetic fixtures derived only from source-verified shapes. Do not turn layer choice into a simple one-line selection.
7. Preserve two distinct money projections and source each amount field. Keep unknown price/freshness/discount state visibly blocked rather than turning missing values into zero.

### P2 — presentation

8. Image completeness/reachability, detail affordances and long catalog scanning need separate visual review after data/selection parity is defined. Do not fabricate photos, price labels or “报价完成” states.

## 11. Explicit unknowns / stop decisions

| Unknown | Status | Why it remains unknown / safe next evidence |
| --- | --- | --- |
| Current Production tenant-wide active `order` ExtField shape | `CAPTURED` | One authorized, bounded query returned 32 rows; sanitized details are in [G4F_ACTIVE_ORDER_EXTFIELD_SCHEMA_SHAPE.md](G4F_ACTIVE_ORDER_EXTFIELD_SCHEMA_SHAPE.md). |
| Effective `placeOrder` ExtField set for a concrete work order and provider option values | `UNKNOWN` | The capture is tenant-wide and redacts service/person values and option contents; no customer/work-order read or provider query was authorized. Resolve only under a later approved scope. |
| R1 wire behavior when `sourceType` is absent vs empty | `UNKNOWN` | Vue constructs the property; framework serialization of `undefined` and backend parameter presence were not proven. Resolve with local transport/source or a safe deterministic mock; do not add a Production request solely to guess. |
| Exact price-body provenance/freshness and per-row R1-vs-Production displayed amount | `UNKNOWN` | Source proves conditional override; audit retained no price values or approval records, and no version token was exposed in normalized model. |
| Material SKU rows/attribute options in Production | `BLOCKED_SCOPE` | Route is outside the current allowlist; no SKU request performed. Source-backed model only. |
| Full existing type-1 Order distribution and multiple Orders under one Work Order | `UNKNOWN` | One bounded Order row was intentionally requested; no broad pagination or enumeration. |
| Active workflow node and Survey→placeOrder transition in current Production | `UNKNOWN` | The audit script did not capture a workflow transition; no workflow mutation was performed. Historical Phase 1K sample not finding a node is bounded evidence only. |
| PDF availability/validity and signing/contract lifecycle | `UNKNOWN` | No PDF was opened/downloaded; source shows PDF creation in mutation path; no customer action or write. |
| Production Mongo schema / DB collection shape | `BLOCKED_SCOPE` | No dedicated proven read-only DB role was supplied/verified for this audit; no DB connection or query. |
| Source runtime vs pinned source checkout drift | `UNKNOWN` | Pinned repositories identify reviewed source revisions; the bounded API reads do not fingerprint the exact Production deployment revision. |

## 12. Recommended smallest next slice

**Do not expand the catalog UI yet.** First close the two model/scope P0s using non-Production artifacts where possible:

1. Add a sanitized, machine-checkable active `placeOrder` ExtField fixture derived from authorized source/evidence (or clearly mark it unavailable); define the normalized field/option-provider boundary and validate conditional required semantics with synthetic tests.
2. Determine and test R1 `sourceType` missing/empty serialization versus backend `containsKey` behavior. If the behavior cannot be proven, require a non-empty, detail-derived source context before catalog access rather than silently omitting scope.
3. Then prepare a kind-specific parity plan for filters and Material SKU, keeping Production routes read-only and gated.

This is an evidence recommendation, not implementation authorization. PR #42 remains Draft; no source/UI behavior is changed by this audit.

## 13. Verification and safety result

- R1 source trace: pinned checkout verified.
- Backend source trace: pinned checkout verified.
- Production API structural read: `PROD_READ_ONLY_SCOPED`; 10 reads across authorized evidence runs; IDs and values remained in memory.
- Production Mongo: `BLOCKED_SCOPE`, not attempted.
- Production business mutations: **0**.
- Workflow, quote, coupon, upload, PDF/customer interaction mutations: **0**.
- `function/changeRole`: **not called**.
- Credentials/session material committed: **none**.
- PR #42 changes: **none**.

## 14. Pinned source call graph

These links are pinned to the revisions in §1 and make the audit trace reproducible.

| Trace | Pinned source |
| --- | --- |
| R1 entry parameters, service/source context and filter dictionary setup | [`placeOrders.vue:initData()` and options](https://github.com/xlink-bj/xlink-app/blob/6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d/business/subpackages/order/placeOrders.vue#L3248-L3278), [route context and service-type filters](https://github.com/xlink-bj/xlink-app/blob/6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d/business/subpackages/order/placeOrders.vue#L3444-L3495) |
| R1 caller identity/context propagation | [Order edit caller](https://github.com/xlink-bj/xlink-app/blob/6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d/business/subpackages/order/order.vue#L1149-L1171), [ServiceAppointment callers](https://github.com/xlink-bj/xlink-app/blob/6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d/business/subpackages/serviceAppointment/serviceAppointment.vue#L8832-L8858) |
| Dynamic order ExtField read, display projection, and option-provider setup | [`getFields()`](https://github.com/xlink-bj/xlink-app/blob/6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d/business/subpackages/order/placeOrders.vue#L3618-L3677), [field validation before catalog](https://github.com/xlink-bj/xlink-app/blob/6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d/business/subpackages/order/placeOrders.vue#L4419-L4465) |
| Package part/warranty filter and Procedure type filter | [Package filters](https://github.com/xlink-bj/xlink-app/blob/6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d/business/subpackages/order/placeOrders.vue#L1350-L1430), [Procedure `repairProcedure` filter](https://github.com/xlink-bj/xlink-app/blob/6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d/business/subpackages/order/placeOrders.vue#L1575-L1619), [normalization/matcher](https://github.com/xlink-bj/xlink-app/blob/6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d/business/subpackages/order/placeOrders/utils/procedureFilter.js#L1-L30) |
| Four R1 catalog request bodies and projections | [`getProjPackages/getProcedures/getMaterials/getMeasures`](https://github.com/xlink-bj/xlink-app/blob/6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d/business/subpackages/order/placeOrders.vue#L5499-L5720) |
| Group initialization and catalog exit/warranty calculation | [group and four category collections](https://github.com/xlink-bj/xlink-app/blob/6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d/business/subpackages/order/placeOrders.vue#L4467-L4544), [exit/warranty](https://github.com/xlink-bj/xlink-app/blob/6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d/business/subpackages/order/placeOrders.vue#L4546-L4579) |
| Quantity selection and top-level current total | [`selectorPlus/calcTotalPrice`](https://github.com/xlink-bj/xlink-app/blob/6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d/business/subpackages/order/placeOrders.vue#L5787-L5889) |
| Direct Material SPU/SKU and attributes | [material attributes](https://github.com/xlink-bj/xlink-app/blob/6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d/business/subpackages/order/placeOrders.vue#L3498-L3567), [SPU hydration/SKU query/matching](https://github.com/xlink-bj/xlink-app/blob/6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d/business/subpackages/order/placeOrders.vue#L6100-L6278) |
| Active Package detail, layers, and confirmation | [`openPackage()`](https://github.com/xlink-bj/xlink-app/blob/6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d/business/subpackages/order/placeOrders.vue#L6399-L6547), [layer requirement and composite package code](https://github.com/xlink-bj/xlink-app/blob/6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d/business/subpackages/order/placeOrders.vue#L6552-L6613) |
| Group serialization and Order command flow | [group/category amount serialization](https://github.com/xlink-bj/xlink-app/blob/6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d/business/subpackages/order/placeOrders.vue#L3993-L4196), [type-1 payload, child workflow start and upsert](https://github.com/xlink-bj/xlink-app/blob/6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d/business/subpackages/order/placeOrders.vue#L4200-L4364) |
| R1 form-encoded API helper | [`common.osg.ajax`](https://github.com/xlink-bj/xlink-app/blob/6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d/business/resources/js/common.js#L112-L182) |
| Backend catalog scope and mini price projection | [`GoodsServiceImpl.queryWithRank()`](https://github.com/xlink-bj/xlink-cloud-backend/blob/5fc008d32e771205260f120621c1c4fc62d0824e/src/main/java/com/fsgo/service/biz/GoodsServiceImpl.java#L376-L459); [`ProjPackageController`](https://github.com/xlink-bj/xlink-cloud-backend/blob/5fc008d32e771205260f120621c1c4fc62d0824e/src/main/java/com/fsgo/modulemini/biz/ProjPackageController.java#L49-L54), [`ProcedureController`](https://github.com/xlink-bj/xlink-cloud-backend/blob/5fc008d32e771205260f120621c1c4fc62d0824e/src/main/java/com/fsgo/modulemini/biz/ProcedureController.java#L53-L58), [`MaterialController`](https://github.com/xlink-bj/xlink-cloud-backend/blob/5fc008d32e771205260f120621c1c4fc62d0824e/src/main/java/com/fsgo/modulemini/basic/MaterialController.java#L53-L58), [`MeasureController`](https://github.com/xlink-bj/xlink-cloud-backend/blob/5fc008d32e771205260f120621c1c4fc62d0824e/src/main/java/com/fsgo/modulemini/biz/MeasureController.java#L53-L58) |
| Backend ExtField/code reads and separate Material SKU query | [`ExtFieldController.query`](https://github.com/xlink-bj/xlink-cloud-backend/blob/5fc008d32e771205260f120621c1c4fc62d0824e/src/main/java/com/fsgo/modulemini/biz/ExtFieldController.java#L33-L41), [`CodeCfgController`](https://github.com/xlink-bj/xlink-cloud-backend/blob/5fc008d32e771205260f120621c1c4fc62d0824e/src/main/java/com/fsgo/modulemini/i/CodeCfgController.java#L23-L33), [`MaterialController.query/queryWithRank`](https://github.com/xlink-bj/xlink-cloud-backend/blob/5fc008d32e771205260f120621c1c4fc62d0824e/src/main/java/com/fsgo/modulemini/basic/MaterialController.java#L35-L58) |
| Backend Order list scope, by-ID read and upsert effects | [`OrderController`](https://github.com/xlink-bj/xlink-cloud-backend/blob/5fc008d32e771205260f120621c1c4fc62d0824e/src/main/java/com/fsgo/modulemini/basic/OrderController.java#L49-L109), [`OrderServiceImpl.queryById/upsert`](https://github.com/xlink-bj/xlink-cloud-backend/blob/5fc008d32e771205260f120621c1c4fc62d0824e/src/main/java/com/fsgo/service/basic/OrderServiceImpl.java#L158-L220), [PDF/message/Order/Work Order/SLA effects](https://github.com/xlink-bj/xlink-cloud-backend/blob/5fc008d32e771205260f120621c1c4fc62d0824e/src/main/java/com/fsgo/service/basic/OrderServiceImpl.java#L441-L493) |
| Backend package detail and raw Order storage types | [`ProjPackageServiceImpl.findById()`](https://github.com/xlink-bj/xlink-cloud-backend/blob/5fc008d32e771205260f120621c1c4fc62d0824e/src/main/java/com/fsgo/service/project/ProjPackageServiceImpl.java#L97-L160), [`Order.java`](https://github.com/xlink-bj/xlink-cloud-backend/blob/5fc008d32e771205260f120621c1c4fc62d0824e/src/main/java/com/fsgo/entity/basic/Order.java#L17-L55) |
| Reviewed new App context, catalog, price, encoder and fixed validator | [Work Order catalog context mapping](https://github.com/xlink-bj/xlink-technician-app/blob/599945780d7c7724ec864b25845832954a148554/src/adapters/api/technician-api.ts#L440-L480), [kind-specific catalog projection](https://github.com/xlink-bj/xlink-technician-app/blob/599945780d7c7724ec864b25845832954a148554/src/adapters/api/quotation-catalog-api.ts#L76-L218), [fixed quotation validator](https://github.com/xlink-bj/xlink-technician-app/blob/599945780d7c7724ec864b25845832954a148554/src/features/work-orders/quotation/validation.ts#L1-L150), [price projections](https://github.com/xlink-bj/xlink-technician-app/blob/599945780d7c7724ec864b25845832954a148554/src/features/work-orders/quotation/pricing.ts#L49-L185), [type-1 encoder](https://github.com/xlink-bj/xlink-technician-app/blob/599945780d7c7724ec864b25845832954a148554/src/features/work-orders/quotation/order-encoder.ts#L236-L360) |
