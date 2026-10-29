# EQ10 — Engineering Quality, Governance & Draft-Stack Integration

**State:** EQ10 independent Draft candidate on verified EQ09; no main merge, deployment, Prod/Beta business write, unauthorized live R1 read, backend contract update or Golden promotion.

## One integration candidate, not four production approvals

| Stage | PR | Exact offline reviewed commit | What actually lands in the EQ10 stack |
| --- | --- | --- | --- |
| Combined R1 ancestor | #184 | `b511cb572902fa0118ca02957e4d77ce6b9528da` | Pin original six-stage source reconciliation; **not** live R1 parity |
| #1 P0 async state | #187 | `934cca0c8aa5bd92fbb1317cd056c90eebc8b93e` | FormData revisions, stale media, Appointment submit/Workflow Complete |
| #2 P1 architecture | #188 | `2fab824a7aff97eb5c36134db45cdad817d7d462` | Shared Form schema, separated R1 command wires, Workflow/Quotation ownership |
| #3 P1 security/reliability | #189 | `a5d494cd1cbed4d89b60bac31178559ccd50807a` | Role-bound Order receipts, ambiguous write gate, scoped catalog price reads |
| #4 P1 quality governance | #190 | Current Draft head (verified only after all exact-head CI checks) | Enforced dependency owner audit, expanded business critical suites, PR ancestry/scope proof, H5/MP/App + original Goldens |

**Independent sibling PRs are not merged:** #185 conditional Appointment behavior+tests were carried into #188 and share the Runtime schema; #186 R1-Q07 catalog guard and tests were copied unchanged into #189. EQ10's executable manifest verifies the Q07 Git source blob (not permission to infer effective tenant prices) and required sibling behavior tests. Exact PR refs and SHA set live in `eq10-stacked-manifest.json`. Do not mark #185/#186 merged.

## Quality gates that cannot be silently skipped

| Gate | Long-term home | Effect | Honest limit |
| --- | --- | --- | --- |
| Module ownership and import graph | `pnpm check:engineering-ownership` | TypeScript-parsed imports; canonical Form schema, Workflow projection, Quotation price/encoder, R1 command Adapter owner; prohibit UI's direct financial/wire imports | Static source ratchet only, **not** executed branch coverage |
| Negative governance proof | `tests/engineering/eq10-governance.test.ts` + `node scripts/check-eq10-ownership.mjs --self-test` | Inject seven synthetic violations and assert **fail closed** without editing repo | Does not prove backend/tenant auth |
| Mandatory behavior lanes | `pnpm check:critical` and `pnpm verify:critical` | Expand 4 → 6 manifest categories, include EQ07 race, R1 conditional appointment, order-role, quote catalog and source-backed wire tests; deduplicated Vitest suite | Not branch/mutation coverage; no real writes |
| Canonical developer checks | `pnpm verify:quick`; `pnpm verify:full` | Both ratchet owner and critical manifest; full also runs all tests and quality census | No browser screenshots or builds alone |
| EQ10-only ancestry & delta | `pnpm check:stacked-provenance` | Uses local `git merge-base`, `git diff`, `git hash-object` for pinned ancestors, nine allowed governance-only files and #186 catalog source; five simulated failure cases | Designed for this Draft branch **only**; intentionally **not** a permanent main check |
| Independent browser/device builds | EQ10 CI workflow | Offline H5 six-stage Mock E2E; untouched approved Gallery/Business Goldens; non-test H5, MP-Weixin and App builds | Build/e2e green is **not** physical device or live R1 parity |

The base root `Validate` Draft quick lane now runs the permanent owner and critical manifest checks (not just the special EQ10 workflow). Existing giant-module/stylesheet census remains valid; no arbitrary LOC thresholds or Golden baselines are raised. All EQ10 changes are tooling/docs/tests/CI/package scripts: `src/`, lockfile, screenshot assets and native runtime are unchanged relative to approved #189.

### User/business safety policy

1. **No Production/Beta mutation and no SDK/backend privilege escalation.** Runs have `VITE_XLINK_ENABLE_REAL_WRITES=false`; Live pricing/writes cannot be enabled by tests.
2. Real R1 effective SKU pricing, backend authorization and tenant isolation, Workflow Complete authority, deferred appointment `need=0` datetime encoding, and type=1 backend idempotency remain evidence-gated. A local command lock or catalog list scope is defense-in-depth, not proof of backend permission.
3. No auto-merge. #184–#189 remain Draft. No release/go-live claims. No guessed Live acceptance.
4. Do not amend other PR heads while running EQ10; if any ancestor changes, update the manifest and re-run the entire exact-head integrated suite after engineering review.

### Definition of Done for this engineering-only milestone

- [ ] EQ10 Draft special workflow SUCCESS at final exact HEAD: stack, negative proof, `verify:quick`, `verify:critical`, `verify:full`, H5/MP/App builds, quality census artifact
- [ ] Original H5 six-stage Mock and unchanged Gallery/Business Goldens SUCCESS
- [ ] Default `Validate` and DS02A Visual Contract SUCCESS on same HEAD
- [ ] GitHub Issue #180 updated with the exact evidence, no source/backend/live parity extrapolation
- [ ] PR #190 Draft and not merged; four *offline engineering* steps complete, real R1 dependencies still open
