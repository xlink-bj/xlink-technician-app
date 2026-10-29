# G4-F product preview: local quotation review readiness

**Gate: CODE_ONLY / UX_BROWSER_PENDING / REAL_R1_PARITY_UNVERIFIED**

The DEV-only product review uses the existing pure `evaluateLocalQuotationPreflight()`
with `schemaEvidence: 'unverified'`, because no **effective** Order ExtField
schema is source-verified for the synthetic work order. The presentation
`quotationReviewReadinessCopy()` provides a single compact line: a source-derived
first actionable repair-group issue or a truthful statement that the group's
local structure is complete while actual dynamic fields/official quotation are
unverified. In product preview it **replaces** the large engineering engine
status block; in ordinary application routes the engine panel remains unchanged.

It does not construct Order.exts, submit commands, provider data, price values,
or a new mandatory-form workflow. Official submit stays hard-disabled by the
existing command ports and DEV-only `productReviewOnly` guard. A source test
and unit tests verify no false-ready signal. Local uni-H5 375/390 click
and screenshot checks still require Codex after exact-head CI; do not claim
Owner UX pass or business parity from compilation.
