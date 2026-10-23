# P0 SKU Mock integration — source-verified scope in real main App

## New product/engineering behavior

The prior #76 synthetic SKU read gate was unit tested but was not wired to #77 main App read view. This PR closes that integration gap, without live API or commercial quote changes.

- `createSyntheticSkuReviewCoordinator` unifies local pure R1 Material and Package SKU projections with the bounded, current-principal-scope synthetic reader. Direct and Package remain separate readers.
- A SKU list reaches a selectable UI model only after an **accepted_synthetic** read with current synthetic session, role, WorkOrder, sourceType, tenant placeholder and listed-SPU allowlist, active and unique SKU identity, parent SPU and complete bounded page. A foreign SKU, duplicate, stale request, disabled DEV Mock or invalid principal remains blocked.
- `syntheticSkuReviewScope` intentionally recognizes only the pinned DEV QA session `local-mock-only-session` with mock WorkOrder/role/user; tenant and source codes are explicit **synthetic placeholders**, not real authorization. Session roleVersion is taken from the synthetic session if present, otherwise explicitly marked synthetic.
- The actual main App SKU review now asynchronously calls the guarded coordinator and stores admission status separately for direct/package. During scope/session/scenario changes, previous matching rows are cleared before requesting new rows; on unmount any outstanding request is invalidated.
- R1 sales attribute and package-layer matching remain pure, price/stock/order untouched. Users cannot invoke a material or layer selection while admission has not succeeded.
- Tests include source admission, complete/no SKU, malformed attributes, ambiguity, cross-SPU, duplicates, overlapping scenarios and read-source gating. Real H5 at 375/390 covers matching and blocked source status; original main App and legacy G4-F regressions stay required.

## Release gates

This is **not** real backend read authorization or network traffic. Mini/PC MaterialController delegates `basic/material/query` to GoodsServiceImpl.queryWithRank with sourceType-dependent authorization/filtering; specific WorkOrder/technician role/tenant authorization remains UNKNOWN (#75). Any live read requires explicit source-verified backend security proof, independently approved bounded Beta read, then Owner UX approval. No Production requests, business writes or main merge. Native runtime Gate #64 still blocked.
