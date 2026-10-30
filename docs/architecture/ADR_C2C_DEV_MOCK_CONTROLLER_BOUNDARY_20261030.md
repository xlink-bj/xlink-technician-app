# C2-C1 — DEV Mock Transaction Controller Composition

> **Status: DRAFT / Owner Review required** · 2026-10-30 · Based on `main@db9f51fa22cc10d5300d8adb05ca25886d52f20b`

Four remaining runtime reverse imports are concentrated in two synthetic-only UI components: the R1 special forms/repeat panel and quotation Mock order confirmation. Previously those feature components built application-specific Mock controllers and storage adapters.

## Decision and scope

- Introduce narrow, feature-owned typed controller contracts for existing Mock forms/repeat and quotation operations.
- Instantiate the **same concrete** Mock controllers through App-owned storage-wired factories referenced by the two existing page composition boundaries, and inject a factory into each feature component. Captured actor identity and current-node rebuild timing remain inside the component lifecycle; the App factory only supplies storage and synthetic transport.
- Keep all existing app-owned exact-ID allowlists, actor/role checks, local receipt recovery, fail-closed Mock/Real separation, and readback without retry. Existing component templates, CSS and business messages are not modified.
- Move shared A-stage special-form response types to the feature port and re-export from the App module for compatibility.
- A fifth `feature → app` edge in `MockJourneyContextPanel.vue` is **type-only**. Defer DTO ownership migration; there is no evidence of a runtime cycle.
- No Production/Beta writes, API contracts, backend, Golden or release configuration changes.

## Required proof

Full Vitest, typecheck, architecture/quality guards; H5/MP-WEIXIN/APP release builds; DEV Mock mutation/readback cases, quotation submission and real main-App H5 Playwright, commercial UI visual parity on exact PR HEAD. PR remains unmerged until Owner Review.
