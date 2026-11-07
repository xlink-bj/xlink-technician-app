# STATUS Code query protocol correction (2026-11-07)

Scope: application adapter and synthetic Mock only. This slice does not authorize database changes, Production/Beta reads or writes, permission-policy changes, or deployment. The original protocol investigation was offline/read-only; main-only code consolidation and CI are separate verification steps. This corrects the historical `valueOption=STATUS` request recorded in `G4UX_REAL_READ_INTEGRATION.md`; that old report is not evidence that the request matches Java's Code schema.

## Source and observed contract

Read-only source: the existing local backend checkout, under `src/main/java/`:

- `com/fsgo/moduleweb/CodeController.java:26–31`: `code/query` constructs `FlipPageInfo` from the request.
- `com/fsgo/entity/Code.java:16–22`: Code stores `parentId`, `typeId`, `type`, `name`, `value`, `order`. There is no `valueOption` field.
- `com/fsgo/service/code/CodeServiceImpl.java:164–170`: current-account tenant filter and default `order ASC`.
- `com/osg/framework/util/FlipPageInfo.java:150–180`: request `rows` (or `size`), `page`, and `_all` parsing. `_all` is not used by this adapter.
- `com/osg/framework/mongodb/EMongoTemplate.java:469–531,605–635,985–1000`: `sidx`/`sord` override the service's default sort, are excluded from database field filters, and support comma-separated stable sorting. The identical filtered query is counted, then offset/limit are applied. `_all` would expand the size to the total and is forbidden here.
- `com/osg/entity/FlipInfo.java:120–164,202–205,273–293`: `size` and `rows` expose the same size, `total` is the full count, `dataCount` is the current page length, and offset is `(page−1)×size`.

Local-only evidence is preserved outside source at `xlink-local-dev/reports/stage7/status-provider-diagnosis.json` and `status-pagination-readback.json`. The first compares the old literal-field filter (0 rows) with the correct type predicate (35 rows, including the four pre-existing local-demo statuses). The second records same-identity page 1 and 2 at size 10: `total=35`, `dataCount=10`, `page/rows/size` agree, `sortField=order,_id`, `sortOrder=asc`, offsets 0/10, and no duplicate IDs. Its additional active-state filter is not introduced here: this correction preserves the existing caller's requested scope.

## Adapter contract

`CodeOptionsQuery.valueOption` is a port-level selector. On this endpoint it becomes `'is:type|string#and'`, not a literal `valueOption` database filter. `parentValue` still becomes `parentId` and is preserved on every page. No other filtering, endpoint, tenant, role, or authorization is added.

Every request is POST `code/query` with explicit `page`, `rows=50`, `sidx=order,_id`, `sord=asc`, and the caller's type/parent predicates. There are at most 10 requests / 500 rows. Query values are captured before awaiting, so mutation of a caller object cannot mix scopes between pages. Blank/malformed supplied filters fail instead of becoming an unfiltered query.

The result succeeds only when all expected rows have been read. It returns `{items,totalCount}`, with no misleading page-one/pageSize metadata for an aggregated result. `total=0` is a valid complete empty dictionary; provider failures are not an empty dictionary or evidence of missing business records.

Completeness checks fail the entire operation, without partial data, on:

- Missing/malformed/noninteger total; total above 500; any total change between pages.
- An uncounted/unbounded response flag or a provided sort field/direction that disagrees.
- Missing/wrong page or rows; a provided size that disagrees; page data not equal to the exact expected length. Optional `pages` and `dataCount` must agree if supplied. `dataCount` is never a substitute for total.
- Nonobject rows; missing/blank/malformed `_id`, `value`, or `name`; contradictory ID alias; wrong/missing requested type or parent.
- Repeated row IDs or option values, within or across pages, even if a duplicated label happens to match. No deduplication can conceal an incomplete page.
- A failed/stale page. Transport failures retain their category, and no automatic retry is issued.

The existing application composition (`src/app/composition.ts:152–167`) supplies the current session/user/role/optional roleVersion fingerprint. It is checked before dispatch and after every awaited page; absent/changed identity fails the complete operation. Standalone adapters without this optional scope callback retain their prior construction behavior. The actual composition + Uni transport test exercises this existing wiring, not a new test-only runtime option.

The endpoint has no snapshot/version token. Stable sort, count/identity checks, and session checks detect the listed inconsistencies, but cannot prove an atomic database snapshot against all concurrent same-count edits. No such guarantee is claimed. Reads do not share a cache or accumulator, so separate same-identity calls cannot mix pages; existing list/detail stores retain their request-generation and navigation invalidation.

## Callers and presentation

The only application consumers of `getCodeOptions` are adapter-owned list/detail STATUS resolution. The parent-only generic port path is also preserved and tested. Dynamic Code (`selectCode.do`), Cascade (`selectMultistageCode.do`), and forms-add (`listR1FormsAddOptions`) are separate paths and unchanged.

`taskLabel` retains `G4B_LIST_DATA_HARDENING.md` semantics: only a matching value in the fully verified STATUS dictionary may supply it. Unknown values, empty dictionaries or any incomplete/failed dictionary omit the label. There is no raw-status, node-name, form-name or global-map fallback.

## Mock and verification

The STATUS Mock fixture now contains Java-shaped `_id/type/value/name/parentId/order`, with real page/size/rows/total/dataCount semantics. Its route requires the verified type predicate, bounded paging and stable sort; it rejects the old `valueOption` wire, `_all`, unknown parameters, invalid bounds and wrong ordering. Parent filtering and subsequent-page slicing are real, not fabricated success. The existing synthetic labels and separate forms-add behavior are unchanged.

Focused coverage in `tests/engineering/code-query-options.test.ts`: multipage success, exact cap, empty dictionary, parent-only/combined filters, numeric-string envelope fields, missing/inconsistent totals/counts/IDs, duplicates, foreign rows, failed or stale pages, role/session/user/version changes, captured query, second-page labels in list/detail, dictionary-only failure, Mock protocol negatives, and unchanged Production transport denial with zero network calls.

This file records source and unit/transport verification only. Real-App browser acceptance, full repository checks and any live non-Production readback are separate gates, owned by the parent validation task. Production `code/query` remains denied by the existing allowlist.
