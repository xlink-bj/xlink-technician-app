# G4-F — R1 Quotation Domain Reverse Engineering

> **Owner 决策补记（2026-11-05，取代把 SKU 当作当前报价硬前提的研发假设）：** 当前配置的正常技术工程师角色可执行 R1 报价；其角色可见的全部四类可报价服务/来源上下文均已完成四目录与 SKU 有界读取，相关活动 SKU 全为空。R1 后端 `Material.spuid` 和静态 SKU 前端分支只证明曾设计 SKU，静态映射可疑点只标 `DORMANT_OR_UNVERIFIED`，**不推断现网显示 Bug**。对当前复刻业务应以套餐/工序/材料 SPU/机措及真实 `mini` 有效价格为主，普通无 SKU 材料不得因 SKU 空而阻断；也不得生成虚构 SKU、猜价格或将旧 Order 的 `skuCode` 误当 SKU 数据库 ID。保留未来有真实活动 SKU 时的独立验证门槛。详细数据/Mock 契约与缺口统一见 [R1 真实数据模型与 DEV Mock 等价清单](R1_REAL_DATA_MODEL_MOCK_EQUIVALENCE_INVENTORY.md)。

此补记是**当前技术工程师角色范围内的产品复刻决策**，不推翻下文的历史源码审计，也不批准真实 Order/Workflow/合同写入。


**Status: R1_SOURCE_AUDITED / FOUR_CONTEXT_PRODUCTION_CATALOG_CHAIN_READ_COMPLETE / QUOTE_PARITY_PARTIAL**

**Scope: R1 source audit, bounded Production read-only catalog adapter implementation and verification; no quote/workflow/business mutation, no merge or deployment.**

## 1. Evidence boundary and provenance

| Source | Revision / status | Evidence classification |
| --- | --- | --- |
| R1 frontend | `xlink-app` `6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d` | `SOURCE_VERIFIED` |
| Backend | `xlink-cloud-backend` `5fc008d32e771205260f120621c1c4fc62d0824e` | `SOURCE_VERIFIED` |
| New App review snapshot | `xlink-technician-app` PR #42 request-time HEAD `599945780d7c7724ec864b25845832954a148554` | `SOURCE_VERIFIED` for that snapshot only |
| Production API | Approved local technician profile; all four distinct enabled `place_order` service/source contexts found across the complete 121-row current role WorkOrder list | `PROD_READ_ONLY_CATALOG_CHAIN_VERIFIED_FOR_FOUR_CONTEXTS` |
| Production MongoDB | No query performed; no dedicated, pre-proven read-only DB role was established for this audit | `BLOCKED_SCOPE` |

The canonical Production business dictionary was read before interpreting Production data: `xlink/docs/z.其它/业务字典-生产统计口径.md`. The checked-in Production application DB configuration is not treated as proof of a read-only Mongo principal and was not used to connect.

No raw response, customer value, record ID, literal price, credential, cookie, token, full API URL, or complete `bjProducts` document was written to this repository. Production observations below are structural counts, field-presence counts, and primitive type summaries only. Do not treat these bounded samples as universal schema or business truth.

### Production request accounting

The earlier bounded domain-shape audit made **10 HTTP requests** in its final successful run (one login and nine reads). Two earlier harness iterations were stopped by the local route/body guard; across those earlier attempts there were three logins, ten successful reads, two locally blocked attempts, and zero business mutations.

