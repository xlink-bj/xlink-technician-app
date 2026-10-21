# F4 — R1 Multi-Form Dynamic Field Draft Editor (Offline)

**Parent:** F3 [Draft #203](https://github.com/xlink-bj/xlink-technician-app/pull/203) exact `8e8872e9a165db2523c6b7bb888f64ea24aec84e`. R1 pinned source remains `xlink-app@6c0a97b`; backend unchanged.

## Implemented user-facing function
- On a *source-backed, complete, already-loaded* R1 `repeat` node, the WorkOrder Detail local draft area can create a new local entry. For a **synthetic DEV Mock** form definition (work-order ID `mock-work-order-*` and form-def ID `mock-*` with development and Mock-data mode), an explicit "编辑字段" action loads the real **normalized** FormDefinitionRead from the existing mock API reader. No read is initiated on page load or by entering a non-Mock WorkOrder.
- Dedicated R1LocalFormFieldEditor renders existing field semantics: text, multiline, phone/ID, number/digit, date/time/datetime, boolean switch, inline select/radio and checkbox. It reuses the existing dynamic-form `evaluateFieldState` and `normalizeFieldValue`; unfamiliar, non-inline option providers, unsupported media/cascade and read-only fields render as unsupported/read-only, never guessed.
- The F3 local draft store now persists only a validated primitive field-value map under the *existing session+role+WorkOrder+runtimeNode* scoped storage key. Values are matched by the canonical R1 `valueKey` and verified FormDefinition ID; local draft ID is never treated as a business FormData `_id`. Duplicate `valueKey`, invalid options or values, excess length and identity mismatch fail closed. Restoring under a different role/workorder remains impossible.
- All modified fields are explicitly labeled **local / 未同步**. Neither FormData upsert, Workflow Process nor node.updateExts is executed; backend command adapters still reject special-node writes.

## Important blockers / non-claims
- No new live tenant FormDefinition or FormData read permission. `loadDraftDefinition` is **DEV + synthetic Mock-data only**. The tool may refuse to display fields if the currently selected Mock WorkOrder has no matching synthetic FormDefinition fixture; it must never fabricate options or read from a real backend instead.
- Existing persisted FormData record field-values are NOT edited here. Editing them requires an explicitly authorized `getFormDetail(definitionId,dataId)` and an authoritative immutable identity readback; the F3 "编辑标题草稿" is still **title only**.
- Actual forms addFormCodeId choices, repeat child workflow IDs, dynamic option providers (code/cascade/media), real write pipeline, server-side rights/idempotency/compensation, and WeChat device validation remain under Stage 1B #201 and local evidence #199.
- This scope is deliberately **offline field editing**, not R1 live functional equivalence or launch ready.

**CI acceptance**: field normalization, unsupported field denial, definition identity, local persistence and role separation, absence of real read attempts; exact-head full and critical tests, H5/MP/App builds, six-stage Mock/unchanged Gallery & Business Goldens. Draft/unmerged; zero real business writes.
