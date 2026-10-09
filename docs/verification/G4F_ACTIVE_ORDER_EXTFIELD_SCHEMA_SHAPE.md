# G4-F Active Order ExtField Schema Shape

Status: `SHAPE_READ_COMPLETE` — one bounded Production capture, sanitized.
Evidence class: current authenticated Production tenant configuration; not a customer Order or a work-order-specific effective form.
Capture date: 2026-10-09.
Capture execution base: `2a8c9f9579bd571ee8b59fd8c0492e9efd420e7d` with the bounded local inspector changes described below.

## Scope and result

The authorized Production quick-login path was used once, followed by exactly one `biz/extField/query`. The query returned 32 rows from a single page of 50; all 32 rows were sanitized in memory and the result was not written as a raw payload or separate response file. The capture reports `total=32`, `returned=32`, `truncated=false`.

This is the current authenticated account's tenant-scoped active `colName=order`, mobile-detail (`showList` includes `4`) ExtField configuration. It is **not** tied to a particular ServiceAppointment, active workflow node, service type, or person type. The returned configuration includes `placeOrder`, `submitOrder`, and rows whose stage is not identified by the sanitizer. Do not interpret it as the exact effective schema for a particular quotation action.

No customer Orders, Work Orders, MongoDB, option contents, or other API routes were read. No dynamic form, quotation UI, serializer, or workflow behavior was changed by this evidence capture.

## Execution and safety evidence

| Check | Result |
| --- | --- |
| Local profile | Production `.env.prod.local` present; secret values were not printed or committed. |
| Target | Exact allowlisted HTTPS Production API host and `/fsgo/wm` context path. |
| Mock / Real writes | Mock off; Real business writes disabled. |
| Login | One normal app quick-login through `resolveQuickLoginInput` → `AuthSessionAdapter` → `createUniAuthBackendDriver`; success. |
| Session | Login response yielded a session snapshot with user and current role; adapter's in-memory current session matched it. The successful schema response also confirms the server accepted that session for this read. No identity or role identifiers were persisted. |
| Role switch | `function/changeRole` not called. |
| Schema query | Exactly one `POST biz/extField/query`; no `_all`; `page=1,size=50`. |
| Other network requests | 0; the request guard allowed only the single login route and the single exact schema route. Redirects and retries are disabled. |
| Business mutation | 0. No Order/Work Order/Workflow/customer action, upload, or other business mutation was sent. |
| Persistent local storage | Not used by the capture; session adapter storage was in-memory only. |
| MongoDB | Not connected. |

The user explicitly authorized normal Production login. Login is an authentication operation and may update authentication/session/permission context as part of the existing server login flow; that is distinct from a business record mutation. The schema query route may refresh the authenticated token/session-cache TTL and the backend performs a count over the same scoped predicate. These source-backed effects are not described as “zero side effects.”

If login had been rejected, incomplete, or ambiguous, the script would have stopped before the schema query. It does not retry. If the one schema request has an ambiguous result, it reports `OUTCOME_UNKNOWN_NO_RETRY` and does not resend.

## Source provenance

Application capture harness: local branch `codex/g4f-order-extfield-schema`, starting HEAD `2a8c9f9579bd571ee8b59fd8c0492e9efd420e7d`; the capture-only diff extends the inspector to use the app's normal login adapter and retains the exact single-route guard.