The first catalog chain in [G4F selectable catalog Production read](G4F_SELECTABLE_CATALOG_PROD_READ_20261104.md) read 9 WorkOrder pages (27 rows) and 27 list-derived details. The [2026-11-05 follow-up](G4F_SELECTABLE_CATALOG_PROD_READ_20261105.md) read all 41 pages and 121 details in the current technician's role-scoped WorkOrder list; all 121 details succeeded, four distinct enabled `place_order` service/source pairs were found, and no fifth pair remained when the list was exhausted. Catalog/SKU reads completed for contexts 2–4. Contexts 1–3 each exposed 27 Packages, 66 Procedures, 89 Materials, 4 Measures and 93 context-local SPUs; context 4 exposed 1 Package, 0 Procedures, 14 Materials, 0 Measures and 15 context-local SPUs. Each context completed all four selector catalogs, all listed Package details, the material sales ExtField and Code dictionary, and every bounded direct/Package-batch SKU read. All four active SKU result sets were empty; raw identities were not retained, so cross-context SPU overlap is unknown. A separate bounded Order identity pass read the first type-1 Order page for 121 role-visible WorkOrders (41 WorkOrder pages; 121 Order-list requests). It observed 89 Order rows across 79 WorkOrders, 94 groups and 573 normalized lines, 40 distinct material SPU IDs, 0 SKU IDs, 28 material SKU codes, no same-line SKU/SPU ID or code pairs, and one truncated three-row Order list. All requests were role/context fenced; local session storage remained memory-only. The Order identity pass is incomplete at that one page boundary. **Production business mutation requests: 0.**

`function/changeRole`, Order/workflow mutations, upload, coupon, customer interaction, and arbitrary-ID Order reads were not called in the catalog-context runs. The catalog proof covers all four distinct enabled `place_order` service/source pairs found in the current 121-row WorkOrder list for the same technician role; it does not authorize other identities or writes.

## 2. Executive findings

R1 is a stateful Order composition workflow, not a generic catalog picker. Its central persisted shape is one `Order` containing a serialized `bjProducts.orderList[]` of repair-part groups, with separate package, procedure, material, and measure collections. Package material layers and direct Material SPU/SKU selection have different identity and configuration rules.

The Lead’s model-level findings are supported by pinned source. Two important refinements emerged:

1. **Price override path is source-verified.** R1’s four `queryWithRank` controller methods inject `form=mini`; the client need not send that parameter explicitly. Backend `GoodsServiceImpl.queryWithRank()` uses it to project service/package/procedure/measure pricing. This corrects the earlier source-only concern that the R1 call might omit the flag.
2. **`sourceType` presence is security/data-scope significant.** R1 constructs catalog requests with a `sourceType` property. Backend `GoodsServiceImpl` branches on `params.containsKey("sourceType")`, changing organization/belong-to filtering. The new App maps `ServiceAppointment.exts.sourceType`, but omits the request property when its value is absent. R1’s actual wire behavior for missing/empty values was not proven; do not assume omission and empty string are equivalent.

