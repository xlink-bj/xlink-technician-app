# M1 · G4-F 报价四屏高保真方案 — Owner Visual Gate V2

Status: **PROPOSED FOR VISUAL REVIEW — NOT APPROVED**  
Source baseline: Draft integrated #38 \`cfe5e0a1\`; technical visual evidence #67 \`6f76a776\`.  
Scope: **design-only isolated static prototype + automated screenshots**. No production UI replacement, backend read, authentication, quotation write or merge.

## 1. Product truth and review basis

Owner #41 (2026-10-08): existing new Quotation UX is **NOT ACCEPTED** because a narrow field-first form/list does not reflect a technician's intent: choose **repair location → product/service → package specifications/material → return to quote group and review**. Preserve Design System v0.2, WorkOrder-scoped catalog, Package / Procedure / Material / Measure, grouped local draft and typed source restrictions. This visual revision is **not** a request to copy R1's crowded yellow navigation.

The first baseline proof is [Draft #67](https://github.com/xlink-bj/xlink-technician-app/pull/67), with real main uni-app Mock screenshots at 375×667 and 390×844. It proves the four interaction checkpoints exist, but the Owner's prior R1 image is **not presently available in this source/CI review**, so the assessment below is a source-grounded UX proposal, **not** a pixel-by-pixel R1 parity claim.

## 2. Four proposed surfaces — one continuous mental model

| Stage | One-glance operator question | Main hierarchy | Primary action | Preserved state |
| --- | --- | --- | --- | --- |
| 01 Workbench | 我在哪个工单、哪个维修部位？ | Current WorkOrder → selected repair group → selection count | 选择服务商品 | Another repair group stays untouched |
| 02 Visual Catalog | 我在为哪个部位选什么？ | Current group → four category chips → product identity / source status | 查看并配置 | Current group, previous selections |
| 03 Package Configuration | 哪些组件、材料层、工程量要确认？ | Package → procedure → quantity → material layer alternatives | 加入当前部位 | Quantity, choice, typed layer must survive Back |
| 04 Return/Review | 添加了什么、添加到哪个部位、如何调整？ | Success feedback → original group → selected package summary → edit action | 修改配置 / 继续选商品 | Other group, selection continuity |

**One action path:** Workbench → Catalog → Configure → Confirm → Workbench. No new nested tab tree and no synthetic business confirmation.

### What changed from existing #67 baseline

- **KEEP** correct selected WorkOrder/repair group context, four R1 catalog types, package body/layer visibility, deliberate add-to-current-group confirmation, independently persisted group identity.
- **IMPROVE** first-fold salience of group/selection outcome rather than raw fields; category/product cards with a clear preview→configure step; a compact, separate material-layer region; post-add confirmation and inline change control; predictable sticky footer.
- **DROP from proposed design** parallel deep taxonomy columns, copied yellow R1 controls, always-expanded generic metadata, official order submit CTA on synthetic pages, invented subtotal, unknown source SKU/contract claims.

**Visual language:** actual v0.2 tokens (\`#2878f2\`, \`#1d2b40\`, pale blue, white, \`#f3f6fa\`), restrained cards, ≥44px controls, sensible vertical rhythm; product graphic is a very small line-work construction symbol, not fabricated catalogue photography.

## 3. Prototype and testing

Single standalone file:
\`__review/concepts/m1-quotation-four-surface.html\`

- No Vue business code, app route, API transport, user session, PII, remote asset, login or persisted data.
- Explicit **设计方案 · 合成数据** badge, non-authoritative quantity, materials and SKU, disabled incomplete package, no currency/quote total.
- Four semantic stage containers with per-screen test IDs, back/forward and edit-configuration interaction. Quantity and alternative material stay selected across the return/change loop; group #2 remains unchanged.
- The demo's “材料层 A/B 必选” is **only a visual assumption**. This does NOT prove R1 mandatory/optional semantics, price/stock, real layer choices or type-1 Order eligibility. When implementing actual #41 Phase B, the package detail contract must determine the required flags and available options. Unknowns fail closed.

\`tests/h5-main-mock/m1-quotation-ux-prototype.spec.ts\` runs on 375×667 and 390×844, attaches **eight full-resolution Chromium screenshots** (four checkpoints × two viewports), verifies back/selection persistence, no external request/page/console errors, and the absence of contract/sign/order command paths. A file-based prototype is not the uni-app production runtime; #67 remains the actual main-App baseline and Phase B must recheck every implementation screen using real main H5 tests.

## 4. Quote → Signing seam (source/Owner decision)

The Owner's actual M1 business rule is **Quotation Action → official type=1 Order directly**; do not invent a type=0 intermediate quote, customer quote acceptance or an automatic type conversion.

Backend/R1 evidence and [#39](https://github.com/xlink-bj/xlink-technician-app/issues/39) show:

- One ServiceAppointment may own **multiple official Orders**, each Order may include **multiple repair-part groups**. Signing is associated with an **explicit Order ID**, not with one repair group.
- A locally configured synthetic QuotationDraft never becomes that official Order. Only an independently authorized server-created type=1 Order with exact current WorkOrder/role/workflow context could be handed to signing.
- Presence of official Order still does **not** imply a Contract exists, current user can sign, or document preview is authorized.
- Existing Contract query/read ID authorization is unproven; PDF generation, online/offline signing, SMS, reminder and status sync may mutate or communicate and cannot be wired from this prototype.
- The current signing Mock Draft #65 is code-valid source/read-only **but not Owner-approved HiFi**. Its Order-specific 1:N model is a valid reference, not a reason to bypass #41.
- Future integration will reuse \`QuotationOrderReadPort.listTypeOneOrdersForWorkOrder\` as a read-only Order list **after its specific Production scope gate**, then an authorized workflow signing Action/contract reader. A limited page of 1/3 Orders must never be called an exhaustive WorkOrder list.

## 5. Explicit Owner visual decisions needed

1. Approve or adjust first fold: WorkOrder strip, current group card and single major catalog CTA (rather than editing all fields at once).
2. Approve Catalog density: one-column touch cards, the four category tabs and explicit no-verified-price state; imagery should only appear when real catalog has it.
3. Approve separate Package Configure stage including source-verified layer/required semantics and editable quantity; the current numeric/typed mock material layers are not commercial configuration authority.
4. Approve Return stage feedback, one-tap modify path and footer. **Do not approve a business submission by approving these visuals.**

Upon explicit Owner approval, **Phase B** can implement the four surfaces through existing uni-app \`QuotationActionWorkspace\`, store and catalog adapter, with main H5 375/390 screenshots + real MP/Android/iOS runtime gate. #75 server SKU authority, #64 device validation, Order.type=1 business write and Contract signing require separate approvals.

Gate: \`V2_DESIGN_PROTOTYPE_AND_BROWSER_EVIDENCE_PENDING_CI / SOURCE_FIDELITY_PARTIAL / OWNER_VISUAL_NOT_ACCEPTED_YET / NO_MAIN_MERGE\`.
