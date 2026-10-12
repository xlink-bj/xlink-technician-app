# M1 I2 / 8 — R1 Material SPU→SKU read compatibility, slice 1

Owner / scope: [I2 #92](https://github.com/xlink-bj/xlink-technician-app/issues/92), [M1 #33](https://github.com/xlink-bj/xlink-technician-app/issues/33). **Frontend-only R1 parity; existing backend unchanged.**

**R1 sole functional source:** `xlink-bj/xlink-app@6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d`, `business/subpackages/order/placeOrders.vue`. **New App baseline:** I1 accepted [Draft #99](https://github.com/xlink-bj/xlink-technician-app/pull/99) HEAD `f7bdebb6db3dc97271a361ef0a04a96d3db9309d`.

## R1 → New App request parity

| R1 source | Precise provider request | New App | Current status |
| --- | --- | --- | --- |
| `getMaterialSKU(spu)` :6191–6198 | POST `basic/material/query` form body `{_all:'1','is:state\|integer#and':1,spuid:spu._id}` | Optional `QuotationCatalogReadPort.listMaterialSkuVariants(context,[spuId])`, `quotation-catalog-api.ts` | **SOURCE_REQUEST_PARITY_CODE_PASS_PENDING_CI**, no UI caller, real read NOT_RUN |
| `getPackageMaterialSKU(materialList)` :6306–6315 | POST `basic/material/query` with `'in:spuid\|array#and':materialList.map(item => item.materialId).join()` plus same `_all/state` | Same typed method with **multiple** source IDs; comma joined in R1 order | **SOURCE_REQUEST_PARITY_CODE_PASS_PENDING_CI**, no UI caller, real read NOT_RUN |
| `getMaterials` :5624–5635 & `getMeasures` :5682–5692 | Ranked list sends `sourceType:this.sourceType`, even when R1 object contains an explicitly empty string. | WorkOrder adapter now preserves ServiceAppointment.exTs `sourceType:''` as **present**, and ranked catalog adapter sends it unchanged in **nonproduction**. An **absent** field stays absent. | **EMPTY_VS_MISSING_SEMANTICS_CODE_PENDING_CI**; no invented fallback or tenant ID |
| R1 `:6231–6239,6347–6366` | Existing selected SKUs are deduped by SKU ID and partitioned by exact SPU ID; provider prices/spec quantities remain attached to each actual row. | New read projection keeps only `id,spuId,name,specification,unit` and rejects cross-SPU/inactive/duplicate; **it does not mutate selected composition, auto-select SKU, or claim price authority**. | **IDENTITY_ONLY**, not a complete R1 material selection implementation |
| Sales attributes `getAttributes`, `attributeValueClick`, `skuMatch` :3420,6243–6264, plus R1 ExtField/Code endpoint calls | Source-specific `frontEndConfig.salesAttribute`, `valueOption`, `i/code/selectCode`; matching by actual `sku.exts`. | Existing pure `material-sku-contract.ts`/DEV mock are **not live**; typed read intentionally does **not** expose raw arbitrary `exts`. | **NOT YET CONNECTED / NEXT I2 TASK** |

## 规格属性/字典源路径（已核对 R1；当前尚未接入）

R1 `placeOrders.vue:3498–3555` 的 `getAttributes()`：
1. `biz/extField/query`，参数 `{colName:'material',_all:'1','is:state|integer#and':1,sortField:'order',sortOrder:'asc'}`，响应字段 `frontEndConfig` 由 JSON 字符串解析；只保留 `salesAttribute` 为真者。
2. 对每条销售属性字段 `valueOption`，R1 构造 `codecfg_${valueOption}`，批量 `jsonPara = JSON.stringify([{codeId:valueOption, eleid:valueOption}, ...])` 调用**现有** `i/code/selectCode.do`。
3. R1 这一请求中的 `tenantId` 是**旧页面中的固定字面值**，不是在该函数中从当前 Session 动态推导。后续新 App 不应猜测为另一个租户，也不能把该字面值扩展为跨租户权限。验证时需与固定 R1 行为保持一致，并在正式调用前确认同环境/角色的预期值。
4. R1 以响应 `[{eleid,options:{[value]:label}}]` 映射为销售选项；SKU `exts` 的属性组合通过 `placeOrders.vue:6243–6264` `skuMatch()` 全量匹配。**本轮新增 SKU 身份读取没有实现 Code 结果读取、销售属性 UI 或 SKU 属性组合匹配**，不能让未映射项默认通过。

R1 的 SKU 请求设置 `_all:'1'`，当前适配边界将它原样传递；既有后台返回条数/最大值仍须经过获准的真实请求才能证明“结果完整”，不得依据 `_all` 推断已获取所有 SKU。下轮将在现有报价目录/表单 port 上补足这条已存在的 R1 元数据链路，无须后台修改。

## Explicit boundaries / no false readiness

- The new read method is **optional** and has **no current UI or orchestrator caller**. It does not change quotation selection, official Order encoding, prices, coupon, contract, workflow or downstream side effects.
- **Production SKU requests are blocked before transport**. This is the existing production read-profile restriction, **not a claim that R1 backend needs new authorization**. No Production/Beta requests were sent. The request shape reuses the backend already used by R1; not a new server API.
- Non-production methods require a nonempty current ServiceAppointment WorkOrder identity/serviceType and bounded, unique, nonempty provider SPU IDs. They reject cross-parent rows, inactive rows, duplicate SKU IDs and malformed return identities. The protections are frontend data integrity checks, **not backend authority claims**.
- Ranked catalog `sourceType:''` is forwarded **only if actually present** in ServiceAppointment.exTs, and **only outside Production**; Production still rejects empty/absent sourceType for these catalog reads. This matches R1's distinction between property present and absent without inventing a value or expanding Production reads.
- No plan to force live SKU option picker into #41 unapproved formal quotation UX. Next phase is R1 `ExtField → salesAttribute → valueOption → tenant Code options → SKU attribute match` with exact typed selection and real UI once source/read gates are proven. In particular, SKU price, inventory, rate/discount and official Order value are not established by this slice.
- Max 30 distinct SPU IDs per batch is a **frontend request-size bound**. Larger R1 packages must be explicitly supported/tested without silently truncating rows before live UI admission.

## Regression / Gate

New `tests/g4f/r1-material-sku-read-compatibility.test.ts`: exact single and batch request forms; identity-only projection and sensitive-price exclusion; empty result; bad IDs/duplicate/unbounded batch; foreign SPU/inactive/duplicate response; pre-transport Production block; WorkOrder persisted empty sourceType and missing/whitespace distinction.

Final status remains **I2 IN_PROGRESS / 0 of 4 full DoD** until live R1 option/UX mapping and actual component regression complete. CI to be recorded against exact final PR HEAD; no branch merge.
