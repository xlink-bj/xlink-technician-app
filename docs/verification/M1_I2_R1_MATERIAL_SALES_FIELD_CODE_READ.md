# M1 I2 / 8 — R1 Material sales ExtField → Code option read slice

Tracking [#92](https://github.com/xlink-bj/xlink-technician-app/issues/92) / [#33](https://github.com/xlink-bj/xlink-technician-app/issues/33). Stacked on the reviewed [Draft #100](https://github.com/xlink-bj/xlink-technician-app/pull/100) exact HEAD `436cf08f290375d06c00c69cdd6cefdc7c1b7528`. R1 sole functional source `xlink-bj/xlink-app@6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d` — `business/subpackages/order/placeOrders.vue:3498–3555`.

## Implemented in existing frontend read adapter

1. Optional `QuotationCatalogReadPort.listMaterialSalesFields(context)`, with complete authenticated principal/role and current WorkOrder context. Production read is blocked **before any HTTP**.
2. R1 request 1: POST `biz/extField/query`, body `{colName:'material',_all:'1','is:state|integer#and':1,sortField:'order',sortOrder:'asc'}`. Parse `frontEndConfig` as JSON, keep `salesAttribute===true` only, normalize `name/nameDisp/valueOption`. Duplicate/invalid/foreign fields block response.
3. R1 request 2 (only when sales fields exist): POST `i/code/selectCode.do` with `jsonPara = JSON.stringify([...{codeId:valueOption,eleid:valueOption}])` and the exact R1 tenant literal used by `getAttributes`. This **does not** change the configured auth tenant: if its value does not match the R1 tenant, **fail closed** rather than attempting another tenant. R1 itself hardcodes this ID; the app does not assert that every environment must use it.
4. Check authenticated principal identity is stable after each awaited read; discard responses on session or role changes. Reject incomplete, duplicate, unknown or malformed code dictionaries, returning only `{name,label,valueOption,options:[{value,label}]}` without raw config/tenant/account/price fields.
5. No source `exts` from any material SPU, no SKU row's `exts` and no official Order are exposed or written. This method is optional and **not yet attached to Quotation Vue**.

## R1 parity vs unverified behavior

| Dimension | Status |
| --- | --- |
| Existing R1 extField → Code endpoint and parameter shape | CODE + mock transport tests |
| Sales attribute metadata validation and label projection | CODE + unit tests |
| R1 fixed code tenant vs current auth tenant | Explicit check, no fallback |
| Response completeness and business permissions | **Real API not tested** |
| SKU selected from material's `exts` and SKU's `exts` by exact match | **Not implemented by this PR** |
| UI attribute picker, group re-selection, rollback, SKU ID persisted in R1 Order | **Not implemented by this PR** |
| Production/Beta/real devices | **NOT RUN**; gates unchanged |

The UI must not display global Code dictionary values as available options for a particular Material SPU until verified against that SPU's own `exts` and the matching SKU record. The existing synthetic `material-sku-contract.ts` is not a real provider/permission proof. It is intentionally safer to stage the real data source read and then join real SPU/SKU attributes in the next implementation batch.

**Acceptance accounting:** this is an **I2 stage**, not I2 4/4. #41 Owner UX approval and #29 Beta/#64 device testing remain independent gates; no new backend API or backend work is required.
