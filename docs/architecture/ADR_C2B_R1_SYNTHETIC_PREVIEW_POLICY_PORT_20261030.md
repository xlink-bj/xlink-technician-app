# ADR — R1 Local Forms Synthetic Preview Policy Port (C2-B)

> **Status:** DRAFT (C2-B review; not an authorization to merge or deploy)
> **Owner / authority:** ChatGPT Lead proposes; Product Owner reviews.
> **Reviewed at:** 2026-10-30
> **Code baseline:** `main@f7609d0a90fafe0b6eae453c438d25ebb01c90f1`
> **Scope:** R1 local-only forms/repeat fixture preview, dependency direction and unit regression.
> **Exclusions:** R1 backend contracts, business writes, quotation, signed-off UI, Production/Beta, release policy.
> **Related:** [Code Organization Standard](../engineering/CODE_ORGANIZATION_STANDARD.md), [C2-A commercial review seam](../engineering/C2A_MOCK_COMMERCIAL_REVIEW_PORT_20261030.md).

## Context and decision

Two feature files, `R1NodeFormsOverview.vue` and `r1-local-form-drafts.ts`, directly imported App-owned `business-mock` policy functions. That was a reverse architectural dependency: feature code knew the App composition module instead of receiving its runtime capability from the composition root.

C2-B proposes that `src/app/bootstrap.ts` inject an explicit **read-only policy probe** (`isSyntheticMockDataModeEnabled`) into the existing R1 local form Pinia store. The component consumes the store's bounded query; neither feature file imports `@app`.

This is an ownership refactor, not a new R1 authorization path:

- The probe is **false when unconfigured, when it throws, and outside `import.meta.env.DEV`**.
- Only App bootstrap decides whether Developer Mock is available and in `data` mode; the check is evaluated at use time, so leaving Mock mode revokes preview availability.
- Existing `trustedDefaultMockReader`, synthetic `mock-` WorkOrder/definition checks, scoped role/node checks and local draft-only persistence remain independent gates. An injected arbitrary read port cannot itself grant access.
- No backend command, workflow advancement, media upload or Production/Beta business write is introduced.

## Verification and migration

- Keep `R1NodeFormsOverview` UI structure, copy and visible action conditions intact; only source of the policy decision changes.
- Update the synthetic MP fixture test to demonstrate default denial, runtime grant and runtime revocation.
- Re-run R1 form tests, architecture boundary checks, typecheck, full verification and H5/MP/APP builds; record exact PR CI separately from local evidence.
- One short-lived C2-B PR from the stated `main`; **no main merge or deployment without another Owner approval**.

## Rollback

Revert the C2-B PR. No persistent schema, external data, route or API contract migration is involved.
