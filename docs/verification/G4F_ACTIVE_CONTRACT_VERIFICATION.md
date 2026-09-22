# G4-F Targeted Active Contract Verification

**Result: PARTIAL — the initial 48 work-order-scoped lists had no type-0 quotation, while a later bounded account-level query returned 9 type-0 rows and one detail was read.** These scopes do not establish quote/work-order linkage, multiplicity, or a common path. A follow-up also read the active workflow definition; Survey-to-`placeOrder` causality remains unproven. This is evidence only, not authorization for G4-F implementation. See [R1 Quotation / Place-Order Runtime Follow-up](./G4F_R1_RUNTIME_FOLLOWUP.md).

| Property | Value |
| --- | --- |
| Repository / branch | `xlink-technician-app` / `rebuild/g4e-onsite-inspection` |
| Baseline | `0a50e9258d2edadd1c270477c16ce5c2cfc2e334` |
| Evidence capture date | 2026-09-22 (Asia/Shanghai) |
| Environment | Authenticated, non-production Beta |
| Mutation policy | Read-only; no quote, workflow, or customer action was issued |
| Persistence | No raw API payload, customer PII, credential, or session was persisted |

## Environment and evidence provenance

The local Beta reader used the app's configured non-production quick-login settings, pinned the API host to `xlinkbeta.fsgo365.cn`, and held the returned session only in memory. The phone, verification credential, tenant identifier, session cookie, work-order IDs, runtime IDs, and catalog IDs are omitted. All displayed identities below are descriptive aliases; no reversible ID map is included.

The active workflow list returned 373 rows across the authenticated account's read scope. For the quote-node sample, 48 distinct work orders had an active `placeOrder` node. The tool read each corresponding quote/order list successfully. This is an account-visible Beta sample, not a claim about all Beta tenants or records.

Read routes used included:

- `basic/serviceAppointment/querySAWorkflowNode`
- `basic/serviceAppointment/queryById/{id}`
- `workflow/queryNode/{workflowId}`
- `basic/order/clearOrderFieldQuery`
- `biz/projPackage/queryWithRank`
- `biz/procedure/queryWithRank`
- `basic/material/queryWithRank`
- `biz/measure/queryWithRank`

The local Beta client allowlist was extended only for specific read routes needed by this verification. Regression tests assert that workflow process, quote create/update/send, customer confirmation, form writes, media upload, unknown routes, and traversal paths are rejected before network access.

## Active workflow node

One actual account-visible active quote-stage node was read, followed by its work-order detail and workflow-instance node list. The values are sanitized; counts and field-presence observations are retained.

| Evidence | Observation | Status / boundary |
| --- | --- | --- |
| Raw category | `nodeDef.nodeType = placeOrder` | Direct wire observation; not inferred from the display label |
| App category | Adapter maps raw `placeOrder` to `WorkflowNode.category = placeOrder` | Source-backed normalization (`technician-api.ts`, workflow node mapping) |
| Runtime identity | Present; represented here as `Node-A` | Exact ID intentionally omitted |
| Lifecycle | Raw `state = 0`; current Adapter maps this to `active` | Direct wire + source-backed mapping |
| Display name | `下单` | Presentation evidence only; not used to establish category |
| Handler configuration | `handlerIds`: 1 entry; `nodeDef.userChoose`: 1 entry | IDs and values omitted; exact current actor-to-handler membership was not resolved |
| Viewable roles | `viewableRoleIds`: 2 entries | IDs omitted; exact current actor role membership was not resolved |
| Raw MP visibility flags | `mpShowable = false`, `mpShow = 0` | Values observed, but their effective semantics were not established; no hidden/visible conclusion is inferred from them |
| Account visibility | Node was returned by the authenticated account-scoped workflow query | Evidence of query visibility only; not a proof of every client-side role predicate |
| `formDefinitionId` | No `nodeDef.formDefId` or `nodeDef.formDefinitionId` observed | Absent on this node record |
| `formDataId` | No `formDataId` observed; a distinct `workflowFormDataId` property was present | The latter's semantics and mapping to `formDataId` are unverified; do not treat it as equivalent |
| Workflow reference | Raw `workflowId` present; `workflow/queryNode/{workflowId}` returned 7 nodes | Adapter currently looks for `runId` / `workflowRunId`; normalized run identity equivalence is not established |
| Workflow definition identity | A separate follow-up active node exposed top-level `WorkflowNode.defId`; its definition was read successfully (version `248`) | Follow-up observation; see linked document. This supersedes the earlier sample's missing definition ID, but does not prove transition causality |