| Source | Pinned revision | Finding |
| --- | --- | --- |
| R1 `business/subpackages/order/placeOrders.vue`, `getFields()` | `xlink-bj/xlink-app@6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d` | R1 requests `biz/extField/query` for `colName=order`, enabled fields, MP detail `showList=4`, sorted by `order asc`; then interprets `frontEndConfig` for `placeOrder` / `submitOrder`, service type, and person type. |
| R1 `business/resources/js/common.js`, `common.osg.ajax()` | same revision | The default request is POST with `application/x-www-form-urlencoded` and a `JSESSIONID` cookie. |
| Backend `ExtFieldController.query()` | `xlink-bj/xlink-cloud-backend@5fc008d32e771205260f120621c1c4fc62d0824e` | Reads the current account and overwrites request `tenantId` with `currentAccount.getTenantId()` before querying. |
| Backend `FlipPageInfo.init()` / `FlipInfo` | same revision | `size` and `page` are read from request parameters; `_all=1` activates all-record behavior. |
| Backend `EMongoTemplate.findByPage()` | same revision | With `page=1,size=50` and no `_all`, the returned-row query is `skip(0).limit(50)`. Total-count is enabled by default, so the backend also counts the same scoped predicate. |
| Backend `ExtFieldServiceImpl.query()` | same revision | Queries tenant-scoped field definitions and may read current user/org/role `Customize` data to adjust response ordering/width. It changes response objects, not stored ExtField records. |
| Backend `MobileInterceptor` / servlet mapping | same revision | `/wm/*` requires a non-empty `tenantId` and authenticated account. It can load the account from the session or Redis token mapping and refresh the token-cache TTL. |

Reference source worktrees were inspected at the pinned revisions. No reference repository files were changed.

## Exact bounded request contract

The only schema request was:

```text
POST /fsgo/wm/biz/extField/query
Content-Type: application/x-www-form-urlencoded; charset=UTF-8
Cookie: JSESSIONID=<in-memory Production session reference>

tenantId=__current_account_tenant__
colName=order
is:state|integer#and=1
in:showList|string#and=4
sortField=order
sortOrder=asc
page=1
size=50
```

The non-empty `tenantId` sentinel is required by the interceptor; the controller overwrites it with the authenticated account's actual tenant before the service query. It is not treated as a tenant identity by the capture script. `_all` was omitted. The single page was complete (`32/32`); no second page was requested.

The exact target is HTTPS on `xlink.fsgo365.cn`, context `/fsgo/wm`, with no query, fragment, credentials, or nonstandard port. The response is capped at 1 MB in memory. The inspector has zero-network default behavior; the explicit authorization flag enables only one normal login and one exact schema read. It neither persists the session nor writes the response.

## Sanitization policy

The final persisted projection omits ExtField row IDs, tenant IDs, option IDs and contents, labels, raw value keys, raw `frontEndConfig`, applicability values, condition comparison values, URLs, formulas, executable expressions, and the raw response. It aliases row identity as `Field-NN` and value-key identity as `ValueKey-NN`; repeated raw keys share the same opaque alias. Raw keys are used only transiently in memory to resolve duplicates/dependencies and are not emitted by the final sanitizer or persisted. Service/person restrictions are counts/presence only. Conditions use row aliases and redacted comparison values. No actual form values or customer data were queried.

The one authorized query was executed before the final alias-only output tightening; that run emitted the sanitizer's safe schema key identifiers to the local command output, but did not persist a response file or write those identifiers to the repository/GitHub. The final sanitizer and repository evidence now retain only opaque aliases. No second Production request was made.

`runtimeCapability` is a type-level comparison against the current `classifyFieldType()` capability set, not proof of end-to-end action readiness. `provider.readiness` is reported separately because a generic control can exist while its live option-provider contract is not implemented or verified. No option-provider endpoint was called.

## Sanitized field matrix

`required` is the raw required flag normalized to true/false/unknown. `showList` is retained because applicability to mobile detail is part of the queried contract. `Stage` is derived only from normalized `frontEndConfig.showType`; an unknown stage remains unknown. Field and value-key identities below are opaque aliases; no raw key/label is persisted.