The current App’s grouped model and package-layer bridge preserve important architecture, but a Production read pass is not full R1 behavior parity. Dynamic `order` ExtField validation is not represented by the fixed App validator; all current Material SKU reads returned empty; the newly read service-specific selector dictionaries are not yet applied as complete per-category UI filters; and R1’s create path has workflow, coupon, PDF/message, and ServiceAppointment side effects that remain unverified by live writes.

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
| Work Order (`ServiceAppointment`) | `_id` identity; `serviceType` string; `exts.sourceType` string-like; workflow/node runtime data | Supplies catalog context and action/workflow ownership. R1 entry routes pass service/source values into the order page. New App detail maps `serviceType` and `exts.sourceType` into `quotationCatalogContext`. | Source verified; four distinct Production list-derived details supplied usable contexts for enabled `place_order` actions, values kept in memory. All 121 current role-listed WorkOrder details were read successfully and no fifth eligible context was found. |
| Dynamic order fields | ExtField `name`, `nameDisp`, `type`, `required`, `valueOption`, `frontEndConfig`; values in form data / Order `exts` | `colName=order`; `showList=4`; runtime `showType=placeOrder`/`submitOrder`; service/person type and `showField/showValue` affect display/validation. File values are flattened during encoding. | R1 source verified; sanitized tenant-wide active Production shape captured (32 rows). Work-order-specific effective `placeOrder` set and provider values remain unknown; see [capture](G4F_ACTIVE_ORDER_EXTFIELD_SCHEMA_SHAPE.md). |
| Repair-part group | `repairParts` path; `partDescription`; `constructionSite`; `maintainAreaNum`; `agelimit`/`agelimitMax`; category collections | One `orderList` row is a business grouping context. Area is text in R1; package/procedure quantity may initialize from it. | Source verified; three bounded type-1 Orders normalized to four groups total. |
| Package | `_id`, `name`, `type`, `agelimit`, `price`, `minimumPrice`, `unit`, descriptions/images; applicability in `exts.repairParts` or `exts.constructionParts`; construction method; `spuCode`; pricing method branch | Filtered by service-specific repair/construction parts and optional age. Package detail components configure a bundle; package base/markup/floor are separate from direct material pricing. | Source verified. Production normalized list: 27 rows; `price` and `minimumPrice` numeric on 27/27; normalized `pricingMethod` absent in this projection. |
| Package component rows | component reference; `number`; `coefficient`; `coefficientUnit`; `order`; `layer`; component price; embedded item | `findById` resolves package procedure/material/measure references. R1 orders materials by layer and requires one selection per populated layer. | Source verified. All 27 Production details mapped 64 procedure, 87 material, and 0 measure references. |
| Procedure | identity/name/content; unit; `guideUnitPrice`; `minimumGuideTotalPrice`; `exts.repairProcedure`; images/description | Filtered by `repairProcedure` dictionary (not repair-part taxonomy); selected quantity may initialize from group area. | Source verified. Production normalized list: 66 rows; both price fields numeric on 66/66. |
| Direct Material / SPU | SPU identity, `code`, `type`, `materialUnit`, `spec`, `specUnit`, image and service-price fields; sales attributes come from material ExtFields/code options | R1 opens a distinct specification flow; selects attribute values, loads SKU rows by `spuid`, then updates per-SKU quantity and derived SPU total. | Source verified. Production normalized standard catalog lists: 89 Material rows, with the same structural counts as in the first three verified contexts. Context 4 returned 14 Materials. The R1 sales field and dictionary were complete in all four contexts; raw identities and values were not retained. |
| SKU | SKU identity; parent `spuid`; attribute values in `exts`; `price`, spec/unit, quantity | R1 matches selected attribute values against each SKU and persists separate SKU rows under a material SPU before flattening/rehydration. | Source verified. The Production read route is bounded and adapter-authorized; contexts 1–3 each returned zero active SKU rows across 93 context-local SPUs, and context 4 returned zero across 15. Cross-context SPU overlap is unknown. No fifth eligible context was found in the complete current role list. |
| Measure (机措) | identity/name; unit; `guideUnitPrice`; `cost`; possibly minimum-guide field | Its own category and price semantics; not a generic procedure/material. | Source verified. Production normalized list: 4 rows; guide price numeric 4/4; `minimumGuideTotalPrice` and `cost` absent in this normalized sample. |
| Order / payload | `type=1`; `serviceAppointmentId`; `originPrice`, `totalPrice`, `otherAmount`, `preferentialAmount`, `discount`, description; `exts`; `bjProducts` | `bjProducts` is serialized JSON in the source model; it contains `orderList`, add/delete item arrays and amount components. R1 reads by queryById for edit; new App uses bounded list-scoped reads and projects rows into a read-only model. | Source verified. The first three sampled Orders yielded 4 groups and 15 lines with recognized product identities; the expanded 121-WorkOrder scan found no material database SKU IDs in its first pages. Raw `bjProducts` was not persisted. |

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

