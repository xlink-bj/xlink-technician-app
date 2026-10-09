# G4-F Active Order ExtField Schema Shape

Status: `BLOCKED_ENV`
Evidence class: source-backed request contract; no active Production schema was read.
Production API requests executed for this task: **0**. Business writes: **0**.

## Scope and result

This evidence task is limited to the active `Order` ExtField definitions returned for the currently authenticated Production account. It does not read customer orders, MongoDB directly, option contents, or any other API route. It does not authorize Dynamic Form, quotation UI, serializer, or workflow changes.

`PROD_API_SHAPE_VERIFIED = BLOCKED_ENV`. No reusable, already-verified Production session reference was available in the approved local environment. The required `XLINK_SCHEMA_API_BASE_URL`, `XLINK_SCHEMA_SESSION_REF`, and `XLINK_SCHEMA_EXISTING_SESSION_VERIFIED` inputs were absent. The script therefore made no Production request. No login was attempted, no environment file was edited, and no session/role/permission was changed.

Consequently, every live-schema fact below remains `UNKNOWN`; the source trace proves how a bounded query can be formed, not what the current tenant has configured.

## Source provenance

Application baseline for this evidence slice: `d5cc9cdf063480ce52df212338377998f8c0b650` (`codex/g4f-p0-safety`).

| Source | Pinned revision | Finding |
| --- | --- | --- |
| R1 `business/subpackages/order/placeOrders.vue`, `getFields()` | `xlink-bj/xlink-app@6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d` | R1 requests `biz/extField/query` for `colName=order`, enabled fields, MP detail `showList=4`, sorted by `order asc`; then interprets `frontEndConfig` for `placeOrder` / `submitOrder`, service type, and person type. |
| R1 `business/resources/js/common.js`, `common.osg.ajax()` | same revision | The default request is POST with `application/x-www-form-urlencoded` and a `JSESSIONID` cookie. |
| Backend `ExtFieldController.query()` | `xlink-bj/xlink-cloud-backend@5fc008d32e771205260f120621c1c4fc62d0824e` | Reads the current account and overwrites the request `tenantId` with `currentAccount.getTenantId()` before querying. |
| Backend `FlipPageInfo.init()` / `FlipInfo` | same revision | `size` and `page` are read from request parameters; `_all=1` activates all-record behavior. Defaults are size 20 and total-count enabled. |
| Backend `EMongoTemplate.findByPage()` | same revision | It counts the filtered query, then applies `skip` and `limit` to returned rows. With `page=1,size=50` and no `_all`, the row query is `skip(0).limit(50)`. |
| Backend `ExtFieldServiceImpl.query()` | same revision | Queries the tenant-scoped field definitions and may read current user/org/role `Customize` data to reorder response rows and adjust response width. It changes response objects, not stored ExtField records. |
| Backend `MobileInterceptor` / `mobile-context.xml` / `web.xml` | same revision | `/wm/*` uses the mini-program servlet. The mobile interceptor requires a non-empty `tenantId` parameter and an authenticated current account; it can load the account from the existing session or Redis token mapping. |

Source worktrees were inspected at the exact pinned revisions above. No reference repository files were changed.

## Identity, tenant, and role scope

- The query must use an already-existing authenticated session. The inspection script has no login path and will not create credentials.
- `MobileInterceptor` calls `getSession(true)`. If a supplied session is absent or invalid, servlet session creation is possible before the request is rejected. A current, verified session is therefore a precondition, not something this script can establish.
- For an accepted account, `MobileInterceptor` refreshes the Redis `token_<session>` TTL to eight hours. This is an authentication/session-cache write, not a business record write. It is an observable side effect of the route and is not described as “zero side effects.”
- The request includes a non-empty sentinel `tenantId` only because the interceptor requires that parameter. `ExtFieldController.query()` overwrites it with the authenticated account's actual tenant before service/database filtering. The sentinel is not a tenant identifier and is not used as the query scope.
- `ExtField` is excluded from the generic role/org data-access filter list in `EMongoTemplate`. The base field definition query is tenant-scoped; the current user/org/role can affect the `Customize` response overlay (ordering/width). Therefore this must not be described as a role-filtered ExtField set or universal across tenants.
- No `function/changeRole`, role selection, login, or customer/work-order endpoint is allowed in this task.

## Exact bounded request contract

If a verified existing session is made available later, the only request the script can issue is:

