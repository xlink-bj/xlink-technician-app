# EQ09 — P1 Actor-scoped Order reliability and read boundaries

Status: Draft / no main merge. Base: EQ08 HEAD `2fab824a7aff97eb5c36134db45cdad817d7d462`.

## Threat model

- **Cross-role contamination:** a persisted type=1 Order receipt had been keyed by user + WorkOrder + node. The same user moving between roles (or reauthenticating) could encounter a record without proof of which actor had dispatched the mutation.
- **Ambiguous writes:** an already-dispatched `workflow/startWorkflow/order` or `basic/order/upsert(type=1)` might return a terminal-shaped failure after server-side effect. Clearing/downgrading that receipt would allow an unsafe duplicate retry.
- **Late role/Action changes:** async quote submit, readback, and edit paths could apply results or clear a draft after a new WorkOrder/role became active.
- **Price-bearing read:** catalog prices require present authenticated actor scope + WorkOrder-derived catalog context before dispatch. Raw list prices are not proven tenant/SKU effective prices.

## Defenses

1. Retain the existing per-user/WorkOrder/node receipt key so **cross-role attempts discover the same existing record**, but persist a short non-PII `authorizationFingerprint` of sessionRef/userId/roleId/roleVersion. A different scope is blocked instead of reusing it or silently starting a fresh receipt. Legacy unscoped receipts also fail closed; reconciliation must be authorized separately.
2. Bind order submission and readback to a live `authorizationCurrent()` callback, checked before dispatch, after awaits, prior to readback and local cleanup. After successful workflow start, persist workflow identity before deciding whether role can still submit the Order.
3. After **any** dispatched child-workflow/Order failure, treat the outcome as **ambiguous** unless confirmed by authoritative readback. Do not infer `no write` from an HTTP/transport `server_terminal` error. Never automatically resend. Same-actor concurrent submissions join one flight; cross-actor simultaneous attempts fail closed.
4. Tie the Workspace's in-flight Order lease, response update, draft deletion, quotation edit and order readback to the exact Action generation, session scope and draft version.
5. Port **unchanged source-backed R1-Q07 catalog scope guard and tests** from independently verified Draft #186. This prevents price-bearing catalog list reads before actor and WorkOrder context checks, and refuses stale in-flight identity results. The original #186 remains Draft; no merge operation is performed.
6. No new SKU price calculation or tenant rate fallback. Effective tenant/SKU prices, type=1 backend semantics, live workflow idempotency, and production writes remain blocked on authorized R1 evidence.

## Tests and acceptance

Synthetic-only regression checks include: scope-mismatched/legacy receipts, different-role concurrent flights, revoked actor between child workflow and Order, revoked actor during readback, terminal-shaped failures after remote dispatch, and R1-Q07 price-bearing catalog access. Keep existing readback/no-draft-loss, R1 appointment and Form Runtime parity tests, critical/full suites, H5/MP/App builds, six-stage Mock and original Golden snapshots.

All configured real writes stay **OFF**. No Production/Beta mutation or backend source changes; no main merge.