The current App now loads the serviceType-selected R1 selector dictionaries and applies the verified package-part, package warranty-age, Procedure and Material type filters in the shared catalog browser. Filter dictionary failure leaves the complete catalog available under “全部”; it never turns unknown classification data into a match. The 430×932 local H5 App regression covers each category and these filters, plus the existing package configuration and direct-item return paths. The direct Material SPU/SKU route is adapter-authorized read-only, but this context returned no active SKU rows, so a selectable priced SKU cannot be claimed. Live SKU availability and Production write behavior remain unverified.

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
| Work Order list/detail | First catalog context: 9 bounded role-scoped pages (27 rows), 27 details. Full current-role discovery: 41 pages (121 rows), 121 details, four distinct enabled `place_order` service/source contexts and no fifth. IDs and values stayed in memory. |
| Existing Order | First three role-listed WorkOrders returned matching `type=1` rows; 4 groups and 15 nested lines were recognized. The expanded first-page-only scan covered 121 role-visible WorkOrders, 89 Order rows/79 WorkOrders, 94 groups/573 normalized lines, 40 material SPU IDs, 0 SKU IDs, 28 material SKU codes, and no same-line SKU/SPU ID or code pair. One Order list exceeded the three-row bound, so global identity discovery remains incomplete. |
| Package list/detail | Contexts 1–3: 27 normalized rows each; all listed details mapped 64 procedure references, 87 material references, and 0 measure references. Context 4: 1 Package/detail, with 1 procedure and 1 material reference. Layer/coefficient/unit/component-price/embedded-item structure is preserved where returned. |
| Procedure list | Contexts 1–3: 66 normalized rows each; guide and minimum-guide price fields numeric in all sampled rows. Context 4: 0 rows. |
| Material list | Contexts 1–3: 89 normalized rows each; context 4: 14. Structural presence counts are as in the dictionary. Adapter-normalized `spuId` absent in the 89-row projection; raw response was not retained, so absence may be projection-related. |
| Measure list | Contexts 1–3: 4 normalized rows each; guide price numeric in all; no normalized minimum-guide or cost field in the sample. Context 4: 0 rows. |

Structural samples do not prove record-wide completeness, price correctness, package availability for every service/source type, complete SKU data, or active `placeOrder` workflow behavior.

## 7. R1 vs new App parity matrix (PR #42 snapshot plus bounded follow-up reads through 2026-11-05)

