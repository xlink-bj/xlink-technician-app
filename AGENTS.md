# Agent Working Rules

## Canonical R1 data / Mock fidelity entry (Owner decision, 2026-11-05)

- Before adding R1-backed Mock business data, quotation/Order/Contract assumptions or API adapters, read [`docs/verification/R1_REAL_DATA_MODEL_MOCK_EQUIVALENCE_INVENTORY.md`](docs/verification/R1_REAL_DATA_MODEL_MOCK_EQUIVALENCE_INVENTORY.md) and its pinned evidence links. It is the current F01–F21 backend-data inventory and M01–M08 protocol-equivalent Mock acceptance checklist.
- For this existing technician role's four verified Production quotation contexts, no active SKU rows were returned. Treat SKU as a modeled but presently unverified/dormant option, **not** a mandatory prerequisite for an ordinary Material SPU quote; do not invent SKU IDs or prices. Keep context-specific filters, mini price projection and Order snapshot prices distinct. Historical static R1 SKU helper anomalies are not proven Production defects.
- Mock PASS does not imply live R1 persistence/authorization. Production/Beta business writes, uploads, signing, messages, PDF and Workflow commands remain closed under Issue #201; contract read permission remains separately limited.


Primary application repository: `xlink-bj/xlink-technician-app`, canonical branch `main`.

Local Mac checkout: `/Users/yesun/Code/xlink-technician-app`.
Codex Cloud uses its provisioned environment/checkout. **Codex Local and Codex Cloud have equal, full end-to-end development responsibility**, including design, implementation, tests, commits, CI verification, and handoff. The Mac path is not a Cloud prerequisite.

Legacy reference repository:

/Users/yesun/Code/xlink-business-jishi-3.0

Rules:

- New repository is the only writable application target.
- Treat the legacy repository as read-only reference.
- Never modify legacy files while working on the new application unless separately and explicitly authorized.
- Never copy large legacy components/modules as the implementation strategy.
- Reuse business behavior, API contracts and validated rules — not legacy architecture.
- New code must not import or reference files from the legacy repository.
- Cross-repository inspection of legacy code is allowed.
- Preserve exact existing backend API contracts unless an explicit decision changes that rule.
- Unsupported low-code workflow/form capabilities must fail explicitly rather than silently behaving incorrectly.
- MP-WEIXIN and APP must remain first-class targets.
- Platform/native differences must be isolated behind explicit platform adapters where practical.
- Do not commit secrets, local credentials, generated build output or environment files.
- During the current Owner-approved main-only development stage, ordinary scoped code/doc commits and pushes go **directly to `main`** after local verification; no feature PR/merge is required. Destructive git actions, releases/deployments, real business writes and high-risk scope expansions still require explicit authorization.
- Prefer coherent capability slices over micro-refactors.
- Each meaningful implementation slice must be independently reviewable and rollbackable.

## Frontend Quality Guardrail

- R2 Live Mobile is the primary visual truth for G4-UX.
- Frontend visual work must explicitly use `skills/xlink-r2-frontend-qa/SKILL.md`.
- **M1 S2 commercial UI work MUST ALSO use `skills/xlink-s2-commercial-taste/SKILL.md`** (offline Taste Skill v2 `redesign-existing-projects` + `minimalist-ui` pinned in `skills/taste-*/SKILL.md`, MIT notice in `skills/taste-license/LICENSE`).
- Commercial UI quality is a **separate Owner visual gate**: `CODE_PASS` / `Screenshot generated` do **not** imply `COMMERCIAL_UI_ACCEPTED`; show matched-viewport actual-App before/after and deliberately reject debug-shell hierarchy.
- Never replace approved Login/WorkOrder/Appointment visuals merely to apply a generic design trend; survey, quotation and signing are the active S2 targets.
- Visual implementation requires matched-viewport screenshot QA before handoff.
- Production-grade frontend quality is a review requirement; weak engineering-shell UI is a blocker.
- R2 visual reference does not authorize unsupported business semantics.
- Screenshots remain local review artifacts unless explicitly requested.


## Current Main-Only Development Policy (Owner decision, 2026-11-03)

