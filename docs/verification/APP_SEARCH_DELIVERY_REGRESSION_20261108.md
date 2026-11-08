# Search input delivery integration defect (2026-11-08)

Baseline: `a144ee465670f19f05f4a03f71192a80f998fa37`, canonical `main`.
This is a frontend event-delivery defect. No R1 API contract, business semantics,
UI appearance, backend data or configuration changes are involved.

## Confirmed actual App reproduction

In the normal DEV Mock work-order list at 430 × 932, enter `李先生`, then 22 ms
later `张先生`, and activate search in the same browser task as the second input.
Both the existing button and Enter keyup return only `李先生`, while the input
shows `张先生`. The two browser tests assert a measured input gap below 100 ms;
there is no wait between the last edit and search. Tests use native browser
input/key events and the existing action, never a Vue instance, draft, store or
injected Mock response. Every non-local HTTP request is aborted.

Confirmed red: `.review/search-delivery-20261108/h5-red-confirmed.log` and its
retained artifacts. The earlier initial run's Enter keydown did not activate
uni's keyup confirm and is a harness failure, not evidence for that entry point.

## Cause and bounded fix

The pinned uni-h5 `3.0.0-5010520260709002` throttles the public input event for
100 ms. AppSearchBar previously depended exclusively on that event to update
its parent's `searchDraft`. Both search handlers emitted `search` immediately;
Enter also discarded the up-to-date `detail.value` carried by uni confirm.
The list's existing `submitSearch` therefore queried the old draft.

- AppSearchBar reuses the established H5 native-input delivery binding after
  uni's native normalization. This fixes button and Enter together, without a
  search delay, synthetic event, flush timer or value conversion.
- Ignore delayed public uni input only once the H5 native binding is attached.
  Follow the existing lifecycle, external-model sync, disabled-node replacement,
  composition and disposal rules. No changes to AppInput, AppTextarea or the
  shared helper are required.
- On MP-Weixin/App (or if no native binding exists), ordinary input stays on the
  uni event path. Confirm first publishes its string detail, including empty,
  then emits search. A missing value does not accidentally clear the draft.
- Disabled/disposed instances cannot update or search. Search remains an explicit
  caller-owned action with the same zero-argument event. The list retains its
  own trimming/reset behavior. Public props, events and CSS are unchanged.

## IME preedit confirmation boundary

Independent review also reproduced an existing uni confirm boundary: while the
list still showed all 12 synthetic customers, a committed but unsearched draft
`李先生` followed by IME preedit `zhang` and `keyup Enter(isComposing=true)`
wrongly queried `李先生` and blurred the editor before composition ended.
The baseline handler was also unconditional. uni's keyup listener ignores IME
state and its normalized confirm event discards the native `isComposing` flag.
See `ime-preedit-probe.log` and the expected-behavior reds in `ime-guard-red.log`
under the ignored review directory above.

AppSearchBar now installs its own H5 native keyup capture guard. It tracks
composition start/end/blur for that target and stops propagation of Enter while
composition is active or the native key event says `isComposing`. It does not
prevent the browser's default IME behavior or publish preedit text. A subsequent
ordinary Enter after commitment still reaches uni's normal confirm/blur path.
The guard is removed/rebound with the existing target lifecycle; no shared
helper, public API or CSS changes were needed. MP/App preprocessing removes it.

## Regression gates

- Actual compiled AppSearchBar component: 10 tests cover rapid button/confirm,
  synchronous parent event ordering, no implicit search, committed IME, final
  clear, external model reset against stale events, disabled/disposed actions,
  real installed uni preprocessing for MP-Weixin/App fallback, and three
  composing-Enter cases (state + flag, state only, flag only) with disposal.
- Actual App H5: 6 tests cover the two red cases, committed IME, rapid empty
  search, the ordinary clear-search action with pending uni events, caller trim,
  and three successive rapid queries across Apple's disabled-node replacements.
  Two additional IME tests prove preedit Enter neither queries nor blurs, while
  the next ordinary Enter searches the final Chinese word. They cover the same
  three state/flag variants, including repeated Apple target replacements.
- Focused component/helper/list tests: 37/37 passed, including AppSearchBar
  10/10. `vue-tsc --noEmit` passed.
- Dedicated config: `config/playwright/search-delivery.config.ts`. It reuses the
  canonical-source isolated output/cache and port 5174, but has its own test
  match, attachments and JSON under `test-results/search-delivery/`. Select local
  installed Chrome with `XLINK_M08_BROWSER_CHANNEL=chrome`; CI may use Chromium.
- Apple vendor simulation validates the pinned uni branch in Chrome, not physical
  WebKit or native-device behavior. Synthetic IME is not a physical keyboard test.
  MP/App preprocessing and bundle builds passed; native-device acceptance stays
  deferred and is not implied by those checks.
- The 22 pre-existing local QA files remain SHA-256 identical to the protected
  baseline. No 5188/5189 server, source copy, production request, upload, signing,
  WeChat DevTools or native device was used.

## Final integrated verification and CI wiring

After integrating media commit `63c32e546f5f32bb630298d613f4c261f3fc8b75`,
the final search candidate passed all local gates without touching the preserved
local QA work:

- `VITE_XLINK_ENVIRONMENT=test pnpm run verify`: 264 test files / 3375 tests,
  including the pre-existing local-only QA tests, plus all verify guard steps.
- Complete `pnpm run build:mp-weixin` and `pnpm run build:app` passed. The MP
  release QA boundary, synchronous bootstrap and emitted WXSS guards passed.
- With the real CI job flag `VITE_XLINK_R1_MP_UX_FIXTURES=true`, search H5 passed
  6/6 and the unchanged input/textarea H5 suite passed 9/9.
- With that same job flag plus `VITE_XLINK_R1_STAGE2D_FIELDS=true`, the exact four
  offline/media step files passed 10/10: temporal fields, weak-network recovery,
  Survey media, and interrupted media receipt reconciliation.
- All original 22 local QA paths remained SHA-256 identical; `git diff --check`
  passed. Logs and the candidate file hashes are retained in the ignored
  `.review/search-delivery-20261108/final-integration-result.json` and adjacent
  `final-*.log` files. Port 5174 was released after the final H5 run.

`validate-main-h5.yml` now runs the dedicated search-delivery gate, preserves
`test-results/search-delivery/` even on failure, and includes
`media-interrupted-receipt.spec.ts` in its existing offline/persistent-media step.
These workflow changes are wired and locally validated; exact-commit remote CI
must be checked after this scoped commit is pushed. Local PASS does not claim
remote CI completion, production persistence, visual acceptance or native-device
validation.
