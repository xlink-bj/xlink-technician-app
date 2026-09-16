# App UI Design System

Status: Living UI system, v0.1  
Scope: Technician App / MP-WEIXIN / iOS / Android  
Initial source surfaces: accepted G4-UX production baseline and G4-D Appointment Action Workspace.

## Purpose

The App must not redesign common UI primitives and interaction patterns for every new business slice. This document defines the evolving visual and interaction grammar for the new Technician App so Work Order, Appointment, Inspection, Quotation, Contract, Construction, Acceptance, and later Actions remain recognizably one product.

This is intentionally a living system. New patterns are promoted only after they are proven by real product work. The goal is consistency without premature abstraction.

The hierarchy is:

```text
Design Tokens
  -> Shared UI Primitives
  -> Reusable Product Patterns
  -> Feature / Action Content
```

Business semantics still come from verified product/runtime contracts. A visual pattern must never invent workflow state, availability, validation, or backend capability.

## 1. Product UI principles

The visual language is optimized for field-service work:

- **Task first** — the primary business action is obvious without reading the whole page.
- **Low cognitive load** — one dominant hierarchy, short labels, predictable controls.
- **Touch first** — large hit areas and thumb-reachable primary actions.
- **Calm and professional** — restrained color, light surfaces, subtle borders, little decorative noise.
- **Progressive complexity** — simple work remains simple; long forms and complex editors use the same shell rather than a new interaction model.
- **State is explicit** — saving, validation, failure, success, read-only, and disabled states are visibly distinct.
- **Cross-platform by construction** — patterns must work in uni-app on MP-WEIXIN, iOS, and Android without Web-only behavior.

Current visual direction:

```text
cool-light page background
+ white surfaces/cards
+ subtle border
+ restrained shadow
+ blue primary action
+ restrained green success/saved state
+ dark high-contrast primary text
+ muted secondary text
+ generous but efficient spacing
```

## 2. Design tokens

Tokens are semantic. Feature pages should consume token intent rather than copy literal values repeatedly.

The v0.1 palette is based on the currently accepted Appointment/G4-UX direction and is subject to controlled evolution:

| Token intent | Initial value / direction | Use |
| --- | --- | --- |
| `color-primary` | `#2878F2` | primary CTA, selected control, active state |
| `color-primary-soft` | `#EDF4FF` / equivalent | selected background, subtle emphasis |
| `color-page` | `#F3F6FA` | application / workspace background |
| `color-surface` | `#FFFFFF` | cards, fields, action surfaces |
| `color-border` | `#E4EAF2` / equivalent | card and field boundaries |
| `color-text-primary` | `#1D2B40` / equivalent | titles, important values |
| `color-text-secondary` | `#7B8AA1` / equivalent | labels, descriptions, metadata |
| `color-success` | `#18AE65` / equivalent | successful completion / saved confirmation |
| `color-danger` | `#F06445` / equivalent | validation / destructive or failure emphasis |

Do not create feature-specific blue/gray variants when an existing semantic token is sufficient.

### Spacing

Use a small semantic spacing scale rather than ad-hoc values. The implementation may use `rpx`, but spacing relationships must remain consistent across MP and App.

Recommended v0.1 scale:

```text
xs   8
sm   12
md   16
lg   20/24
xl   32
```

Use the scale for card padding, field gaps, section separation, and page gutters. Exceptional geometry must have an explicit product reason.

### Radius and elevation

Use few radius levels:

- control / compact element;
- card / field surface;
- large state/success surface.

Prefer border + very subtle elevation. Heavy shadows are not part of the current visual language.

### Typography

The system needs a small hierarchy, not per-page font inventions:

- page/native navigation title;
- product/section title;
- field/control label;
- body/value;
- supporting/meta text;
- status/error text.

Primary hierarchy should come from size, weight, and spacing before color.

## 3. Shared UI primitives

The following primitives are candidates for shared implementation. Do not create a universal component unless reuse is real; when a primitive is shared, feature pages should not restyle it independently.

### Card / Surface

Use for compact business context and grouped information.

Standard behavior:

- white surface;
- subtle border;
- moderate radius;
- restrained/no shadow;
- consistent inner padding;
- no nested decorative cards without hierarchy value.

### Button

Required variants:

- Primary — dominant business action.
- Secondary — reversible/supporting action.
- Text/tertiary — low-emphasis navigation or auxiliary action.

Required states:

```text
default
pressed
loading
disabled
```

Button state must not be encoded only by opacity if interaction meaning would become ambiguous.

### Input / Textarea

Common properties:

- clear label outside the field;
- required state comes from Runtime/schema, not copied text;
- consistent border, radius, placeholder tone, disabled/read-only treatment;
- field-level validation belongs near the affected field;
- feature code must not invent length/required rules unsupported by the normalized schema.

### Selector

Use when a value opens a focused selection surface such as Appointment date/time.

A selector must visibly communicate:

