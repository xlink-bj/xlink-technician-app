# New App engineering completion — functional exit criteria

Status: **NOT COMPLETE / Stage 1 HOLD** (2026-10-24). Owner: ChatGPT Lead. This is a working gate sheet for [#198](https://github.com/xlink-bj/xlink-technician-app/issues/198), not a release approval.

## Definition of engineering complete

The New App is **engineering complete** only when a technician can carry out the agreed R1 business paths end-to-end in the target WeChat environment, with source-aligned semantics and authoritative server readback, and no unapproved business writes. Unit-test counts, build success, a Mock page, and Production read-only evidence are **necessary but not interchangeable** with this gate. Keep user-directed visual/UX polish as the next focused phase, while fixing usability bugs that currently block functional paths.

The authoritative comparison is the existing R1 client `xlink-app@6c0a97b`; do not change the R1 backend to fit the New App. For each workflow action, record its effective source node, actor/role, preconditions, exact request, reply, side effects, failure/retry semantics, and persisted readback. An unknown action or field must stay inert, not be guessed into `forms`, `repeat`, an Order write, or a signature.

| Engineering gate | Current evidence | Remaining acceptance |
|---|---|---|
| E1 — Login, role, work-order list/detail | Implemented read/Mock routes, bounded R1 reads, test coverage | Session and permissions across actual device entry/back/navigation; work-order changes reflected after allowed commands |
| E2 — Workflow, forms, repeat and child node | Source mapping, offline transaction candidate and receipts, read-only child panel, four Mock panel states | Authoritative live node-type/action contract; wired add/edit/delete/finalize for permitted rows; role recheck, timeout/unknown result reconciliation, authoritative readback; real device checks |
| E3 — Appointment and onsite survey | Mock/source-derived action forms, form/field contracts, media safety gates | Real appointment and survey business command paths, field/component mapping, upload/media/PDF effects and readback within specifically authorized pilot scope |
| E4 — Quotation, SKU, Order | Read-only model tests and order-list semantic discrepancy documented | Exact choice/meaning of `clearOrderFieldQuery` vs `basic/order/query`, button semantics, SKU/price consistency, order change and query-back lifecycle for authorized test record |
| E5 — Contract and signature | Read model and signing boundary tests | Signing initiation, callback/receipt semantics and authoritative contract lifecycle readback; no synthetic approval as real signature |
| E6 — Cross-platform and integration | H5 and WeChat build/test gates in CI; local WeChat Mock scenarios tested | Real WeChat/authorized intranet golden paths, device console/network checks, regression, stacked PR integration, rollback/read-only/writes boundaries and Owner merge/release approval |

### Work packages in dependency order

1. **Stage 1 transaction closure (Lead code, Codex only local help).** Finish full-source-preserving edit, R1 deletion order and receipt fail-close; wire only to an authorized command entry. Identify a real isolated forms/repeat fixture and capture exact ACK/readback. No default automatic retries after dispatch.
2. **Six-path business parity (Lead code).** For each E1–E5 area, ship the missing concrete action and readback in a bounded reviewable batch. Do not confuse read-only panels with CRUD completion. Record `SOURCE_MAPPED → OFFLINE_FUNCTIONAL → READ_VERIFIED → WRITE_VERIFIED → DEVICE_VERIFIED` separately.
3. **Mini-program golden path (Codex where required, Lead owns defects).** Login → list → detail → appointment → survey → quotation/Order → contract; include denied, cancelled, unknown, no-permission and flaky network paths. Capture sanitized evidence, not customer payloads.
4. **Integration and release decision (Lead review, Owner approval).** Reconcile stacked Draft PRs, exact SHA CI, app tests, operational gating, controlled pilot and rollback; do not merge or deploy implicitly.

### External decisions that bound the completion date

- **Owner approval required** for any *specific* isolated Beta business write/readback. Define actor, work order and node, permitted commands, observation/rollback and retention first. Prior Production authorization is **read-only**; it does not cover these writes.
- **Business specification needed** for the R1 `button` ExtField, ambiguous `forms/repeat` node definitions and differing order-list filters. These cannot be solved by type aliases or imagined data.
- **Codex needed only for local-only evidence**: private R1/WeChat DevTools, permitted internal network access, physical device behavior. ChatGPT Lead owns code, automated tests, triage and final review.

Until these decisions are resolved, no calendar deadline for *fully integrated real business operations* can be asserted honestly. Each weekly progress report should show the last fully verified business path, the next reproducible acceptance test, a named blocker and responsible party; CI green alone never changes `Stage 1 HOLD` to PASS.

## 2026-10-24 functional safety slice

- Existing FormData update now requires a same-ID authoritative full source record and overlays only edited fields, preserving unknown fields and failing before receipt/network on missing/mismatched source.
- Editing an existing `exts.formList` entry retains unrecognized server metadata.
- Forms deletion choreography matches the audited R1 order (`updateExts` then FormData soft-delete); partial success remains fenced as uncertain and **is not claimed to be atomic or R1-equivalent in a real environment**. R1 active-node `Process` side effect still needs an approved pilot contract.
- The offline functional candidate remains disconnected from live App composition; no change here grants Production business-write permission.
