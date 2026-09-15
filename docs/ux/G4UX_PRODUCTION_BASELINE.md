# G4-UX Production Baseline

Status: G4-UX Production UX Baseline = ACCEPTED / FROZEN

Accepted branch HEAD: `5aac413b187e039d01450e092905b600fb23e8ac`

Product Owner visual acceptance: COMPLETED

ChatGPT engineering / architecture freeze audit: PASS, subject only to this
documentation closeout.

This is the durable governance record for the accepted G4-UX implementation at
the accepted HEAD. Future Product Owner UX specifications may supersede this
baseline through an explicit follow-up decision; this closeout does not reopen
the current visual review.

Product Owner overrides for the new App: the Login brand lockup is text-only — **修链 / 屋顶维修**. The R2 graphic Logo and the incorrect **量顶维修** copy must not be restored.

## Authority model

- **R1 / REAL BACKEND = production business truth.** R1 is authoritative for
  production backend API behavior, field meanings, business semantics,
  workflow semantics, permissions/visibility, operational edge cases, and
  compatibility requirements.
- **R2 = new-experience prototype / UX reference.** R2 is primary for G4-UX
  visual hierarchy, IA, interaction direction, and List/Detail experience
  patterns. R2 is not production backend dictionary authority, status-code
  authority, workflow truth, or API-contract authority.
- **NEW APP = modern implementation of R1 business truth with the accepted
  R2-led experience direction.**

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

## FROZEN CURRENT BASELINE

The accepted read journey is:

Login / Session → Home → Work Order List → Work Order Detail → Customer
Contact presentation → read-only Current Task projection where semantically
valid.

The accepted development infrastructure is:

- Non-production Home exposes the `Mock 数据` / `Real API` source switch.
- Fresh non-production state defaults to Mock `DATA`; `DATA` / `EMPTY` scenarios
  remain available while Mock is enabled.
- Real API reads use the same Adapter, semantic model, Workflow Runtime, and UI
  path as Mock reads.
- Login / Session remains real and is never mocked.
- Production does not render the switch and Mock is hard-disabled.

The Detail Interaction Rule is frozen: information regions and tabs are
read-oriented; Workflow / Appointment execution belongs to an independent
Current Action / Current Task surface.

The following read evidence remains **DEFERRED / NON-BLOCKING FOR G4-UX**:

- representative live `repairParts` cascade shape;
- representative live `communityOrdersTotal` shape;
- complete live raw workflow visibility matrix;
- raw-envelope persistence/parity evidence.

Missing evidence is conservatively omitted or under-displayed. No fallback
business semantics are fabricated. These items may be verified when a later
slice genuinely requires them.

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

This is the accepted implementation record for the frozen baseline. Product
Owner visual acceptance is complete; no screenshot artifact is required in the
repository. Login, Detail, Contact, and the accepted read transport are part of
the subsequent frozen G4-UX read journey below.

The development-only synthetic business-read runtime and source control are
documented in `docs/ux/G4UX_MOCK_RUNTIME.md`; they do not replace real Login or
Beta read verification.

## B. R2-DERIVED UX RATIONALE AND OPEN DETAILS

The following rationale is derived primarily from R2 and explains the accepted
experience direction. Exact details or capabilities explicitly marked deferred
remain outside the frozen acceptance and require a later Product Owner or
evidence-gated decision.

### Accepted hierarchy and composition

- **Login:** reproduce the locked R2 staged experience: branded launch → login method selection → focused login form → one primary action → concise feedback. Only contract-supported auth behavior may be wired.
- **Home:** reproduce the locked R2 task-first composition: authenticated context → current work/current task → next meaningful action → secondary information/actions. Only accepted task data/capabilities may render.
- **List:** scope/title → optional search/filter controls only if accepted → structured rows/cards → explicit recovery and pagination state.
- **Detail:** Back → summary/identity → stable Quick Actions → read-oriented information → future independent Current Action/Task surface. This preserves the accepted Detail Interaction Rule.

### Accepted visual rhythm

- Prefer a soft page background, white information surfaces, restrained borders, and subtle elevation similar to R2.
- Use short section groups, a clear title/supporting-text relationship, and one dominant primary action.
- Use status color only for an accepted semantic status; never use raw backend codes or unverified color severity.
- Use skeletons for initial loads, explicit empty/retryable/terminal/session-invalid states, and disabled/in-flight treatment for duplicate actions.
- Respect safe areas, platform back behavior, long title/address wrapping, and a minimum touch target suitable for MP/App.

### Unpinned visual implementation details

The accepted implementation at the frozen HEAD is the visual baseline. The
following values are retained as historical implementation guidance only; they
do not authorize a future visual change without Product Owner direction:

| Token | Historical guidance | Future change |
| --- | --- | --- |
| Page background | `#F5F7FB` or a product-approved neutral | Explicit PO spec |
| Primary surface | White | Explicit PO spec |
| Primary text | Near-black neutral, e.g. `#101827` | Explicit PO spec |
| Supporting text | Neutral gray, e.g. `#667085` | Explicit PO spec |
| Primary action | Blue family inspired by R2 | Explicit PO spec |
| Error | Semantic red paired with text/recovery | Explicit PO spec |
| Card radius | 14–20rpx | Explicit PO spec |
| Control radius | 10–16rpx | Explicit PO spec |
| Page inset | 24–32rpx on compact phones | Explicit PO spec |
| Spacing rhythm | 8rpx base with 16/24/32/48rpx steps | Explicit PO spec |
| Page title | 40–52rpx equivalent | Explicit PO spec |
| Body text | 28–30rpx equivalent | Explicit PO spec |
| Minimum control height | 88rpx equivalent where practical | Explicit PO spec |
| Elevation | Subtle shadow only | Explicit PO spec |

## C. NON-BLOCKING OPEN DETAILS AND FUTURE GATES

The following items do not block the frozen G4-UX baseline. Future changes or
capability expansion still require Product Owner direction and, where noted,
an independent evidence gate:

1. **Login content details:** final Chinese copy, agreement text, and which R2 secondary method affordances are contract-supported. Staged structure and branded interaction hierarchy are locked.
2. **Login functional gate:** B1 source/build correction keeps the primary Login action visible/reachable on the MP simulator; Product Owner visual acceptance is complete.
3. **Home content details:** exact accepted task data, supported workbench cards, greeting/status copy, and whether any secondary content is V1. R2 task-first structure is locked; metrics-first is not an alternative.
4. **Navigation shell:** Home/List/Detail back behavior, bottom navigation presence, and the set of V1 destinations; R2’s Projects/Account tabs are not automatically included.
5. **List capability exposure:** whether search, filters, tabs, counts, direct contact, special ordering, or only one role-visible list is required. No broad Legacy parity is assumed.
6. **List/detail density:** minimum semantic fields, status display, card versus row treatment, long-text/address behavior, and empty-state copy after Beta evidence.
7. **Visual tokens:** the implementation at the accepted HEAD is frozen; future palette, typography, radii, spacing, elevation, iconography, focus/pressed-state, or contrast changes require explicit Product Owner direction.
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
