# G1-A2 P0 API Read Contract Verification

## Status

Verification completed for the targeted beta read-only slice.

| Field | Value |
| --- | --- |
| Repository | `xlink-bj/xlink-technician-app` |
| Branch | `rebuild/g1-p0-api-read-verification` |
| Parent main at branch creation | `a2211487f0100c5df1b0f842c556036d01bb2597` |
| Observation timestamp | `2026-09-10T19:12:30+0800 CST` |
| Environment | R1 beta host `https://xlinkbeta.fsgo365.cn/fsgo/wm/` |
| Tooling | R1 `scripts/run_api_smoke.sh` and `scripts/run_api_inspect.sh` at R1 SHA `6ada6b5375324bfcd09ca7c569b96a4ff328173f` |
| Observation ID | `A2-20260910-beta-read-01` |
| Production calls | NO |
| Business mutations | NO |

The scripts ran from the existing R1 virtual environment. Response samples
were written to temporary directories outside all repositories and were not
committed. Credentials, tokens, cookies, tenant values, IDs, names, phones,
and customer data are not reproduced here.

## Call accounting

The tooling performed **40 HTTP requests**:

- 17 login requests made by the R1 runner before each inspection/smoke session;
- 23 read endpoint requests;
- all calls completed in the beta/test environment;
- all endpoint calls were read-only; login was authentication only.

The core smoke run passed login, role/menu read, work-order count read,
work-order list/detail reads, project count/list reads, and contract list read.
The targeted probes all returned successfully, including the corrected GET
form-detail probe and the empty-list probe.

## Sanitized request and response evidence

HTTP status `200` below means the R1 client completed the request without an
HTTP or JSON error. Values are intentionally represented as types, counts, or
field names only.

| Read target | Method / sanitized request shape | Observed status and envelope | Conclusion | Remaining uncertainty |
| --- | --- | --- | --- | --- |
| `index/phoneLogin.do` | POST form: `method`, redacted phone/code, redacted tenant parameter | 200 through every R1 session; login response accepted by runner and session cookie established in memory | Beta login/session path is confirmed. | Expiry, refresh, logout, error envelope, and MP/App differences were not exercised. |
| `function/changeRole` | POST form: role identifier list | 200; object envelope with boolean success and function/menu data | Role change is a permitted read-session setup operation for this verification. | Permission failure and role-selection edge cases. |
| `function/dataCount` | POST form: function capability list | 200; object envelope; live data object had no stable count keys in sanitized shape | Endpoint is reachable but does not yet prove tab-count semantics. | Mapping to work-order tabs remains P0. |
| `basic/serviceAppointment/querySAWorkflowNode` | POST form: page/rows, orderState, sortField/order, state filter | 200; paginated envelope; array length 2; numeric page/rows/total/dataCount | Non-`.do` path is a live read candidate. | Exact server equivalence with `.do` across all filters. |
| `basic/serviceAppointment/querySAWorkflowNode.do` | Same form shape as non-`.do` variant | 200; same paginated envelope and numeric count fields; array length 2 | `.do` alias is also a live read candidate. | Canonical path choice is an app policy decision, not proof that every edge case is identical. |
| `basic/serviceAppointment/query` | POST form: page/rows, sort, state filter | 200; paginated envelope; array length 2; numeric page/rows/total/dataCount | Non-`.do` path is a live ordinary-list candidate. | Exact filter parity with `.do`. |
| `basic/serviceAppointment/query.do` | Same form shape as non-`.do` variant | 200; same paginated envelope and numeric count fields; array length 2 | `.do` alias is also a live ordinary-list candidate. | Edge-case parity and Legacy-only callers. |
| `basic/serviceAppointment/queryWorkflowNode` | POST form: page/rows and sort | 200; paginated envelope; array length 2; numeric page/rows/total/dataCount | Non-`.do` workflow-node list remains reachable. | Whether V1 needs this path in addition to the two canonical list modes. |
| `basic/serviceAppointment/queryWorkflowNode.do` | Same form shape as non-`.do` variant | 200; compatible paginated envelope; array length 2 | `.do` workflow-node alias is reachable. | Semantic distinction from `query` remains bounded but not fully characterized. |
| Empty `querySAWorkflowNode` result | POST form with synthetic no-match title regex and normal paging | 200; paginated envelope; `data` array length 0; numeric count fields | Empty results are represented as a normal empty page, not an error. | Count behavior for every tab/filter combination. |
| `basic/serviceAppointment/queryById/{id}` | POST form: `type=query`; ID redacted | 200; object envelope with `serviceAppointment`, `workflow`, `workflowNode` | Detail read shape is confirmed. | Nullability and fallback behavior for missing/unauthorized IDs. |
| `workflowDef/queryById/{workflowDefId}` | POST path identifier only; identifier redacted | 200; boolean success envelope with top-level `entity` object | Definition read returns an `entity`, not `data`. | Definition/version relationship to runtime node records. |
| `workflow/queryNode/{runId}` | POST path identifier derived from live workflow read; ID redacted | 200; boolean success envelope; `data` array length 7 | Runtime node read returns the same observed node cardinality as the detail read. | Whether Legacy `runId` is always the workflow `_id` or a distinct runtime identifier. |
| `workflow/queryByParentWorkflowNodeId/{parentWorkflowNodeId}` | POST path identifier plus create-time/id sort; ID redacted | 200; boolean success envelope; `data` array length 0 for the selected parent | Parent lookup is read-safe and returns an empty child array when none are present. | Non-empty parent-child example and ordering semantics. |
| `biz/extField/query` | POST form: extId, order sort, active-state filter, `_all` | 200; paginated envelope; 74 field records; numeric count fields | Field-definition read contract is confirmed for the observed form. | Cross-form field-type coverage and server-side pagination limits. |
| `biz/extForm/query/{formDefId}` | POST form: create-time sort and redacted form-data identifier filter | 200; paginated envelope; one form-data record | Form-data query returns a paginated array and links to workflow context. | Whether all form families use the same identity/filter pattern. |
| `biz/extForm/findByIdWithWorkflow` | GET query parameters and POST form were both read-probed with the same redacted ext/form-data identifiers | 200 for both; boolean success envelope; `data` contains nested `data`, `workflow`, `workflowNode` | GET and POST both returned the same observed read shape in beta. | Canonical verb and behavior for all form definitions. |
| `code/query` | POST form: active-state filter; one probe also supplied an observed valueOption as parentId | 200; paginated envelope; active query returned 20 code records; parent-specific probe returned an empty array | Code definitions are a readable dependency and use `parentId`/state-style filters. | Per-field dictionary expansion and cascade endpoint semantics remain incomplete. |

