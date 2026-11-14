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

## Current documentation and engineering baseline

The present mainline implementation and current rules are indexed in [docs/README.md](docs/README.md).
Tool configurations live in [config/](config/README.md), with only the three
conventional Playwright/Vite/Vitest discovery shims at the repository root.
Engineering checks and manual generators are described in
[scripts/README.md](scripts/README.md).
The G3-A foundation narrative below is historical foundation context, **not the
current completeness or release status**. See [current implementation baseline](docs/architecture/IMPLEMENTATION_BASELINE_20261030.md)
and [quality/environment gates](docs/engineering/QUALITY_AND_ENVIRONMENT_GATES.md)
before making a development or release decision.

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

## Development environments

| Target | H5 | MP-WEIXIN | Private profile |
| --- | --- | --- | --- |
| Local backend (default) | `pnpm dev:h5` | `pnpm dev:mp-weixin` | `.env.local`: environment `dev`, API `http://127.0.0.1:5189/xlink/wm`, Mock `false` |
| Explicit Beta | `pnpm dev:h5:beta` | `pnpm dev:mp-weixin:beta` | `.env.beta.local`, mode `beta`, application environment `test` |
| Pure frontend Mock | `pnpm dev:h5:mock` | `pnpm dev:mp-weixin:mock-ux` | Existing inert synthetic launcher; API/auth and both write flags pinned closed |
| Production read-only | `pnpm dev:h5:prod-readonly` | `pnpm dev:mp-weixin:prod-readonly` | Existing `.env.prod.local`, mode `prod`; existing read-only guards remain authoritative |

Default H5 owns `127.0.0.1:5189` and transparently proxies `/xlink` to
`http://127.0.0.1:18080`, preserving the path. An occupied port is an error.
If an integration window already owns 5189 with its proxy and compiler on
5188, keep it unchanged; do not start a second server. MP compilation does
not independently start this proxy and is not native-device acceptance.

After active windows release their configuration, migrate the old Beta values
from `.env.local` to `.env.beta.local` locally, then set `.env.local` to the
local target. Private environment files, credentials and grants must not be
committed. Backend selection grants no permissions; existing local scopes and
runtime policies stay unchanged.

Vite loads `.env` → `.env.local` → `.env.<mode>` → `.env.<mode>.local`, with
shell variables taking precedence. `--mode beta` alone does not isolate local
credentials. Remote mode files must explicitly define or blank all ten keys:

```text
VITE_XLINK_ENVIRONMENT
VITE_XLINK_API_BASE_URL
VITE_XLINK_MOCK
VITE_XLINK_AUTH_API_BASE_URL
VITE_XLINK_AUTH_TENANT
VITE_XLINK_AUTH_METHOD
VITE_XLINK_QUICK_LOGIN_PHONE
VITE_XLINK_QUICK_LOGIN_CODE
VITE_XLINK_ENABLE_REAL_WRITES
VITE_XLINK_ENABLE_R1_SPECIAL_WRITES
```

For Beta use environment `test` and API `https://xlinkbeta.fsgo365.cn/fsgo/wm/`;
for local use the `dev`/5189 values above. Real backends use Mock `false`.
`VITE_XLINK_AUTH_API_BASE_URL=` means the selected API; a nonempty value must
match it. Quick-login phone/code can both be blank for manual login. Fill each
profile's actual tenant/method privately; do not copy accounts between targets.
Both remote write flags must be `false`. Explicitly blank inherited local
`*_GRANT`, `VITE_XLINK_LOCAL_SESSION_RESTORE` and `VITE_XLINK_LOCAL_SIGNING_READ`.
Clear exported auth/tenant/quick-login values before remote startup: the entry
rejects nonempty shell credential overrides without printing their values.

Checks apply only to named entries using `XLINK_DEV_PROFILE`. Existing bare
`uni` integration/Playwright launchers retain their reviewed settings. No new
proxy framework, runtime permission or release channel is introduced.

## Beta read-only contract discovery

For local inspection-contract discovery, use the R1-compatible Beta login
helper. It logs in with `index/phoneLogin.do`, keeps the returned opaque
session in memory, and performs only authenticated reads. The helper rejects
non-Beta hosts and never prints or persists the session value.

```sh
pnpm run inspect:inspection-contract:beta
```

The command automatically reuses the App quick-login configuration from the
explicit `.env.beta` / `.env.beta.local` profile, never `.env.local`:
`VITE_XLINK_QUICK_LOGIN_PHONE`, `VITE_XLINK_AUTH_TENANT`,
`VITE_XLINK_AUTH_METHOD`, and the optional
`VITE_XLINK_QUICK_LOGIN_CODE`. It is available only when
`VITE_XLINK_ENVIRONMENT` is explicitly non-production, and uses the same
`999999` default code as the App. Phone and verification code are read only
from the local App configuration; this command intentionally has no CLI
credential injection path.

Use `XLINK_BETA_LOGIN_METHOD=password` and `XLINK_BETA_PASSWORD` for the
password variant; the password is also environment-only. An explicit
`--work-order=<safe-id>` is required for discovery, and `--node` is required
when the work order has more than one eligible Inspection node. `--output` is
available for a controlled capture. The output is sanitized before it can be
committed; no real write, upload, customer call, or Production request is part
of this command. The inspector never selects a work order by list position,
display label, historical form identity, or Mock fixture.

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

