# Quotation UI — Commercial Visual Fidelity Contract
**Status: IMPLEMENTATION BASELINE / OWNER NOT YET APPROVED** · 2026-10-15

## Authority and scope
The owner's approved high-fidelity images are the **visual reference** for Q00 order management (existing orders, empty, new-order method), Q01 quote composition, and Q03 product selection. R1 contracts remain the source of truth for pricing, order edits, permissions, and operations. Existing app IA and S01/S02 approved components remain stable.

This spec covers the rendered **App H5 content viewport**, not a decorative iPhone mockup, presentation headings or shadows outside the device. The mockup is a proportional *design* image, not a pixel-perfect exported runtime screen; calibrate typography and rhythm against the phone content, never compare whole composite pixels.

## Design system: one source of truth
| Item | Target range (CSS px at 390w) | QA |
|---|---|---|
| Canvas | #f3f7fc–#f6f9fc; no blue gradients in app content | verify H5 |
| Primary text | dark navy #182b48 | sample computed color |
| Secondary text | gray blue #7486a0 | secondary/labels consistent |
| Primary blue | #1677f4 | primary action, selected, icon accent |
| Cards | white, 14–16px radius, 1px low-contrast border or subtle shadow | inspect all states |
| Card padding | 14–16px (small phone 12–14px) | inspect bounding boxes |
| Page side gutter | 12–14px | geometry |
| Titles | 17–19px, 700–800 weight | computed styles |
| Order number, product title | 14–16px, 650–800 | geometry/computed |
| Body/value | 13–14px (don't shrink real data to 10px) | computed |
| Metadata/labels | 11.5–13px | computed |
| Controls | min 42–48px tap target; 8–11px radius | geometry |
| State pills | 11–12px, muted contextual fills; never show invented status | source binding |
| Bottom CTA | full width, blue, not occluding visible task entry | 390x844, 375x667 |
| Semantic icons | AppIcon/uni-icons only; don't use giant glyphs as product photos | inspect |
| Money | source-derived, clear currency/number; unknown ⇒ explicitly unverified | domain gates |

**Never** add a fourth override block for a selector. Replace the owning rule in the component stylesheet or extract semantic tokens. Q00 should have one canonical <style> with no additive 'correction v2' cascade. Q01/Q03 can be consolidated incrementally without changing behaviour.

## Q00 key visual anatomy
1. Native header once (no repeated faux app header), work-order card with icon/number, meaningful status and customer detail whenever it exists (do not fabricate phone/address).
2. Existing-order hint is secondary; heading and +新增订单 visually distinct.
3. Each order is a white card: number + status, structured label/value grid with gross and actual amount, subdued time, consistent outlined actions, enough space to scan.
4. Existing records, empty, and choosing-method are three separate screens/states; empty has a main explanatory card plus a lighter multi-order hint.
5. Fixed main CTA is visible, never blocks the scroll content. Historical list count cannot claim completeness if API returns capped 3.
6. DEV-only synthetic records must remain explicitly labelled, and NEVER act as server data, edit/signature eligibility or verified prices.

## Q01 key visual anatomy
Three separate task groups: 维修部位（部位 / 描述 / 工程量）, 选择产品（selected product and add/deduct affordances gated), 费用与优惠（discount/preferential with truthful restrictions). Sticky footer is amount-left + action-right; local Save Draft is independent of formal order write. Survey hint may collapse but cannot disappear. Every input and critical CTA must be reachable on 390x844 and 375x667.

## Q03 key visual anatomy
Search, top kind tabs, category rail (if code mappings unavailable keep unsupported categories visibly disabled), and readable 2-column thumbnail/text **inside each card**; verified package detail shows material/procedure and configuration before capture. Never synthesize a provider product image, SKU, price or category mapping.

## Visual QA method and hard gates
1. Fix a single exact Git HEAD, DEV fixtures, locale, viewport dimensions, safe-area and font availability.
2. Capture Q00 list/empty/method, Q01 blank/filled/fee and Q03 packages/detail/materials/selected-return on both 390x844 and 375x667; **wait for populated content, not shell loaded**.
3. Compare **content-only** crops with reference for alignment, spacing, relative prominence, typography, state/control treatment; record each visible mismatch as P0/P1/P2 with before/after screenshots. Where design image is not a literal 390x844 viewport, do **not** assert pixel-diff similarity percentages.
4. Automated checks: all mandatory controls visible/scroll reachable, no overlapping fixed footer, no horizontal overflow, minimum readable font sizes, no invisible labels, stable icon/canvas load, provider state truthful.
5. Regression gates: typecheck + unit + Main H5 including legacy G4-F + screenshot/geometry + MP/App build on **same final HEAD**. A green screenshot job proves capture/geometry, **not visual acceptance**.
6. Only Owner may approve commercial visual fidelity after reviewing side-by-side real App H5 images. Do not merge PR, deploy, claim parity or remove source restrictions before explicit approval.

## Non-goals and constraints
R1 exhaustive server pagination, official pricing, discount/add/deduct write semantics and full order edit permissions are **separate business gates**. This work must not open Production mutations. Existing S01/S02 accepted pages are frozen.
