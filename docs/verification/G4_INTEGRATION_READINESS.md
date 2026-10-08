# G4 Integrated Candidate — CI / Integration Readiness

Status: **CANDIDATE_ONLY / DO NOT MERGE**. Owner: Web Lead. Created 2026-10-08. Tracking: #33, #36.

## Exact provenance

| Layer | Reference | Gate |
| --- | --- | --- |
| Current main | `0a46d8482b878b2d04f08894da54f5b77fb56214` | Existing stable main |
| G4-E | `89218f9c375a0cf593a3787cced1bf24779a3422` | Source stack; acceptance/device status must be cross-checked |
| G4-F Phase 1J, PR #30 | `dc3c13aa06e769a60623f5ab95fe4d50859db528` | Beta write-chain `PARTIAL / BLOCKED_ENV` |
| G4-F Phase 1K, PR #32 | `f212a3614e5ed76a151b7e5a3b5c3b454acade90` | Production read-only code review `PASS`; integration outstanding |
| CI foundation, PR #35 | `f24b13730ea5e235b849ec57580154d7dda530f4` | Main-based GitHub Actions run 37737723276 `SUCCESS` |
| This candidate | branch `lead/g4-integrated-candidate` from exact Phase 1K tip | Separate Draft PR to main; code + identical CI workflow + this document |

This branch carries the **existing history and implementation** as-is. It does not cherry-pick, squash, rebase, rewrite, close, or merge PR #30 / PR #32. Workflow file is identical to the one authored for PR #35; it is included here so GitHub Actions can validate the **actual integrated candidate** rather than just current main. Branch has not been merged into main.

## CI contract and limitations

`.github/workflows/validate.yml` runs on pull requests and main pushes, without secrets or Production/Beta credentials. It runs frozen `pnpm` install, `pnpm run verify` and `pnpm run build:mp-weixin` / `pnpm run build:app`. It **does not** run `pnpm run verify:g4f-prod-read`, authenticate, send API calls, perform database access, upload, mutate Orders or progress Workflow.

Codex previously reported local `pnpm run verify` with 517 tests, G4-F browser 12/12 and H5/MP/App builds at `f212a36`; these were local reports, not CI for this candidate. **A green PR check is necessary but not sufficient** for native-device, customer-workflow or release readiness.

## Business-write restrictions remain

- Production: source-proven, permission-scoped **business reads only**, with authorized login-time account/session-context persistence. No `function/changeRole` or Production business writes.
- Beta: quotation create/readback/edit, parent Workflow closure, PDF usability and downstream transaction verification remain `BLOCKED_ENV`.
- Unsupported/unknown operations must fail closed. No enabling hidden command paths, generic query escapes, or customer contact/upload.
- No G4-G/H live write implementation or release gate is approved by this PR.

## Codex independent validation and Web Lead merge gate

1. Verify current branch topology: main → G4-E → PR #30 → PR #32 → this candidate, with exact SHAs and no source drift. Validate whether any unreviewed G4-E child scope or latent unsafe action is included.
2. Examine the full candidate PR diff relative to main. Compare explicit business surfaces to accepted G4-D/E/F evidence and report any code-level gaps; do not silently classify `PARTIAL` as `PASS`.
3. Run local `pnpm run verify`, H5 browser critical paths, MP/App builds and `git diff --check` from a clean worktree. Do not delete untracked `.review/` or evidence files.
4. Check the PR GitHub Actions run for this exact head and report its outcome, not only the earlier #35 run.
5. Provide a cross-platform validation plan: WeChat DevTools, Android and iOS (build evidence != native runtime).
6. Propose explicit stack merge order, post-merge SHA checks, rollback and branch retention. **No merges until Web Lead separate `INTEGRATION_PASS`.**

Result needed for #36: `READY_FOR_WEB_INTEGRATION_REVIEW` with exact CI run, local tests, remaining blockers and proposed next safe action.

## Future slices

Construction (G4-G) and Acceptance (G4-H) source/contract discovery is independently active under #37. Scope its first nonmutating UI implementation only after review of this candidate; do not add an additional dependent Draft PR chain.
