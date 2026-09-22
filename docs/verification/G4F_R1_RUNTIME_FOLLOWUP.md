# G4-F R1 Quotation / Place-Order Truth — Active Beta Read-Only Follow-up

**Result: PARTIAL.** This read-only follow-up verified an active `placeOrder` workflow definition, observed type-0 quotation records in one bounded account-visible query, and read one type-1 Order linked to an active `placeOrder` work order. Survey-to-placeOrder causality remains unproven, and package detail → SPU → SKU remains blocked by the package-detail HTTP 500.

| Property | Value |
| --- | --- |
| Repository / branch | `xlink-technician-app` / `rebuild/g4e-onsite-inspection` |
| Evidence capture revision | `47adcc7739efe0de9afb996e7f30f04fb2829b67` |
| Capture date | 2026-09-22 (Asia/Shanghai) |
| Environment | Non-production Beta; local Beta guard passed; API host pinned to Beta |
| Session handling | App-configured login; session held in memory only |
| Evidence persistence | Sanitized structural observations only; no raw payload, raw ID, literal price, customer value, credential, or session persisted |
| Mutation boundary | No Beta/Production business mutation, customer communication, media upload, or workflow command |

This supplements [G4-F Active Contract Verification](./G4F_ACTIVE_CONTRACT_VERIFICATION.md). It does not authorize Phase 1C implementation or select a `place_order` / quotation architecture mapping.

## Scope and evidence provenance

Reads used the existing `scripts/beta-api-client.mjs` and its existing allowlist. The login configuration was resolved by `betaLocalDefaults()`, which rejects an unset or production environment; `assertBetaApiBaseUrl()` restricted requests to the Beta host. The returned session was passed directly to the in-memory client and was never emitted or stored.

Routes read in this follow-up:

- `basic/serviceAppointment/querySAWorkflowNode`
- `basic/serviceAppointment/queryById/{id}`
- `workflow/queryNode/{workflowId}`
- `workflowDef/queryById/{defId}`
- `basic/order/clearOrderFieldQuery`
- `basic/order/queryById`
- `biz/projPackage/queryWithRank`
- `biz/projPackage/findById/{packageId}`
- `biz/extField/query`

No route was added to the allowlist. The only package detail request returned HTTP 500; no response body was persisted. No SKU request was made because the detail read failed and the sampled ranked package rows did not expose a usable `materialList[].materialId` reference.

**Capture-integrity note:** An initial ephemeral summary utility did not recognize the top-level `FlipInfo.data` array and its zero counts were discarded. A follow-up shape-only check identified the envelope, and all observations in this document come from the corrected in-memory projection. The temporary utility and raw Beta responses were not written to disk.

## A. Active workflow definition

The account-visible active work-order query reported 373 rows. Four pages at 100 rows/page were read. Forty rows matched raw `nodeDef.nodeType = placeOrder` and raw `state = 0`; one such node with a `workflowId` and associated work-order identity was selected. These are account-visible counts, not tenant-wide or global counts.

| Check | Sanitized observation | Classification |
| --- | --- | --- |
| Active node raw identity | `nodeDef.nodeType = placeOrder`, `state = 0` | `VERIFIED` for the selected runtime node |
| Workflow instance read | `workflow/queryNode/{workflowId}` returned 7 nodes | `VERIFIED` |
| Top-level runtime `WorkflowNode.defId` | Present on the selected active `placeOrder` node; value omitted | `VERIFIED` |
| Workflow definition read | `workflowDef/queryById/{defId}` returned a successful definition | `VERIFIED` |
| Definition version | `248` | `VERIFIED` |

The sanitized runtime node sequence was:

| Runtime node type | State | Presentation label, if safely recognized |
| --- | ---: | --- |
| Not exposed in selected projection | 10 | — |
| `auto` | 10 | — |
| `auto` | 10 | — |
| `accept` | 10 | — |
| Not exposed in selected projection | 10 | — |
| `repeat` | 10 | 勘察 |
| `placeOrder` | 0 | 下单 |

The workflow definition exposes an ordered eight-node sequence. The node rows expose `nodeType`; a separate `category` property was not observed.

| Position | `nodeType` | Recognized label |
| ---: | --- | --- |
| 1 | `auto` | — |
| 2 | `dispatch` | — |
| 3 | `accept` | — |
| 4 | `repeat` | 勘察 |
| 5 | `placeOrder` | 下单 |
| 6 | `dispatch` | — |
| 7 | `accept` | — |
| 8 | `subflows` | — |

