# G4-E Survey Domain Truth Deep Dive

Status: domain truth accepted; Survey semantic routing and effective contract
fidelity are implemented in the G4-E application Mock.
Environment: Beta / Dev (same development environment for this slice)
Captured: 2026-09-17
Issue: `#21`

This note separates the three business concepts that were historically mixed
in the Legacy inspection page. It is the domain-truth companion to the
earlier form/runtime evidence in
`docs/verification/G4E_FORM_SCHEMA_DEV_READ.md` and
`docs/verification/G4E_ONSITE_INSPECTION_EVIDENCE.md`.

## 1. Executive Business Conclusion

The backend evidence supports this business model:

```text
Service Appointment / 工单
  -> Survey / 勘查单
  -> Quotation / 报价
  -> Order / 订单
  -> Contract / 合同

Service Appointment / 工单
  -> InspectionAppointment / 巡检单
  -> Inspection Form / 巡检表单
```

The Survey and InspectionAppointment branches are different domains. Survey
is a typed backend entity persisted in the `survey` collection. Its form
fields are delivered through the Dynamic Form mechanism, but a Survey dynamic
form is not evidence that the form is an InspectionAppointment form.

The authenticated, read-only Beta scan found five historical inactive repeat
nodes named `勘察`, and no active repeat node with a safe form identity. The
historical `勘察` family has 61 field rows and matches the typed Survey model.
It does not contain the `inspectionSOP`, `inspectionContent`, `isQualified`,
`reason`, `suggest`, or `reformDate` fields from the previously committed
15-field development snapshot. The 15-field snapshot is therefore retained
unchanged but classified as a shared/historical hybrid, not promoted as the
current Survey contract.

This investigation does not establish the complete active Production schema
and does not authorize any write behavior. The bounded G4-E implementation
now derives its development Mock from the sanitized 61-row family while
retaining the 15-field artifact as quarantine-only evidence.

## 2. Terminology

| Term | Backend meaning | Domain decision |
| --- | --- | --- |
| Survey / 勘查 / 勘查单 | `Survey`, collection `survey`, domain `survey` | Survey measurement and survey result data. |
| Inspection / 巡检 / 巡检单 | `InspectionAppointment`, collection `inspectionAppointment`, domain `inspectionAppointment` | Inspection appointment, SOP/qualification and inspection report data. |
| Quotation / 报价 | Quotation is represented by an `Order` with `type = 0`, plus quotation confirmation data | Downstream commercial selection and pricing. |
| Order / 订单 | `Order`, collection `order` | Commercial order and package/price snapshots. |
| Form definition | `Ext` plus `ExtField` rows | Dynamic field contract; not automatically a typed entity. |
| Form data | A typed entity record or a dynamic `frm_<tenant>_<colName>` record | Must be interpreted with its form/domain identity. |

The words “inspection form” in the old page are not, by themselves, a safe
domain identifier. New code must use the verified backend identity and node
metadata rather than a display label.

## 3. Confirmed End-to-End Business Sequence

### 3.1 Survey sequence

The evidence-backed sequence is:

```text
read ServiceAppointment + workflow nodes
  -> select an explicitly identified Survey repeat node
  -> read ExtField rows for the node's form definition
  -> optionally read one exact FormData record
  -> save Survey form data
  -> complete/process the workflow node when authorized
  -> reread the authoritative appointment/workflow state
```

The typed Survey conversion is a backend concern. On a new Survey form upsert,
`ExtFormServiceImpl` maps the submitted fields into `Survey`, copies the
work-order identity fields from the related ServiceAppointment, and saves the
typed record. See
`xlink-cloud-backend/src/main/java/com/fsgo/service/biz/ExtFormServiceImpl.java`
(`154-183`, `242-278`).

### 3.2 InspectionAppointment sequence

