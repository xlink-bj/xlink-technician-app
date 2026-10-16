# DS-01.1 — XLink Commercial Visual Excellence

**Design status:** engineering candidate until Owner visual signoff.  
**Architecture:** Business Truth → Workflow Runtime → Action Workspace → Action Content → shared UI primitives.  
**Primary goal:** mature mobile-native design grammar—not another layer of page-specific CSS.

## Reference-to-implementation matrix

| Mature reference | Observed industry rule | XLink implementation | Validation |
| --- | --- | --- | --- |
| [Apple HIG: Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons) | ≥44×44pt target, deliberate press feedback, one prominent action, activity indicator during work | 44px minimum H5 physical tap, native press class, calm 150ms feedback; prominent blue Primary, thinner busy spinner | Real 320/375/390 H5 geometry and tap guard |
| [Ant Design Mobile: Button](https://mobile.ant.design/components/button) | Clear fill tiers, shape, size, icon, disabled and loading contracts | Primary / Secondary / Tertiary / Ghost; rounded/pill; compact/regular/large; complete state matrix | Golden candidate screenshots per viewport |
| [TDesign](https://tdesign.tencent.com/), [WeUI](https://weui.io/) | Chinese mobile controls and familiar touch-first interaction | Chinese-safe typography, concise CTA labels, no extra icon decoration, cross-platform explicit calibration | MP Review build + device gate |
| User's 3 supplied visual references | polished button matrix, grouped modal actions, submit→busy→success | pill/elevation options; single/dual/split/trailing Action Bar; passive Feedback component | Gallery, real App tests + Owner review |

Reference rules are adapted, not copied pixel-for-pixel; illustration colors, purple CTA hues or ornamental shadows are **not** defaults.

## Foundations / visual specification

- Brand blue remains `#2878f2`; accessible main-action blue `#1d6ecf`, selected for white text contrast ≥4.5:1.
- Main operation: filled blue, white label, restrained native shadow. One dominant Primary per decision group.
- Secondary: white surface with restrained neutral boundary, dark text. Ghost: blue outline, blue text. Tertiary: quiet blue text, no boundary. Legacy `text` remains valid.
- Pill is **opt-in**; regular rounded default preserves the current form and footer grammar. Elevation is contextual, never used for every button.
- Physical dimensions: compact ≥44px, regular 48px, large 52px. Preferred 14/15/16px Chinese typography; padding/spacing consistent across widths.
- Normal state, elevated, disabled, pressed and loading are separate visual states. Disabled never emits a command. Loading uses `aria-disabled` and a component-side guard rather than a native disabled attribute to avoid uni-app's disabled grey skin; it is never allowed to emit a business command. Busy indicator must not make the label shift appreciably; pressed feedback should not remain stuck.
- Default Action Bar is in the Workspace flow, not a floating overlay; dual is balanced, split separates safe vs. primary actions, trailing groups modal actions on the right. Safe-area padding survives all modes.
- Feedback state API is strictly presentational: `busy`, `success`, `error` exist **only** as current caller-supplied business states. Do not set success on a timer, CSS animation completion or optimistic fake network event.

## Components

- `AppButton`: `variant=primary|secondary|tertiary|ghost|text`, `size=compact|regular|large`, `shape=rounded|pill`, `elevated`, `loading`, `disabled`, `pressed`, `block`, `ariaLabel`, slots leading/trailing, `tap` event.
- `AppActionBar`: `layout=single|dual|split|trailing`, `preview`, `elevated`, `label`; no action authority.
- `AppActionFeedback`: `state=idle|busy|success|error`, `label`; no network, command or lifecycle transitions.

## Golden-master acceptance

1. Run true uni-app Gallery and validate interaction plus screenshot files `ds011-button-master-{320,375,390}.png`, `ds011-action-master-{320,375,390}.png`.
2. Compare to approved premium native references for contrast, spacing, typography, elevation restraint, loading geometry, press feedback and disabled states. Goldens become frozen only after explicit product visual approval, not automatically on CI success.
3. Run full cross-platform and main H5 business suites; inspect Q01's real bottom action hierarchy after the shared component change.
4. MP-Weixin simulator screenshots and real-device keyboard/safe-area verification remain separate release gates.
5. Never merge PR #132 to main until Owner accepts cross-page commercial visual quality; avoid confusing a pass from a screenshot-test with visual acceptance.

### Non-goals
No new UI package, pricing changes, workflow changes, authoritative order mutation, production read/write, or speculative server success. No broad rewrite of business UI files.