| Row | Value-key alias | Type | Required | Stage | showList | Provider | Runtime type capability |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Field-01 | ValueKey-01 | cascade | yes | PLACE_ORDER | 4 | cascade configured | SUPPORTED_GENERIC |
| Field-02 | ValueKey-01 | cascade | yes | PLACE_ORDER | 4 | cascade configured | SUPPORTED_GENERIC |
| Field-03 | ValueKey-02 | text | yes | PLACE_ORDER | 4 | none | SUPPORTED_GENERIC |
| Field-04 | ValueKey-01 | cascade | yes | PLACE_ORDER | 4 | cascade configured | SUPPORTED_GENERIC |
| Field-05 | ValueKey-02 | text | yes | PLACE_ORDER | 4 | none | SUPPORTED_GENERIC |
| Field-06 | ValueKey-02 | text | yes | PLACE_ORDER | 4 | none | SUPPORTED_GENERIC |
| Field-07 | ValueKey-03 | radio | yes | PLACE_ORDER | 4 | code configured | SUPPORTED_GENERIC |
| Field-08 | ValueKey-04 | radio | yes | SUBMIT_ORDER | 1,4 | code configured | SUPPORTED_GENERIC |
| Field-09 | ValueKey-05 | gap | no | SUBMIT_ORDER | 4 | none | PRESENTATION_ONLY |
| Field-10 | ValueKey-06 | text | yes | SUBMIT_ORDER | 1,4 | none | SUPPORTED_GENERIC |
| Field-11 | ValueKey-07 | text | yes | SUBMIT_ORDER | 1,4,5 | none | SUPPORTED_GENERIC |
| Field-12 | ValueKey-08 | text | yes | SUBMIT_ORDER | 4 | none | SUPPORTED_GENERIC |
| Field-13 | ValueKey-09 | phone | yes | SUBMIT_ORDER | 1,4,5 | none | SUPPORTED_GENERIC |
| Field-14 | ValueKey-10 | text | yes | UNKNOWN | 1,4 | none | SUPPORTED_GENERIC |
| Field-15 | ValueKey-11 | text | yes | SUBMIT_ORDER | 1,4 | none | SUPPORTED_GENERIC |
| Field-16 | ValueKey-12 | text | yes | SUBMIT_ORDER | 1,4 | none | SUPPORTED_GENERIC |
| Field-17 | ValueKey-13 | digit | yes | PLACE_ORDER | 4 | none | SUPPORTED_GENERIC |
| Field-18 | ValueKey-14 | button | unknown | PLACE_ORDER | 4 | none | UNSUPPORTED |
| Field-19 | ValueKey-15 | select | no | UNKNOWN | 1,4 | code configured | SUPPORTED_GENERIC |
| Field-20 | ValueKey-16 | text | no | UNKNOWN | 1,4 | none | SUPPORTED_GENERIC |
| Field-21 | ValueKey-17 | select | yes | UNKNOWN | 1,4 | code configured | SUPPORTED_GENERIC |
| Field-22 | ValueKey-18 | area | yes | UNKNOWN | 2,4,5,6 | none | UNSUPPORTED |
| Field-23 | ValueKey-19 | text | yes | UNKNOWN | 1,4 | none | SUPPORTED_GENERIC |
| Field-24 | ValueKey-20 | area | yes | SUBMIT_ORDER | 2,4,5 | none | UNSUPPORTED |
| Field-25 | ValueKey-21 | text | yes | SUBMIT_ORDER | 1,4 | none | SUPPORTED_GENERIC |
| Field-26 | ValueKey-22 | date | yes | UNKNOWN | 1,2,4 | none | SUPPORTED_GENERIC |
| Field-27 | ValueKey-23 | textarea | no | UNKNOWN | 1,4 | none | SUPPORTED_GENERIC |
| Field-28 | ValueKey-24 | textarea | no | UNKNOWN | 1,2,4,5 | none | SUPPORTED_GENERIC |
| Field-29 | ValueKey-25 | gap | no | UNKNOWN | 4 | none | PRESENTATION_ONLY |
| Field-30 | ValueKey-26 | file | yes | UNKNOWN | 1,2,4 | none | SUPPORTED_GENERIC |
| Field-31 | ValueKey-27 | gap | unknown | UNKNOWN | 4 | none | PRESENTATION_ONLY |
| Field-32 | ValueKey-28 | file | yes | UNKNOWN | 1,2,4 | none | SUPPORTED_GENERIC |

