# DS-03 — Transaction Visual Foundation (Q00 / Q01 / Signing)

Status: engineering candidate; **NOT** COMMERCIAL_UI_ACCEPTED. Parent #140; dedicated scope #145.

## Visual architecture

1. **Foundations**: a single semantic palette, typography and spacing definition in `src/shared/ui/design-system.scss`. The DS-03 `--app-transaction-*` tokens are derived from existing surface/text/action contracts, not a separate theme.
2. **Primitives**: existing `AppRecordCard` (surface/elevation), `AppSectionHeading` (section hierarchy), `AppMetaTag` (descriptive state/identity) and `AppButton` (action hierarchy); new `AppAmountValue` displays only caller-supplied formatted strings (including source-declared unknown/blocked values).
3. **Applications**: the real `QuotationOrderHub` (Q00), real `QuotationActionWorkspace` footer (Q01) and `signing-order-read` read-only contract page use this visual grammar. Do not turn historical proposal, Local Draft, amount preview, synthetic contract or incomplete server reads into authoritative business state.

## Why this is engineering and not a style patch

Previous Q00 had `--q-*` local palette, local cards/shadows/tag/amount treatments; signing had separate cards and tags; Q01 amount had independently calibrated typography. These are consolidated so subsequent screens reuse semantics rather than duplicate colors and border radii.

## Boundaries

No workflow action selection, order identity, status inference, sign authorization, user session, server call or order mutation is made by any UI primitive. No production/Beta write. Signing remains read-only, Q01 submit eligibility remains unchanged. DEV labels retain explicit `演示`; unknown amounts remain `待核验`.

## Verification and next slices

- Gate A: code governance, typecheck, unit tests, no authorization/financial contract regression.
- Gate B: rendered uni-app H5 Q00/Q01/signing screenshots at 320/375/390, with real before/after visual review. Deliberate expected image differences are **not** permission to weaken pixel-diff limits.
- Gate C: Owner aesthetics approval followed by deliberate Golden promotion and strict H5 visual PASS.
- Following slices: improve information density and state composition in Q01/Q02/Q03; migrate legacy `QuotationActionContent` CSS debt by repeating verified reuse, not bulk search/replace.

Cross-device visual acceptance is deferred; final main merge is not authorized by this engineering slice.
