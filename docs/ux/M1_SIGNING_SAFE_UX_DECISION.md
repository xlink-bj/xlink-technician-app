# M1 Contract Signing — Safety Boundary and UX Phase A Decision
Date: 2026-10-10 · source-truth read-only design record
Tracking: [#39](https://github.com/xlink-bj/xlink-technician-app/issues/39), [#33](https://github.com/xlink-bj/xlink-technician-app/issues/33), [#41](https://github.com/xlink-bj/xlink-technician-app/issues/41)

## Product-approved business semantics

- The technician's Quotation Action produces an **official type=1 Order**.
  Signing is entered **from that Order** only after workflow authorization.
  M1 does **not** require a persisted type=0 quote, separate customer quote
  confirmation, or a type=0 → type=1 conversion UI.
- A ServiceAppointment may have **multiple** Orders; a single Order may
  contain multiple repair-part groups. Signing is Order-specific. Do **not**
  implement the unapproved "one Order per repair part" rule.
- The Quote Action's current synthetic local composer is not proof that
  an Order was submitted or that a Contract exists. It must never be
  treated as a successful signing trigger.

## Pinned source facts (not permission to invoke endpoints)

Original #39 Phase A audited R1 xlink-app
\`6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d\`
and backend xlink-cloud-backend
\`5fc008d32e771205260f120621c1c4fc62d0824e\`.

| Operation | Evidence from #39 | Safety classification |
| --- | --- | --- |
| List contracts for appointment | R1 \`basic/contract/query.do\`, injected tenantId; possible conditional org filter widening in service | READ-SHAPED BUT SCOPED AUTHORIZATION UNKNOWN; **not allowed Production adapter** |
| Contract query by id | \`basic/contract/queryById/{id}.do\`, direct service findById | READ-SHAPED; role/tenant ownership checks UNKNOWN; **not allowed Production adapter** |
| Signing page URL | \`basic/contract/getContractSignatureUrl\` reaches Qiyuesuo provider | UNKNOWN_EXTERNAL; **not allowed preview implementation** |
| Save signing fields | \`basic/order/orderConfirm\` updates Order fields | MUTATION; prohibited |
| Initiate online/offline signing | \`signature/applyForElectronicSignature\` persists Contract/Order, creates PDF, contacts signer | MUTATION + PDF + EXTERNAL SIDE EFFECTS; prohibited |
| Re-send/retry/remind | \`againApplyForElectronicSignature\`, \`handleReminderContract\` | MUTATION/NOTIFICATION; prohibited |
| Sync signing status | \`signature/syncContract\` may update Workflow, payment, docs, messages and status | MUTATION; **never poll as read** |
| Stored Contract PDF URL | Seen in Contract model, but URL scope/expiry and access control unknown | NOT VERIFIED SAFE; **do not fetch, render, or call provider** |

UI visibility for R1 operator \`isHandler\`, \`processState\`,
\`type==1\`, \`isAgain\` is **not** a proven backend authorization boundary.

## Phase B UX, after quotation visual language is stable

Proposed single signing Action Workspace uses existing
\`ActionWorkspaceShell\` and the blue/white Design System; creates **no
duplicate workflow or dynamic form engine**. Define fixed domain-rich
signing overview with finite configurable fields only where source
contracts support them.

1. **Entry:** select a specific existing official Order from Work Order
   read-only order list or from an authorized sign Action; validate
   WorkOrderId, OrderId, node/role/tenant context before making UI
   affordances available. If no official Order exists, show blocked/empty
   state, not fabricated success.
2. **Read-only Order summary:** show source-backed order identity and
   service summary, existing Contract state only from a verified
   ownership-checked read adapter. Use synthetic fixtures to demonstrate
   named status variants; fixture labels must not imply actual backend
   enumerations. No price or legal term invention.
3. **Document/terms:** display a disabled document-preview affordance
   with explicit "尚未验证安全预览" until document authorization,
   effective template and expiry rules are verified. **No PDF generation
   or remote URL request in this phase.**
4. **Signing initiation:** an *explanatory disabled CTA*, not wired to
   \`applyForElectronicSignature\`. Show separately the verification
   prerequisites (verified Order, signer eligibility, terms, endpoint
   role control and explicit Beta authorization). Never auto-invoke or
   auto-retry.
5. **States:** loading / no official Order / no Contract / pending
   verification / signed (synthetic-only) / failed / expired (synthetic
   concept until statuses verified) / unknown / read-failed; transitions
   in demo are labelled LOCAL MOCK and cannot advance actual workflow.
6. **Back/re-entry:** preserve Order identity; no duplicate applications,
   SMS, signatures, customer communication or Workflow completion.
   Production runtime remains read-only for *approved* operations only.

## Implementation entry and acceptance gates

- Do not copy the rejected generic quote form style. Keep Product Owner
  design-to-code protocol: business truth → one high fidelity approved
  reference → implementation-ready UI spec → real H5 comparison → per-page
  Owner visual gate.
- Allow Phase A documentation now. The independent signing UX
  implementation PR must start from an **approved integrated baseline**
  rather than adding another deep Draft stack.
- Before a Production read adapter: verify global auth/tenant/role
  predicates plus the conditional widening noted in ContractServiceImpl,
  and safe document URLs. A "query" name alone does not establish safety.
- Before any Beta signing action: explicit disposable test identity,
  permissions, side-effect consent, readback, idempotency, and recovery
  plan. No signing/customer/PDF business operation until then.
- Cross-platform UX requires real H5/WeChat DevTools/iOS/Android
  checks, keyboard/footer/safe-area, not bundle builds alone.

Gate today: \`SOURCE_CONTRACT_REVIEWED / DESIGN_SPEC_PROPOSED_NOT_OWNER_APPROVED / SIGNING_WORKBENCH_NOT_IMPLEMENTED / LIVE_READ_AND_WRITE_BLOCKED\`.
