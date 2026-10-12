# M1 I2 — Bounded R1 SKU Evidence Gate

Scope: pinned R1 xlink-bj/xlink-app@6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d / placeOrders.vue. This instrument provides bounded shape evidence, NOT R1 UI-parity proof or authorization to write an Order.

## One-shot local protocol

1. pnpm inspect:i2-r1-sku -> NO_NETWORK_DEFAULT. Zero HTTP requests.
2. Configure XLINK_I2_APPROVED_SPU_ID only in your local shell with one SPU that your current technician role is already authorized to see. Never paste IDs, source responses, credentials or .env.prod.local to GitHub/chat.
3. pnpm inspect:i2-r1-sku -- --preflight-only -> PREFLIGHT_PASS or BLOCKED_ENV, zero network. Requires configured Production profile, known allowlisted host, current quick-login, Mock OFF, and VITE_XLINK_ENABLE_REAL_WRITES=false.
4. Only with Owner approval of THIS bounded Production SKU read scope, a locally authorized operator may run pnpm inspect:i2-r1-sku -- --authorize-bounded-prod-read. At most ONE existing quick-login request then THREE sequential paginated reads with no retry: biz/extField/query up to 12 rows, i/code/selectCode.do for at most 12 Code dictionaries, basic/material/query for exactly one provided SPU and up to 30 rows.
5. The collector rejects unknown API hosts/routes, oversized pages/responses, malformed schema, mismatched SPU, duplicated SKU and role/session inconsistencies. No business write, upload, workflow complete, redirect, pagination sweep, _all, persistent session storage or file output. HTTP bounded at 1 MB / 20s per call. It outputs ONLY safe aggregate counters and statuses; no raw SKU IDs, attribute codes/names, labels, prices, user IDs, cookie, or phone.
6. Post ONLY the sanitized JSON report, exact HEAD and PASS/BLOCKED/NOT_RUN conclusion into Issue #92. Do not copy raw response into any report. If a schema is partial or unavailable, classify NOT_PROVEN/BLOCKED; do not guess.

## Remaining R1 live UI gate

RAW_R1_SHAPE_MATCHABLE_NOT_UI_PARITY shows one bounded raw response included self-consistent sales fields + Code values + SKU identities. It does NOT prove R1 running skuMatch after getMaterialSKU's observed attribute projection, which can remove exts. Obtain locally authorized read-only runtime evidence for actual match / no-match / ambiguous state, or explicitly NOT_RUN. Do not claim I2 4/4 from this script alone.

The existing shipping Production catalog port still blocks SKU read calls; this instrument is an isolated, explicitly authorized and limited tool. It cannot validate full-catalog completeness, as _all is omitted. I2 remains IN_REVIEW 3/4; M1 1/8 ACCEPTED. No merge, no Beta/Production business write.

## Automated gate

pnpm check:i2-r1-sku-evidence performs CLI syntax, Node built-in test fixtures and the NO_NETWORK_DEFAULT CLI run. pnpm verify includes this gate. CI must NEVER pass --authorize-bounded-prod-read or credentials.