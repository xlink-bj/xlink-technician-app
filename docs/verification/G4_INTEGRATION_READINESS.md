# G4 Integrated Candidate — CI / Integration Readiness

Status: **CANDIDATE_ONLY / DO NOT MERGE**. Owner: Web Lead. Created 2026-10-08. Tracking: #33, #36.

## Exact provenance

| Layer | Reference | Gate |
| --- | --- | --- |
| Current main (2026-10-08) | `c57fb3cc876c8ca3fb133d74dcf4833f8f755b32` | PR #35 CI foundation merged; G4 application code is not on main |
| Candidate common ancestor | `0a46d8482b878b2d04f08894da54f5b77fb56214` | Main at candidate creation; remains the merge base |
| G4-E | `89218f9c375a0cf593a3787cced1bf24779a3422` | Source stack; acceptance/device status must be cross-checked |
| G4-F Phase 1J, PR #30 | `dc3c13aa06e769a60623f5ab95fe4d50859db528` | Beta write-chain `PARTIAL / BLOCKED_ENV` |
| G4-F Phase 1K, PR #32 | `f212a3614e5ed76a151b7e5a3b5c3b454acade90` | Production read-only code review `PASS`; integration outstanding |
| CI foundation, PR #35 | `c57fb3cc876c8ca3fb133d74dcf4833f8f755b32` | Squash-merged to main; candidate workflow has identical SHA-256 `122823dd52206d8e2fd25fc112093896d5ad9bbe308910d17f80d3881e85ceb2` |
| This candidate | branch `lead/g4-integrated-candidate`, HEAD `0840f81ea05b512e8ed136ee9cf1b6b25e501f21` | Draft PR #38 to main; Phase 1K stack plus CI/documentation commits |

This branch carries the **existing history and implementation** as-is. It does not cherry-pick, squash, rebase, rewrite, close, or merge PR #30 / PR #32. Workflow file is identical to the one authored for PR #35; it is included here so GitHub Actions can validate the **actual integrated candidate** rather than just current main. Branch has not been merged into main.

## CI contract and limitations

`.github/workflows/validate.yml` runs on pull requests and main pushes, without secrets or Production/Beta credentials. It runs frozen `pnpm` install, `pnpm run verify` and `pnpm run build:mp-weixin` / `pnpm run build:app`. It **does not** run `pnpm run verify:g4f-prod-read`, authenticate, send API calls, perform database access, upload, mutate Orders or progress Workflow.

### Independent verification at candidate HEAD `0840f81ea05b512e8ed136ee9cf1b6b25e501f21`

| Check | Result | Evidence / boundary |
| --- | --- | --- |
| Frozen install | PASS | `pnpm install --frozen-lockfile` |
| `pnpm run verify` | PASS | Run with the CI-declared `VITE_XLINK_ENVIRONMENT=test`; 47 test files, 517/517 unit tests, boundary/UI governance/typecheck passed |
| Unconfigured local `pnpm run verify` | FAIL, expected environment mismatch | 5 synthetic Mock tests fail closed when the explicit test environment is absent; rerunning with the CI-declared test-only variable passes. No API requests were made. |
| G4-F H5 Playwright | PASS | 12/12 on Chromium `153.0.8010.12`; synthetic `place_order`, quote submit/readback, same-order edit and fail-closed cases |
| G4-E H5 Playwright | PASS | 32/32 on Chromium `153.0.8010.12`; Survey, media, validation, saved/complete distinction and deferred-field cases |
| MP-Weixin build | PASS | `pnpm run build:mp-weixin`; compile only, not DevTools/device runtime |
| App build | PASS | `pnpm run build:app`; compile only, not Android/iOS runtime |
| `git diff --check` | PASS | No whitespace errors in the candidate worktree |

GitHub Actions run `37738756616` for this exact HEAD is **COMPLETED / SUCCESS** (47 files, 517/517 tests; MP and App bundles complete). This evidence is automated/build evidence only, not native-device, authenticated business, Beta, or release evidence.

## Independent integration review

### Candidate graph and scope

- The candidate has the accepted Phase 1K source tip `f212a3614e5ed76a151b7e5a3b5c3b454acade90` as its application-code parent. Its two later commits add the CI workflow/readiness record and make synthetic test mode explicit; no additional business source was changed after Phase 1K.
- Current `main` is one commit ahead of the candidate's merge base and the candidate is 84 commits ahead (`git rev-list --left-right --count origin/main...HEAD` = `1 84`). The main-only CI commit is not an ancestor of the candidate, but the workflow files are byte-identical and GitHub reports PR #38 `MERGEABLE / CLEAN`. Do not manually merge or rebase main into the candidate; let the separate integration decision preserve both histories.
- PR #38 remains Draft/Open. No merge was performed.

### Safety and remaining gates

| Area | Source-backed state | Remaining gate |
| --- | --- | --- |
| Production API commands | Command transport blocks all commands for the production target before real dispatch | No Production mutation; source guard and unit coverage are not a live penetration test |
| Production uploads | Upload port rejects Production before token issuance/upload | Real media and watermark remain unvalidated; no upload was attempted |
| Production quotation UI | Submit is unavailable in Production mode; handler also returns before dispatch | No real quote write/edit/Workflow completion; verify the guard remains in place after integration |
| Production read scope | Role-listed Work Order authorization and full session/user/role/version identity are enforced; returned quotes are ownership-checked | No new Production calls in this audit; previously accepted read evidence is separate from this local candidate review |
| Beta write chain | Phase 1J remains `PARTIAL / BLOCKED_ENV` | Create/readback/edit and parent workflow closure await a safe Beta test target |
| Devices / product UX | H5 proxy and MP/App builds pass | WeChat DevTools and physical Android/iOS runtime, permissions, persistence and authenticated UX remain unexecuted |
| Construction / Acceptance | Source-contract discovery only under #37 | No G4-G/H implementation or business write is authorized by this candidate review |

### Integration and rollback proposal (for Web Lead decision)

1. Prefer one integration of PR #38 as the coherent G4-E/F candidate; do not separately merge stacked PR #30/#32 first, which would duplicate history and increase sequencing risk. Preserve the original commits with a regular merge commit rather than rewriting/rebasing the candidate. GitHub currently reports a clean mergeability result.
2. Before merge, require Web Lead `INTEGRATION_PASS`, keep PR #38 Draft until that decision, and retain the outstanding Beta/device/business gates as independent release gates.
3. After an authorized merge, verify the exact `main` merge SHA and rerun the merged-head CI. Keep the source branches and review artifacts until post-merge verification is accepted.
4. If integration regresses, revert the merge commit with `git revert -m 1 <merge-sha>`, rerun CI, and keep the PR/source branches for diagnosis. Do not reset or force-push main.

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
