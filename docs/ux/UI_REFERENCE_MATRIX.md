# UI Reference Matrix

Status: v0.1 implementation evidence  
Scope: shared App UI primitives used by the G4-D Appointment Action Workspace

This matrix records the external references checked before the first real
primitive implementation. It is a design reference only; XLink does not add a
third-party UI runtime dependency.

## Reference hierarchy

| Reference | Role | Source evidence |
| --- | --- | --- |
| WeUI Mini Program | Primary MP interaction and safe-area baseline | [pinned commit `739eca5`](https://github.com/Tencent/weui-wxss/tree/739eca530481e9dc9860cc298cb126b9890799cf), [button](https://github.com/Tencent/weui-wxss/blob/739eca530481e9dc9860cc298cb126b9890799cf/src/style/widget/weui-button/weui-button.less), [cell](https://github.com/Tencent/weui-wxss/blob/739eca530481e9dc9860cc298cb126b9890799cf/src/style/widget/weui-cell/weui-cell_global.less), [select](https://github.com/Tencent/weui-wxss/blob/739eca530481e9dc9860cc298cb126b9890799cf/src/style/widget/weui-form/weui-select.less), [radio](https://github.com/Tencent/weui-wxss/blob/739eca530481e9dc9860cc298cb126b9890799cf/src/style/widget/weui-form/weui-radio.less), [bottom fixed](https://github.com/Tencent/weui-wxss/blob/739eca530481e9dc9860cc298cb126b9890799cf/src/style/widget/weui-footer/weui-btn_bottom-fixed.less) |
| Vant Weapp | Secondary mobile control anatomy and state coverage | [pinned commit `7a7d437`](https://github.com/youzan/vant-weapp/tree/7a7d43757ed19d3ad5e6bca69059e0b9ea565d0b), [button](https://github.com/youzan/vant-weapp/blob/7a7d43757ed19d3ad5e6bca69059e0b9ea565d0b/packages/button/index.less), [field](https://github.com/youzan/vant-weapp/tree/7a7d43757ed19d3ad5e6bca69059e0b9ea565d0b/packages/field), [cell](https://github.com/youzan/vant-weapp/blob/7a7d43757ed19d3ad5e6bca69059e0b9ea565d0b/packages/cell/index.less), [goods action](https://github.com/youzan/vant-weapp/tree/7a7d43757ed19d3ad5e6bca69059e0b9ea565d0b/packages/goods-action) |
| Ant Design Mobile | Tertiary token and interaction-state methodology | [pinned commit `eee5477`](https://github.com/ant-design/ant-design-mobile/tree/eee5477f8d6221ced8298e3547eb03e0a037a615), [Button](https://github.com/ant-design/ant-design-mobile/blob/eee5477f8d6221ced8298e3547eb03e0a037a615/src/components/button/index.zh.md), [Input](https://github.com/ant-design/ant-design-mobile/blob/eee5477f8d6221ced8298e3547eb03e0a037a615/src/components/input/index.zh.md), [Selector](https://github.com/ant-design/ant-design-mobile/blob/eee5477f8d6221ced8298e3547eb03e0a037a615/src/components/selector/index.zh.md), [SafeArea](https://github.com/ant-design/ant-design-mobile/blob/eee5477f8d6221ced8298e3547eb03e0a037a615/src/components/safe-area/index.zh.md) |

## Verified implementation references

Values below are the source values observed in the pinned commits above. The
commit is part of the evidence: do not replace it with a moving branch when
rechecking the decision. `rpx` uses the standard 750rpx design width; the
conversion is an implementation convention, not a claim that every platform
uses the same physical pixel density.

| Concern | WeUI Mini Program | Vant Weapp | Ant Design Mobile | XLink v0.1 decision |
| --- | --- | --- | --- | --- |
| Default button height | 48px (`weui-btn`) | 44px (`button-default-height`) | token-based, with compact/large variants | `--app-control-height: 88rpx` (44px), a shared touch-safe baseline |
| Minimum action target | Bottom action bar reserves safe-area padding | Goods Action reserves safe-area padding | SafeArea is an explicit layout primitive | `--app-touch-target: 88rpx`; Shell owns bottom safe-area handling |
| Button horizontal padding | 24px default | tokenized button padding | 12px base padding token | 32rpx for the larger field-service CTA; one shared component token |
| Button states | default, plain, warn, disabled | active overlay, disabled, loading | active, disabled, loading | AppButton owns primary/secondary/text plus pressed/loading/disabled states |
| Loading states | structural skeleton / progress feedback | loading state with preserved context | loading state is distinct from empty/error | AppLoadingState owns page/workspace/inline modes; shared 240ms reveal threshold; no visible route-loading copy |
| Cell / information row | 56px cell with 16px horizontal spacing | 10px vertical / 16px horizontal Cell padding | List-like content uses tokenized spacing | AppInformationRow uses a shared 88rpx minimum for readable two-column data |
| Selector / choice | Select and radio expose selected/disabled states | Radio and field/cell composition | Selector uses 8px/16px padding and selected/disabled states | AppSelector/AppChoiceGroup share selected/disabled grammar |
| Field anatomy | Cell-based label/control grouping | Field composes Cell and exposes error/disabled/placeholder states | Input exposes error/disabled/loading feedback | AppField owns label/required/supporting/error chrome; native input remains content |
| Surface/card | Panel/cell surfaces | Card and cell surfaces | Card uses restrained radius/padding | AppSurface and compact surface classes retain accepted XLink shell |
| Persistent bottom action | `weui-btn_bottom-fixed` separates scrollable content and safe area | Goods Action is fixed-height and safe-area aware | SafeArea separates content from inset | ActionWorkspaceShell keeps footer outside scroll-view; Action Content does not reserve footer height |
| Typography | 17px cell/button body, 14px tips | tokenized mobile body/label hierarchy | semantic typography tokens | XLink semantic font tokens stay product-owned; no page literals added |

## XLink semantic mapping

| Primitive | Shared contract | Current consumers |
| --- | --- | --- |
| `AppButton` | primary/secondary/text, block, loading, disabled | Workspace, time, confirmation |
| `AppField` | label, required/optional, supporting/error | Appointment workspace |
| `AppSelector` | placeholder/value, selected, disabled, chevron | Appointment workspace/time |
| `AppChoiceGroup` | normalized options, selected/disabled | Appointment workspace |
| `AppSurface` | surface and compact surface treatment | Appointment workspace/time/confirmation |
| `AppStatus` | neutral/success/warning/danger/quiet status copy | Action Workspace Shell |
| `AppInformationRow` | label/value/trailing slots, shared divider and rhythm | Confirmation |
| `AppLoadingState` | page/bootstrap, workspace skeleton, inline progress | Home/bootstrap, List/Detail preparation, Appointment Workspace |
| Persistent Action Bar | Shell-owned draft status, CTA, safe area | ActionWorkspaceShell |

## Explicit XLink overrides and non-claims

- Accepted XLink visual direction owns the palette, radius, page background,
  card elevation, and typography values; these are semantic tokens rather than
  copied library theme values.
- The 44px / 88rpx control baseline is a deliberate cross-platform product
  decision: field technicians need a dense but thumb-safe form, the accepted
  XLink visual direction already uses this geometry, and the same baseline is
  now shared by input, selector, choice, and action controls. It matches
  Vant's pinned default height and remains close to WeUI's pinned 48px control;
  changing it to 48px would require Product Owner approval.
- Shared geometry decisions are represented by semantic tokens including
  `--app-control-padding-x`, `--app-card-padding`, `--app-field-gap`,
  `--app-section-gap`, `--app-control-gap`, `--app-action-bar-padding-x`,
  `--app-action-bar-gap`, `--app-input-padding-x`,
  `--app-input-padding-y`, and `--app-textarea-min-height`.
- `--app-control-gap` is reserved for ordinary control groups and stacked
  options. `--app-action-bar-gap` remains an Action Bar grouping token and is
  not reused by choice or time-slot controls.
- The external references are reproducible at the pinned commits above. Their
  observed values and the adopted XLink values remain separate columns; the
  XLink values are deliberate overrides where they differ.
- The matrix does not establish business labels, workflow states, action
  identity, field validation rules, or backend capabilities.
- No value is inferred from a screenshot alone. Where the XLink shell differs
  from a reference, the difference is documented as an explicit product-owned
  token decision.
