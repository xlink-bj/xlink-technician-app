# App UI Design System

Status: Living UI system, v0.1  
Scope: Technician App / MP-WEIXIN / iOS / Android  
Initial source surfaces: accepted G4-UX production baseline and G4-D Appointment Action Workspace.

## Purpose

The App must not redesign common UI primitives and interaction patterns for every new business slice. This document defines the evolving visual and interaction grammar for the new Technician App so Work Order, Appointment, Inspection, Quotation, Contract, Construction, Acceptance, and later Actions remain recognizably one product.

This is intentionally a living system. New patterns are promoted only after they are proven by real product work. The goal is consistency without premature abstraction.

The hierarchy is:

```text
External mobile design baseline
  -> XLink semantic design tokens
  -> Shared UI primitives
  -> Reusable product patterns
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
- **Mature mobile defaults first** — common control geometry and interaction states should inherit proven mobile conventions before XLink invents a new value.

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

## 2. External reference hierarchy

XLink does not need to rediscover standard mobile control sizes, spacing, hit areas, field anatomy, action hierarchy, or feedback behavior by repeatedly tuning individual screens.

The default reference order is:

1. **WeChat Mini Program / WeUI** — primary baseline because MP-WEIXIN is a first-class runtime and the WeChat design system is built to match native WeChat interaction expectations.
2. **Vant Weapp / Vant mobile design language** — secondary baseline for mature mobile component anatomy, state coverage, and dense business UI patterns.
3. **Ant Design Mobile / Ant token methodology** — tertiary baseline for semantic token organization, component state completeness, and interaction hierarchy.
4. **XLink product-specific overrides** — used only where field-service workflows or accepted product UX require a deliberate deviation.

Reference sources:

- WeUI: <https://github.com/Tencent/weui>
- WeUI for Mini Program: <https://github.com/tencent/weui-wxss>
- Vant Weapp: <https://github.com/youzan/vant-weapp>
- Ant Design Mobile: <https://github.com/ant-design/ant-design-mobile>

These references are design baselines, not required runtime dependencies. The current App remains uni-app based and should not import a third-party UI library merely to match its dimensions or interaction grammar.

### What should be inherited before XLink overrides it

For common controls, engineering should first benchmark mature mobile references for:

- control height and minimum touch area;
- horizontal page gutter and control padding;
- vertical spacing between labels, controls, sections, and cards;
- typography hierarchy;
- button emphasis and action grouping;
- input / textarea / selector anatomy;
- cell / information-row anatomy;
- selected, pressed, focused, disabled, loading, error, and success states;
- dialog, toast, notice, loading, and empty-state behavior;
- safe-area and persistent bottom-action treatment.

Do not invent a new control size, spacing value, radius, or interaction state simply because a new screen is being implemented.

### Conflict rule

When references disagree:

1. prefer WeUI / Mini Program convention for interaction geometry and expectations that materially affect MP-WEIXIN;
2. use Vant Weapp as the next mobile-oriented reference;
3. use Ant Design Mobile mainly to improve semantic token/state completeness;
4. apply an XLink override only when the field-service product context or accepted Product Owner UX clearly requires it.

A deliberate override must be semantic and reusable. It must not be a one-page visual exception without product reason.

### Reference, do not clone

XLink should borrow mature design reasoning, not blindly copy a library theme.

The target is:

```text
mature mobile geometry + interaction conventions
+ XLink semantic tokens
+ XLink field-service product patterns
```

not:

```text
third-party component library visual identity
```

## 3. Design tokens

Tokens are semantic. Feature pages should consume token intent rather than copy literal values repeatedly.

Token values should be established in two steps:

1. benchmark the relevant mature mobile reference for geometry/state behavior;
2. apply the smallest XLink-specific visual adjustment required by the accepted product direction.

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

### Geometry tokens

Geometry should not be tuned per feature. Establish shared semantic tokens for at least:

- `page-gutter`;
- `control-height`;
- `control-height-compact` only when a real compact use exists;
- `touch-target-min`;
- `field-padding-x` / `field-padding-y`;
- `card-padding`;
- `section-gap`;
- `field-gap`;
- `action-bar-padding`;
- `action-bar-gap`;
- control and surface radius.

The initial values should be benchmarked against WeUI first, then checked against Vant Weapp and current accepted XLink Appointment UX. Do not choose geometry from one screenshot in isolation.

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

This scale is a semantic working scale, not permission to ignore platform conventions. Final control geometry should be benchmarked against the external hierarchy above.

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

## 4. Shared UI primitives

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

Button geometry and hit area should start from WeUI mobile convention, be compared with Vant Weapp, and then use XLink brand tokens for color/radius if needed.

Button state must not be encoded only by opacity if interaction meaning would become ambiguous.

### Input / Textarea

Common properties:

- clear label outside the field;
- required state comes from Runtime/schema, not copied text;
- consistent border, radius, placeholder tone, disabled/read-only treatment;
- field-level validation belongs near the affected field;
- feature code must not invent length/required rules unsupported by the normalized schema.

Input height, internal padding, typography, and disabled/focus/error treatment should follow the external reference hierarchy before XLink-specific adjustment.

### Selector

Use when a value opens a focused selection surface such as Appointment date/time.

A selector must visibly communicate:

- current value or placeholder;
- tappability;
- disabled/read-only state;
- selected/result state.

Selector geometry should normally align with Input geometry unless the interaction requires a deliberate larger target.

Do not style semantic selectors as generic text inputs.

### Choice Group

Use for small mutually exclusive option sets.

- large touch area;
- obvious selected state;
- option labels come from normalized business data where available;
- do not infer semantics from visual order.

Choice geometry and selected-state contrast should be benchmarked against WeUI / Vant mobile patterns rather than invented per form.

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

Rows that navigate must look and behave consistently across modules. Cell height, padding, divider behavior, and trailing affordance should start from mature mobile cell/list patterns rather than page-specific invention.

### Icon

Use the existing shared `AppIcon`/icon vocabulary where appropriate. Do not introduce page-local symbolic glyphs when a shared semantic icon exists. Icon color follows component state, not decoration.

## 5. Reusable product patterns

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

## 6. Action Workspace UI contract

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

## 7. Interaction states

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

Use mature mobile component systems to validate that state coverage is complete. XLink should customize the semantic appearance, not omit standard interaction states.

Do not leave browser/uni-app native defaults to define the product language accidentally when a shared state is required.

## 8. Cross-platform constraints

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

## 9. Component promotion rule

Do not over-componentize early.

Use this working rule:

- **first occurrence** — a local implementation is acceptable if the pattern is not yet proven;
- **second occurrence** — explicitly review whether it is a shared primitive/pattern;
- **third occurrence** — default to shared component/token unless there is a clear reason not to.

However, components already identified as architectural invariants — such as Action Workspace Shell, persistent Action Bar, and draft status presentation — should be shared immediately.

External maturity can accelerate promotion: if WeUI/Vant/Ant Mobile all express essentially the same stable mobile primitive and XLink has an immediate real use, it is reasonable to create the shared primitive at first use rather than wait for three internal copies.

## 10. Design-system governance

For each new business slice:

```text
1. check the external reference hierarchy for the common mobile primitive
2. reuse existing XLink token / primitive / pattern
3. extend an existing primitive when the interaction is genuinely the same
4. add a new local pattern only when existing grammar is insufficient
5. after Product Owner acceptance, decide whether the new pattern graduates into this system
6. update this document and shared implementation together
```

A new page is not permission to introduce a new visual system.

Before introducing a new literal geometry/color in a feature page, engineering should be able to answer one of:

- which existing XLink semantic token this maps to;
- which mature mobile reference justifies a new token;
- which field-service product requirement requires a deliberate override.

Product Owner owns final visual/experience acceptance. Engineering review owns architecture, semantic correctness, reuse discipline, reference discipline, and cross-platform safety.

## 11. v0.1 implementation target

The first code-side consolidation should focus on high-value reuse, not a full component library.

Start with the controls already proven by Appointment:

1. **Button** — Primary / Secondary / Text, including loading and disabled states.
2. **Field frame** — label / required marker / supporting or error text.
3. **Textarea / Input visual grammar** — common field geometry and state treatment.
4. **Selector** — Appointment datetime selector is the first consumer.
5. **Choice control** — Appointment `need` options are the first consumer.
6. **Card / Surface** — compact context, confirmation grouping, information surfaces.
7. **Notice / Status** — draft/autosave, warning, retryable/terminal error, success.
8. **Information Row / Cell** — confirmation rows and later Work Order information rows.
9. **Persistent Action Bar** — one or two actions, Shell-owned safe area.
10. **AppIcon semantic vocabulary** — replace local text glyphs where appropriate.

For each primitive:

```text
A. inspect WeUI / WeUI Mini Program baseline
B. compare Vant Weapp mobile pattern
C. use Ant Mobile/token methodology to check state completeness
D. map the result to XLink semantic tokens
E. migrate one real Appointment consumer
F. verify MP-WEIXIN + App build
G. only then reuse it elsewhere
```

Do not build a universal calendar, quotation editor, contract system, list framework, theme editor, CSS utility framework, or form-builder redesign merely to satisfy Design System v0.1.

## 12. Definition of consistency

A future screen is consistent when a technician can correctly predict:

- what is actionable;
- where the primary CTA will be;
- how selected/disabled/error states look;
- how forms are labeled;
- how cards and information rows are structured;
- where draft/save feedback appears;
- how confirmation and success are presented;

without learning a new visual language for every workflow node.

Consistency does not mean every screen looks identical. It means common mobile behavior comes from a mature baseline, common XLink semantics come from shared tokens/primitives, and only genuine business differences remain feature-specific.