The Survey-stage `repeat` node is the immediate predecessor of `placeOrder`; `dispatch` is the immediate successor. The selected `placeOrder` definition entry had a `hideNodeId` property and a `nodeTypeDef` reference; both values are omitted. Its `routeInCondition` was absent. `preActionScript` and `actionScript` keys existed but had empty content on the inspected entry. No Survey-completion condition or script was observed there.

**Survey → placeOrder: `PARTIAL`.** The definition verifies ordering/adjacency, and the live workflow snapshot showed the Survey-labeled `repeat` node at state 10 with `placeOrder` at state 0. Neither fact establishes that Survey completion caused activation; no causal route condition, script, or before/after transition evidence was found.

## B. Type-0 quotation availability and detail

One bounded query used `basic/order/clearOrderFieldQuery`, page 1, 50 rows, `type = 0`, and states `0,1`, under the current authenticated account's Beta read scope. The response contained 9 matching type-0 rows. This proves records were visible in this bounded result; it does not establish global absence/presence outside the account/page or a common business path.

One returned row was read through `basic/order/queryById`. The detail `_id` matched the selected list-row identity in memory; no ID was retained.

| Detail property | Sanitized observation |
| --- | --- |
| `Order._id` | Present; omitted |
| `type` | `0` |
| `bjProducts` | Present; structured JSON keys: `orderList`, `addItems`, `deleteItems`, `otherItemsAmount`, `preferentialAmount` |
| `processState` | Numeric code `0` |
| Confirmation field/relation | No top-level `confirm` or `exts.confirm` field observed |
| `contractId` | Absent on this sampled detail |
| PDF field | `exts.bjdPDFurl` present; no top-level PDF field observed |
| Work-order relation | `serviceAppointmentId` and `serviceAppointmentNum` absent on this sampled detail |
| Other `exts` structure | Key names only: `bjdPDFurl`, `clientname`, `coupons`, `couponsName`, `couponsVal`, `isCreateBjdPDF`, `personType`, `repairParts`, `serviceType`, `sourceType`, `supervisorName` |

Because the sampled type-0 detail had no work-order relation fields, it could not be grouped under a work order or connected to the selected active `placeOrder` node. Multiple quotations under one work order therefore remain `UNKNOWN`.

## C. Type-1 Order under an active `placeOrder` work order

For one selected active `placeOrder` work order, a bounded `clearOrderFieldQuery` with `serviceAppointmentId`, `type = 1`, and states `0,1` returned one row. `queryById` then returned detail whose `_id` matched the list row and whose `serviceAppointmentId` matched the selected work order. This proves the relationship for this one current Beta sample, not the ordinary creation path for all `placeOrder` actions.

| Detail property | Sanitized observation |
| --- | --- |
| `Order._id` | Present; matched list identity, omitted |
| Work-order relation | `serviceAppointmentId` matched the selected work order; `serviceAppointmentNum` present; values omitted |
| `type` | `1` |
| `bjProducts` | Present; keys: `orderList`, `addItems`, `deleteItems`, `otherItemsAmount`, `preferentialAmount` |
| `orderList` | One group |
| Group structure | All present: `repairParts` (array), `partDescription` (string), `maintainAreaNum` (string), `projPackages` (object), `procedures` (object), `materials` (object), `measures` (object) |
| `processState` | Numeric code `0` |
| `confirm` | No top-level or `exts.confirm` field observed |
| `contractId` | Absent on this sampled detail |
| PDF field | `exts.bjdPDFurl` present; top-level `bjdPDFurl` absent |
| Price-related fields | `discount`, `preferentialAmount`, and `totalPrice` present; literal values omitted |

**Composition shape: `VERIFIED` for this one type-1 Beta sample.** Its `orderList[]` structure matches the R1 composition snapshot shape. No price values were captured.

## D. Package detail → SPU → SKU

The package rank read used service/source context from the selected work-order detail and the R1-compatible filters: enabled `state`, `serviceType`, optional `sourceType`, `_all = 1`, and `sortField = order,_id` / ascending order. The bounded current result contained 29 package rows. The sampled rank response's top-level field names included `unit`, `price`, `minimumPrice`, and `cost`; no version/revision/price-revision token name was observed in those rank rows. Literal values were not retained.

One package returned by that rank query was passed to the already allowlisted R1 path `biz/projPackage/findById/{packageId}`. Beta returned **HTTP 500**. Therefore no detail-level counts or types for `procedureList`, `materialList`, `measureList`, layer metadata, `materialId`, quantity, detail unit/minimum-price fields, or `pricingMethod` are claimed.