- current value or placeholder;
- tappability;
- disabled/read-only state;
- selected/result state.

Do not style semantic selectors as generic text inputs.

### Choice Group

Use for small mutually exclusive option sets.

- large touch area;
- obvious selected state;
- option labels come from normalized business data where available;
- do not infer semantics from visual order.

### Notice / Status

Status presentation should be semantic and quiet unless user action is required.

Examples:

- saved/autosave;
- offline/local-only state;
- retryable warning;
- terminal failure;
- success.

Do not render the same semantic state in multiple regions.

### List Row / Information Row

Use predictable anatomy:

```text
leading icon/status (optional)
primary label/value
secondary metadata (optional)
trailing affordance/status (optional)
```

Rows that navigate must look and behave consistently across modules.

### Icon

Use the existing shared `AppIcon`/icon vocabulary where appropriate. Do not introduce page-local symbolic glyphs when a shared semantic icon exists. Icon color follows component state, not decoration.

## 4. Reusable product patterns

Patterns are larger than primitives and encode stable product interaction structure.

Current patterns include:

- Work Order Card;
- Current Action Card;
- Action Workspace;
- Action form section;
- Confirmation Summary;
- Success State;
- Draft / autosave status;
- Follow-up / timeline list;
- Persistent Action Bar.

New features should reuse these patterns before inventing alternatives.

## 5. Action Workspace UI contract

Action Workspace is a product and architecture pattern, not an Appointment-only layout.

The structural model is:

```text
Native Page Header
Action Workspace Shell
  ├── compact business context
  ├── scrollable Action Content
  ├── Shell-owned status / feedback
  └── persistent Action Bar
```

The following are UI architecture invariants:

1. **Draft feedback is Shell-owned and rendered exactly once.**
2. **The primary Action Bar is persistent and independent of Action Content height.**
3. **Action Content scrolls; the Action Bar remains outside the scroll container.**
4. **Safe-area/footer geometry is owned by the Shell, never by Action Content.**
5. **Action Content must remain usable at arbitrary supported content length.**
6. **Action Content does not own storage/autosave presentation.**
7. **Success must be a visible state, not only a toast.**

Appointment is the first concrete consumer. Inspection, quotation, contract, signature, and other Actions should inherit this structure when they become supported.

## 6. Interaction states

Every reusable interactive component or pattern must deliberately define the states that apply to it. At minimum review:

```text
default
pressed / active
selected
focused
disabled
readOnly
loading
validation error
retryable error
success
```

Do not leave browser/uni-app native defaults to define the product language accidentally when a shared state is required.

## 7. Cross-platform constraints

UI system implementation must remain compatible with:

- MP-WEIXIN;
- iOS App;
- Android App.

Prefer:

- uni-app page navigation;
- `view`, `text`, `button`, `input`, `textarea`, `picker`, `scroll-view`;
- shared CSS variables/classes or equivalent platform-safe token mechanism;
- safe-area-aware Shell/footer behavior.

Avoid platform assumptions in feature content. If a platform difference is unavoidable, isolate it in shared platform/layout infrastructure rather than duplicating feature UI.

## 8. Component promotion rule

Do not over-componentize early.

Use this working rule:

- **first occurrence** — a local implementation is acceptable if the pattern is not yet proven;
- **second occurrence** — explicitly review whether it is a shared primitive/pattern;
- **third occurrence** — default to shared component/token unless there is a clear reason not to.

However, components already identified as architectural invariants — such as Action Workspace Shell, persistent Action Bar, and draft status presentation — should be shared immediately.

## 9. Design-system governance

For each new business slice:

```text
1. reuse existing token / primitive / pattern
2. extend an existing primitive when the interaction is genuinely the same
3. add a new local pattern only when existing grammar is insufficient
4. after Product Owner acceptance, decide whether the new pattern graduates into this system
5. update this document and shared implementation together
```

A new page is not permission to introduce a new visual system.

Product Owner owns final visual/experience acceptance. Engineering review owns architecture, semantic correctness, reuse discipline, and cross-platform safety.

## 10. v0.1 implementation target

The first code-side consolidation should focus on high-value reuse, not a full component library:

- central semantic UI tokens;
- shared Card/Surface styling;
- Primary/Secondary/Text button grammar;
- shared field/selector/choice visual grammar;
- status/notice presentation;
- persistent Action Bar and Action Workspace Shell geometry;
- reuse existing `AppIcon` rather than page-local glyph styling;
- migration of current Appointment surfaces to consume the shared system without changing business semantics.

Do not build a universal calendar, quotation editor, contract system, or form builder merely to satisfy Design System v0.1.

## 11. Definition of consistency

A future screen is consistent when a technician can correctly predict:

- what is actionable;
- where the primary CTA will be;
- how selected/disabled/error states look;
- how forms are labeled;
- how cards and information rows are structured;
- where draft/save feedback appears;
- how confirmation and success are presented;

without learning a new visual language for every workflow node.
