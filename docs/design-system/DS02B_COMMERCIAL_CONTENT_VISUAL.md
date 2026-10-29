# DS-02.B — Commercial Content UI / Visual Convergence

**Scope:** true source-composed H5 Work Orders and Detail, 320/375/390.  
**Status:** Engineering candidate; Owner visual signoff pending. No production or cross-device visual release.

## Why this is a commercial pattern, not a cosmetic patch

Existing list/detail separately defined container borders, shadows, information density, category chips and section labels. DS-02.B extracts a single premium utilitarian presentation grammar directly from both screens. Style choices follow familiar mature field-service and enterprise mobile interfaces: content first, strong task/customer identity, quiet supporting metadata, restrained semantic accents, large touch targets and readable Chinese.

## Adopted shared components (presentation only)

| Primitive | Contract | Actual consumers |
| --- | --- | --- |
| `AppRecordCard` | surface, semantic tone, vertical/horizontal layout, optional press feedback; no navigation or data fetching | Work Orders list inside existing `navigator`; Detail summary and information panel |
| `AppMetaTag` | neutral/info/success/warning descriptive tag; never projects Workflow authorization | service part (list/detail) and proximity indicator (list) |
| `AppSectionHeading` | title, supporting subtitle, optional trailing slot, one typography hierarchy | loaded Work Orders listing / Detail overview |
| Existing `AppButton` | single commercial primary CTA, compact physical target >=44px; independent business state | real Work Orders Accept; existing Workspace actions |

## Deliberate H5 before/after visual differences

- List: a coherent title/summary row above cards; same 18px shared card radius and restrained shadow as Detail; clear 17px task, secondary work-order number and address, quiet service tags, restrained status accent.
- Detail: common card elevation and shapes; explicit overview heading; consistent service-part tag and readable task/customer information; tabs follow shared content typography.
- Card operations: phone and Accept now have >=44px physical H5 target. Accept is the production shared AppButton, with existing permission gate, in-flight guard and **stopped navigator tap bubbling**. Contact retains existing stop propagation and no unauthorized access.
- Colorful semantic task category icon remains a distinguishable signal; the primary Accept CTA is one consistent accessible blue rather than a different action color per category.
- No mock order creation, new Workflow transitions, data interpretations or price calculations.

## H5 image evidence and update authorization

Old candidate set: `DS-02.A` 15 images under `tests/ds02a-{gallery,main}/snapshots`. DS-02.B deliberately changes **only six** business candidates (`list` and `detail` at 320/375/390). The other nine (Gallery 6, Q01 3) **must remain byte-identical**. This change is explicitly documented and comes with before/after visual review.

A *temporary, branch-locked* first-party GitHub Action may stage the six candidates in PR #143, then is removed. All normal regression remains `contents:read`, strict `toHaveScreenshot` with the existing 0.4% difference budget and NO implicit rebaseline. Stage files are still **CANDIDATE**, not approved Golden. Approval is an explicit Owner gate.

## Acceptance

- H5 real list/detail reuse shared components and pass 320/375/390 geometry, no-overflow and click target checks.
- 15 tracked screenshot regressions pass; only documented six have changed.
- Full `verify`, Main H5 legacy G4-F, business functionality and S2 picture-sheet regressions pass on exact final PR head before integration to #132 Draft.
- Production read-only permissions, work order accept/call authorization, session boundaries and Workflow persist untouched.
- DS-02.C will subsequently standardize empty/error/loading states. The current empty record panel is not misrepresented as a server-verified action.

## Product aesthetic bar

An automated pixel comparison validates *stability*, not attractiveness. The Owner reviews actual before/after H5 list and Detail captures before labeling this `COMMERCIAL_UI_ACCEPTED`. No MP/Android/iOS visual gate is required for this H5-only phase.