InspectionAppointment has its own typed read and report path. The backend
reads the typed `InspectionAppointment` and its workflow state through
`InspectionAppointmentServiceImpl`; the report generator separately reads
the dynamic `InspectionForm` data, SOP data, images, recommendation and
related values. See
`xlink-cloud-backend/src/main/java/com/fsgo/service/basic/InspectionAppointmentServiceImpl.java`
and
`xlink-cloud-backend/src/main/java/com/fsgo/service/basic/InspectionAppointmentServiceImpl.java`
(`60-85`, `143-217`).

This is evidence of a separate domain, not permission to add arrival or
start-inspection semantics to G4-E.

### 3.3 Evidence boundary

The current Beta scan is structural and read-only. It did not perform an exact
form-data read because the observed repeat nodes exposed a workflow form-data
reference rather than a safe exact `formDataId`. No cross-record query was
used. No upload, process, upsert, accept, telephone call or Production
request was executed.

## 4. Survey Domain Model

The backend class
`xlink-cloud-backend/src/main/java/com/fsgo/entity/basic/Survey.java`
extends `ExtDataEntity` and declares collection `survey`. Its business shape
includes:

- Survey identity and work-order linkage: survey number, name, phone,
  address, `sid`, order/contract references and service-appointment number;
- measurement values: length, width, height, perimeter, plane area, square
  meter and gap length;
- measurement/media values: parts, survey drawings and infrared images;
- leakage/reason and memo values;
- service metadata and geographic identity;
- `serviceGoods`, a list of service-product identifiers;
- generated Survey PDF URL and progress.

The class is typed and persisted as Survey even though the field-definition
and form-data APIs are Dynamic Form APIs. This is the important distinction:
dynamic field delivery does not erase the typed Survey domain.

The live historical `勘察` family is consistent with this model: it includes
measurement fields, `part`, Survey images, leakage causes, memo and
`serviceGoods`; it has no Inspection SOP/qualification field family.

## 5. Survey Form / Dynamic Form Model

The backend Dynamic Form model is:

```text
Ext (form metadata, extId/colName/type)
  -> ExtField rows (field identity, type, options, required, visibility)
  -> FormData record
```

`Ext` defines `type = 0` as a dynamic form and uses `colName` to identify its
form namespace. `ExtField` links rows to `extId` and carries type,
`valueOption`, display name, `frontEndConfig`, required/multiple flags,
visibility and operation metadata. See
`xlink-cloud-backend/src/main/java/com/fsgo/entity/biz/Ext.java` (`15-30`)
and `ExtField.java` (`12-41`).

For dynamic forms the backend physical collection is
`frm_<tenant>_<colName>`. Typed entity extensions use their entity collection.
`ExtFormServiceImpl` chooses this path from Ext metadata rather than from a
Vue label. See
`xlink-cloud-backend/src/main/java/com/fsgo/service/biz/ExtFormServiceImpl.java`
(`query`, `327-380`, `515-538`).

The R1 field contract remains useful for wire semantics: field rows are
requested with `extId`, ascending `order`, active state and `_all`; existing
data is queried by the exact form-definition route and the exact-record
filter. The R1 reference available locally is the `xlink-app/business_jishi`
mirror. The requested `xlink-business-jishi-3.0` path is not present in this
workspace, so no claim is made that the mirror is the missing repository's
current tip.

## 6. Survey → Quotation Boundary

The verified crossing is identity and user flow, not field copying:

```text
Survey / ServiceAppointment context
  -> user opens quotation flow
  -> quotation independently loads eligible packages
  -> Order(type = 0) stores quotation package/price snapshot
```

R1's Survey page can use `serviceGoods` to recommend or select service
products, and the backend Survey type retains that list. However, the traced
quotation flow independently queries packages and stores the selected package
and price information under the quotation/order payload. No inspected backend
path copies `Survey.serviceGoods` into the quotation's commercial snapshot or
copies quotation prices back into Survey.

Therefore `serviceGoods` is not sufficient evidence of quotation selection,
price, discount, amount, payment or contract state. Those values belong to
the Quotation/Order boundary.

## 7. serviceGoods / projPackage Truth

### 7.1 `serviceGoods`