**Active node result: VERIFIED for the observed node — its raw category is `placeOrder`.** The authenticated endpoint returned it, but exact role membership and the meaning of the two MP flags remain unknown. No policy or Action Content mapping was changed.

## Survey → quotation-stage handoff

The same workflow-instance snapshot contained seven nodes. The `勘察` node was a `repeat` category with raw state `10` (mapped by current source to closed), and the `下单` node had raw category `placeOrder` with state `0` (active). An appointment node in that same snapshot was also closed.

**Classification: PARTIAL.** The initial snapshot showed a closed Survey-stage node coexisting with an active `placeOrder` node. The follow-up definition read shows an ordered eight-node definition where `repeat`/勘察 immediately precedes `placeOrder`/下单; the inspected `placeOrder` entry had no `routeInCondition`, and its action-script contents were empty. Ordering plus co-occurrence still does not prove Survey completion caused activation. No workflow state was mutated to test the sequence.

## Current quotation read contract

The initial quote/order list used the R1-shaped work-order filter (active states `0,1`, descending `createTime`) and was reachable for all 48 distinct account-visible active `placeOrder` work orders; it returned no type-0 rows in those work-order-scoped lists. A separate follow-up made one bounded account-visible query with `type=0`, states `0,1`, page 1 / 50 rows; that query returned 9 rows. One row was read through `basic/order/queryById` and its detail identity matched the list identity in memory. These results are not contradictory: the second query was not scoped to the 48 work orders.

| Check | Current Beta observation | Result |
| --- | --- | --- |
| Type-0 quotation in the 48 work-order lists | 0 observed | Scoped result only; does not imply no account-visible type-0 quotations |
| Separate bounded account-level type-0 query | 9 rows returned on page 1 / 50 rows | Bounded account-visible result, not global prevalence or a work-order association |
| Type-0 list → detail | One selected list row's detail identity matched in memory | Verified for one round trip; identity omitted |
| Type-0 detail structure | `bjProducts` present with keys `orderList`, `addItems`, `deleteItems`, `otherItemsAmount`, `preferentialAmount`; `processState` numeric code `0`; `exts.bjdPDFurl` present | One sampled detail only; no raw values persisted |
| Work-order / contract relation | `serviceAppointmentId`, `serviceAppointmentNum`, and `contractId` absent on the sampled detail | Does not establish linkage or relation behavior for all type-0 records |
| Confirmation relation | No top-level or `exts.confirm` observed on the sampled detail | Confirmation semantics remain unknown |
| Type-1 order rows | Present in some lists | Not treated as quotation evidence |

**Quote read result: PARTIAL — an account-scoped type-0 candidate and one detail are available, but no association to the active work-order sample was established.** This is not a global prevalence or workflow-path conclusion. Historical R1/backend shape remains in [G4-F Quotation Domain Truth](./G4F_QUOTATION_DOMAIN_TRUTH.md) and is not substituted for a current record.

## Current provider and price reads

Provider queries were bounded to page-sized samples, using service/source context from the observed work-order read where available, enabled-state filtering, and the R1 ordering convention. Returned rows were inspected for structural field names/types only; literal prices, names that could identify customers, and IDs are not recorded.

