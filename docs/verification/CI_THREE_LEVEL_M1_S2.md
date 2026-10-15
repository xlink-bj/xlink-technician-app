# M1-S2 CI three-level verification (PR #132)

## Intent and change boundary

This CI-only change is based on PR #132 head and is delivered through a separate
stacked PR. It does not edit Q00–Q03 UI, app architecture, runtime configuration,
business APIs, or production behavior. Keep PR #132 in Draft during high-frequency
visual iterations.

## L1 — iteration

ChatGPT directly reviews and edits the UI. No GitHub push or CI run is required
for every local/visual adjustment. There is **no** claim that a GitHub-only
iteration provides 10–30-second HMR feedback.

## L2 — automatic Draft PR check

Every Draft PR update runs `Validate / quick`:
- safety boundaries, UI governance, M1-I8 baseline and typecheck;
- selected quotation browse, order read, signing-read and local review unit tests.

This is a focused feedback gate, **not** the full regression suite. Do not
interpret skipped L3 jobs on a Draft PR as L3 passing.

## L3 — final verification

When PR #132 is marked **Ready for review**, GitHub `ready_for_review`
triggers the same three complete checks. Further commits while Ready trigger
them again:

1. `Validate / verify`: full `pnpm run verify`, MP build, App build.
2. `Validate Main H5 UX / h5-ux`: H5 build, bootstrap smoke,
   real-App isolated Mock Playwright and legacy G4-F regression.
3. `S2 UX Review Sheet / capture-main-app`: 50 real-App DEV-Mock
   screenshots at 390 and 375, manifests and review sheets.

All three must be successful for the **current final PR head** before merge.
Any subsequent commit invalidates that acceptance and must be rechecked.
The screenshot sheet is evidence of rendering, **not** itself proof of
high-fidelity design parity; visual comparison remains a separate human/Lead gate.

Both full Validate and full H5 continue running on `main` pushes.
The existing full workflows can also be manually dispatched **after they
exist on the repository default branch**; feature-branch-only workflow files
may not be dispatchable from the Actions UI. S2 screenshot capture remains
available at Ready and via dispatch where GitHub supports it.

`cancel-in-progress` remains enabled to prevent stale commits wasting runners.
Chromium binary caching reduces repeat downloads; OS/browser dependencies
and Playwright execution still consume time.

## Security / status limitations

All browser tests remain synthetic DEV Mock with real writes disabled and
external network guards unchanged. CI does not authorize Production/Beta calls
or mutations.

The active GitHub App cannot read branch protection, and repository rulesets
could not be inspected. Therefore **these workflow edits alone do not prove
that L3 is enforced by GitHub branch protection**. The reviewer must check the
actual job conclusions for the final head before merging. Configure required
status checks separately if repository settings allow.

## Next optional improvement

Add an isolated, on-demand **single-scene** Q00/Q01/Q03 Playwright snapshot
runner with approved design baselines and a structured visual-diff report.
This is not falsely claimed to be implemented by the workflow gating above.
