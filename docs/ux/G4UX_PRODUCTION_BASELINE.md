# G4-UX Production Baseline

Status: Phase B2 implementation candidate with locked product directions. R2’s brand/visual/IA baseline and staged Login/task-first Home directions are locked; no visual value below is settled unless marked LOCKED. Home and Work Order List production UX are implemented on the current branch and remain pending human visual review.

R2 — `xlink-business-3.0`, pinned main `06b885ed22477e79d50bc6f3a0ce0c96fbc1a185` — is the **LOCKED primary brand/visual/IA baseline**. R1 is secondary business/field-service evidence for this baseline. R2 observations are reproduced as approved product UX in uni-app, not copied as React/Next implementation.

Product Owner overrides for the new App: the Login brand lockup is text-only — **修链 / 屋顶维修**. The R2 graphic Logo and the incorrect **量顶维修** copy must not be restored.

## A. LOCKED PRODUCT / ARCHITECTURE CONSTRAINTS

These are accepted constraints, not open visual preferences:

- Shared/application code consumes semantic contracts; raw backend DTOs, paths, query keys, status codes, and menu conventions stay below the adapter boundary.
- R2 branded visual language and interaction hierarchy are locked for G4-UX.
- R2 staged Login — brand launch → login method selection → login form — is locked as the Login product direction. Unsupported R2 auth behavior is `UI/DEV BEHAVIOR REQUIRES CONTRACT EVIDENCE` and does not authorize new production auth APIs or shared-contract changes.
- Login UI must expose product-facing copy only; engineering, contract, endpoint, and backend explanations remain in source comments, tests, and documentation.
- Login launch auto-advance remains UNDECIDED and is not implemented; the current manual “进入登录” action is intentional.
- R2 task-first Home is locked: current work/current task first and the next meaningful action visually prioritized. Metrics-first is not a G4-UX alternative; only accepted task data/capabilities may render.
- Information regions and future information tabs are read-oriented.
- Stable customer contact is a Quick Action outside information content.
- Dynamic workflow/current-task business actions belong to an independent Current Action / Current Task surface, using a dedicated sheet, modal, or page when needed.
- Dynamic workflow actions must never be modeled as dynamic information tabs.
- MP-WEIXIN, Android, and iOS remain first-class targets; H5 is not a V1 target.
- G4-D is not started; appointment/workflow action behavior remains behind its own evidence gate.
- No product decision in this document authorizes new API fields, tabs, counts, filters, workflow writes, native integrations, or customer mutations.
- The branch retains the explicit exact-version MP-WEIXIN compiler correction from `c0128a06fff271532d0e88f04d44066cf192ddd4`; no further dependencies are authorized by this UX baseline.

## B2 IMPLEMENTATION RECORD — HOME / WORK ORDER LIST

The current B2 slice re-expresses the locked R2 task-first hierarchy in
uni-app without copying R2 React/Next implementation or fabricating data:

- Authenticated Home uses a compact 修链 / 屋顶维修 brand line, optional
  SessionSnapshot display name, one visually dominant 工单 entry, and a quiet
  local sign-out action.
- Home does not render a current-task card, task count, metric, trend, urgency,
  notification, or unsupported quick action because no separate current-task
  source is verified.
- Work Order List remains the single role-visible semantic list. It keeps the
  accepted adapter-selected SANODE/ordinary read path, page/pageSize behavior,
  semantic title-only rows, and semantic detail navigation.
- Work Order List now has production Chinese loading/skeleton, empty, manual
  refresh, retryable, terminal, and session-guard presentations. Empty means
  the current visible scope has no rows; it is not a global account claim.
- Raw adapter errors, backend codes, query names, workflow-node IDs, and
  WorkOrderId values are not rendered. Tabs, counts, filters, sorting, and
  richer card fields remain unimplemented until separately evidenced.

This record describes the implemented candidate, not final visual approval.
Human review must still assess MP safe-area behavior, typography, density,
touch targets, and narrow-device rendering. Login, Detail, Contact, G4-D, and
the accepted read transport are outside this B2 change.

The opt-in synthetic business-read runtime used for UX development is documented
in `docs/ux/G4UX_MOCK_RUNTIME.md`; it does not replace real Login or Beta read
verification.

## B. R2-DERIVED UX PROPOSALS

The following are evidence-backed proposals derived primarily from R2. They require product-owner review before implementation.

### Hierarchy and composition proposal

- **Login:** reproduce the locked R2 staged experience: branded launch → login method selection → focused login form → one primary action → concise feedback. Only contract-supported auth behavior may be wired.
- **Home:** reproduce the locked R2 task-first composition: authenticated context → current work/current task → next meaningful action → secondary information/actions. Only accepted task data/capabilities may render.
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

1. **Login content details:** final Chinese copy, agreement text, and which R2 secondary method affordances are contract-supported. Staged structure and branded interaction hierarchy are locked.
2. **Login functional gate:** B1 source/build correction keeps the primary Login action visible/reachable on the MP simulator; final human visual review remains required.
3. **Home content details:** exact accepted task data, supported workbench cards, greeting/status copy, and whether any secondary content is V1. R2 task-first structure is locked; metrics-first is not an alternative.
4. **Navigation shell:** Home/List/Detail back behavior, bottom navigation presence, and the set of V1 destinations; R2’s Projects/Account tabs are not automatically included.
5. **List capability exposure:** whether search, filters, tabs, counts, direct contact, special ordering, or only one role-visible list is required. No broad Legacy parity is assumed.
6. **List/detail density:** minimum semantic fields, status display, card versus row treatment, long-text/address behavior, and empty-state copy after Beta evidence.
7. **Visual tokens:** final palette, typography scale, radii, spacing, elevation, iconography, focus/pressed states, and contrast acceptance.
8. **State language:** Chinese copy and illustration/treatment for bootstrap, loading, empty, retryable, terminal, and session-invalid states.
9. **Future action surface:** workflow execution placement and presentation remain product decisions. The read-only R2 status-driven Current Task card is implemented outside information tabs; its CTA remains disabled until the separate action evidence gate passes.

## Cross-target gate scope

- **G4-UX visual gate:** primarily MP-WEIXIN, including the human-observed simulator rendering and source-to-render traversal of Login/Home/List/Detail.
- **Android/iOS in G4-UX:** source/build integrity, semantic contract portability, and configuration consistency only.
- **G5:** native packaging, device behavior, native APIs, and Android/iOS screenshot/device visual parity.

## Screen acceptance checklist for later review

### LOGIN — LOCKED R2 staged composition

Brand launch → login method selection → login form → primary Login action → feedback/recovery. The R2 branded visual language, worker/brand scene, trust cues, method-card hierarchy, and focused form hierarchy are locked. Bootstrap remains non-interactive until resolved. Only accepted auth methods may be actionable; unsupported R2 password/OTP-send/quick-test behavior is `UI/DEV BEHAVIOR REQUIRES CONTRACT EVIDENCE`.

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