| Provider | Route | Bounded live result | Identity / price fields observed | Tenant, organization, version |
| --- | --- | --- | --- | --- |
| Package | `biz/projPackage/queryWithRank` | 10 rows | `_id`, `tenantId`, `orgId`, `name`, `unit`; numeric `price`, `minimumPrice`; nested `materialList`, `procedureList`, `measureList` properties | Tenant/org identity fields present. No price/version/revision token observed in the sample. |
| Procedure | `biz/procedure/queryWithRank` | 10 rows | `_id`, `tenantId`, `orgId`, `unit`; numeric `guideUnitPrice`, `minimumGuideTotalPrice` | Tenant/org fields present. No price/version/revision token observed. |
| Ranked material | `basic/material/queryWithRank` | 10 rows | `_id`, `tenantId`, `orgId`, material unit/spec fields; numeric price/service-price/cost-price fields | Tenant/org fields present. No price/version/revision token observed. |
| Package SKU detail | R1 source uses `basic/material/query` filtered by `spuid`, after package detail | No current SKU chain verified | The package detail route did not return a successful read in this attempt; no SKU response is claimed | SKU filters, returned SKU identity, and SKU price semantics remain unknown live |
| Measure | `biz/measure/queryWithRank` | 1 row | `_id`, `tenantId`, `orgId`, `unit`; numeric `guideUnitPrice` and `cost` | Tenant/org fields present. No version token observed; a minimum-price field was not present in this bounded row, which does not prove global absence. |

All four provider list routes were reachable. The live request context contained service type and source type where present; these were not persisted. The inspected legacy backend applies tenant/organization scoping and price-body overlays, but this live sample does not prove the exact current Beta implementation of those rules. No freshness/version mechanism was observed; none is inferred.

**Pricing read result: PARTIAL.** Ranked package, procedure, material, and measure list contracts are observed. Package-detail → SPU → SKU read is not verified, and no provider revision/freshness token was observed.

## Write-contract evidence — source only

No write route was requested. Existing checked-in R1/backend evidence documents the following legacy command paths and boundaries:

| Operation | Source-backed route/shape | Unresolved semantics |
| --- | --- | --- |
| Create quotation | `POST basic/order/creatQuotation`, with serialized type-0 `Order` in the `data` field | No idempotency key or operation ID found; ambiguous create reconciliation is not established |
| Update quotation/order | `POST basic/order/upsert`, serialized `Order` in `order` | Concurrency/version semantics and current Beta behavior unknown |
| Send quote | `POST basic/order/sendMessage`, by order ID | Repeat-send and delivery reconciliation semantics unknown |
| Customer confirmation | `POST /i/bjd/quotation.do`, using confirmation-record identity | Confirmation requirement before conversion is not proven |
| Quote conversion | Legacy workflow start plus type-1 `basic/order/upsert` | Partial-failure/reconciliation contract unknown |
| Workflow completion | Generic workflow process path exists in R1, but is not called by type-0 quote creation | No quotation-specific completion contract proven |

R1 transport source treats HTTP 200 with `success === false` as a failure and literal `restart` as session expiry. Backend/source paths include business failures inside successful HTTP responses. These are source findings, not current Beta command-response verification. No create, update, send, confirm, conversion, workflow/process, or upload operation was attempted.

## Current accepted `place_order` → quotation Action Content architecture

The accepted frontend architecture is `placeOrder` → `place_order` → quotation Action Content. This is the current implementation and accepted architecture, not a claim that the Beta observations alone establish the only valid business interpretation. The Beta evidence does not overturn or independently prove that mapping.

