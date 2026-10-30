# C3-C2 — Media Selection Transport Dispatch Boundary

> Status: DRAFT / Owner Review required · 2026-10-30 · Based on main@a0f7d287669e1be600ae2119c4f1295757d3bf45

## Decision

Extract **one selected media** transport dispatch from Action Workspace into a feature-local coordinator. This is a bounded orchestration extraction, **not** a new uploader or change to media queue persistence.

- Store retains picker/camera calls, role/actor guard, field validation, special survey tool refusal, max-count, in-flight UI state, uploaded-ref reconciliation, FormData updates, draft persistence, manual retries and user copy.
- New coordinator only captures eligible location evidence, routes through existing durable queue `enqueue → process` (or the existing direct-upload fallback), and reports the confirmed remote ref / failure / stale result. It cannot mutate the Store.
- Check current command scope before dispatch and after each awaited platform/transport call. Never apply a delayed result into a different actor or work order. Queue checkpoints are kept as the existing behavior requires.
- No speculative retry, no changes to the `ambiguous_postprocess` rule, no creation of synthetic evidence or media URLs, no Production/Beta business writes.

## Acceptance

Direct regression tests prove policy-specific evidence, queue-vs-direct precedence, scope-preserving enqueue, no processing on stale enqueue, no stale response application, existing failed-checkpoint reporting, and null-data fail-closed behavior.

Run exact-head full Validate and H5/MP-WEIXIN/APP frontend builds, B2X2 and DS02A commercial UI parity, Main H5 UX. This is a short-lived independent PR requiring an explicit merge approval after Review. No deployment or native binary signing.