Evidence for `serviceGoods` is strong at the field/data-shape level:

- the typed Survey entity declares `List<String> serviceGoods`;
- the historical Survey form exposes a `bizSelect`, multiple-valued
  `serviceGoods` field;
- R1's Survey page loads package options and writes selected identifiers to
  `formData.serviceGoods`.

Its broader business meaning is only partially established: it is a Survey
service-product recommendation/selection compatibility value, not a complete
commercial quote.

### 7.2 `projPackage`

`ProjPackage` is a separate typed backend entity persisted in `projPackage`.
The read controller exposes `biz/projPackage/queryWithRank`, while update
routes are writes. The package class contains package identity, service type,
name, price/minimum price, warranty and scope information. See
`xlink-cloud-backend/src/main/java/com/fsgo/entity/biz/project/ProjPackage.java`
and `ProjPackageController.java`.

The R1 quotation page uses the package read endpoint independently, normalizes
package display and price data, and stores package snapshots under
`Order.bjProducts.projPackages`. `OrderServiceImpl` also creates product and
material snapshots from the quotation selection. See
`xlink-cloud-backend/src/main/java/com/fsgo/entity/basic/Order.java` and
`OrderServiceImpl.java` (`203-230`, `495+`).

Conclusion: package lookup and pricing are quotation-owned. Survey may expose
candidate service products, but it must not be treated as the commercial
pricing source.

## 8. inspectionSOP Truth

`inspectionSOP` is evidenced on the InspectionAppointment/InspectionForm
side, not the Survey side:

1. R1 reads the dynamic `inspectionSOP` collection through
   `biz/extForm/queryByColName/inspectionSOP`.
2. The legacy inspection page stores nested `inspectionSOPData` and uses
   qualification, cause, suggestion and inspection-image fields.
3. The backend InspectionAppointment report path reads dynamic
   `frm_<tenant>_InspectionForm` data and consumes `inspectionSOPData`,
   qualification values, inspection images, `reformDate` and `suggest`.
4. `InspectionAppointment` is a typed entity in the separate
   `inspectionAppointment` collection.

The old R1 page combines Survey measurement and Inspection concepts, which is
historical coupling. The current live historical Survey family has no
`inspectionSOP`, `inspectionContent`, `isQualified`, `reason`, `suggest`, or
`reformDate` rows. These names must not be added to a Survey Mock or treated as
Survey domain truth without a new verified identity.

## 9. Current 15-field Snapshot Classification

The committed `contracts/beta/inspection/current.json` snapshot is classified
as:

| Question | Classification |
| --- | --- |
| Composition | `SHARED/HISTORICAL HYBRID` — Survey-like measurement/product fields mixed with Inspection-like SOP/qualification fields. |
| Confidence in that composition | `STRONG` — the field families are directly present in the committed structural artifact and are consistent with the two traced legacy/backend paths. |
| Exact active Beta form identity | `UNKNOWN` / `PARTIAL` — no active node with a safe exact identity was captured in this scan. |
| Promote as current Survey contract | `NO` |
| Promote as current InspectionAppointment contract | `NO` |
| Remove or rename the artifact in this pass | `NO` — preserve it for compatibility and review history; do not silently rewrite it. |
| Keep as the G4-E Survey Mock source | `NO` — G4-E Mock now derives from the sanitized 61-row Survey family inventory below; this artifact remains quarantine-only. |

The 15-field snapshot is therefore a quarantined development artifact, not a
backend dictionary. It remains unchanged for historical compatibility tests
and is not imported by the G4-E application Mock.

## 9A. Survey Contract Rebase and Field Identity Model

G4-E application Mock data is generated from the sanitized Survey contract in
`contracts/beta/survey/historical.json`. That contract is a sanitized,
historical, inactive Beta observation with 61 field rows and row-level
behavior metadata; it is the approved structural basis for this development
Mock, not a claim about the active Production schema. The old 15-field hybrid remains isolated under
`contracts/beta/inspection/current.json`.

Each Survey field row has two identities:

