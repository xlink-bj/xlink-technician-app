# XLink Technician App

Purpose:
A new Technician / Field Service application for XLink.

Primary users:
- Technical Engineer / Technician
- Site Supervisor
- Back-office operator with permission differences

Core business flow:

Login
→ Home
→ Work Order List
→ Work Order Detail
→ Customer Contact
→ Appointment
→ On-site Inspection
→ Inspection Form
→ Estimate / Quotation
→ Construction
→ Acceptance

Target platforms:
- MP-WEIXIN
- APP-PLUS / Android
- APP-PLUS / iOS

Architecture direction:
- Vue 3
- uni-app family
- TypeScript
- one shared business codebase for Mini Program + Android + iOS App
- existing backend APIs will be reused
- workflow + dynamic-form runtime are first-class capabilities

Important:
This repository is a NEW implementation.
The legacy application is a behavioral/reference implementation, not a source-code dependency.

## G3-A foundation

G3-A establishes the Vue 3 / uni-app / TypeScript skeleton and the ownership
boundaries accepted in `docs/architecture/TARGET_ARCHITECTURE.md`. It does not
implement Technician business features, API calls, runtime behavior, native
capabilities, offline sync, or Legacy migration.

The repository uses pnpm. Install dependencies and run the foundation checks:

```sh
pnpm install
pnpm run check:boundaries
pnpm run typecheck
pnpm test
```

The MP-WEIXIN compile check is available locally with:

```sh
pnpm run build:mp-weixin
```

The source ownership skeleton is under `src/`: `app` contains bootstrap,
`shared` contains cross-cutting types/config/state/UI boundaries, `adapters`
contains infrastructure boundaries, `runtimes` contains the future workflow
and form runtimes, `features` is reserved for G4 business slices, and
`test-support` is reserved for sanitized fixtures/helpers. Android and iOS
native packaging remain later G3-E/G5 verification.

G3-A dependencies are limited to the accepted scaffold: `@dcloudio/uni-app`,
`@dcloudio/uni-components`, and `@dcloudio/vite-plugin-uni` provide the
uni-app runtime/compiler; `vue` and `@vue/compiler-sfc` provide Vue 3;
`pinia` and `vue-demi` provide the accepted state boundary; the explicit
`@vue/runtime-*`, `@vue/reactivity`, `@vue/shared`, and `@vue/devtools-api`
entries satisfy the uni/Vite/Rolldown and Pinia runtime resolution boundary;
`typescript`, `vue-tsc`, `vite`, `@dcloudio/types`, and `@types/node` provide
the TypeScript/compiler toolchain; and `vitest` provides the unit-test
harness. No native plugin, analytics, offline-sync, or generic form
dependency is installed.
