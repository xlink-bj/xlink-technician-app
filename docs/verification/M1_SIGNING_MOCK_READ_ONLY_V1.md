# M1 Signing — R1 domain-first DEV Mock read-only Workbench (P1D)

State: **CODE CANDIDATE, OWNER VISUAL REVIEW PENDING, LIVE CONTRACT READ NOT APPROVED**.
Base: integrated Draft PR #38 exact cfe5e0a1847c2a0c14dfc0b94a9b51f6680c83f0.

## R1/source-grounded business model (not extra assumptions)

- R1 xlink-app pinned \`6c0a97b\` \`serviceAppointment.vue:608–633\` shows sign initiation on **type=1 official Order**, conditional on handler and process state. UI condition does **not** establish backend authorization.
- \`serviceAppointment.vue:9757–9796\` calls \`signature/applyForElectronicSignature\` for offline and online methods; electronic action says SMS is sent. Backend \`SignatureServiceImpl\` may produce PDF/Contract and send signing to provider.
- Backend pinned \`5fc008d\` \`Contract.java\` has \`orderId\`, \`serviceAppointmentId\`, document refs and \`signedDate\`. \`syncContract\` potentially mutates workflow, messages, documents and payment; **never model it as read-only polling**.
- Product Owner M1 decision: Quotation Action directly creates official type=1 Order (when real authorized write is proven). ServiceAppointment **1:N** Orders; Order **1:N** repair-part groups. No extra type=0 conversion or automatic contract from local quote.

## Implementation scope and safety

- A dedicated **DEV H5 Mock E2E-flagged read-only Signing Review** route is registered in the real uni-app main App, linked **only in the existing developer Mock panel**. Uses the common \`ActionWorkspaceShell\`, \`AppButton\`, tokens; no new global workflow or form runtime and no Production signing action capability.
- Synthetic fixture is deliberately separate from P1C local quotation draft: one mock Work Order identity with **two** distinct type=1 Orders; first has 2 repair-part groups but **no Contract**; second has an example Contract and a pending display-concept. Selection changes only local UI state.
- Covers **normal, empty (no official Order), read error, pending, synthetic signed/failed/expired**. All scenario toggles **local only** and are labelled synthetic concepts, **not** decoded \`Contract.exts.contractStatus\` numeric values.
- Entry accepts only known Mock WorkOrder ID + literal test User/Role IDs, current authenticated session, and exactly enabled DEV Mock E2E profile. Unknown order/role/tenant/workOrder/scenario denies access. No read of global business Order store, no real adapter, no storage, no network or command port, no arbitrary route or PDF URL.
- Both **合同预览** and **发起签约** are inert disabled controls, with explicit authorization requirements. There is no simulated Order submit, Contract create, SMS, PDF generation, remote signing success, status-sync or Workflow Complete. Status switching is visibly a display-only QA tool, **not a signing action**.
- The page does not invent signer name, recipients, legal terms, price, expiry policy or current tenant ExtField. All are separately unknown. Existing real WorkOrder/Quotation workflow action policy unchanged.

## Acceptance and further work

- Vitest tests: correct official Order cardinality, Contract↔Order ID binding, all scenario states, immutable demo state, cross-identity denial, Mock OFF/empty and Production disabled.
- Real main H5 Chromium: navigate from Mock Home to Review route; selection two orders, state toggle, empty/error, disabled action controls, no external network requests/browser errors. Existing 6 Mock tests + 25 legacy G4F H5 remain regression baseline.
- CI: \`pnpm run verify\`, main App H5 browser, MP/App builds at **the final exact SHA**; code PASS never implies real device PASS (G5 #64), Owner Signing UX visual acceptance or Beta signing business E2E.
- Next **business integration** requires source-verifying a signing-specific workflow node + actor entitlement and safe Contract read with tenant/ownership scope. Do not overload \`place_order\`, dynamically query Contracts without authorization, or merge PRs.
