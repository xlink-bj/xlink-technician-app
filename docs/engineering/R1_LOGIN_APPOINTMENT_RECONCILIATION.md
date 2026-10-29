# R1 Two-Stream Engineering Reconciliation — Interim Candidate (NO release)

## Exact provenance and zero conflict

- R1-P1 source-pinned control: [#179](https://github.com/xlink-bj/xlink-technician-app/pull/179) `1082a24d27c0e09e3c5faaec8fca38e140cc0f60`.
- [#182 R1-L02 manual legal-consent](https://github.com/xlink-bj/xlink-technician-app/pull/182) exact source `f7ee7360e302d576dd4a44164592b5bcdf2c1b0e`, CI `39233158758` success.
- [#183 R1-A03 Appointment single writer](https://github.com/xlink-bj/xlink-technician-app/pull/183) exact source `18ae65d85713cadc40cc00b87a44d3dba90ffdeb`, CI `39234168363` success.
- This reconciliation is **a real two-parent Git commit** `c383a642485e609e52a9110efb91c10938e30025` with exact parents **in order** L02 then A03, and tree `4f18736da17194f54f6fa25239086d46acecf8a0`.
- Starting from L02's tree, exactly **four byte-identical blobs** from #183 were overlaid: `src/adapters/api/technician-api-commands.ts`, `tests/engineering/r1-appointment-wire-unification.test.ts`, `docs/engineering/R1_APPOINTMENT_SAVE_WIRE_UNIFICATION.md`, `.github/workflows/r1-appointment-wire.yml`. The Login source pages and policy guard are unchanged from #182.
- The additional manifest and read-only CI in this branch have no application-side effect; both feature PRs remain separately OPEN/DRAFT/unmerged; `main` has not moved.

## What this candidate proves

One reproducible checkout contains both R1 improvements:
1. Real manual login now demands **affirmative legally approved** Privacy/Agreement URLs and checked consent before Auth Port request. With no legal URLs, there is **zero manual auth call**; DEV Quick remains isolated; no OTP/password provider invented.
2. Appointment's required/deferred/saveOnly branches share **one FormData envelope**, but Workflow Complete only runs on successfully saved form record. Unknown R1 `need=0` datetime encoding remains **blocked by transport safety**.

The combined candidate must independently PASS: pinned R1 six-stage source gate, focused 2 feature + old regression tests, critical 12-file behavior lane, full `verify:full`, H5/WeChat MP/App builds, real Uni H5 offline manual consent 2 viewports, six-stage Main-App H5 Mock 2 viewports, existing Gallery 3 plus business List/Detail/Q01 Goldens 9. No re-recording snapshots. Every external browser route is denied in the offline tests.

**Not proven:** real legal copy/approval, SMS-provider and password-mode parity, privileged role/tenant ACL, real SKU/org/sourceType price authority, Contract electronic signing, real workflow/form/backend readback, true iOS/Android/WeChat simulator validation. These remain separate Owner/Codex gates. Formal R1/M1 live parity is NOT_VERIFIED, business writes NOT_APPROVED and no main merge.

## Why interim

Additional R1 catalogue-price and Contract permission code work and measured coverage/Mock engine improvements remain. Use this as a reproducible **intermediate integration head**, not as the final simulator-ready release. Later reconciliation requires an independent candidate and fresh full green checks.
