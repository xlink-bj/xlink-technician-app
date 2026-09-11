# G4-UX Production Baseline

Status: Phase A target baseline. No visual value below is a settled product design unless marked LOCKED; exact values are proposals for product-owner review.

R2 — `xlink-business-3.0`, pinned main `06b885ed22477e79d50bc6f3a0ce0c96fbc1a185` — is the primary UX/visual/IA reference. R1 is secondary business/field-service evidence for this baseline. R2 observations are adapted, not copied.

## A. LOCKED PRODUCT / ARCHITECTURE CONSTRAINTS

These are accepted constraints, not open visual preferences:

- Shared/application code consumes semantic contracts; raw backend DTOs, paths, query keys, status codes, and menu conventions stay below the adapter boundary.
- Information regions and future information tabs are read-oriented.
- Stable customer contact is a Quick Action outside information content.
- Dynamic workflow/current-task business actions belong to an independent Current Action / Current Task surface, using a dedicated sheet, modal, or page when needed.
- Dynamic workflow actions must never be modeled as dynamic information tabs.
- MP-WEIXIN, Android, and iOS remain first-class targets; H5 is not a V1 target.
- G4-D is not started; appointment/workflow action behavior remains behind its own evidence gate.
- No product decision in this document authorizes new API fields, tabs, counts, filters, workflow writes, native integrations, or customer mutations.
- The branch retains the explicit exact-version MP-WEIXIN compiler correction from `c0128a06fff271532d0e88f04d44066cf192ddd4`; no further dependencies are authorized by this UX baseline.

## B. R2-DERIVED UX PROPOSALS

The following are evidence-backed proposals derived primarily from R2. They require product-owner review before implementation.

### Hierarchy and composition proposal

- **Login:** trusted product context → focused phone/code form → one primary action → concise feedback.
- **Home:** authenticated context → current work or primary workbench entry → secondary information/actions. R2 supports either task-first or metrics-first composition; the new App should not select one without approval.
- **List:** scope/title → optional search/filter controls only if accepted → structured rows/cards → explicit recovery and pagination state.
- **Detail:** Back → summary/identity → stable Quick Actions → read-oriented information → future independent Current Action/Task surface. This preserves the accepted Detail Interaction Rule.

### Visual rhythm proposal

- Prefer a soft page background, white information surfaces, restrained borders, and subtle elevation similar to R2.
- Use short section groups, a clear title/supporting-text relationship, and one dominant primary action.
- Use status color only for an accepted semantic status; never use raw backend codes or unverified color severity.
- Use skeletons for initial loads, explicit empty/retryable/terminal/session-invalid states, and disabled/in-flight treatment for duplicate actions.
- Respect safe areas, platform back behavior, long title/address wrapping, and a minimum touch target suitable for MP/App.

### PROPOSED visual tokens — not approved

These values make the proposal concrete for review; they are not locked design tokens:

| Token | PROPOSED value | Approval needed |
| --- | --- | --- |
| Page background | `#F5F7FB` or a product-approved neutral | Brand/visual approval |
| Primary surface | White | Product/contrast approval |
| Primary text | Near-black neutral, e.g. `#101827` | Contrast/brand approval |
| Supporting text | Neutral gray, e.g. `#667085` | Contrast approval |
| Primary action | Blue family inspired by R2, exact hue TBD | Brand approval |
| Error | Semantic red paired with text/recovery | Accessibility approval |
| Card radius | 14–20rpx | Visual approval |
| Control radius | 10–16rpx | Visual approval |
| Page inset | 24–32rpx on compact phones | Device/layout review |
| Spacing rhythm | 8rpx base with 16/24/32/48rpx steps | Density review |
| Page title | 40–52rpx equivalent, weight TBD | Typography/copy approval |
| Body text | 28–30rpx equivalent, line-height TBD | Typography/accessibility approval |
| Minimum control height | 88rpx equivalent where practical | MP/App touch-target review |
| Elevation | Subtle shadow only | Visual approval |

No exact color, radius, typography size, spacing, shadow, icon, or screen alternative above is settled.

## C. PRODUCT DECISIONS REQUIRED

The following decisions remain with the product owner/design review:

1. **Brand/Login:** approved brand mark, launch illustration, direct-form versus launch/method steps, agreement text, and final Chinese copy.
2. **Login functional gate:** resolution of the MP iPhone 12/13 simulator observation where the Sign in action is not visible after the verification-code field. Root cause is intentionally not assumed in Phase A.
3. **Home composition:** task-first versus metrics-first; whether Home has a bottom tab shell; which greeting, status, cards, quick actions, and counts are genuinely V1.
4. **Navigation shell:** Home/List/Detail back behavior, bottom navigation presence, and the set of V1 destinations; R2’s Projects/Account tabs are not automatically included.
5. **List capability exposure:** whether search, filters, tabs, counts, direct contact, special ordering, or only one role-visible list is required. No broad Legacy parity is assumed.
6. **List/detail density:** minimum semantic fields, status display, card versus row treatment, long-text/address behavior, and empty-state copy after Beta evidence.
7. **Visual tokens:** final palette, typography scale, radii, spacing, elevation, iconography, focus/pressed states, and contrast acceptance.
8. **State language:** Chinese copy and illustration/treatment for bootstrap, loading, empty, retryable, terminal, and session-invalid states.
9. **Future action surface:** placement and presentation of Current Action/Current Task; it must remain outside information tabs and is not implemented here.

## Cross-target gate scope

- **G4-UX visual gate:** primarily MP-WEIXIN, including the human-observed simulator rendering and source-to-render traversal of Login/Home/List/Detail.
- **Android/iOS in G4-UX:** source/build integrity, semantic contract portability, and configuration consistency only.
- **G5:** native packaging, device behavior, native APIs, and Android/iOS screenshot/device visual parity.

## Screen acceptance checklist for later review

### LOGIN — PROPOSED composition

Product context → phone → verification code → primary Sign in → feedback/recovery. Bootstrap remains non-interactive until resolved.

Must not appear: raw method/tenant/endpoint text, password/social/QR flows, unapproved send-code behavior, credentials, or a primary action hidden below the current MP rendering viewport.

### HOME — PROPOSED composition

Authenticated greeting/context → one clearly labeled Work Orders/workbench entry → optional approved secondary content → quiet Sign out.

Must not appear: guessed permission cards, analytics/trends/counts without approval, stale Work Order data, or a broad Legacy dashboard port.

### WORK ORDER LIST — PROPOSED composition

Proven role-visible scope → approved controls → list/skeleton/empty/error → semantic Work Order rows → load-more only when safely derived.

Must not appear: “My”/“Assigned” claims without evidence, raw codes/menu labels, workflow-node ids, backend query details, or unapproved tabs/counts/filters.

### WORK ORDER DETAIL — PROPOSED composition

Back → semantic summary → stable Quick Actions → read-oriented information. Future Current Action/Task is an independent region; future information tabs remain read-only.

Must not appear: dynamic workflow execution inside information tabs, raw DTO fields, unmasked phone, phone in routes, contact editing, relay calls, or appointment/inspection actions before their evidence gate.