Summary: 9 rows are tagged `PLACE_ORDER`, 10 `SUBMIT_ORDER`, and 13 have unknown stage. Requiredness is true for 24 rows, false for 6, and unknown for 2. Type-level runtime classification is 26 `SUPPORTED_GENERIC`, 3 `PRESENTATION_ONLY` (`gap`), and 3 `UNSUPPORTED` (two `area`, one `button`). Seven rows have configured code/cascade providers (four code, three cascade); their provider data was not fetched. Two rows have dispensable rules: Field-19 and Field-20 depend on Field-21, with comparison values redacted. All returned rows normalize to `visibility=ALWAYS`; no conditional-visibility dependency was reported by this projection. `operationType` normalized to `UNKNOWN` for all 32 rows.

Repeated value keys are not collapsed into one field row: ValueKey-01 appears on Field-01/02/04; ValueKey-02 appears on Field-03/05/06. They share aliases but remain separate row aliases. Applicability metadata reports only whether service/person restrictions exist and the number of service-type values; actual values are omitted.

## Component support and review findings

- **Directly mapped by current Runtime type capability:** text, phone, digit, date, textarea, radio, select, and cascade types in this capture are recognized as `SUPPORTED_GENERIC`. This is not a claim that provider options or final Order serialization are already wired.
- **Presentation-only:** the three `gap` rows are not editable values.
- **Unsupported by current Runtime type classifier:** Field-18 (`button`, tagged `PLACE_ORDER`), Field-22 (`mailArea`, required `area`), and Field-24 (`projectArea`, required `area`). Field-22 has unknown stage; Field-24 is tagged `SUBMIT_ORDER`. Although each includes mobile-detail code `4` in `showList`, the precise effective field set still depends on service/person context and R1 stage behavior. They are explicit mapping-review items, not silently treated as supported.
- **Provider-backed:** three cascades and four code-backed controls have a provider reference configured. Option values were not fetched, and a configured reference alone does not prove that the app has the correct provider route/options.
- **Media:** Field-30 and Field-32 are required `file` fields with a generic type-level component. Their Order-specific upload, persistence, and `Order.exts` round-trip contract remains unverified.
- **Applicability:** actual service-type/person-type values were intentionally omitted. Stage and restriction counts do not prove which rows apply to a specific current work order.

These findings do not authorize a schema adapter, quotation UI, Order serializer, provider request, or business write. Lead review must decide how the unsupported `area`/`button` rows and media/provider semantics affect the future quotation migration.

## Remaining unknowns

1. The exact effective `placeOrder` field set for a concrete ServiceAppointment, service type, person type, workflow node, and form context.
2. Human-readable labels, option values, and option-provider contracts. They were intentionally excluded from the persisted projection; no option endpoint is authorized by this capture.
3. Whether the `button` row represents a visual control, a command, or an R1-only special case; the field type is not supported by the current generic Runtime.
4. Whether the `area` rows are applicable to any place-order form context; one is tagged `SUBMIT_ORDER`, the other has unknown stage. Both are required in the captured config and unsupported by the current classifier.
5. Order-specific photo wire/persistence behavior and restoration of existing `Order.exts` values.
6. Dynamic field round-trip and serialization behavior. This task is read-only and did not read Orders.
7. Whether tenant-wide field configuration differs from other tenants or principal-specific response overlays.

## Verification

- `pnpm run inspect:g4f-active-order-extfield -- --preflight-only`: `PREFLIGHT_PASS`, 0 network requests.
- Synthetic sanitizer and safety tests: 7 passed.
- Authorized execution: `SHAPE_READ_COMPLETE`; login 1, schema query 1, unexpected requests 0; business mutations 0.
- Role switch / customer Order / Work Order / option-provider / MongoDB requests: 0.
- Raw Production response or credentials persisted: **No**.
