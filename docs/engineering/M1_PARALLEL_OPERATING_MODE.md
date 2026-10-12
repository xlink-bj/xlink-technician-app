# M1 — Two-lane engineering operating mode

**Effective:** 2026-10-12. Single Lead owns acceptance/integration. Codex local environment evidence is independent and asynchronous; issuing a GitHub instruction **does not start** the local Codex process. M1 remains eight acceptance iterations (never creates a ninth).

## Lane A — Local / authoritative evidence (Codex)

- Sole blocking outcome currently: [I2 #92](https://github.com/xlink-bj/xlink-technician-app/issues/92), Owner-authorized single Production quick-login + <=3 bounded ExtField/Code/SKU **read-only** requests, followed by read-only R1 runtime skuMatch observation. Use [#106](https://github.com/xlink-bj/xlink-technician-app/pull/106); one locally existing authorized SPU only; no secrets/IDs/price in reports. **Never** repeat a failed/unknown outcome automatically.
- Evidence format: pinned R1 source SHA + branch HEAD + actual command/preflight outcome + redacted response-shape counters + permitted UI matching outcome + PASS/BLOCKED/NOT_RUN. If unavailable, record precise blocker, never fabricate.
- This lane never changes New App code or PR ancestry by default. Unexpected behavior is an Issue evidence comment first; Lead opens/fixes a separate focused Draft PR if needed.
- **Gate:** I2 4/4 requires authorized real source/runtime evidence and Lead acceptance; synthetic success alone remains I2 3/4.

## Lane B — Cloud / offline engineering (Lead)

- Continue I3 contract work from [#105](https://github.com/xlink-bj/xlink-technician-app/pull/105) using [#107](https://github.com/xlink-bj/xlink-technician-app/pull/107). Golden tests exercise `QuotationDraft → hydration → pricing → candidate Order(type=1)`, source-based fields, safe blocking and H5/MP/App build. Do not touch I2 local probe or its connection.
- Next preparatory stream once I3 offline goldens PASS: independently audit I6 signing read-side contracts and I7 automated integration/rollback smoke (both **read-only**), without claiming their full acceptance or exceeding WIP=2 engineering lanes. Owner-dependent I4 UX design stays gated by #41; do not implement speculative UI.
- **Hard-stop boundary:** pinned R1 `placeOrders.vue.quote()` actually invokes a type=0 quotation route; new app's type=1 encoder is a candidate. No authorized type=1 wire equivalence, SKU pricing or official Order/Contract writes until independent stage/route + Owner/Beta #29 gates are satisfied.
- The four I3 DoD checks remain separate from preparatory engineering and CI; source-only and offline tests must not be renamed "R1 live parity".

## Integration & release discipline

1. **Stacked Draft PR ancestry:** #104 = I2 code; #106 = local bounded evidence tool stacked on #104; #105 = I3 source contract preflight (older I2 SHA baseline); #107 = I3 offline tests stacked on #105. Branch heads and bases are explicitly frozen in GitHub reports; don't cherry-pick across lanes casually.
2. Lead validates **exact HEAD**: Verify/Typecheck/Vitest, Main App H5 Playwright, WeChat MP and App bundle and any locally relevant checks. Separate **CODE_PASS** from **R1_PARITY_PASS**, **OWNER_UX_PASS**, **BETA_WRITE_PASS**, **NATIVE_DEVICE_PASS**.
3. I2 final real evidence arriving later is consumed as an *input* to I3; if it invalidates I3 synthetic mapping, update tests/contracts in Lane B before any integration. Do not merge speculative fixes into protected/runtime lanes.
4. Leave all PRs OPEN/DRAFT and no I3-to-main merge until I2 and I3 respective gates and owner integration authorization. Real Production business writes and backend/R1 alterations remain prohibited.
5. Update [master #33](https://github.com/xlink-bj/xlink-technician-app/issues/33) once per **meaningful milestone**, not per small commit. Report each lane's HEAD/CI/gates/next blocker. Gate checks are not cumulative acceptance merely because coding continues.

**Progress baseline:** M1 1/8 ACCEPTED. I2 IN_REVIEW 3/4 (Codex authorized, empirical results NOT_RUN). I3 IN_PROGRESS offline prep, 0/4 formal acceptance until evidence. I4–I8 not advanced.
