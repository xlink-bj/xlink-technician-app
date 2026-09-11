# G4-UX Production Baseline

Status: Target baseline defined in Phase A; implementation and visual sign-off are future work.

This is a small product-specific UX system for the Technician App. It is deliberately narrower than the Legacy surface and does not authorize new business fields, tabs, workflow actions, or platform integrations.

## Product principles

- Put technician intent before implementation terminology.
- One clear primary intent per screen; secondary actions remain visually subordinate.
- Information is read-oriented. Dynamic workflow/current-task actions use a separate action surface.
- Use normalized semantic status and capability values; never display backend codes or raw menu conventions.
- Every async surface has explicit loading, empty, retryable, terminal, session-invalid, and in-flight behavior where applicable.
- MP-WEIXIN, Android, and iOS are first-class targets. H5 is not a V1 target.

## Visual tokens

These values are a starting product baseline for visual review, not a substitute for final design sign-off.

### Typography

| Token | Target |
| --- | --- |
| Page title | 44–52rpx, semibold, line-height 1.25 |
| Section title | 32–36rpx, semibold, line-height 1.35 |
| Body / row title | 28–30rpx, regular/medium, line-height 1.45 |
| Supporting text | 24–26rpx, regular, line-height 1.45 |
| Helper/error text | 24–26rpx, line-height 1.4; error is paired with a recovery path |
| Number/order emphasis | Use body/section scale and weight before adding color |

Chinese production copy should be short, concrete, and technician-oriented. Engineering words such as “role-visible”, “terminal”, and “session snapshot” must not appear in normal user-facing copy.

### Color, surfaces, and shape

| Token | Target |
| --- | --- |
| App background | Soft neutral, currently represented by `#f5f7fb` |
| Primary surface | White card/sheet with clear contrast from background |
| Primary text | Near-black neutral, target `#101828` |
| Secondary text | Neutral gray, target `#475467` / `#667085` |
| Border | Low-contrast neutral, target `#d0d5dd` |
| Primary action | One high-contrast brand color; do not use status colors as the primary action |
| Error | Semantic red with text and recovery, not color alone |
| Card radius | 16–20rpx |
| Control radius | 12–16rpx |
| Elevation | Subtle separation only; avoid decorative floating layers |

### Spacing and density

Use an 8rpx base rhythm: 8, 16, 24, 32, and 48rpx are the normal steps. Page insets are 32rpx on a compact phone unless safe-area or device width requires adjustment. Keep one meaningful group per card; avoid dense legacy-style multi-purpose panels.

### Controls and actions

- Interactive controls target at least 88rpx in the cross-target layout, with visible pressed, disabled, and in-flight states.
- Inputs have persistent labels, useful placeholders, keyboard/input mode appropriate to the semantic value, and adjacent validation feedback.
- Primary action is full-width or otherwise dominant when it is the screen’s main intent.
- Secondary action is quiet/outlined; destructive or terminal actions require explicit semantics and are out of current G4 scope.
- Quick Actions are a stable lightweight region. `Call customer` is available only for a normalized direct phone and never logs or persists the raw value.
- Disable submit/refresh/action controls while their own operation is in flight. Never rely on visual opacity alone.

### Navigation and device behavior

- Respect MP, Android, and iOS safe areas and platform back behavior.
- Detail navigation carries only semantic WorkOrderId; no phone, cookie, token, or raw backend identifier appears in a URL.
- Back from Detail returns to the role-visible List. Back from List returns to Home.
- Preserve scroll position only when the accepted feature contract needs it; do not introduce broad caching.
- Addresses and long titles wrap naturally to multiple lines. Do not truncate away identity or location without an accessible full view.

## Shared state language

| State | UX baseline |
| --- | --- |
| Bootstrap / unknown | Minimal non-interactive initialization shell; no Login submit path is exposed. |
| Loading | Preserve page context and show a lightweight skeleton or structured loading surface; avoid abrupt blank screens. |
| Empty | Say what is empty, what scope was checked, and provide refresh/retry only when meaningful. |
| Retryable failure | Plain-language problem plus a visible retry action; keep technical details out of the primary copy. |
| Terminal failure | Explain that the surface could not be loaded and provide a safe route/back action. |
| Session invalid | Clear current/persisted app auth through the accepted boundary, then return to Login. Do not claim refresh or remote logout. |
| In flight | Disable duplicate action and provide progress feedback without changing the user’s intent. |

## Screen composition baseline

### LOGIN

Top to bottom: product/technician context → sign-in title and short explanation → phone input → verification-code input → one primary Sign in action → inline feedback/recovery. Bootstrap uses a separate non-interactive initialization state.

Must not appear: password/social/QR/registration flows, send-code flow without an accepted endpoint, raw endpoint/method/tenant text, credentials in copy or storage, or a form while bootstrap is unresolved.

### HOME

Top to bottom: concise authenticated greeting/context → one clear Work Orders workbench entry → quiet Sign out. Home may be intentionally sparse until later business evidence supports more.

Must not appear: guessed permission cards, analytics, marketing, counts, stale Work Order data, or a broad Legacy dashboard port.

### WORK ORDER LIST

Top to bottom: page title and proven role-visible scope → refresh/recovery control → structured list/skeleton/empty/error → semantic Work Order rows → load-more only when safely derived. The default is one list; tabs, counts, filters, search, and special ordering require evidence.

Must not appear: “My Work Orders” or “Assigned” claims without evidence, raw state codes, raw role/menu labels, backend query keys, workflow-node identity, or a detail implementation inside the row.

### WORK ORDER DETAIL

Top to bottom: back navigation → semantic Work Order summary/identity → read-oriented information region → stable Quick Actions such as direct contact → future read-only tabs if separately accepted. Current Task/Workflow Action is a separate region and is not part of an information tab.

Must not appear: dynamic workflow execution in information rows/tabs, raw DTO fields (`exts`, `nodeDef`, raw data/envelopes), unmasked customer phone, phone in the route, contact editing, relay calls, or appointment/inspection actions before their own evidence gate.

## Review and sign-off

Phase A is complete when this target is recorded and the Beta read plan is ready. Before a production UX implementation is accepted, review screenshots or device captures for all four screens in MP, Android, and iOS target modes, including narrow width, long text/address, empty/error/session-invalid, and in-flight states. Final product copy, brand assets, contrast, and touch-target sign-off remain human/product review items.