The rank rows did not expose a usable `materialList[].materialId` in the inspected sample, and package detail failed before its material structure could be read. The R1-compatible `basic/material/query` SKU request filtered by `spuid` was therefore **not issued**. SKU identity/spec/unit/sales attributes/prices and any SKU revision token remain `UNKNOWN`.

**Catalog detail chain: `PARTIAL`.** Package rank is readable; package detail currently errors; SPU → SKU was not proven. Existing Phase 0 ranked procedure/material/measure read observations remain as recorded in the prior active-contract note and are not upgraded by this follow-up.

## E. Current Order dynamic fields (`showList = 4`)

`biz/extField/query` read 55 enabled `colName = order` definitions. Locally filtering those definitions for mobile-detail `showList = 4` produced 34 rows. Only field definitions were retained; no Order/customer field values were read or written. Repeated `fieldName` values are separate service/configuration-specific definitions and must not be collapsed solely by name.

| Classification (`frontEndConfig.showType`) | Count |
| --- | ---: |
| `placeOrder` | 9 |
| `submitOrder` | 11 |
| Other (`sign` or `1`) | 14 (12 `sign`, 2 `1`) |

| Classification | Field name | Display label | Type | Required | `valueOption` |
| --- | --- | --- | --- | --- | --- |
| `placeOrder` | `repairParts` | 防水维修部位 | `cascade` | 1 | `parts` |
| `placeOrder` | `repairParts` | 刷新类型 | `cascade` | 1 | `refreshParts` |
| `placeOrder` | `partDescription` | 维修部位描述 | `text` | 1 | — |
| `placeOrder` | `maintainAreaNum` | 工程量 | `digit` | 1 | — |
| `placeOrder` | `partDescription` | 施工部位描述 | `text` | 1 | — |
| `placeOrder` | `repairParts` | 防水施工部位 | `cascade` | 1 | `constructionParts` |
| `placeOrder` | `partDescription` | 施工部位描述 | `text` | 0 | — |
| `placeOrder` | `constructionSite` | 防水施工位置 | `radio` | 1 | `constructionSite` |
| `placeOrder` | `button` | 选择产品 | `button` | absent | — |
| `submitOrder` | `personType` | 客户类型 | `radio` | 1 | `ChooseTypeOwner` |
| `submitOrder` | `gap0p` | 分割槽0公司 | `gap` | 0 | — |
| `submitOrder` | `gap0` | 分割槽0 | `gap` | 0 | — |
| `submitOrder` | `clientname` | 业主姓名 | `text` | 1 | — |
| `submitOrder` | `houseType` | 房屋类型 | `text` | 1 | — |
| `submitOrder` | `companyName` | 公司名称 | `text` | 1 | — |
| `submitOrder` | `telphone` | 联系方式 | `phone` | 1 | — |
| `submitOrder` | `agentExt` | 经办人 | `text` | 1 | — |
| `submitOrder` | `agentPhone` | 经办人电话 | `text` | 1 | — |
| `submitOrder` | `projectArea` | 施工省市区 | `area` | 1 | — |
| `submitOrder` | `projectAddress` | 施工地址 | `text` | 1 | — |
| `other: showType=1` | `couponName` | 优惠券名称 | `text` | 0 | — |
| `other: showType=sign` | `organizationCode` | 组织机构代码 | `text` | 1 | — |
| `other: showType=sign` | `certificateType` | 证件类型 | `select` | 0 | `certificateType` |
| `other: showType=sign` | `certificateNum` | 证件号 | `text` | 0 | — |
| `other: showType=1` | `contractType` | 合同类型 | `select` | 1 | `allContractType` |
| `other: showType=sign` | `mailArea` | 通讯省市区 | `area` | 1 | — |
| `other: showType=sign` | `mailAddress` | 通讯地址 | `text` | 1 | — |
| `other: showType=sign` | `beginDate` | 开始施工日期 | `date` | 1 | — |
| `other: showType=sign` | `supplementaryMemo` | 补充协议 | `textarea` | 0 | — |
| `other: showType=sign` | `description` | 备注 | `textarea` | 0 | — |
| `other: showType=sign` | `gap1` | 分割槽 | `gap` | 0 | — |
| `other: showType=sign` | `warrantyPhotos` | 维修部位图片 | `file` | 1 | — |
| `other: showType=sign` | `gap2` | 分割槽 | `gap` | absent | — |
| `other: showType=sign` | `repairPhotos` | 质保部位图片 | `file` | 1 | — |

