# Action Workspace UX Standard v0.2

Status: shared mobile UX contract for the Appointment and Survey Action
Workspaces. The R1 mobile experience is the parity baseline; the new Runtime
and safety boundaries remain authoritative.

## 1. Principles

- **R1 Mobile UX Baseline**: proven mobile information hierarchy and control
  behavior are the starting point for shared UI.
- **Business truth is not legacy implementation**: R1 is evidence for
  presentation and wire compatibility, not authority for unverified business
  semantics.
- **Shared UI owns presentation**: buttons, fields, status strips, spacing,
  focus, disabled and loading states are shared concerns.
- **Runtime owns state and business truth**: eligibility, validation,
  persistence, workflow execution and reconciliation are not inferred by Vue
  presentation code.
- **Business Experiences compose primitives**: verified domain experiences may
  compose shared controls without turning their business rules into generic
  controls.

## 2. Action Workspace Anatomy

The workspace has five stable regions:

1. page shell;
2. work-order context card;
3. draft and business status area;
4. scrollable Action Content;
5. persistent bottom Action Bar, including the platform safe area.

Workspace actions always belong to the persistent bottom Action Bar. The
scrollable content must retain bottom clearance and must not contain the
workspace-level Save, Complete, Continue, Confirm or Submit action.

The Action Bar grammar is:

```text
[ Primary                                  ]
[ Secondary              ][ Primary        ]
```

It is safe-area aware, uses the existing shared touch-target token, and keeps
the secondary action visually weaker than the primary action. Field-local
actions remain inside their field or controlled experience, for example
“选择图片”, “继续处理” and “完成选择”.

## 3. Action Taxonomy

| Action class | Ownership | Examples |
| --- | --- | --- |
| Workspace Action | Action Workspace Shell / Runtime projection | 保存表单、完成勘查、继续、确认、提交 |
| Field Action | Field presentation and field capability | 选择图片、继续处理上传 |
| Controlled Experience Action | Domain experience composed inside Action Content | 选择渗漏原因、完成选择 |

The bottom bar is the only location for Workspace Actions. Appointment keeps
one primary footer action. A dynamic Survey form uses a secondary Save and a
primary Complete action in the same persistent footer.

## 4. Action States

Shared action states are `enabled`, `disabled`, `loading`, `saved`,
`submitting` and `failed`.

For a dynamic form:

| Runtime state | Secondary | Primary |
| --- | --- | --- |
| editable / unsaved | 保存表单 | 完成勘查, disabled |
| saving | 保存中…, loading | 完成勘查, disabled |
| saved and eligible | 已保存 | 完成勘查 |
| saved but not eligible | 已保存 | 完成勘查, disabled |
| submitting | disabled/loading as applicable | 提交中…, loading |
| failed | 保存表单 | 完成勘查, Runtime decides eligibility |

These are deliberately separate concepts:

- local draft autosave is passive feedback: **已自动保存**;
- business form Save is an explicit Workspace Action: **保存表单**;
- workflow Complete is a separate explicit primary action: **完成勘查**.

The UI does not create a second state machine. It renders the existing
`dynamicFormSaveState` and `canSubmit` Runtime projections.

## 5. Field Grammar

`AppField` provides the common label, required marker, optional marker,
supporting copy, error copy and read-only presentation. Visibility and
capability come from the effective Runtime field state. Hidden fields are not
rendered; unsupported visible fields remain conservatively blocking.

Single-line values use `AppInput` for text, number and digit fields. Multiline
values use the shared `AppTextarea` contract for `textarea`, `memo`, `note`,
`remarks`, `notes` and `description` semantic fields. A multiline field has a
meaningful initial minimum height and uses native uni-app `auto-height` where
the platform supports it; no JavaScript DOM measuring is used.

## 6. Core Controls

| Control | Purpose | Use / state contract | Do not use for |
| --- | --- | --- | --- |
| `AppInput` | Single-line entry | text, number and digit; disabled, read-only, focus and error states | multiline notes |
| `AppTextarea` | Multiline entry | textarea-like content; native disabled/read-only behavior, focus/error states, auto-height | single-line identifiers |
| `AppSelector` | Navigate to a selection surface | selected, disabled, read-only and error states | free text |
| `AppChoiceGroup` | Small single-choice set | verified option values and selected/disabled states | array-valued fields |
| `AppMultiChoiceGroup` | Small multi-choice set | normalized multi-value option contract | scalar-only fields |
| `AppCascadeSelector` | Hierarchical selection | preserves the verified cascade path and selected state | flat business-specific path rules |

Appointment notes and Survey memo fields both use `AppTextarea`. The shared
control owns presentation; the Appointment and Survey runtimes own value
normalization and persistence.

## 7. Proven Complex Patterns

| Pattern | Classification | Boundary |
| --- | --- | --- |
| Media Uploader | `SHARED_PATTERN` | Shared media state presentation; business codecs stay domain-owned |
| Gap / Separator | `SHARED_PATTERN` | Presentation-only ordering/separation row |
| Bottom Sheet | `SHARED_PRIMITIVE` | Reusable shell and interaction surface |
| Tree Multi Select | `SHARED_PATTERN` | Reusable tree selection presentation; provider semantics stay outside |
| Hierarchical Cascade | `SHARED_PATTERN` | Reusable hierarchical presentation; value path remains Runtime-owned |
| Leakage Cause | `BUSINESS_EXPERIENCE` | Survey provider, grouping and persistence semantics remain Survey-owned |
| Repair Part | `BUSINESS_EXPERIENCE` | Survey cascade contract remains outside generic controls |

Leakage Cause and repair-part rules are not extracted into generic business
components in v0.2. Their visual shells are candidates for future promotion
only after a second verified consumer exists.

## 8. State / Feedback Grammar

- **loading**: the requested operation is in flight; controls prevent duplicate
  dispatch where required;
- **saved local**: local draft durability only, never a business Save result;
- **validation**: actionable missing or invalid content, localized to the
  business operation;
- **retryable**: the operation did not establish success and may be retried
  explicitly;
- **terminal**: the operation cannot proceed under the current contract;
- **ambiguous**: outcome requires reconciliation; do not expose a blind retry;
- **success**: business mutation succeeded, with any refresh/cleanup warning
  represented separately.

## 9. R1 Parity Rule

```text
R1 proven UX
  -> parity baseline
  -> deliberate improvement
  -> documented reason
```

The v0.2 textarea height and native auto-height are deliberate, documented
improvements to the shallow-field risk identified in the R1 parity review.
The persistent footer action grammar preserves the accepted R1 mobile action
placement while making Save and Complete boundaries explicit.

## 10. Platform Contract

- **MP-WEIXIN**: native `textarea` props, safe-area footer spacing and shared
  touch targets must remain within uni-app supported behavior.
- **App**: the same component and state contract is used in App-Plus; device
  keyboard and safe-area behavior remain device-validation concerns.
- **H5 review proxy**: the existing development-only harness renders the real
  Action Workspace and Runtime with a minimal platform shim. It is QA
  infrastructure, not a product channel and not authenticated/device/live
  evidence.

No v0.2 rule authorizes real writes, changes form semantics, changes media
queue behavior, or starts G4-F.