| Existing layer | Current checked-in behavior | Consequence |
| --- | --- | --- |
| Workflow category projection | `placeOrder` maps to intent `place_order` in `workflowActionIntentForCategory()` | Current Workflow intent remains `place_order` |
| Workflow policy | `place_order` may be allowed when the node is visible/active and Workflow handler/role checks pass | This is Workflow Runtime eligibility; it does not authorize a real quote mutation or workflow completion |
| Standalone quotation intent | `quotation` remains independently classified as `policy_unverified` | This does not change the accepted `place_order` route |
| Action Content mapping | `actionContentKindForIntent('place_order')` resolves to `quotation` | `ActionWorkspace.load()` loads quotation content and initializes the Phase 1A/1B composition runtime |
| Quotation read/catalog | Action Workspace uses a Mock quotation fixture and local Phase 1A/1B composition runtime; Beta reads in these documents are evidence-only, not an app adapter | Real catalog integration remains `NOT_AUTHORIZED`; this foundation is not a live quotation read model |
| Mutation / completion | Quotation UI does not expose quote save/submit/confirm/conversion; `canSubmit` is false and Workflow Complete is not invoked | Real quote writes and Workflow Complete remain `NOT_AUTHORIZED` |
| Execution projection | `place_order` execution is enabled when Workflow policy allows it; form-backed actions separately require a form definition | This is current frontend behavior. The Beta snapshot verifies the raw active `placeOrder` node, but does not independently establish the unique business content semantics |

The live node confirms raw category, current lifecycle, and definition evidence, but does not by itself establish that this accepted frontend mapping is the only business interpretation, nor does it prove the lifecycle completion command or Survey data handoff. No policy or mapping code changed in this evidence follow-up.

## Remaining unknowns and blockers

| Item | Classification | Owner / next evidence |
| --- | --- | --- |
| Survey completion as causal trigger for `placeOrder` | `PARTIAL` | Follow-up definition establishes adjacency only; backend transition evidence/Product confirmation still needed |
| Type-0 quote work-order association and multiplicity | `UNKNOWN` | Sampled detail lacked work-order relation fields; identify authoritative association semantics or a representative linked record |
| Type-0 confirmation relation semantics | `UNKNOWN` | One sampled detail had no confirmation field; another representative record or backend contract is needed |
| Package detail / package SPU → SKU provider | `PARTIAL` | Package detail read did not succeed; establish its current read response and then inspect SPU/SKU relation |
| Price freshness/revision identity | `UNKNOWN` | Backend/Product must define a version token or explicitly establish that no conflict token exists |
| Quote create/update idempotency and reconciliation | `UNKNOWN` | Backend command/read contract required; no mutation performed |
| Exact actor authorization for the observed node | `PARTIAL` | Resolve the account role/handler membership against sanitized node configuration |
| `workflowId` versus normalized `workflowRunId`; `workflowFormDataId` versus `formDataId` | `UNKNOWN` | Confirm wire semantics before any Adapter mapping change |
| Whether Beta evidence alone establishes the unique business meaning of `place_order` | `UNKNOWN` | The accepted frontend mapping remains in force; product/backend semantics need separate evidence if a unique business-truth claim is required |

## Smallest next slice

The accepted quotation Action Content and Phase 1A/1B composition runtime already exist. Do not start Phase 1C or any real catalog/quotation integration yet. A next bounded read-only evidence slice may test another package detail to determine whether the observed HTTP 500 is package-specific, then continue the package → SPU → SKU and quote-association questions. The backend source null-dereference is only a plausible hypothesis, not a diagnosed cause. Real catalog access, quote writes, and Workflow Complete remain unauthorized.

## Safety and verification boundary

- Production API: not contacted.
- Beta business writes: none.
- Quote create/update/send/confirm/conversion: none.
- Workflow mutation/process: none.
- Customer action/communication: none.
- Credentials/session persisted in repository evidence: none.
- Raw Beta payload persisted: none.
- Reference repositories modified: none.
- G4-F production implementation: not started.
- G4-G: not started.

Historical source references and limits are recorded in [G4-F Quotation Domain Truth](./G4F_QUOTATION_DOMAIN_TRUTH.md). The current active observations above supersede only the previous *lack of active workflow/list/provider reads*; they do not upgrade historical source findings into live command contracts.
