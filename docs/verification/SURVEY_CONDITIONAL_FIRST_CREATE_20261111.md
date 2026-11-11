# Conditional Survey first-create integration

Baseline: `61df38305030e25347e51619e62ab30382e11e7b`. This private integration candidate preserves existing media and appointment capabilities. It adds one explicitly synthetic six-field first-create slice for canonical Survey definition `7971040108398070730`: part, length, width, planeArea, memo and conditional height. It does not certify the original 59-row definition.

The full ordered part path controls height. Switching to a hidden branch clears the old height to the verified empty input; returning requires a fresh value. Part selection does not recalculate planeArea. Only length/width events use the existing R1 calculation rule. Reader-private exact typed Ext/field provenance and fresh permission/schema identity remain mandatory. Raw root and EXTS readback must agree; a lossy display projection is insufficient. Unknown conditions/providers, conflicting or duplicate configuration, calculations and stale authority remain refused. Typed existing edits, append and workflow completion are not enabled by this slice.

The strict scoped JSON decoder is extracted without changing its function body. Existing file codecs, default-image qualification, file-route issuance, queue behavior and appointment version-2 edit-only grants remain intact. The conditional H5 has separate JSON, attachments and compiler output directories.

## Local verification

On this exact merged source tree:

- Actual baseline RED: four targeted assertions failed before integration; the failure log is retained privately.
- New conditional suite: 61 PASS. Affected repeat/lease/part/appointment/media/scalar tests: 598 PASS across 16 files, including those same 61 (not additive). Additional reader/Code/generic regressions: 343 PASS across five files.
- `VITE_XLINK_ENVIRONMENT=test VITE_XLINK_ENABLE_REAL_WRITES=false pnpm run verify:full`: exit 0, 293 files / 4799 PASS, including typecheck, architecture, dependency and quality gates.
- Opt-in normal App H5 at 430×932: conditional 3, original part 3, appointment 3, image upload 1 and image recovery 8: 18 PASS, zero skipped. All APIs are intercepted synthetic responses. The existing image tests exercise actual browser picker/uni multipart against a synthetic loopback receiver; this is not real object storage or Java metadata persistence.
- New conditional ledgers: save 27 requests / one upsert; provider drift 19 / zero writes; wrong readback 34 / one upsert followed by uncertain protection. Each has zero Process, EXTS, uploads, external requests and page errors. Height is hidden and cleared at the actual save; real numeric visible-height persistence remains a separate unverified scope.
- Release-profile `build:h5`, `build:mp-weixin`, `build:app`: exit 0, serial execution. Build success does not prove native runtime behavior.
- Default discovery still finds three opt-in conditional cases; discovery/skip metadata is not counted as execution PASS.

No real backend writes occur in Cloud validation. The new scoped-job CI step sets the explicit conditional flag and archives its independent output. Existing steps, conditions, permissions, concurrency and the 15-minute budget are unchanged. This private candidate has not been submitted or run on remote CI.

## Previously completed Mac evidence

The exact reviewed V4 author candidate ran 4502 unit tests and three intercepted normal App H5 cases. Independent review ran 49 adversarial and 318 focused tests plus typecheck/boundary/dependency checks. These are separate from merged-tree Cloud results.

One already consumed isolated real-Java test used the correct synthetic six-field protocol fixture: 57 responses, three logins, one create; height empty in the wire and absent from persisted root/EXTS. Objects increased 26 to 27, the prior 25 BSON documents were unchanged except Account login updates, and all 27 matched after restart before fresh cold reading. No EXTS, Process or upload was issued. This prior business write was not replayed here. The initial incorrect fixture encoded an array in Java's string showValue slot; it was preserved as 50 reads and zero business writes. That fixture error is not a production defect.

Original 59-field condition/provider values, real visible-height numeric persistence, typed existing editing, append, completion, production, native runtime and general BSON/CAS guarantees remain unverified. Fixed backend Date/type and full replacement risks remain documented historical limits. No exact candidate-SHA remote CI has run for this private tree.
