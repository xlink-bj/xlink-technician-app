# C3-B — Durable mutation checkpoint and actor-scope extraction

> DRAFT · Base `main@e95c8e17c88a99a8c0e0860a02791c0770e137a9` · Owner Review required

The Action Workspace currently mixes its Pinia state and page lifecycle with per-command durable FormData / Workflow receipt checkpoints. This PR extracts the **existing checkpoint coordinator and actor-scope derivation** to `action-workspace-command-boundary.ts`, without modifying the underlying `action-mutation-receipt.ts` storage format, lock algorithm, or R1 command protocol.

- The store still owns injected storage, active descriptor, role/session identity, formDataId and command dispatch; callbacks keep authorization checks fresh.
- The helper owns per-command-generation in-memory flags and calls unchanged durable receipt operations.
- The two pre-dispatch checkpoints check current actor/descriptor both before and after async receipt I/O, failing closed on revocation.
- Post-dispatch ACK recording remains permitted after page/role changes, for durable reconciliation only, never a new dispatch.
- Preserve actor fingerprint JSON field order and user+workOrder+node+definition receipt identity; no local migration.

Direct tests cover role fingerprint, missing or foreign user scope, second dispatch, completed retry, late FormData ACK and identity revocation during the receipt read. All existing contract tests and exact-head Validate, H5/MP/APP builds, DEV Mock browser and visual regressions remain required.

No business UI/CSS/API changes, backend migration, production write, deployment or automatic merge.
