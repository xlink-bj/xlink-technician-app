# C3-D1 — Read-Side Work Order / Workflow Target Eligibility

> DRAFT / Owner Review · 2026-10-30 · Based on main@77229d04e036ab913c4a895d72ebd805ed867214

Extract the **pure, read-side** Work Order identity, role provenance, current Workflow task and FormDefinition eligibility from Action Workspace into a feature-local typed decision function. The Store still owns all API/command calls, stale session and loadVersion checks, UI state, local draft restoration, media queue, quotation composition and side effects.

The Workflow Runtime remains authoritative for task selection and execution. A user-provided localPreviewOnly flag never grants execution: DEV and H5 Mock E2E build gates stay inside the Store, while the helper further requires exact synthetic Work Order ID, action/node allowlist and disabled_read_only source forms/repeat. No business command capability is introduced.

Blocked error categories, Chinese/English text, whether detail is retained, form purpose and command intent paths remain unchanged. Direct tests cover foreign order, missing role, wrong node/action, disabled execution, exact synthetic read-only allowlist, missing FormDefinition and quotation identity. Require full exact-head CI (type/architecture/tests, H5/MP-WEIXIN/APP frontend builds, commercial visual and Main H5 UX). No deployment or Production/Beta business writes. Separate merge approval required.