| Behavior | R1 evidence | New App snapshot | Status / impact |
| --- | --- | --- | --- |
| Work Order context | Entry receives service type, source type, node/workflow context | WorkOrder adapter maps service type and `exts.sourceType` to catalog context | `PARTIAL`: mapping exists; source-type absent/empty semantics differ or remain unknown. |
| Dynamic order fields | Runtime ExtFields with showList/showType, service/person conditions, required and conditional validation | Fixed group validator for repair path/description/area/package config/quantity | `DIFFERENCE`, P0: no proof all configured required fields are collected/validated before catalog or completion. |
| Repair-part grouping | `orderList[]` contains independent groups and four category lists | `QuotationDraft.groups[]` with repair path, description, area and typed selections | `PARITY` at composition-model level; broader field and warranty parity incomplete. |
| Package applicability/warranty | Service-type-dependent repair/construction part filter; age filter; min selected warranty | Package browser/detail and layer configuration; filter/warranty coverage is not full R1 parity | `PARTIAL`: wrong package eligibility or warranty can mislead selection. |
| Procedure taxonomy | Filtered through `repairProcedure` code dictionary and `exts.repairProcedure` | Direct provider selection exists; reviewed catalog UX does not reproduce this taxonomy | `DIFFERENCE`: user may not find the expected subset; taxonomy must not be replaced with repair parts. |
| Direct Material | `type1/type2` filter; SPU→attribute options→SKU; per-SKU quantities | Material sales ExtField/Code, bounded direct SKU read, and service-specific selector filters are implemented in the shared browser; dictionaries were read for all four current role contexts | `UNSUPPORTED/PARTIAL`: all four contexts returned zero active SKU rows (93/93 SPUs in contexts 1–3; 15/15 in context 4); no real selectable variant or final price is established. |
| Package composition | Package detail + each populated layer selected; component coefficients, spec and bundle code | 27 Package details and 26 nonempty package SKU batches were live-read; package layer configuration and typed component model exist | `PARTIAL`: source identities/read routes are verified, but no active SKU rows were returned and bundle calculation/encoding remains separate. |
| Price | R1 mini list projection and two separate total projections | Kind-specific catalog pricing model and Phase 1H price projections; unknown inputs blocked | `PARTIAL`: one exact current Package/detail matched its type-1 Order unit and total snapshot (1/1); another historical Package was absent from its current filtered list. No price freshness/version or server authority proof. Direct Material SPU comparison still has no eligible line. |
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
| `basic/serviceAppointment/query` or workflow-list variant | Role-scoped list read | 41 pages and all 121 current-role WorkOrders read to verify four distinct eligible contexts and exhaustion. All pages stayed within the three-row bound. |
| `basic/serviceAppointment/queryById/{id}` | Work Order detail read | One list-derived detail only. Do not use arbitrary IDs or the legacy permission bypass. |
| `biz/extField/query` | ExtField controller injects current account tenant and calls `extFieldService.query`; read path | R1 uses it for order and material field definitions. One bounded active material-sales-field query completed; the effective `placeOrder` order schema remains separately unknown. |
| `i/code/selectCode.do`, `i/code/selectMultistageCode` | Code-config controller delegates to code-service selection methods; source path reads dictionary/options | The material sales-field dictionary and serviceType-selected `packageType`, package-part, `repairProcedure`, `type1/type2`, `agelimitFilter`, and `maintenanceLayer` dictionaries were read under the R1 tenant. Dynamic cascade providers remain unverified. |
| `basic/order/query` | Controller injects current tenant unless caller supplies the bypass flag; accepts `notFilterBelongTo`, `notFilterOrgId`, `notFilterTenantId` which disable corresponding scope filters. The normal list path also applies `OrderServiceImpl.query` and `EMongoTemplate.findByPage` role/data-access filters. On an active schedule-flagged Work Order, R1 deliberately relaxes org/belong-to filters after validating that Work Order. | Used only with exact role-listed Work Order ID, `type=1`, page 1 and row limit 3. None of the bypass flags was sent. One Work Order's list reported more than three rows; no later Order page was read. |
| `basic/order/queryById` | Controller delegates to `OrderServiceImpl.queryById`, which performs `mongoTemplate.findById(id, Order.class)`. `EMongoTemplate.findById` delegates directly to `MongoTemplate.findById`; this path does not add tenant, Work Order ownership, Order type/state, org, or technician-role criteria. | Not called in Production; current App blocks it for Production browsing. R1 uses it for edit hydration, but that client behavior does not establish server authorization. |
| Four catalog `queryWithRank` routes | List/read, but sourceType changes data scope; mini form changes price projection | Bounded paginated reads for all four kinds using detail-derived context and exact allowlisted bodies; complete for the four distinct current role contexts. |
| `biz/projPackage/findById/{id}` | Resolves package child lists; no explicit per-record tenant guard is visible in the examined method | Called only for an ID returned by the just-read allowed package list. Arbitrary ID use remains prohibited. |
| `basic/material/query` (SKU) | Material controller delegates to `GoodsService.queryWithRank`; R1 filters active rows by `spuid`. This is distinct from `queryWithRank`'s R1 list endpoint and does not receive the controller-injected `form=mini` projection. | Bounded Production reads completed for all four current role-listed contexts, only for direct Material or exact Package-detail SPU provenance. R1 single `spuid` and package `in:spuid|array#and` shapes were exercised. Contexts 1–3 each had 93 SPUs and context 4 had 15; all active row sets were empty. |
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
3. **Order/model decode truth:** The first bounded page for 121 role-visible WorkOrders exposed 40 material SPU IDs and 28 material SKU codes, but no database SKU IDs. One Order list exceeded the three-row boundary. Preserve unknown fields as unsupported/read-only; do not infer SKU identity or hydrate an editable draft from an incomplete Order list.

### P1 — functional parity and field usability

4. The six static selector dictionaries are integrated with the shared catalog browser's package applicability/warranty, Procedure `repairProcedure`, and Material type1/type2 filters. Production dictionaries are verified for all four contexts in the current role list; other technicians/roles remain unverified.
5. The direct Material SPU→attribute→SKU read/config chain is source-scoped and verified as a Production read for all four contexts in the current role list. Contexts 1–3 each returned an empty active SKU result for 93 context-local SPUs; context 4 returned empty for 15. No fifth context appeared after all 121 role-visible WorkOrders and details were read successfully.
6. Package SKU route and source identity are covered by tests and were live-read in 26 nonempty package batches. Continue verifying coefficient/spec quantity, composite identity and bundle round-trip using synthetic fixtures derived only from source-verified shapes. Do not turn layer choice into a simple one-line selection.
7. Preserve two distinct money projections and source each amount field. Keep unknown price/freshness/discount state visibly blocked rather than turning missing values into zero.