| Runtime identity | Meaning | Allowed to repeat? |
| --- | --- | ---: |
| `fieldId` | Stable ExtField row identity used to address a field in the Runtime and UI. | No within a definition. |
| `valueKey` | Backend business field name used at the FormData value layer. | Yes; observed duplicates include `province`, `length`, `width` and `gap4`. |

The Adapter maps raw row `_id` to `fieldId` and raw `name` to `valueKey`.
Runtime field state, visibility and field-level interaction use `fieldId`;
value lookup, normalization and submission use `valueKey`. No Map keyed only
by `valueKey` may be used to represent field rows, because it would silently
drop repeated Survey rows.

The Mock preserves this boundary with deterministic `survey-field-*` row IDs,
passes the raw-shaped response through the production Adapter, and retains
the real Dynamic Form Runtime. Missing Survey providers and unsupported field
types remain explicit capability failures; the Mock does not turn them into
scalar controls or invent Production options.

## 10. Backend Persistence Map

| Business concept | Typed collection / dynamic namespace | Evidence |
| --- | --- | --- |
| Service Appointment / work order | `serviceAppointment` | `ServiceAppointment` and workflow services. |
| Survey typed entity | `survey` | `Survey.COLLECTION_NAME`; `ExtFormServiceImpl` has explicit Survey conversion/update handling. Do not infer a generic `frm_<tenant>_survey` write namespace. |
| Generic dynamic Ext form | `frm_<tenant>_<colName>` | Only true `Ext.type=0` dynamic forms use the generic dynamic namespace. |
| InspectionAppointment | `inspectionAppointment` | `InspectionAppointment.COLLECTIO_NNAME`; typed query/report service. |
| Inspection form | `frm_<tenant>_InspectionForm` | Inspection report generator. |
| Inspection SOP records | `frm_<tenant>_inspectionSOP` | R1 `queryByColName` and report path. |
| Quotation / Order | `order` plus dynamic quotation confirmation namespace | `Order.type = 0`, `bjProducts`, quotation controller/service. |
| Contract | `contract` | `Contract` links to order/service appointment. |
| Project package | `projPackage` | `ProjPackage` and package query controller. |

The `frm_<tenant>_*` notation is intentionally structural. No tenant value is
stored in this note.

## 11. API Map

### Read paths evidenced by R1/backend

| Purpose | Route / mechanism | Domain |
| --- | --- | --- |
| Work-order/workflow context | `basic/serviceAppointment/querySAWorkflowNode`, `queryById` | Service Appointment + Workflow Runtime |
| Field definition | `biz/extField/query` | Dynamic Form |
| Exact form record | `biz/extForm/query/<formDefId>` with exact `_id` filter | Dynamic Form |
| Survey/other form discovery | `biz/extForm/queryByColName/<colName>` | Dynamic Form; identity must be known |
| Code/multistage option provider | `i/code/selectCode.do`, `i/code/selectMultistageCode.do` | Dynamic options |
| Package options | `biz/projPackage/queryWithRank` | Quotation candidate data |
| Typed InspectionAppointment | `basic/inspectionAppointment/queryById/<id>` | InspectionAppointment |

### Write paths deliberately outside this investigation

`biz/extForm/upsert`, `workflow/process`, Survey/InspectionAppointment PDF
generation, package updates, order creation, uploads/media and telephone
actions were not executed. Their server validation, authorization, idempotency
and retry semantics remain separate implementation gates.

## 12. Beta Observed Form Families

The sanitized structural inventory is retained at
`contracts/beta/form-families/observed.json` as the scan index. The effective
Survey field contract is committed at
`contracts/beta/survey/historical.json`: 61 historical inactive rows with
labels, ordering, required/read-only flags, duplicate value keys, conditional
metadata and provider verification. No active Survey membership is asserted.

