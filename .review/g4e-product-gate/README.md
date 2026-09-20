# G4-E Product / Visual Gate Review Pack

Status: `READY_FOR_PRODUCT_OWNER_REVIEW`

## Manifest

- Starting HEAD: `a803fff01742b2e02fa01421d195dc0029ce8bc8`
- Review HEAD: current tip of `rebuild/g4e-onsite-inspection` (the final full SHA is reported with the delivery)
- Branch: `rebuild/g4e-onsite-inspection`
- Mode: `MOCK_PRODUCT_REVIEW`
- Visual label: `H5_VISUAL_PROXY`
- Viewport: mobile `390 x 844`
- Authenticated: `NO`
- Real customer data, credentials, or live writes: `NO`
- Playwright: `@playwright/test 1.63.0`
- Browser: Chromium `153.0.8010.12`
- Automated browser tests: `18 passed` (11 scenario smoke tests + 7 semantic assertions)
- Screenshots: 11 generated under `generated/`; intentionally untracked and not committed

Generated screenshot files are intentionally untracked. They are local review
evidence and must not be committed unless repository policy explicitly
changes.

## Start

```bash
cd /Users/yesun/Code/xlink-technician-app
pnpm run dev:h5-review
```

For automated smoke tests and screenshot capture, use:

```bash
pnpm run test:h5-review
pnpm run capture:g4e-review
```

Playwright starts `pnpm run dev:h5-review` automatically at
`http://127.0.0.1:5173`. The browser test is the runtime visual-review path;
`build:h5-review` remains separate build/isolation evidence.

Open:

`http://127.0.0.1:5173/__review/g4e-survey.html?scenario=survey-overview`

The harness uses the real `ActionWorkspaceShell`, `SurveyActionContent`,
Dynamic Form Runtime, Leakage Cause controlled experience, media presentation,
and Save / Complete actions. The review entry supplies only a minimal H5
`uni` platform shim (storage, navigation, media picker/camera, location, and
toast/modal). It does not contain Survey business rules.

## Scenario URLs

Use the `scenario` query parameter or the in-page development-only selector:

| Scenario | URL suffix |
| --- | --- |
| Survey overview | `survey-overview` |
| Required fields | `required-fields` |
| Part-dependent fields | `part-dependent-fields` |
| Leakage Cause | `leakage-cause` |
| Required media empty | `required-media-empty` |
| Media local pending | `media-local-pending` |
| Media uploading | `media-uploading` |
| Media retryable failure | `media-retryable-failure` |
| Media ambiguous | `media-ambiguous` |
| Media uploaded | `media-uploaded` |
| Validation error | `validation-error` |
| Unsaved | `unsaved` |
| Saved, ready to complete | `saved-ready-to-complete` |
| Deferred fields absent | `deferred-fields-absent` |

Example:

`http://127.0.0.1:5173/__review/g4e-survey.html?scenario=media-ambiguous`

## Review boundaries

- Data is deterministic and synthetic; no Beta session, phone, customer,
  address, photo, or token is used.
- Mock mode is forced on and real writes are forced off.
- `serviceGoods`, `projPackage`, `surveyDrawing`, `surveyTool`, and LBS
  check-in are absent/deferred as required by G4-E governance.
- Save remains distinct from Complete; the real Runtime controls eligibility.
- Pending local media is not presented as uploaded media.
- Ambiguous media does not receive an ordinary blind-retry success path.
- This is not MP device evidence, App device evidence, authenticated evidence,
  live Beta evidence, or production readiness evidence.

## Known limitations

- The generated PNGs are review evidence only, not visual-regression baselines,
  and remain untracked. The browser test produces failure screenshots and
  traces only when a test fails.
- H5 platform behavior is represented by the review shim; MP/App device
  permissions, restart recovery, and native camera behavior remain separate
  device QA concerns.
- Live Beta reads, real media upload, real watermark execution, Survey Save,
  and workflow completion are intentionally not exercised here.