### P2 — presentation

8. Image completeness/reachability, detail affordances and long catalog scanning need separate visual review after data/selection parity is defined. Do not fabricate photos, price labels or “报价完成” states.

## 11. Explicit unknowns / stop decisions

| Unknown | Status | Why it remains unknown / safe next evidence |
| --- | --- | --- |
| Current Production tenant-wide active `order` ExtField shape | `CAPTURED` | One authorized, bounded query returned 32 rows; sanitized details are in [G4F_ACTIVE_ORDER_EXTFIELD_SCHEMA_SHAPE.md](G4F_ACTIVE_ORDER_EXTFIELD_SCHEMA_SHAPE.md). |
| Effective `placeOrder` ExtField set for a concrete work order and provider option values | `UNKNOWN` | The capture is tenant-wide and redacts service/person values and option contents; the bounded catalog chain did not resolve the effective WorkOrder-specific order fields or their dynamic providers. Resolve within a specifically scoped read path; do not infer from the tenant-wide shape. |
| R1 wire behavior when `sourceType` is absent vs empty | `UNKNOWN` | Vue constructs the property; framework serialization of `undefined` and backend parameter presence were not proven. Resolve with local transport/source or a safe deterministic mock; do not add a Production request solely to guess. |
| Exact price-body provenance/freshness and per-row R1-vs-Production displayed amount | `UNKNOWN` | Source proves conditional override; audit retained no price values or approval records, and no version token was exposed in normalized model. |
| Material SKU rows/attribute options in Production | `OBSERVED_EMPTY_FOR_ALL_FOUR_CURRENT_ROLE_CONTEXTS` | Four distinct enabled `place_order` contexts were found in the complete current 121-row role list. Contexts 1–3 each returned zero active rows for 93 context-local SPUs; context 4 returned zero for 15. Cross-context SPU overlap is unknown; other roles, tenants, and future data remain unqueried. |
| Full existing type-1 Order distribution and multiple Orders under one WorkOrder | `PARTIAL` | First pages were read for 121 role-visible WorkOrders; 89 Order rows were returned for 79 WorkOrders. One page reported more than three rows and no Order pagination was performed, so this is not a complete distribution. |
| Historical material SKU identity in current Order pages | `OBSERVED_WITHOUT_DATABASE_SKU_ID` | 40 distinct material SPU IDs and 28 material SKU codes were observed; no SKU IDs or same-line ID/code pairs were found in the 121 first pages. Codes are not database IDs. One Order list is truncated at the page bound. |
| Active workflow node and Survey→placeOrder transition in current Production | `UNKNOWN` | The audit script did not capture a workflow transition; no workflow mutation was performed. Historical Phase 1K sample not finding a node is bounded evidence only. |
| PDF availability/validity and signing/contract lifecycle | `UNKNOWN` | No PDF was opened/downloaded; source shows PDF creation in mutation path; no customer action or write. |
| Production Mongo schema / DB collection shape | `BLOCKED_SCOPE` | No dedicated proven read-only DB role was supplied/verified for this audit; no DB connection or query. |
| Source runtime vs pinned source checkout drift | `UNKNOWN` | Pinned repositories identify reviewed source revisions; the bounded API reads do not fingerprint the exact Production deployment revision. |

## 12. Recommended smallest next slice

The static R1 Code dictionaries are wired into the shared per-kind catalog browser and have been read for every distinct enabled `place_order` context in the current role-visible WorkOrder list. The next slice is to reconcile the existing type-1 Order material identities against these context-local catalogs in one memory-only, read-only pass, and to keep database SKU IDs distinct from business SKU codes. In parallel, close the remaining model/scope P0s using non-Production artifacts where possible:

1. Add a sanitized, machine-checkable active `placeOrder` ExtField fixture derived from authorized source/evidence (or clearly mark it unavailable); define the normalized field/option-provider boundary and validate conditional required semantics with synthetic tests.
2. Determine and test R1 `sourceType` missing/empty serialization versus backend `containsKey` behavior. If the behavior cannot be proven, require a non-empty, detail-derived source context before catalog access rather than silently omitting scope.
3. Keep Material SKU selection blocked for the observed empty result; continue only when a separately source-proven context returns active rows. Keep Production reads bounded and gated.

