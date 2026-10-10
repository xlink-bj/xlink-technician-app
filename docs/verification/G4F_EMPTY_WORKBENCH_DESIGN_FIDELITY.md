# G4-F first-use quotation workbench — visual contract

Status: `CODE_VERIFIED / READY_FOR_OWNER_VISUAL_SIDE_BY_SIDE_REVIEW`; **not** Owner UX PASS. Scope is only the fresh, empty quotation Action Workspace. Approved source is the Owner-provided `报价工作台空状态_ui.png` (853×1844, SHA-256 `1d3e6d1640cf4a85dbc4f259f0da120bc728dc13eb249f630f4e98110d2643d88`). It was inspected locally; the source artwork is not copied into the app or committed.

At 390×844, the normalized design regions are below. The reference OS/nav and expanded work-order summary are deliberately **non-comparable**: the actual app must keep the shared `ActionWorkspaceShell.vue` and its common context card for Appointment, Survey and Quotation. The visual region below that card is comparable. All values are approximate because the approved source is a raster design image.

| Source region at 390px | Target presentation | Implemented owner / accepted business-safe deviation |
| --- | --- | --- |
| Status, x≈15–375 y≈182–219 | Standalone pale-blue notice; blue info mark; 11–13px text; ~10px radius | Initial-empty content. Says *local draft* and order creation only after validation/submission; does not promise signing. |
| Main card, x≈15–375 y≈232–553 | Pearl-white surface, subtle shadow, ~13px radius; 17–19px section title; lighter support copy | Quotation-only initial card within shared shell. No copied work-order header. |
| Empty illustration, x≈25–365 y≈301–544 | Pale blue inset, genuine 3D blue open box, soft ground, centered label and support copy | Transparent project PNG + CSS ground. Not an outline AppIcon or full-page screenshot. Generated asset is analogous but not pixel-identical. |
| CTA, x≈115–275 y≈483–525 | Centered cobalt action, 44px+ tap target | Existing `createRepairGroup()` behavior; no new action. |
| Three-step help, x≈15–375 y≈563–728 | Separate white card with numbered steps, arrows and supporting copy | Informational `选择维修部位 → 添加项目 → 提交订单`. Not a required wizard; submit remains gated. |
| Fixed footer, y≈756–844 | Project count, amount, main action | Existing shared action footer: 0 items, amount pending verification, submit disabled. Reference art's implied submission/signing state is not copied. |

Visual tokens follow the accepted Design System: `#2878f2` primary, `#edf4ff` soft primary, white surfaces, `#1d2b40` text. Initial-state surfaces add only scoped icy gradients and restrained shadows. No global Shell, token, other Action page, quote contract or runtime state change is made.

The illustration `src/features/work-orders/quotation/empty-box-illustration.png` was generated with the built-in image tool from the approved visual reference. Generation prompt specified an isolated transparent isometric blue open box with translucent panels, cobalt accents and two sparks, and excluded background, text, icons, people and product imagery. The original generated asset is retained in the local Codex generated-images area; the distributable PNG is included in the app source.

## Evidence and acceptance boundaries

Local, untracked review pack: `.review/g4f-ux-phase-b0/empty-workbench-approved-v1/after/`. It contains 390×844 and 320×844 real uni-app H5 screenshots, a 390×844 reference/runtime side-by-side, a business-content-aligned side-by-side and post-add-part screenshot. The aligned comparison accounts for ~58px of shared Shell/header height difference; it does **not** claim pixel identity. The visible remaining differences are the independently generated box shading, simpler step glyphs and business-safe copy. No major approved content module is omitted.

`DESIGN_FIDELITY_REVIEW`: shared shell reuse PASS; standalone notice PASS; complete composition PASS for review; illustration present/loaded PASS for review; three-step card present PASS; truthful disabled footer PASS; 390/320 horizontal overflow NONE. Final aesthetic acceptance belongs to the Owner. Browser evidence is `H5_VISUAL_PROXY / MOCK_PRODUCT_REVIEW`, never authenticated or device evidence. The synthetic review fixture contains no real customer data.

Semantic classification: actual draft count/amount/submission eligibility are `VERIFIED_DATA`; box/gradient/three-step helper are `VISUAL_PATTERN_ONLY`; fake amounts, automatic signing and a submit-ready first-use draft are `UNSUPPORTED_BUSINESS_CAPABILITY` and absent. No new Product decision is inferred from the design art.

Automated source/type/unit/H5 and H5/MP/App builds pass. The MP build emits its app files and illustration asset, but local DevTools opening this isolated test artifact fails with `AppID not found` (CLI code 10); MP simulator/device visual status is `BLOCKED_ENV`, not PASS. App native runtime is also not claimed. No Beta/Production request or business write is part of this visual review.
