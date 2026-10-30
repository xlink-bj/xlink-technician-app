# C1 — Production-profile Release Artifact Boundary Verification

> **Status: DRAFT SNAPSHOT / Evidence-based review** · 2026-10-30
> **Source:** `main@17ba7211040df887be28665564414cb037b6acef`
> **Authority:** ChatGPT Lead (diagnostic); Owner decision required before changing release packaging policy or merging.
> **Scope:** Real local production-mode H5 and MP-WEIXIN compilation with **synthetic, inert environment**. No Production/Beta network, credentials, API writes, code changes, CI modifications, upload, deploy, or native App binaries.
> **Machine evidence:** [C1 Output Files and SHA-256](../governance/C1_RELEASE_ARTIFACT_FACTS_20261030.json)

## Executive verdict

| Gate | Result | What the evidence proves |
| --- | --- | --- |
| H5 compile | **PASS** | `pnpm run build:h5`, exit 0, emitted `dist/build/h5/` |
| MP-WEIXIN compile | **PASS** | `pnpm run build:mp-weixin`, exit 0, emitted `dist/build/mp-weixin/` |
| MP bootstrap and WXSS post-checks | **PASS** | Synchronous App registration and existing nine-component style guard passed |
| QA/Mock **absent** from release bundle | **FAIL** | All four routes are present in both H5 and MP compiled artifacts |
| Compile-time DEV authorization fences | **PASS on inspected paths** | Eight targeted emitted-artifact assertions passed; details below |
| H5 browser deep-link interaction | **SKIP — environment** | No Chromium binary could run in this container; no user interaction assertion |
| Native APP archive | **NOT RUN** | Android/iOS packaging/WeChat DevTools are outside this H5/MP build step |

**Conclusion:** Packaging isolation is incomplete (engineering hygiene and potential internal UI discoverability), but the inspected DEV-only controls are compile-time closed. **This does not establish a real Production business write vulnerability.** Nor does compile-time inspection substitute for interactive route/permission testing on a device.

## 1. Reproducible build provenance

- Temporary shallow clone pinned to exact `main` SHA above. `git diff` and staged diff both empty after building.
- Lockfile installation: `pnpm 10.31.0 --frozen-lockfile`, 548 packages; uni-app compiler reports `5.15 (Vue 3)`.
- Container Node: `24.22.1` (CI Workflow uses Node 22; therefore this is a diagnostic build, **not** the final release sign-off).
- `CI=1` disables DCloud's network update telemetry. Without it the container cannot read OS interfaces and failed **before** business compilation; source code was not changed.
- Both builds use `VITE_XLINK_ENVIRONMENT=prod`, `VITE_XLINK_ENABLE_REAL_WRITES=false`, `VITE_XLINK_API_BASE_URL=https://example.invalid`, synthetic tenant and method `phone`. Platform values respectively `h5` and `mp-weixin`.
- No application login, API requests, customer identifiers, real tenant credentials or deploy steps were performed.

Build commands (environment variables supplied only to each process):

~~~sh
CI=1 VITE_XLINK_ENVIRONMENT=prod VITE_XLINK_PLATFORM=h5 \
VITE_XLINK_API_BASE_URL=https://example.invalid \
VITE_XLINK_AUTH_TENANT=c1-synthetic VITE_XLINK_AUTH_METHOD=phone \
VITE_XLINK_ENABLE_REAL_WRITES=false pnpm run build:h5

CI=1 VITE_XLINK_ENVIRONMENT=prod VITE_XLINK_PLATFORM=mp-weixin \
VITE_XLINK_API_BASE_URL=https://example.invalid \
VITE_XLINK_AUTH_TENANT=c1-synthetic VITE_XLINK_AUTH_METHOD=phone \
VITE_XLINK_ENABLE_REAL_WRITES=false pnpm run build:mp-weixin
~~~

## 2. Four release-bundled QA/Mock routes (confirmed, not inferred)

| Route | H5 JS chunk | MP emitted page files | Dev-only authorized behavior |
| --- | --- | --- | --- |
| `pages/dev/qa-console` | Present | JS/JSON/WXML/WXSS present | Compiled `authorized` `computed(()=>false)` |
| `pages/work-orders/signing-mock-review` | Present | JS/JSON/WXML/WXSS present | Signing Mock read compiled to `blocked` |
| `pages/work-orders/material-sku-mock-review` | Present | JS/JSON/WXML/WXSS present | Mock journey availability compiled to `false` |
| `pages/work-orders/child-subflow-mock-review` | Present | JS/JSON/WXML/WXSS present | Mock child reader compiled to `blocked` |

- MP `dist/build/mp-weixin/app.json` registers **12 pages including all four QA routes**.
- H5 `dist/build/h5/assets/` contains four dedicated QA route chunks, totaling **52,721 bytes** before transfer compression; this excludes shared imported developer fixtures.
- MP four page-specific JS files total **16,927 bytes**, excluding associated WXML/WXSS and shared dependencies.
- `dist/build/h5` and `dist/build/mp-weixin` generated locally; no output bundled into GitHub PR. Exact file names, lengths and SHA-256 are in the JSON snapshot.

Eight machine-checked observations were **true**: all four route entries on MP, all MP page artifacts, all H5 page chunks, MP QA constant-false, MP mock journey constant-false, H5 QA constant-false, MP signing read blocked, MP child read blocked.

## 3. Runtime scope and environment blockers

Source-level guards existed before this investigation; C1 now verifies that the inspected `import.meta.env.DEV` gates constant-fold to denied paths in the **actual compiled output**. This is stronger than solely reading `src/pages.json`. It does **not** prove every possible deep link, auth state, renderer side effect or device policy is covered.

Attempted browser setup:
- Playwright's Chromium download returned a 0 MiB invalid archive.
- System package manager update could not change OS user/group IDs in this container.
- A user-space prepackaged Chromium attempted a forbidden file ownership change during extraction.

These are **environment limitations**, not observed App runtime failures. Browser interaction and WeChat DevTools device evidence remain `SKIP`. Do not mark `COMMERCIAL_UI_ACCEPTED` or a security penetration test PASS based on this report.

## 4. Recommended owner decision and safe implementation path

**Recommendation: set the long-term release policy to “DEV QA routes are entirely absent from Production bundles,” while keeping the development QA experience intact.** Today the behavior is “bundled but compile-time guarded.” There is a real packaging gap, not a proven unauthorized write.

If Owner approves exclusion policy:

1. Establish a build-profile-aware page registry so the four QA routes are kept in DEV builds and excluded from Production H5/MP/APP. Uni-app documents `pages.json` conditional compilation by **platform**, but that alone does **not** prove environment/profile-based exclusion is supported; a small proof of concept and compiler gate are required.
2. Adjust `check:b2x2-parity`, which currently requires QA Console to be present in the generic `src/pages.json`; preserve the requirement for DEV profile only, and add a **release artifact absence** assertion.
3. Review `src/app/bootstrap.ts` references to diagnostics and mock seeds; exclusion of page routes alone may not remove shared DEV fixture code.
4. Verify DEV Mock equivalence and the original QA flows; run `verify:full`, H5 production build + browser denied routes, MP production build, and App compilation as available. Preserve accepted Goldens; visual changes require separate Owner gate.
5. Make the packaging fix a small, reversible PR against latest `main`, after Owner approves the exact boundary. Do not remove Mock adapters and business-parity fixtures by filename.

**C1 finding is complete for build/compiled-artifact evidence; interactive release route verification remains explicitly unverified.** No source, workflow, runtime/permission or release configuration was changed by C1.
