# AppInput rapid input delivery regression (2026-11-08)

## Baseline and scope

- Baseline: `6b4f8fe61c88d581e0f7632fef40b3c07f61be5f` on `main`.
- This is a frontend integration defect, not a change to the R1 API, fields,
  numeric rules, Mock persistence contract, or UI design. No backend or Production
  request is needed to reproduce it.
- The installed uni-h5 version `3.0.0-5010520260709002` throttles its public
  `input` event for 100 ms in `useValueSync`. Ordinary blur does not flush that
  timer. A rapid second edit can therefore miss the parent draft before a normal
  save action or explicit reread unmounts the input.

## Historical reproduction, retained separately from the fix

- Cloud forms found `19.25` → `27.75` after 21.929 ms, then explicit reread after
  another 13.38 ms. Failed rereads followed by fresh authority restored `19.25`.
  That scenario used its separate in-progress forms candidate.
- This change independently reproduces the same delivery boundary in the current
  normal App DEV Mock journey. Two native browser input events, 22 ms apart, are
  followed immediately by the normal save/advance button in the same browser task.
  The baseline saved `exts.squareMeter = 19.25`; the assertion requires `27.75`.
  No Vue draft, Mock ACK, or store is injected by the reproduction.
- Local red evidence: `.review/input-delivery-20261108/h5-red-confirmed.log`.
  Earlier harness failures are retained, not counted as product red evidence.

## Fix boundary

- H5 subscribes to the component's own native input after uni has installed its
  target listeners. `nextTick` is necessary: uni installs them from a field-ref
  watcher. The same-target subscription runs after numeric/maxlength rejection
  and normalization, despite uni stopping event propagation.
- Actual strings are delivered synchronously. The delayed uni event is ignored
  only for an H5 instance with an attached native binding. No delay or numeric
  coercion is added. Other platforms retain the ordinary uni event path.
- IME preedit stays private until composition ends (or composition blur).
  Ordinary blur must not publish stale DOM text over an external model reset.
  Disabled/read-only inputs and disposed instances cannot publish; listeners are
  removed on unmount. Initial attachment also checks disposal after `nextTick`.
- Apple/WebKit uni-input replaces its native target during disabled/read-only
  changes. Updated components check target identity and rebind after uni's watcher.
- A pending uni input can also cancel external prop-to-DOM synchronization. An
  external model change uses the pinned uni-input's exposed `$triggerInput` state
  setter, after native DOM normalization, without dispatching a fake user event.
  Ordinary input echoes do not invoke that setter. The real H5 test verifies its
  presence, DOM/model agreement, focus preservation and zero extra AppInput events.
  Recheck this adapter and its browser gates when upgrading uni-h5.
- During development the real H5 boundary test caught an early-listener ordering
  error that could bypass uni's numeric maxlength rejection. The final test asserts
  both the parent value and normalized native DOM value, not only event delivery.

## Reproducible gates and limits

- `VITE_XLINK_ENVIRONMENT=test pnpm exec vitest run tests/engineering/app-input-delivery.test.ts`
  covers the helper and actual AppInput component with a modeled delayed uni event.
- `pnpm exec playwright test --config config/playwright/input-delivery.config.ts`
  covers the normal App save/unmount and actual uni-H5 AppInput text/number/digit
  instances, including IME, leading zeros, native maxlength rejection, external
  clearing, locked controls, and delayed events after disposal.
- The component suite also uses the installed uni preprocessor to exercise the
  MP-Weixin and App fallback branches. This is not native-device validation.
- The isolated server uses canonical source, port 5174, and the existing isolated
  generated output/cache. It does not replace the 5188/5189 local integration
  services. Installed Chrome can be selected locally with
  `XLINK_M08_BROWSER_CHANNEL=chrome`; CI uses installed Playwright Chromium.
- Dedicated CI evidence is under `test-results/input-delivery/`, including results
  JSON and failure traces/screenshots. The workflow preserves it even on failure.
- Synthetic browser IME events are not a claim of physical keyboard/native-device
  validation. MP/App compilation and native-device acceptance are separate gates.
  The original cloud reread scenario must also be rerun on its final forms candidate.

## Final local integration result

- Fast-forwarded to forms commit `cc362b8da5206648834d9b43ff31de1a2cfa2d05`
  without changing any of the 22 pre-existing local QA files (SHA-256 comparison).
- `verify`: 263 files / 3352 tests passed, including the 12 input-delivery tests;
  this count includes the preserved local-only QA tests, not just committed CI tests.
- Actual H5: 5 dedicated input cases, 22 existing normal quotation/journey cases,
  1 primitive-field case and 1 scalar-field case passed. Opt-in field variants ran
  separately; mixing the scalar fixture into the normal journey invalidates its
  expected Survey fields and is not a product regression.
- MP-Weixin and App release bundle builds passed on the integrated source.
  Native-device execution remains deferred.
- Independent review's Apple-target and external-reset findings were fixed and
  tested before submission. The final integrated logs are under
  `.review/input-delivery-20261108/`; original red/failed harness evidence remains.