Relevant `frontEndConfig` behavior was recorded by key/presence only, not by arbitrary values: `showType` partitions the 9/11/14 rows; several `placeOrder` rows also carry `serviceType` and/or placeholder configuration; `submitOrder` rows include person-type-conditioned metadata; `gap` rows include presentation HTML metadata; the `button` row has function/loading/presentation keys; `certificateType` has dispensable-field/validation keys; `contractType` has dynamic-option metadata; file rows expose max/upload-text configuration. This is Order-form metadata, distinct from `bjProducts` quotation composition.

## F. Evidence-bounded product conclusions

| Question | Conclusion | Boundary |
| --- | --- | --- |
| Does `placeOrder` mean direct ordinary creation of an official type-1 Order? | `PARTIAL` | One active `placeOrder` node and one type-1 Order linked to its work order were observed. The read does not prove which action/command created it or the ordinary path. R1 source contains separate quote/order branches; it is not current Beta command evidence. |
| Is persisted type-0 quotation an active/common path? | `PARTIAL` | Nine type-0 rows appeared in one bounded account-visible page. The selected detail had no work-order relation fields, so commonality and association to active `placeOrder` are not established. No global absence/presence claim. |
| Do current Beta type-1 Orders use `orderList[]` repair/service-part grouping? | `VERIFIED` for one sample | One type-1 detail contained one `orderList` group with all seven inspected fields, including `repairParts`, `partDescription`, `maintainAreaNum`, and package/procedure/material/measure objects. |
| Is editing an existing Order snapshot an available current Beta action? | `SOURCE_ONLY` / current runtime `UNKNOWN` | R1 `placeOrders.vue` accepts `orderId`, reads `basic/order/queryById`, and saves an existing snapshot through `basic/order/upsert`. A current Beta Order detail is readable, but this evidence did not exercise/verify an edit entry or write. |
| Is there a dedicated add-item/delete-item amendment workflow? | `SOURCE_ONLY`; current Beta workflow `UNKNOWN` | The sampled `bjProducts` contains `addItems` and `deleteItems`. R1 has `editType` modes for edit/add/delete within the existing Order editor/upsert path. No separate current Beta command/workflow was proven. |

The current Beta evidence sharpens the domain/composition model but does **not** decide whether `place_order` remains the Workflow intent mapped to quotation Action Content, is normalized to `quotation`, or follows another architecture. No policy or mapping code changed.

## Remaining unknowns and smallest next slice

- **Workflow causality:** the active definition proves Survey-stage adjacency only. A rule/transition source or authorized transition audit is still needed to upgrade `PARTIAL` to `VERIFIED`.
- **Type-0 quote association/multiplicity:** the sampled type-0 detail lacks `serviceAppointmentId` and `serviceAppointmentNum`; no same-work-order grouping or quote multiplicity can be inferred.
- **Package detail → SPU → SKU:** the Beta package detail endpoint returned HTTP 500. Material layers, package-level quantity/pricingMethod, SPU identity, SKU rows, SKU prices/units/attributes and SKU version tokens remain unknown.
- **Provider price freshness:** no version/revision token name was observed in the sampled package rank rows. This is a sample observation, not proof that no tenant/provider version exists.
- **Existing Order edit and add/delete modes:** R1 source evidence only; current Beta UI/authorization behavior unverified.
- **Command idempotency/reconciliation, price authority, quote Save versus Workflow Complete:** unchanged `UNKNOWN` items from the Phase 0/source audit; no write was attempted.

Smallest next useful step: resolve the package-detail HTTP 500 using backend/runtime evidence before claiming a package-detail/SPU/SKU adapter contract. The ranked list read contract can be treated separately from the unavailable detail chain. Keep the quotation intent/content architecture gated on Web/Product review; do not introduce real quotation writes or Workflow Complete.

## Safety

- Production API contacted: **No**.
- Beta quote/order/workflow writes: **None**.
- Quote create/update/send/confirm/conversion: **None**.
- Workflow process/start/complete: **None**.
- SMS, customer contact, contract signing/cancellation: **None**.
- Media upload: **None**.
- Raw IDs, literal prices, customer data, raw payloads, credentials, session: **Not persisted**.
- G4-F production implementation beyond the already accepted Phase 1B baseline: **Not started in this evidence task**.
- G4-G: **Not started**.
