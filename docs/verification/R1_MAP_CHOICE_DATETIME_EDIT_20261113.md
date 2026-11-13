# Configured Map radio and local datetime editing

Private candidate against main `3901ac7688136dedd8035d89aa7891a4763ae3a9`; no commit, push, hosted CI or real backend save is claimed.

The existing configured-record edit capability additionally accepts single-value `radio` and local-clock `datetime` for proven type0 Map storage. Field identities, values, options and requiredness come from the current schema. No work-order name, business field pair or particular option value selects this path. Typed Survey control support remains unchanged.

Radio options reuse the normal reader's exact scoped Code provider or unambiguous inline metadata. Missing, duplicate, conflicting or hierarchical choices are refused; numeric/array radio inputs cannot become string member IDs implicitly. Existing schema/currentness checks reject changed provider results. Datetime uses the shared local calendar validator and `AppDateTimeField`; a date-only half selection never commits a business value. No timestamp/timezone reconstruction is introduced.

The type0 appointment collection is eligible only with the normal reader's existing `appointmentSubmitAllowed` check, including `submitHideNodeId`. The qualification must remain true on the final node reread. Full raw/query-wire provenance, exact grant/actor/record/field checks, original preservation, same-ID ACK/readback and durable uncertainty remain the existing configured controller's responsibility. No new reader, store, writer or renderer is added.

The established six-field appointment v2 and its dedicated time/review experience remain unchanged. This bounded generic path does not manufacture missing reason/change-reason fields, loosen their rules, add calendar integration, or authorize creation, completion, Process, upload or delete. Unsupported conditional/choice/media configurations remain refused. Known Map audit Date-to-string behavior remains disclosed; business datetime is not part of that exception.

## Verification

New actual reader/provider module tests: 21 passed. Combined related run: 178 tests in five files passed, including configured editing41, appointment78, actual appointment SFC6 and Panel/Back32. Shared option and date/native-control regressions: 102 tests in three files passed. Typecheck, architecture and dependency/self-test gates passed.

Normal App intercepted H5: two new cases passed with no skips/retries/errors. They use Login → listed WorkOrder → actual Detail CTA → unique Workspace → the existing generic controls. Native H5 date/time pickers verify half selection cannot save; a complete choice/time edit makes one synthetic same-ID upsert, preserves sibling/opaque values and rereads after Back/reentry. The revoked case sends zero commands. The existing two six-field appointment experience cases also passed unchanged. All business transport is intercepted synthetic loopback; there was no Java, database, real account or production operation.

The initial new-module positive RED (two failures) is retained. Initial browser assertions incorrectly applied Playwright native disabled semantics to a `uni-button` that already had disabled and aria-disabled state; the original failure logs/JSON/context are retained. Final assertions inspect the component's actual `aria-disabled` contract and retain the zero-command half-selection assertion. No product change, timeout, force-click, retry or skipped assertion was used to resolve that test-oracle mismatch.

Portable commands using installed tools:

```sh
VITE_XLINK_ENVIRONMENT=test pnpm exec vitest run tests/engineering/r1-map-choice-datetime-edit.test.ts
pnpm exec playwright test --config config/playwright/map-choice-datetime-edit.config.ts
pnpm exec playwright test --config config/playwright/normal-appointment-experience.config.ts
```

The dedicated config lists exactly two tests, uses Cloud Chromium by default, and isolates results under `test-results/map-choice-datetime-edit/`. The inherited optional browser executable override remains available; no machine path is committed. Workflow wiring, full-project rerun, three-target builds, real appointment saving and native/production/commercial acceptance were not performed in this candidate. A real target must independently qualify through the current reader/provider; synthetic fixtures never establish server authorization.
