# G4-B AU-02 Work Order List Review

## Decision

The accepted evidence supports a bounded V1 list, not a claim of full Legacy
tab/count parity.

The review used the existing repository evidence with:

**REUSE → VERIFY → GAP ANALYSIS → TARGETED RESCAN**

No additional XLink request or reference-repository scan was required.

Sources reviewed:

- `docs/discovery/API_CONTRACT_BASELINE.md`
- `docs/discovery/API_EVIDENCE_TRACEABILITY.md`
- `docs/discovery/API_P0_READ_VERIFICATION.md`
- `docs/architecture/TARGET_ARCHITECTURE.md`

The accepted read evidence shows that the ordinary `query` family returns a
paginated envelope with page/rows/total/dataCount fields and that an empty
result is a normal empty page. `function/dataCount` did not expose stable tab
count keys. `.do` and non-`.do` variants were both observed, but their full
edge-case equivalence and canonical production spelling remain unknown.

## V1 policy

| Concern | G4-B decision | Evidence boundary |
| --- | --- | --- |
| Tabs | No tabs; one semantic **My Work Orders** list | Multiple tab semantics are not justified by the accepted evidence. |
| Counts | No count cards or tab counts | `function/dataCount` has no stable count mapping in the accepted live shape. |
| Refresh | Manual refresh reads page 1 and replaces the current list | This is the bounded app behavior; Legacy freshness/tab parity is not claimed. |
| Pagination | Page/pageSize request; load-more only when totalCount safely derives `hasMore` | Paging fields are evidenced; no arbitrary filters/sort fields are added. |
| Canonical path | Use the accepted adapter's ordinary `query` candidate | `.do` alias parity remains an explicit unknown. |

## Remaining UNKNOWNs

- exact Legacy tab/count mapping and whether a future V1 tab is required;
- canonical `.do` versus non-`.do` spelling across all edge cases;
- server freshness guarantees beyond the explicit manual refresh request;
- additional filters or ordering required by later business verification.

These UNKNOWNs do not widen the G4-B feature contract and are not resolved by
inventing backend fields in the shared port.