- **Both Codex Local and Codex Cloud develop directly on `main`** at this stage. `main` is the only active development/integration branch, not merely the PR base. Do **not** create feature branches, stacked PRs, alternate integration branches, new task worktrees or disposable copies to perform ordinary current development. This replaces earlier short-lived PR/branch guidance until the Owner changes it.
- **End-to-end responsibility is identical**: either environment may independently inspect R1/architecture, implement a complete capability slice, run tests and Playwright, commit/push to `main`, watch CI, correct failures and report evidence. Use whichever environment is available. Local Mac retains its single canonical checkout; Cloud may use its managed provisioned checkout. No “Cloud codes, Local only collects native evidence” division.
- **Transition safely from any existing non-main work**. Before switching a current in-progress branch (e.g. `codex/stage-b-dynamic-form-ux`), inspect root, exact SHA, `git status`, diff and any untracked work. Preserve all modifications and move/reapply them onto up-to-date `main` without force/reset, overwrite, silent cherry-pick or lost changes. If preservation is uncertain, STOP and ask. This main-only policy does not authorize deleting historical branches/worktrees.
- **Fast layered verification**: focused local type/lint/tests -> real App DEV Mock H5 Playwright at 430x932 (for UI/flow changes) -> direct `main` commit/push -> exact-SHA main GitHub CI full verify -> separate Owner commercial visual gate. Fix failures promptly on `main` with another verified scoped commit. Full CI need not block every tiny edit; SKIPPED/NOT_RUN never counts as PASS. Do not bypass branch protections or status checks.
- **Stage B explicitly excludes native WeChat**: do not launch WeChat DevTools, a native simulator or device in either environment. Native and release checks stay deferred independent gates; MP/App remain first-class build targets for later appropriate work.
- Preserve accepted DS02A visual Golden and current quotation CSS owner hierarchy; do not delete CSS solely due to duplicate counts. DEV Mock must be protocol-equivalent to R1 and commercial UI must not show DEV debug information.
- Keep Production/Beta business writes, uploads and signing side effects prohibited unless separately approved; Production read-only and role-scope fail-closed restrictions remain. The main-only policy is **not** permission to deploy/release or change backend/API contracts.
- Historical PRs/branches remain auditable; any future cleanup still requires exact SHA/unique-commit/worktree/PR checks and recoverability. The permanent branching model can only change by new Owner decision.

## Mac Local Checkout & Stable WeChat Project (native execution deferred during Stage B)

- **Scope of this section:** Mac/local checkout and any later approved native tests only. Codex Cloud has equal end-to-end development scope in its managed checkout and is not required to use the Mac path. Stage B verification is H5 Playwright, not native.
- **Local Mac App workspace:** `/Users/yesun/Code/xlink-technician-app` is the single operational checkout for source edits, DEV Mock builds, screenshots and WeChat DevTools. Start each Codex task there and verify `pwd -P`, `git rev-parse --show-toplevel`, branch, exact HEAD and `git status --short`. A mismatched root is a STOP, not permission to create a temporary clone.
- **No new local git worktrees or per-task application copies.** Do not use `/private/tmp/...`, `/tmp/...`, `~/.codex/worktrees/...` or `.review/...` as an alternate **source/build project** for the current commercial app. Existing worktrees and evidence must be inventoried and preserved until explicitly reviewed; never delete or reset them merely to adopt this policy.
- **One stable development build:** from the canonical repository root, run `pnpm run dev:mp-weixin:mock-ux` for DEV synthetic Mock. Open the resulting **same-repository** output in WeChat DevTools (normally `/Users/yesun/Code/xlink-technician-app/dist/dev/mp-weixin`; verify the actual UniApp output log before importing). Keep the DevTools project rooted at this exact location across Codex and human sessions; close/re-import any project whose path points to a temporary worktree or old output. Do not treat `build:mp-weixin` release output or review-only `.review-input` as the live DEV Mock project.
- Keep **one active dev compiler/watch process** for that output path. If changing Mock vs authorized read-only modes, stop the previous process and verify network/write guards before rebuilding. Never infer the environment merely from a cached WeChat window. Generated `dist/`, `unpackage/`, `.review/` and test evidence remain ignored and may live under this stable repository; do not commit generated artifacts.
- **Busy/dirty canonical checkout:** coordinate and preserve all ongoing work; do not silently spawn another checkout or new feature branch. Safely move any existing non-main work onto current `main` only after inspecting status/diff and preserving changes; STOP if unsafe. Production business writes, unauthorized uploads and releases remain prohibited.
- **Backend local Codex:** work from its existing persistent backend checkout as well; do not create a new ephemeral repository for backend Issue #2. This path rule does not constrain isolated CI runners, which must still test the exact commit.
