# M1 I6 — R1 Contract status read-side vertical slice

**Engineering-only; Production Contract API disabled.** New App is a frontend-only refactor; existing backend remains unchanged.

## Fixed source evidence

- R1 frontend SHA: xlink-bj/xlink-app@6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d; business/subpackages2/workOrder/workOrder.vue lines 5025–5075 (Contract read), 727–750 (sign UI gates), 844–884 and 5077–5139 and 5211–5260 (sign/cancel/retry/SMS).
- Existing backend SHA: xlink-bj/xlink-cloud-backend@5fc008d32e771205260f120621c1c4fc62d0824e; modulemini/basic/ContractController.java lines 48–57; entity/basic/Contract.java lines 31/38; service/basic/ContractServiceImpl.java lines 712–745; framework/mongodb/EMongoTemplate.java lines 617–639 and 803–812.
- R1 list sends is:workOrderId|string#and, whereas backend Contract entity stores serviceAppointmentId and the query parser has no obvious alias. This is an unresolved parity discrepancy, **not proven live defect**. No backend modification.

## Engineering deliverables

1. Optional listR1ContractsForSigningReview port; source-accurate R1 field/filter with page=1, rows=3. The Production allowlist remains unchanged and REJECTS the Contract route. Requests are only user-triggered in non-Production context.
2. Before Contract read, prove selected type=1 Order from bounded currently role-listed WorkOrder. Check session/user/role/version and membership on both sides of each awaited read; reject duplicate, malformed, overlong and foreign-WorkOrder rows.
3. Only project Contract metadata whose orderId matches the chosen Order; strip URLs, PDF/QR, signer, phone, contacts and legal documents. Zero results are 'bounded unverified', never 'no Contract'. Multiple Orders per WorkOrder remain independent.
4. Pinia state clears on session/role/logout/revocation/Order reselection, and discards delayed reads. Signing preview page offers explicit non-Production read status with loading/error/retry and sanitized status text, but no signing actions.
5. Synthetic WorkOrder contract query is mock-owned and cannot fall through to live backend. Added adapter, UI rules and Store regression tests.

## Remaining gates

- Exact-head CI + H5 + MP/App build must pass; manual live tenant/MP/iOS/Android remains NOT_RUN.
- Resolve R1 workOrderId/serviceAppointmentId mismatch through R1 evidence or separately authorized bounded read-only environment inspection before enabling Production Contract read. Do not infer or change backend schema.
- No signed Contract entitlement, PDF/QR access, SMS, electronic/offline sign, cancel, retry, workflow commands, Beta/Production business writes or main merge are granted.
- I6 formal original DoD remains 2/4; M1 accepted count remains 1/8.
