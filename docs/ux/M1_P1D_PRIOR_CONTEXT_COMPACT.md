# M1 / P1D — Compact prior-stage information in DEV Mock Quotation

Parent: [#41](https://github.com/xlink-bj/xlink-technician-app/issues/41), [#62](https://github.com/xlink-bj/xlink-technician-app/issues/62).
Base: integrated Draft PR #38 `cfe5e0a1847c2a0c14dfc0b94a9b51f6680c83f0`.

## Problem (observed, not assumed)

The **actual main App H5 screenshot** for `MOCK-019` in
[Actions #38043656353](https://github.com/xlink-bj/xlink-technician-app/actions/runs/38043656353)
placed a fully expanded Appointment + Survey context above the editable
Quotation, consuming much of a 390×844 viewport. Local context is reference
information, not the operator's primary quotation task.

## Source-faithful design

- R1 and the approved #41 UX guide preserve explicit operator choice:
  WorkOrder / repair location → catalog → config/qty → grouped quotation.
- For the **synthetic quoted stage only**, default the preceding data to a
  two-stage provenance summary. A tap expands the actual identity-scoped
  Appointment/Survey draft values; a tap collapses them again.
- **Before** technician adopts a verified Survey repair-part recommendation,
  keep the suggestion and its explicit confirmation visible even when the
  prior records are collapsed. No automatic first-level selection.
- **After** successful adoption, show a concise feedback state, not the
  contradictory "already has part or catalog unavailable" notice.
- Keep the Survey stage's previous Appointment reference fully displayed
  as before; do not alter other Action Workspace surfaces.
- Survey `squareMeter` is **reference-only**, never quote
  `maintainAreaNum`; quote quantity, materials, procedures, prices and
  official Order remain blank/unmodified until their respective explicit
  authorized operations. The Map is synthetic-only and not a real tenant
  Survey↔Quotation code mapping.
- Disclosure state is in the component's in-memory Vue `ref`. It does not
  persist, trigger a read, refresh backend data, change Action drafts or
  affect the real Order/Contract read/command ports.

## Gates

The existing Source/Type/UX Governance/MP/App gates must stay green.
Run an actual main App H5 Playwright `MOCK-019` test that checks default
collapse, explicit expand/re-collapse and access to both saved draft records,
suggestion adoption without quantity transfer, reliable read-after-reload,
no external request attempts and the original G4-F regression.
Capture initial compact and post-adoption 390×844 H5 screenshots for Owner
review. UI smoke **does not equal Owner quotation UX acceptance**; #41's
four-surface guided catalog/configuration redesign remains open.

Gate: `DEV_MOCK_P1D_TECH_PENDING / PRODUCT_UX_PENDING / NO_MAIN_MERGE / NO_BUSINESS_WRITE`.
