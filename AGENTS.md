# Agent Working Rules

Primary writable repository:

/Users/yesun/Code/xlink-technician-app

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
- No main merge or destructive git action without explicit human authorization.
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


## Temporary Mainline-First Development Policy (Owner decision, 2026-10-29)

- **`main` is the single canonical active integration baseline** during the current development stage. Do not establish new long-lived feature trains, chained/stacked PR base branches or competing integration trunks. The previous stacked PR lineage is historical evidence, not an active parallel release line.
- Implement safe, reviewable slices against the **latest `main`** in the **single canonical local checkout**. For Mac/local Codex development, do **not** create task-specific git worktrees, temporary repository clones or independent mini-program build directories. A short-lived branch and PR within the same checkout may still be used when a review/CI gate requires it; integrate only after approval and promptly return to `main`. Do not remove branch protection, skip checks, force-push `main`, or assume prior authorization covers future high-risk changes.
- Before any merge or direct main change: verify exact HEAD/base, preserve local dirty worktrees, run appropriate `verify:full`, H5/MP and commercial visual gates, and record PASS/FAIL/SKIP honestly. A documentation-only change still requires applicable CI on the final main HEAD.
- Preserve accepted DS02A visual Golden and the current quotation CSS owner hierarchy. No wholesale CSS selector deletion based on duplicate counts; the CUI-02 mainline no-growth limits are guardrails, not proof that remaining selectors are dead.
- Keep Production/Beta business write actions prohibited unless separately and specifically authorized. DEV Mock must remain protocol-aligned, with DEV QA isolated from the commercial surface.
- Legacy branches/PRs may be closed after exact ancestry or divergence review. Before deleting a remote branch, verify that no open PR, dependency, active worktree or unreviewed unique commit needs it; preserve immutable commit evidence and use exact-ref SHA lease deletion where possible. A closed PR does **not** mean its remote branch was removed.
- The permanent branching model may be reconsidered only through a later explicit Owner governance decision. This policy does not imply automatic deployment of `main`.

## Single Local Checkout & Stable WeChat Project (Owner decision, 2026-11-02)

- **Local Mac App workspace:** `/Users/yesun/Code/xlink-technician-app` is the single operational checkout for source edits, DEV Mock builds, screenshots and WeChat DevTools. Start each Codex task there and verify `pwd -P`, `git rev-parse --show-toplevel`, branch, exact HEAD and `git status --short`. A mismatched root is a STOP, not permission to create a temporary clone.
- **No new local git worktrees or per-task application copies.** Do not use `/private/tmp/...`, `/tmp/...`, `~/.codex/worktrees/...` or `.review/...` as an alternate **source/build project** for the current commercial app. Existing worktrees and evidence must be inventoried and preserved until explicitly reviewed; never delete or reset them merely to adopt this policy.
- **One stable development build:** from the canonical repository root, run `pnpm run dev:mp-weixin:mock-ux` for DEV synthetic Mock. Open the resulting **same-repository** output in WeChat DevTools (normally `/Users/yesun/Code/xlink-technician-app/dist/dev/mp-weixin`; verify the actual UniApp output log before importing). Keep the DevTools project rooted at this exact location across Codex and human sessions; close/re-import any project whose path points to a temporary worktree or old output. Do not treat `build:mp-weixin` release output or review-only `.review-input` as the live DEV Mock project.
- Keep **one active dev compiler/watch process** for that output path. If changing Mock vs authorized read-only modes, stop the previous process and verify network/write guards before rebuilding. Never infer the environment merely from a cached WeChat window. Generated `dist/`, `unpackage/`, `.review/` and test evidence remain ignored and may live under this stable repository; do not commit generated artifacts.
- **Busy/dirty canonical checkout:** coordinate and preserve changes; do not silently spawn another checkout as a workaround. For a required Draft PR, use a short-lived branch in this same checkout only after working-tree safety checks. Production business writes, unauthorized upload and merging without approval remain prohibited.
- **Backend local Codex:** work from its existing persistent backend checkout as well; do not create a new ephemeral repository for backend Issue #2. This path rule does not constrain isolated CI runners, which must still test the exact commit.
