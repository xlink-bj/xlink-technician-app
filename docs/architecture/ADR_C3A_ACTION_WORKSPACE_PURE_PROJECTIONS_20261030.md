# C3-A — Action Workspace Route and Media Read Projection Extraction

> Status: DRAFT · Base `main@e95c8e17c88a99a8c0e0860a02791c0770e137a9` · 2026-10-30 · Owner Review required

The 2,356-line Action Workspace store owns several pure concerns alongside workflow state, draft persistence, command dispatch and media upload side effects. This first C3 extraction is deliberately limited to **route construction / ID parsing** and **media UI projection**.

## Decision
- Move existing route constants, encoders and ID parsers unmodified into `action-workspace-routes.ts`. The original store module re-exports the exact public API; internal navigation calls are unchanged.
- Move media task-status priority, camera/file picker eligibility, retry eligibility and user-facing media hints to `action-workspace-media-projection.ts`.
- The Pinia store retains the existing external methods and continues to own queue processing, device access, draft saving, error mutation and lifecycle state.
- Keep the existing retry ambiguity guard, visible/read-only conditions, survey photo policy and copy intact.
- No changes to page markup, CSS, R1 API, business writes, schema, or Production/Beta permissions.

## Acceptance
- New pure-helper tests exercise route encoding and parsing, media task precedence, picker guards, ambiguous postprocess retry denial and Survey tool blocker precedence.
- Run `verify:full`, H5 / MP-WEIXIN / App front-end builds, DEV Mock business flows, H5 UX and commercial visual tests on exact PR HEAD.
- Rollback: revert one scoped PR. No data migration.
