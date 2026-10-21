# A06-B — R1 Source NodeType Identity & Fail-Closed Command Routing

**Base:** A06-A [Draft #196](https://github.com/xlink-bj/xlink-technician-app/pull/196) exact `d07225d0b604fdded722b1db6e3fa14c3296173e`. **Purpose:** remove the unsafe assumption that a normalized Workflow UI category can use the single-FormData `workflow/process` writer.

## R1 source evidence / conclusion

Pinned R1 app `xlink-bj/xlink-app@6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d`, `business/subpackages/serviceAppointment/serviceAppointment.vue`:
- **`forms`:** `saveNodeExts(res.data)` updates `updateExts`/form list; Process on this node intentionally clears `nodeFormDefId` and `nodeFormDataId` (L7435–7457; L7566–7615).
- **`repeat`:** repeats individual saves and Process joins the saved `formDataList` IDs (L7190–7240; L7642–7666).
- **`subflow`, `subflows`:** child runtime node and definition IDs vary from parent; cannot reuse one parent runtime ID (L7190–7240; L7530–7615).
- Existing New App `workflowCompleteCommand` always encodes **one** definition/Data ID; this is only adequate for already-validated ordinary single-record paths. A06-B **does not claim the extra R1 multi-form/child contracts have been implemented**.

## Actual implementation

1. `WorkflowNodeRead.sourceNodeType` now preserves exact `nodeDef.nodeType` (fallback `nodeTypeOld`), alongside the normalized `category`. This comes from the authenticated read adapter; it is NOT invented from title, form purpose, `category`, or Mock data.
2. `projectDetailWorkflow` retains that provenance. Real `forms` and `repeat` *form-backed actions* are marked `disabled_read_only` (but remain visible). Read/navigation for subworkflow remains outside this FormData writing fence. Source-free UI-only synthetic mocks retain their existing projection; they are **not evidence of a real single-record node**.
3. `ActionDescriptor` receives the exact source node discriminator, and passes it to all FormData/Workflow/Appointment commands. Independently, the API command adapter refuses `forms`, `repeat`, `subflow`, `subflows`, `subworkflow` **before** mutation checkpoints or request dispatch, including direct Port invocations with that provenance.
4. Existing A06-A unknown-result receipt, `need=0` block, non-Production real-write flag, Production read-only fence and backend remain **unchanged**.

## Limitations and acceptance gates

- **Safety improvement, not full parity:** the final source-backed request encoder for `forms`/`repeat` and child Workflow has not been built; no complete `updateExts` list read/write or multi-record Process is implemented. Real users on these node types see a non-executable Action until requirements/real samples can validate safe behavior.
- Exact first pilot nodeType still UNKNOWN. Missing raw source nodeType in **synthetic** fixture is not proof of a single-record real node. For real adapters, missing/unsupported source nodeType is already categorized `unsupported`, not a free pass.
- Direct, trusted in-process synthetic caller that **omits** sourceNodeType remains compatible with existing Mock regression tests. A06-B does not turn this hint into a backend authorization or cryptographic proof; real API read-to-Action path is what carries verified evidence.
- Fail-closed paths are verified offline only; authenticated real R1 backend FormData writes, Workflow Process, Production/Beta read/write, actual miniprogram device behavior, and first-pilot node sampling require their own approval.
- A06-A Draft stays unmerged, A06-B Draft stays unmerged. No main integration/release changes.

**CI acceptance:** exact HEAD, parent + file allowlist, dedicated node-type tests, inherited A06-A P0, critical/full suites, H5/MP-Weixin/native App builds, six-stage H5 Mock and unchanged Gallery + Business Goldens. Record real failing test evidence without relaxing safe behavior.
