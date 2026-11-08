# Multiline input delivery integration defect (2026-11-08)

Baseline: `27a6b73ede13989acc774c6376c5cb837cec2ed8`, canonical `main`.
This is a frontend dependency/event-delivery defect, not a new R1 backend defect
or a change to R1 FormData/Workflow semantics.

## Actual App reproduction

On the normal DEV Mock appointment journey, enter `先检查屋面`, then 22 ms later
`先检查屋面\n再确认墙根渗水处` and immediately click the existing save/advance
button in the same browser task. Before the fix, the saved synthetic FormData
`exts.note` contains only the first line. After the fix both lines persist.
The test drives browser input and the normal action; it does not inject a draft,
Mock ACK, or store. The initial missing-element harness failure is distinct from
the confirmed persistence red in `.review/textarea-delivery-20261108/h5-red-v2.log`.

Installed uni-h5 `3.0.0-5010520260709002` shares `useField/useValueSync` between
Input and Textarea, including its 100 ms public input throttle and ordinary blur
without a flush. Textarea also exposes the same internal-state synchronization
hook and replaces its native node on Apple disabled/read-only transitions.

## Bounded fix and regression

- Extend the existing H5 delivery adapter to recognize native TEXTAREA as well
  as INPUT. AppTextarea uses the same post-watcher binding, target-replacement
  check, external-model synchronization, IME handling and disposal guards.
- Do not trim, coerce, truncate or synthesize business input. Native maxlength,
  line-ending normalization and uni auto-height remain authoritative. A model
  with CRLF is not silently rewritten by an external-model synchronization.
- No CSS, business wire, backend configuration, Production request, upload or
  signing change. MP/App retain their ordinary uni event path.
- The existing input-delivery CI gate includes the new real App case and actual
  textarea component cases: IME, locked inputs, Apple target replacement,
  pending-event external clear/nonempty fill, real-keyboard maxlength, multiline
  blank/trailing lines, auto-height and final empty input. AppInput numeric and
  string gates remain in the same suite.
- Actual component tests use TEXTAREA host identity and installed uni
  preprocessing for MP-Weixin/App fallback, rather than pretending an INPUT
  host is evidence for textarea. Native devices remain a separate deferred gate.

Final local checks: `verify` passed 263 files / 3358 tests (including preserved
local-only QA), focused input component tests passed 18/18, the dedicated actual
H5 suite passed 9/9 and existing quotation/journey H5 passed 22/22. MP-Weixin and
App bundle builds passed. The original 22 local QA files were SHA-256 identical;
independent review found no remaining blocker. Logs remain in the ignored review
directory above; exact-commit CI is tracked after the scoped main push.

## Independently identified follow-on issue

AppSearchBar still directly uses uni's delayed input event. Its button and Enter
handlers emit search without first ensuring the latest value reached the parent's
search draft. The complete source chain reaches work-orders.vue's search handler.
This is an existing frontend risk, not caused or fixed by this textarea slice.
Both entry points need an actual rapid-input reproduction and a separate scoped
fix; a confirm-only change would not fix the button path.
