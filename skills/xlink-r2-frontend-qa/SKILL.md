---
name: xlink-r2-frontend-qa
description: "Run XLink R2 visual frontend implementation and Design QA for the Technician App, using matched mobile screenshots, pinned reference evidence, and semantic-contract safeguards."
---

# XLink / R2 Frontend QA

Use this skill for visual frontend implementation and review work in
`xlink-technician-app`. It governs the evidence and QA workflow; it is not a
source of business requirements or authorization for new product behavior.

## Required workflow

1. Read the task scope, Product Owner decisions, Program Control issue, and
   current accepted contracts before changing code.
2. When the task concerns an R2 reference, open R2 Live Mobile:
   `https://app.xiulian.com.cn/login?from=%2F`.
3. Use Quick Login only when needed and when the task's approved environment
   permits it. Never print or retain credentials, OTPs, cookies, or tokens.
4. Set a target mobile viewport and record the dimensions used for comparison.
5. Capture the actual R2 reference screenshot at that viewport.
6. Inspect pinned R2 source, read-only, for component structure, tokens,
   spacing, typography, card anatomy, and interaction patterns.
7. Inspect the current Technician semantic contracts and supported data.
8. Classify every desired visual or data element as exactly one of:
   `VERIFIED_DATA`, `VISUAL_PATTERN_ONLY`,
   `UNSUPPORTED_BUSINESS_CAPABILITY`, or `PRODUCT_DECISION_REQUIRED`.
9. Implement only semantics allowed by accepted contracts, verified evidence,
   and current Product Owner decisions.
10. Build MP-WEIXIN and verify the generated artifact is usable.
11. Open WeChat DevTools and the MP simulator.
12. Capture the Technician screen at the matched viewport.
13. Compare R2 and Technician screenshots side-by-side (or with an equivalent
   visual comparison artifact).
14. Perform the Design QA checklist below.
15. If visual quality is materially below R2, iterate before handoff.
16. Hand off only when functional tests pass, the composition is
   production-grade, no engineering-shell appearance remains, and unsupported
   business semantics have not been invented.

If approved beta credentials or configuration are unavailable, do not
fabricate them. Report the relevant verification as credential-required and
keep the work source/build-only.

## R2 Live PII handling

- Prefer approved demo/test accounts and synthetic/demo records whenever they
  are available.
- Temporary visual inspection of R2 Live in the browser is allowed.
- Real customer names, addresses, phone-related data, and other PII must never
  be persisted into `.review/`, saved screenshots, ZIPs, logs, GitHub Issues,
  or committed files.
- Inspect a live screenshot for PII before saving it. If it contains real PII,
  redact or crop the saved artifact while preserving the layout, spacing,
  typography, hierarchy, card anatomy, and density evidence needed for QA.
- If safe redaction or cropping would destroy the required visual evidence, do
  not save the screenshot. Record
  `R2_REFERENCE_SCREENSHOT = NOT_SAVED / PII` and continue with transient live
  browser inspection, pinned R2 source, and non-sensitive visual notes.
- Technician-side screenshots must use synthetic/mock data only unless
  separately authorized.

## Design QA checklist

Explicitly inspect and record:

- page composition and visual center of gravity;
- page width, safe-area handling, and content insets;
- information hierarchy and typography hierarchy;
- spacing rhythm and density;
- card anatomy, icon scale, border, radius, and restrained shadow;
- action hierarchy and touch-target clarity;
- empty, loading, and error states;
- mobile navigation and top spacing;
- long-content wrapping and overflow behavior;
- optional-field omission behavior;
- consistency with the accepted Home/List/Detail baseline.

Functional correctness is necessary but not sufficient. A page that still
looks like an engineering shell, basic CRUD/admin UI, placeholder cards, or a
weak mobile composition is not ready for handoff.

## R2 and business authority

- R2 Live Mobile is the visual ground truth and interaction/IA reference.
- R2 source is evidence for design tokens, components, layout, and behavior
  patterns.
- R1, approved Beta evidence, and accepted semantic contracts are the
  authority for business semantics, backend behavior, and field truth.
- Program Control, the Issue, and Product Owner decisions remain higher
  priority than this skill.

R2 does not authorize new business fields, API calls, workflow states, counts,
statuses, tabs, filters, or navigation destinations. Do not convert a visual
pattern into an unsupported business capability.

## Mock data rule

Mock values may be synthetic; mock business semantics must be real. Mock UI
must not introduce mock-only fields. Mock DATA combines synthetic values with
verified semantic structure, and mock scenarios must not conceal unsupported
capabilities.

## Visual review artifacts

For a visual frontend slice, keep review artifacts local and untracked under:

`.review/<slice>/`

Prefer a README, a PII-safe R2 reference screenshot, the synthetic/mock-data
Technician screenshot, and an optional side-by-side comparison. Do not upload
screenshots or ZIP files to GitHub Issues unless explicitly requested. Issues
are the textual review ledger by default.

## Preferred capabilities

Use the existing local capabilities when applicable:

- `wechat-miniprogram-automation` for MP builds, DevTools, simulator, and
  read-only verification;
- `visualize` for an in-conversation comparison when it materially helps;
- Chrome / CUA browser for R2 inspection and matched viewport control;
- WeChat DevTools for MP runtime evidence;
- `view_image` for local screenshot inspection.

This workflow does not require Figma, the standalone `agent-browser` CLI,
v0, or random third-party frontend skills.

## Non-authority and safety boundary

This skill must not change shared contracts, authorize APIs, decide workflow or
navigation products, override Program Control or Product Owner decisions, or
permit backend writes. Keep reference repositories read-only. Do not expose
credentials, session references, customer data, raw phone numbers, cookies, or
tokens in screenshots, logs, artifacts, or issue comments. Apply the R2 Live
PII handling rules above before persisting any visual evidence.