## Observed dynamic-form schema

The live `extField/query` response contained 74 fields. The observed distinct
`type` values were:

`area`, `bizSelect`, `cascade`, `datetime`, `file`, `foreignkey`, `map`,
`phone`, `radio`, `select`, `text`, `textarea`.

Additional sanitized observations:

- every observed field had a `required` key represented as a string;
- the top-level field object did not expose a `readOnly`/`readonly` key;
- the `frontEndConfig` value was a JSON string for all 74 fields and parsed as
  an object; its observed nested key union included `readOnly`, `multiple`,
  `max`, `maxlength`, `showField`, `showValue`, and display/platform flags;
- 28 fields had a non-empty `valueOption`, while 8 had a null `valueOption`;
- active code lookup returned a paginated code-definition shape; the selected
  parent-specific lookup was empty, so a complete option-resolution rule is
  not yet established;
- form-data reads returned workflow-linked records, while
  `findByIdWithWorkflow` returned a nested `data` plus workflow and node
  objects.

This is observed evidence, not the final supported-control matrix. In
particular, a nested `frontEndConfig.readOnly` value and the Legacy
`workflowNode.nodeDef.formFieldIdsReadOnly` behavior must not be collapsed into
one universal field rule without more evidence.

## Four contract decisions

| Decision | Result | Basis |
| --- | --- | --- |
| SESSION CONTRACT | **PARTIAL** | Beta base route, form POST, login/session token handling, and in-memory `JSESSIONID` behavior are confirmed by the R1 runner. Expiry/refresh/logout/error behavior and MP/App differences remain unknown. |
| WORK-ORDER LIST CONTRACT | **PARTIAL** | All three route families and both `.do` spellings returned compatible read envelopes; empty-page behavior is confirmed. Canonical tab/count relationship is not resolved because `function/dataCount` returned no stable count keys in the sanitized live shape. |
| WORKFLOW READ IDENTITY | **PARTIAL** | Live detail, definition, runtime-node, and parent-node reads expose the expected identifier fields and returned compatible node cardinality. `runId` versus workflow `_id` and non-empty parent-child semantics need one more read-only fixture. |
| DYNAMIC FORM READ CONTRACT | **PARTIAL** | Field/data/detail reads, 12 observed field types, required/config metadata, identity linkage, and code-definition envelope are confirmed. Complete option expansion, read-only precedence, and cross-form nullability remain open. |

## Remaining P0 gaps

These are the remaining read-contract P0 items. No P1 business write concern
has been promoted to P0:

1. Resolve session expiry/error/refresh/logout behavior and document the
   platform-neutral auth adapter boundary.
2. Resolve `function/dataCount` to list-tab count semantics and verify whether
   the selected non-`.do` canonical paths remain equivalent under all V1
   filters.
3. Verify `runId` versus workflow `_id`, a non-empty parent-child workflow
   read, and the exact definition-to-node-to-form identity join.
4. Bound dynamic-form option/code expansion, read-only precedence, and empty
   behavior across at least one additional form family.

## Safety record

- All live calls were beta/test reads or authentication setup.
- No production endpoint was called.
- No workflow transition, form write/remove, order/quotation write,
  appointment mutation, acceptance/construction write, upload persistence, or
  destructive action was called.
- No credentials, tokens, cookies, tenant secrets, or personal/customer data
  were written to the repository.
- R1/R2/R3 were not modified.
