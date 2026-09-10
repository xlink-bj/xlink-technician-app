# Workflow & Dynamic Form Capability Matrix

## Status

**NOT STARTED — foundation placeholder only.**

No workflow or dynamic-form capability is declared supported, unsupported, or
compatible by this foundation document.

## Planned matrix schema

| Capability | Source evidence | Reference SHA / observation | Current behavior | Input/schema | Output/state transition | Roles/permissions | MP-WEIXIN | APP-PLUS Android | APP-PLUS iOS | Backend dependency | Authority | Verification | Gap/conflict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |

Rows should cover at least:

- workflow state transitions and allowed actions;
- dynamic form schema discovery and rendering;
- field types, validation, visibility, requiredness, and conditional rules;
- draft, resume, submit, and failure behavior;
- attachment/photo/signature handling;
- estimate/quotation and acceptance forms;
- role-specific differences;
- unsupported or partially supported low-code capabilities.

Unsupported capabilities must fail explicitly rather than silently producing an
incorrect workflow or form result.

## Evidence rule

Separate raw backend schema and behavior from Legacy client assumptions and from
any normalized/domain-facing model. Detailed capability discovery remains
pending targeted reuse and verification of the existing R1–R3 assets.
