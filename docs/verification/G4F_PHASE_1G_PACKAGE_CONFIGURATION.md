# G4-F Phase 1G — Real Package Configuration Bridge

## Scope and status

This slice adds a local quotation-draft configuration bridge for provider-read
Packages. It does not create or update a backend quotation. The implementation
is awaiting Web Review; this verification record is not a Phase 1G PASS.

- Base: `6c11bfa626fd8fa90c93c80912b2e125c5d8b1b6`
- Branch: `codex/g4f-phase1g-package-configuration`
- Product/runtime scope: Mock and Real use the same Action Workspace gate and
  normalized read contract; Real catalog stays read-only.

## Configuration boundary

Package configuration is intentionally distinct from the Phase 1F direct
Procedure / Material / Measure bridge. The Action Workspace accepts only a
Package that is present in the current successfully-read Package list and a
Package Detail that is currently successful, selected for that Package, and
has matching Package identity. The target must be an existing editable
quotation group with a repair-part path. Caller-supplied provider objects are
not accepted by the workspace API.

The user must select exactly one resolved Material for every exact layer
provided by the detail. Numeric and string layer values are distinct. Missing
layers, unresolved or identity-conflicting components, duplicate/ambiguous
provider identities, and incomplete choices fail closed. No layer is inferred
from row position. Procedures, selected materials, and measures are projected
from the verified detail into a local Package configuration snapshot; unchosen
material alternatives are not stored.

The local snapshot contains provider component/reference identity, normalized
catalog identity, display label, optional unit, and exact material layer. It
does not contain price, cost, minimum price, subtotal, total, discount, or
pricing result. A newly configured Package initializes quantity from a valid
positive `maintainAreaNum`, otherwise `1`. Reconfiguring the same Package in
the same group updates its configuration in place while retaining its
`selectionId` and user-edited quantity. The same Package may be configured in
another group independently. Duplicate legacy Package rows in a target group
are rejected rather than guessed or merged.

## Draft recovery

Grouped quotation drafts now write schema v3 to store configured Package
snapshots. Grouped schema-v2 drafts remain readable without migration on read;
an explicit subsequent local edit writes v3 and preserves all existing groups
and selections, including unconfigured legacy Package rows. Schema-v1 flat
drafts retain the existing `legacy_requires_action` behavior and are not
silently migrated or overwritten. The v3 decoder validates the snapshot shape,
provider identities, positive existing selection quantity, and unique exact
material layers; malformed records remain invalid and are not rewritten.

## Safety boundary

- Package selection changes only the user-scoped local grouped draft.
- Phase 1F generic direct selection remains limited to Procedure, Material,
  and Measure; Package does not enter through that bridge.
- No SKU / SPU, package `skuCode`, pricing calculation, quote save/submit,
  customer confirmation, quote-to-order conversion, or Workflow Complete was
  added.
- No Beta or Production read/write was performed for this slice; no business
  mutation or external customer action was performed.
- G4-G was not started. The integration branch was not merged.

## Verification

The bounded package-configuration tests cover target-group and current-read
gates, exact layer behavior, unresolved/mismatched child references, selected
alternative projection, commercial-field exclusion, initial quantity,
in-place reconfiguration and cross-group reuse. Codec tests cover v2 restore
and v3 write-after-edit, malformed v3 snapshots, and duplicate identities.
H5 tests exercise the real quotation workspace path and local-only commit.

Verification on this implementation:

| Check | Result |
| --- | --- |
| `pnpm run verify` (boundaries, UI governance, G4-F guards, typecheck, unit tests) | PASS — 38 files, 401 tests |
| `pnpm run test:uni-h5-g4f-phase1b-review` | PASS — 6 tests; Chromium 153.0.8010.12 |
| `pnpm run test:h5-review` | PASS — 32 tests |
| `pnpm run test:uni-h5-review` | PASS — 4 tests |
| `pnpm run test:design-system-review` | PASS — 4 tests |
| `pnpm run build:uni-h5-g4f-review` | PASS |
| `pnpm run build:mp-weixin-review` | PASS |
| `pnpm run build:mp-weixin` | PASS |
| `pnpm run build:app` | PASS |
| `git diff --check` | PASS before publication |

All browser suites ran with localhost-only network guards; no external service
was contacted. Review screenshots and Playwright outputs remain local and
uncommitted under `.review/` and `test-results/`.
