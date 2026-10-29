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
- Implement safe, reviewable slices against the **latest `main`**. A short-lived branch/worktree and PR may be used for isolation, CI and Owner review; once approved and verified, integrate into `main` and promptly close the PR/delete its remote branch. Do not remove branch protection, skip checks, force-push `main`, or assume prior authorization covers future high-risk changes.
- Before any merge or direct main change: verify exact HEAD/base, preserve local dirty worktrees, run appropriate `verify:full`, H5/MP and commercial visual gates, and record PASS/FAIL/SKIP honestly. A documentation-only change still requires applicable CI on the final main HEAD.
- Preserve accepted DS02A visual Golden and the current quotation CSS owner hierarchy. No wholesale CSS selector deletion based on duplicate counts; the CUI-02 mainline no-growth limits are guardrails, not proof that remaining selectors are dead.
- Keep Production/Beta business write actions prohibited unless separately and specifically authorized. DEV Mock must remain protocol-aligned, with DEV QA isolated from the commercial surface.
- Legacy branches/PRs may be closed after exact ancestry or divergence review. Before deleting a remote branch, verify that no open PR, dependency, active worktree or unreviewed unique commit needs it; preserve immutable commit evidence and use exact-ref SHA lease deletion where possible. A closed PR does **not** mean its remote branch was removed.
- The permanent branching model may be reconsidered only through a later explicit Owner governance decision. This policy does not imply automatic deployment of `main`.
