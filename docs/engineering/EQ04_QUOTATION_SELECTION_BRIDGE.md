# EQ-04 — Bounded Quotation Catalog/Package Admission Bridge

**Parent:** [EQ-03 #171](https://github.com/xlink-bj/xlink-technician-app/pull/171), pinned HEAD `df9ffa72a7fcd45c3e08760f7eb049d417130559`. Separate **Draft**, no merge/Production requests.

## Change

Move the four Quotation catalog-selection and Package-configuration methods from the ~2,027-line Action Workspace Store into `quotation/catalog-selection-bridge.ts`. Use explicit injected Store dependencies and **live `getWorkspaceState()`** rather than copying/persisting the current authorization state. The Action Workspace still owns Pinia, Action lifecycle, local draft, API ports and all submission commands.

The bridge preserves every existing guard: loaded action, `place_order` + `quotation` + execution enabled, unfinished business state; only current successful Catalog candidates, explicit direct-selection kinds; existing editable repair group; Package list entry and successful matching detail; and both validation + commit use the *same provider list/detail references*. No price, synthetic source fallback or signing authority introduced.

The preexisting `check-g4f-phase1b.mjs` check was retargeted to **check the new owner** and require Workspace composition; its assertions were not deleted. New isolated tests exercise forbidden action/read-only/succeeded, wrong Catalog kind, absent item/group/detail, commit/validation and live revocation.

## Engineering quality and remaining debt

This is a deliberately scoped vertical seam, NOT a full ~2k-line Store rewrite. It makes future Package and direct selection work independently testable without mounting a full Action Workspace. Other concerns — Order submission, dynamic Survey/Appointment, draft lifetime/media upload — still need explicit bounded controllers and their own state transitions after this bridge is proven stable. The module must not turn an arbitrary caller's catalog record into authoritative identity or pricing.

## Acceptance

- Full `pnpm verify:full` passes (including all preexisting static safety guards), and dedicated EQ04 behavior tests.
- Same-HEAD H5 Gallery 3/3 + real List/Detail/Q01 Golden 9/9, H5 quote/contract safety E2E.
- H5, MP-Weixin, App bundles PASS; no image snapshot updates.
- No `src/adapters`, `src/shared`, `src/runtimes`, persisted draft schema or command safety edits; no main merge or real backend writes.

**Unverified separately:** R1 source SKU/price/official Order, real backend tenant ACL, legally signed Contract and device acceptance.
