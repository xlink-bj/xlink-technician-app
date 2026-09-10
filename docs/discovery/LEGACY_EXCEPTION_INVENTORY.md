# Legacy Hardcode / Exception Inventory

## Status

**NOT STARTED — foundation placeholder only.**

No hardcode or exception findings are asserted by this foundation document.

## Purpose

Identify business rules, role/permission differences, fallback behavior,
endpoint-specific exceptions, platform branches, and other behavior in the
current Technician legacy app that must be preserved, intentionally changed, or
explicitly rejected.

## Planned record schema

| Field | Required content |
| --- | --- |
| ID | Stable inventory identifier |
| Source repository / path | Exact source and file or runtime location |
| Reference SHA | Commit or observation baseline |
| Area | Login, work order, appointment, inspection, quotation, construction, acceptance, permissions, or platform |
| Trigger | Input, role, state, endpoint result, or platform condition |
| Observed behavior | What the current system actually does |
| Intended rule | Evidence-supported interpretation, or `UNKNOWN` |
| Exception type | Business rule, compatibility workaround, defect, fallback, or unknown |
| Evidence | Call site, runtime observation, API response, backend contract, or document |
| Preservation decision | Preserve, redesign, retire, or pending |
| Verification required | YES / NO |
| Conflict / notes | Differences between evidence sources and next action |

## Evidence boundary

Use current Technician runtime/API behavior and backend evidence before relying
on comments or old documentation. Do not classify a hardcode as a defect until
its business purpose and current behavior are understood.

Detailed legacy inspection remains pending. No source is copied into the new
repository as part of this foundation step.