| Alias | Node / family | Observed shape | Classification |
| --- | --- | --- | --- |
| `beta-form-family-01` | `评价`, `node` | 4 fields | Other / evaluation |
| `beta-form-family-02` | `预约`, `node` | 6 fields | Other / service appointment |
| `beta-form-family-03` | `勘察`, `repeat` | 61 field rows, historical inactive only | Survey, strong structural match |
| `beta-form-family-04` | `建单`, `auto` | 74 fields | Other / work-order creation |

No exact FormData record was read for the historical repeat family because
the safe scan had only a workflow form-data reference. The scan did not issue
a broad form-data query and did not persist raw values.

## 13. Known UNKNOWNs

The following are intentionally unresolved:

- the exact active Beta Survey node/form identity and an exact sanitized
  FormData capture for it;
- the fixed Production Survey and InspectionAppointment schemas and their
  Beta/Production parity;
- the requested R1 repository path's current revision (the available local
  reference is the `business_jishi` mirror);
- the complete `serviceGoods` business semantics and the verified option
  provider payload for `projPackage`;
- the complete custom widget contracts for Survey measurement/media and
  Inspection SOP;
- database-level document examples and collection counts in this pass;
- database-configured Groovy pre/post/delete/integration script contents;
- server-side validation, authorization, idempotency and retry behavior for
  writes;
- whether any future inspection workflow requires durable offline media;
- Production parity and live active-node membership.

`LIVE_DATABASE_ACCESS = NOT AVAILABLE` for this evidence slice. The backend
repository contains example configuration with placeholders, but no explicit
sanitized/authorized Mongo read configuration was available in the local
environment. A legacy helper exists in the separate tooling repository, but
it has hardcoded fallback credentials and broad PII-oriented output, so it was
not run and was not used as evidence.

## 14. Architecture Consequences for the New App

The following consequences are implemented in the current bounded G4-E pass:

1. **Use domain identity before presentation identity.** A Survey action must
   be selected from an explicitly identified Survey node/form contract. Do not
   use the word “inspection”, a first list row, a field label or a historical
   form ID as a fallback.
2. **Do not use the 15-field hybrid as Survey Mock authority.** The current
   Survey Mock is derived from the sanitized 61-row family; the old artifact
   is quarantine-only. True `InspectionAppointment` symbols remain reserved
   for the backend inspection/SOP/report domain.
3. **Keep commercial fields out of Survey.** Package prices, totals,
   discounts, payment, order products/material snapshots and contract values
   belong to the quotation/order flow. `serviceGoods` can remain a Survey
   compatibility/recommendation value only when its provider and semantics are
   explicit.
4. **Keep dynamic behavior in Dynamic Form Runtime.** Definition, field
   visibility, requiredness, option providers and value normalization belong
   in Adapter/schema/Runtime. Custom controls are justified only for verified
   measurement, media or SOP contracts. Do not hardcode Survey fields or
   silently flatten unsupported multi-value/cascade/business-selector fields.
5. **Preserve the current safety boundary.** Until the missing identities and
   providers are verified, fail closed for unsupported fields and keep all
   live business mutations disabled.

## Evidence Scope and Safety

- Sources inspected: target App, available R1 mirror `xlink-app/business_jishi`
  and backend `xlink-cloud-backend`.
- Beta access used the repository's authenticated quick-login read-only path.
- All Beta observations were sanitized and held in memory; no raw payload,
  FormData value, customer/address/phone value, session, token, tenant
  identifier, media URL or raw business ID was persisted.
- The target App changes are limited to the Survey Mock source, field identity
  model and required Runtime wiring; no visual redesign was performed.
- No real business mutation, upload, phone call or Production request was
  performed.
- G4-F was not started.

## Verification Record

The repository verification commands for this bounded rebase are:

```text
pnpm run check:survey-contract
pnpm run check:inspection-contract  # historical compatibility artifact only
pnpm run check:boundaries
pnpm run typecheck
pnpm test
pnpm run build:mp-weixin
pnpm run build:app
```

The final command results and commit are recorded in the delivery message and
Issue #21. The active Survey inventory is checked by `check:survey-contract`;
the historical artifact is independently checked by
`check:inspection-contract`.
