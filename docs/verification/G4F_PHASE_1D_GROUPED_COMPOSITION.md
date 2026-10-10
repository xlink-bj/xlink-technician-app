# G4-F Phase 1D — Grouped Quotation Composition Foundation

## Scope

Phase 1D replaces the temporary flat local `lines[]` composition with local
repair-part groups shaped around the sanitized R1 quotation evidence. It does
not implement quotation persistence or business execution.

The evidence basis is the sanitized, one-record `bjProducts.orderList[]`
observation in [G4-F R1 Runtime Follow-up](./G4F_R1_RUNTIME_FOLLOWUP.md).
That observation establishes the group/context field names for the sampled
record, not a complete serialization contract for writes. The Phase 1D model
is therefore an editable local composition model, not a wire-compatible
`Order.bjProducts` encoder.

The local draft contains:

- `groups[]`, each with a `repairParts` cascade path, `partDescription`, and
  textual `maintainAreaNum`;
- typed selections grouped as `projPackages`, `procedures`, `materials`, and
  `measures`;
- local selection identity, catalog identity, display label, optional unit,
  and quantity.

The model deliberately does not infer group context from a Survey form, array
position, selected package, or Phase 1C Real Catalog result. Repair-part
options are read through the existing code-options read port. Catalog selection
in this phase remains deterministic synthetic Mock data.

## Legacy draft safety

Phase 1B schema-v1 flat drafts are recognized only when their stored action
identity matches the current work order and workflow node. They are surfaced
as `legacy_requires_action` and are not decoded into groups, edited, migrated,
overwritten, or removed during listing/restoration. The user must explicitly
choose to abandon the old draft before a fresh grouped draft can be created.
Malformed non-v1 records remain separately classified as invalid and are also
preserved until explicit user disposition.

New grouped drafts use schema version 2. The codec validates group identities,
selection category placement, identity uniqueness, quantity, and repair-part
path structure. Writes remain local and scoped to the existing Action Draft
identity.

## Execution and catalog boundaries

- Phase 1C Real Catalog ports remain read-only and are not connected to this
  composition store.
- The grouped composition UI uses the existing synthetic review catalog only.
- No price calculation, monetary total, quote save/submit/send/confirm,
  conversion, workflow completion, or business mutation is introduced.
- Group engineering quantity is retained as entered text; it is not used for
  price or total calculations.
- Package-detail configuration by material layer remains outside this local
  foundation; this phase only preserves group-level categories and selections.

## Verification boundary

The G4-F Playwright review is an H5 visual proxy with synthetic scenarios. It
does not establish authenticated Beta, device, production, quotation-write, or
workflow-completion behavior. Unit and browser coverage verifies grouped local
composition, group-scoped catalog selection, restoration, and fail-safe legacy
draft handling.
