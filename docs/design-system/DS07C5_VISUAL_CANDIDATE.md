# DS-07.C5 — Proposed Golden Candidates / Engineering Gate

**Decision:** PROPOSED (not approved). **No baseline PNG is changed on this branch.**
**Parent:** [#159](https://github.com/xlink-bj/xlink-technician-app/pull/159) exact reviewed HEAD `e1caa4f6beddae59f5a8dc3fff1052407061cbe1`.
**Evidence source:** `docs/design-system/DS07_DS02A_VISUAL_ADJUDICATION.md`.

## What this stage does

DS02A's existing 15 tracked H5 candidate PNGs are intentionally **read-only** in `.github/workflows/ds02a-h5-visual-contract.yml`. Existing failure set at #153 through #159: 3 list scenes PASS; 6 Detail/Quote scenes FAIL at 320/375/390. We must not revert an intentional Q01/task-panel design to make an old screenshot green, but we must not blindly bless current UI either.

New **separate** workflow `.github/workflows/ds07c5-visual-candidate.yml`:

1. Uses the same pinned packages, Chromium, deterministic Noto CJK fonts, real uni-app main H5 and original DS02A screenshot tests.
2. Requires the committed Gallery comparisons to PASS.
3. Runs the **unaltered, committed** main H5 visual tests and parses test-level Playwright JSON using `scripts/check-ds07c5-legacy-visual.mjs`. Exactly List×3 PASS and Detail/Quote×6 FAIL is required; any new or missing failure blocks the job.
4. Runs the **same** main tests with `--update-snapshots=changed` in a temporary CI working tree, then requires exactly the six known Detail/Quote PNG files to change. List Golden must not move.
5. Uploads six original Golden PNGs, six newly-generated **candidate** PNGs, result manifest, SHA-256 and screenshots/traces for explicit Owner review.
6. Never commits, pushes, updates main, merges PRs, touches Production, modifies contract files, or sets Owner Approval to ACCEPTED. `GITHUB_TOKEN` has `contents: read` only.

## Owner scope and approval gates

| Visual surface | Existing treatment | Next action |
|---|---|---|
| Work-order detail | Dark navy active task card + strong CTA | Owner confirms task priority, 320/375/390 overflow and legibility |
| Quotation Q01 | Progress 01/03, step-first repair-part entry, local save/next footer | Owner confirms step semantics, footer hierarchy, no misleading amount or submit |
| Signing | Real route forged Order fails closed; DEV signed / pending are **UI-only synthetic** | Synthetic status screenshot accepted as layout evidence, **not** a real signed Contract success |

The user's request to **continue** authorizes preparing and reviewing candidate snapshots; it is not by itself a separate approval to overwrite tracked Golden files. Owner must explicitly accept both Detail and Q01 commercial visual treatments before promotion. Even after approval, submit a **separate**, narrowly scoped snapshot-only Draft PR (six files only), compare once more in real H5 CI, then obtain normal merge/release authorization. No production write permission is implied.

**Remaining independent blocker:** Backend-confirmed signed Contract success-state visual parity is unverified; do not synthesize backend authorization or call sign/send/SMS/PDF endpoints to resolve it.

## Exit criteria

- [ ] New C5 candidate workflow PASSES including strict inherited-pattern validation.
- [ ] 6 candidate PNGs + 6 old Golden PNGs uploaded with hashes and stable fixture metadata.
- [ ] No List Golden change, no business/safety regression and no code write to main.
- [ ] Owner explicit Detail and Q01 visual approval.
- [ ] Separate Golden-only PR and full DS02A comparison pass at approved HEAD.
