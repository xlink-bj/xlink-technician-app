# M1-I7 — Cross-stage WorkOrder identity scope & stale-result safety

**Based on** New App `xlink-bj/xlink-technician-app@30194c2e2d3539c4849fd4e8b9603f52e75a4f6e`. Only frontend read-state hygiene, no backend modification or business commands.

## Confirmed defect and why this matters

Before this change, `useWorkOrderListStore.load` could commit a late response without validating the user/role/roleVersion, and `useWorkOrderDetailStore.load` compared only `sessionRef` after an asynchronous read. Both stores could retain an old list/detail when the same session changed role. The actual main pages observed login **status only**, so an authenticated role switch did not automatically refresh. Cached detail contained contact and workflow node data, and the subsequent quotation and signing preflight use these stores as upstream scope evidence.

## Engineering fix

- Shared `workOrderReadScopeKey` ties **sessionRef + userId + currentRoleId + roleVersion**, where missing role/version are represented distinctly rather than invented. It is ephemeral, not persisted/logged, and is strictly a **cache/read invalidation identity**, not server ACL proof.
- Pinia List and Detail stores watch current session identity with `flush:'sync'`, clear old role data immediately, and reject late HTTP results when the request version or identity changes, without returning the raw stale response to callers.
- Detail also rejects backend detail IDs that differ from the requested WorkOrder and denies phone contact on a mismatched identity. List phone contact requires the identical still-current row reference so an external old card object cannot trigger a call.
- Real List and Detail uni-app pages subscribe to both authentication status and scoped identity, reload exactly once on a new role, and clear stale accepted-order confirmation/quotation data. The initial page load remains driven by its reactive route-ready lifecycle, avoiding duplicate manual load.
- Regression tests cover same-token role switches, same-role roleVersion changes, changed-user identities, stale List/Detail requests, foreign detail IDs, old card/contact actions, logout and the fresh authorized-role reload. Main H5 mock smoke still runs as a distinct integration gate.

## Release restrictions

Does not create a new backend ACL, expand the existing read allowlist, change official type=1 Order behavior, enable Contract read, send signing/SMS, trigger workflow completion, make Production/Beta business writes, or claim real tenant and MP/Android/iOS physical-device verification. Formal M1 stays 1/8; I7 original DoD stays 1/4 until actual business, device and Owner gates. The exact new HEAD must pass its own `pnpm verify`, H5 and MP/App builds before engineering CODE_PASS.