```text
POST /fsgo/wm/biz/extField/query
Content-Type: application/x-www-form-urlencoded
Cookie: JSESSIONID=<existing local session reference>

tenantId=__current_account_tenant__
colName=order
is:state|integer#and=1
in:showList|string#and=4
sortField=order
sortOrder=asc
page=1
size=50
```

`_all` is deliberately omitted. The backend reads `size` and `page` and applies `limit(50)` to the returned records. The backend also performs a count over the same scoped predicate because `FlipInfo.needTotal` defaults to `true`; the source does not expose a request parameter to disable that count. This count behavior is documented as a read-cost caveat. There is one page only: if the reported total exceeds the returned rows, the result is marked truncated and the script never requests page 2.

The URL must be HTTPS on the pinned Production host and exact `/fsgo/wm` context path. Redirects are rejected. The response body is capped at 1 MB in memory; the script makes no retry. An ambiguous transport outcome is reported as `OUTCOME_UNKNOWN_NO_RETRY`.

## Sanitization and persistence policy

The script parses the response in memory and emits only a structural projection. It omits row/document IDs, tenant IDs, `valueOption` IDs, labels, option values, raw `frontEndConfig`, condition comparison values, URLs, formulas, executable expressions, and the raw response. It retains only safe ExtField value-key identifiers, field type, enabled/showList/required/multiple/operation metadata, stage and applicability-presence/count flags, redacted dependency aliases, and whether a provider is configured. Repeated value keys remain shared aliases; ambiguous conditional dependencies are explicitly marked `AMBIGUOUS`, never guessed.

The script never evaluates `frontEndConfig`, follows a configured provider URL, calls an option provider, writes response data to disk, or persists a live result into this repository. Synthetic tests contain no Production data.

## Active schema applicability matrix

No Production field rows were returned in this task, so no role/service context can be classified from live configuration.

| Area | Status | Evidence |
| --- | --- | --- |
| Active enabled `Order` ExtFields | `UNKNOWN` | No API request; environment preflight blocked. |
| Mobile-detail applicability (`showList=4`) | `SOURCE_VERIFIED`, live set `UNKNOWN` | R1 request filter is source-backed; live rows were not read. |
| `placeOrder` / `submitOrder` stage rows | `UNKNOWN` | R1 interprets these config values; actual configured rows unavailable. |
| Required / conditional / dispensable patterns | `UNKNOWN` | Sanitizer supports redacted structural reporting; no live values were observed. |
| Service/person applicability | `UNKNOWN` | Runtime filter shape is source-backed; actual rule values and contexts were not read. |
| Provider kind and option definitions | `UNKNOWN` | Provider IDs/contents are intentionally excluded; no option endpoint is authorized. |
| Required-field Runtime support | `UNKNOWN` | Requires live schema plus later mapping review; this task does not implement Runtime behavior. |
| Existing `Order.exts` key round-trip | `UNKNOWN` | No customer Order reads or writes are in scope. |

## Remaining unknowns and next smallest step

1. A valid, already-established Production read-only session reference and its current-account verification are unavailable in this execution environment.
2. The active tenant's ExtField row count and structure are unknown.
3. User/org/role `Customize` response ordering and widths are unknown for the current principal.
4. Actual service/person applicability, requiredness, visibility dependencies, provider kinds, and supported Runtime mapping remain unknown.
5. Existing `Order.exts` preservation/round-trip behavior remains unverified.

Next step: make the already-verified existing read-only session available through the local, untracked environment expected by the script and attest `XLINK_SCHEMA_EXISTING_SESSION_VERIFIED=true` only after confirming it is the current session. Then run the explicit one-shot command once. If that precondition cannot be met without a new login, keep this issue `BLOCKED_ENV`; do not log in, broaden the route, query MongoDB, or infer the schema from R1.

## Local verification status

- `pnpm run inspect:g4f-active-order-extfield`: `NO_NETWORK_DEFAULT`, 0 requests.
- `pnpm run inspect:g4f-active-order-extfield --preflight-only`: `BLOCKED_ENV`, 0 requests.
- Explicit read mode with current missing session configuration: `BLOCKED_ENV`, 0 requests.
- `VITE_XLINK_ENVIRONMENT=test pnpm run verify`: PASS, 52 test files / 580 tests. This explicit test-only mode is needed in this shell because the app mock runtime intentionally treats an unspecified environment as Mock-off; no Production mode was used for tests.
- Synthetic parser/request/sanitizer tests: 6 passed; no Production data involved.
- Production API requests: **0**.
- Production business writes / workflow mutations / customer actions: **0**.
- MongoDB connections: **0**.