This is an evidence status and next-slice recommendation. No Production write or UI filter behavior is authorized by the read evidence itself.

## 13. Verification and safety result

- R1 source trace: pinned checkout verified.
- Backend source trace: pinned checkout verified.
- Production API structural read: the catalog chain is `COMPLETE` for all four distinct enabled `place_order` service/source contexts in the current 121-row role-visible WorkOrder list; all 121 details succeeded and no fifth context was found. Contexts 1–3 each had 27 Packages, 66 Procedures, 89 Materials, 4 Measures, 27 Package details, 93 SPUs and 115 bounded SKU reads; context 4 had 1 Package, 0 Procedures, 14 Materials, 0 Measures, 1 Package detail, 15 SPUs and 15 bounded SKU reads. All four active SKU result sets were empty. The separate Order scan covered 121 WorkOrders and remains incomplete because one Order page reported more than three rows. IDs, codes, labels, option values and prices were not retained; only aggregate counts were recorded.
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
| Backend Order list scope, by-ID read and upsert effects | [`OrderController`](https://github.com/xlink-bj/xlink-cloud-backend/blob/5fc008d32e771205260f120621c1c4fc62d0824e/src/main/java/com/fsgo/modulemini/basic/OrderController.java#L49-L109), [`OrderServiceImpl.query/queryById/upsert`](https://github.com/xlink-bj/xlink-cloud-backend/blob/5fc008d32e771205260f120621c1c4fc62d0824e/src/main/java/com/fsgo/service/basic/OrderServiceImpl.java#L93-L220), [`EMongoTemplate.findById` direct lookup](https://github.com/xlink-bj/xlink-cloud-backend/blob/5fc008d32e771205260f120621c1c4fc62d0824e/src/main/java/com/osg/framework/mongodb/EMongoTemplate.java#L290-L310), [`EMongoTemplate.findByPage` tenant/role filtering](https://github.com/xlink-bj/xlink-cloud-backend/blob/5fc008d32e771205260f120621c1c4fc62d0824e/src/main/java/com/osg/framework/mongodb/EMongoTemplate.java#L835-L862), [PDF/message/Order/Work Order/SLA effects](https://github.com/xlink-bj/xlink-cloud-backend/blob/5fc008d32e771205260f120621c1c4fc62d0824e/src/main/java/com/fsgo/service/basic/OrderServiceImpl.java#L441-L493) |
| Backend package detail and raw Order storage types | [`ProjPackageServiceImpl.findById()`](https://github.com/xlink-bj/xlink-cloud-backend/blob/5fc008d32e771205260f120621c1c4fc62d0824e/src/main/java/com/fsgo/service/project/ProjPackageServiceImpl.java#L97-L160), [`Order.java`](https://github.com/xlink-bj/xlink-cloud-backend/blob/5fc008d32e771205260f120621c1c4fc62d0824e/src/main/java/com/fsgo/entity/basic/Order.java#L17-L55) |
| Reviewed new App context, catalog, price, encoder and fixed validator | [Work Order catalog context mapping](https://github.com/xlink-bj/xlink-technician-app/blob/599945780d7c7724ec864b25845832954a148554/src/adapters/api/technician-api.ts#L440-L480), [kind-specific catalog projection](https://github.com/xlink-bj/xlink-technician-app/blob/599945780d7c7724ec864b25845832954a148554/src/adapters/api/quotation-catalog-api.ts#L76-L218), [fixed quotation validator](https://github.com/xlink-bj/xlink-technician-app/blob/599945780d7c7724ec864b25845832954a148554/src/features/work-orders/quotation/validation.ts#L1-L150), [price projections](https://github.com/xlink-bj/xlink-technician-app/blob/599945780d7c7724ec864b25845832954a148554/src/features/work-orders/quotation/pricing.ts#L49-L185), [type-1 encoder](https://github.com/xlink-bj/xlink-technician-app/blob/599945780d7c7724ec864b25845832954a148554/src/features/work-orders/quotation/order-encoder.ts#L236-L360) |
