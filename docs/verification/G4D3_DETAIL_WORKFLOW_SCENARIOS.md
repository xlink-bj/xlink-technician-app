# G4-UX Detail D3 Workflow Scenario Matrix

This matrix is a read-only harness for the accepted synthetic Detail fixtures.
Each scenario follows the same path:

```text
raw backend-shaped workflowNode → API Adapter → Workflow Runtime → Detail projection
```

The page never receives `nodeDef`, numeric `state`, or raw handler strings.
The runtime selects a Current Task only when there is exactly one visible,
active, supported, actionable candidate. A CTA may be displayed for visual
review, but D3 execution is always disabled.

| Synthetic WorkOrderId | Raw workflow shape exercised | Normalized category / lifecycle | Visibility | Current Task | Action intent / domain policy | Expected Detail blocks |
| --- | --- | --- | --- | --- | --- | --- |
| `mock-work-order-001` | one `forms` node, `state: 0` | `forms / active` | visible | `勘察` | `interact_with_form / allowed` | Current Task shown; CTA disabled; Progress deferred; Task Context absent |
| `mock-work-order-002` | one `placeOrder` node, `state: 0` | `placeOrder / active` | visible | `下单` | `place_order / allowed` | Current Task shown; CTA disabled; Progress deferred; Task Context absent |
| `mock-work-order-003` | one `subflows` node, `state: 0` | `subworkflow / active` | visible | `派工` | `open_subworkflow / allowed` | Current Task shown; CTA disabled; Progress deferred; Task Context absent |
| `mock-work-order-004` | one closed `forms` node plus one active `placeOrder` node | `forms / closed`, `placeOrder / active` | active candidate visible; closed node lifecycle-filtered | `下单` | `place_order / allowed` | Current Task shown; CTA disabled; Progress deferred; Task Context absent |
| `mock-work-order-005` | one active `forms` node with a non-matching bare handler id | `forms / active` | hidden by Runtime handler policy | absent | no candidate / not selected | Current Task collapsed; Progress deferred; Task Context absent |
| `mock-work-order-006` | unknown node type and unknown lifecycle state | `unsupported / unknown` | hidden by Runtime policy | absent | no candidate / policy unverified | Current Task collapsed; Progress deferred; Task Context absent |

## Boundaries

- `workflowNode.state` is normalized to `active` (`0`), `closed` (`10`),
  `inactive` (`-1`), or explicit `unknown`; no other state is guessed.
- Known R1 node types are normalized to Runtime categories, including the
  observed `subflows` → `subworkflow` compatibility spelling.
- A bare R1 `handlerIds` value is retained as an adapter-owned
  `unclassified` identity because the wire value does not identify whether it
  is a user, role, or organization-role reference. It is never rendered.
- Current Task selection never uses status labels, first-node rules, array
  order, screenshots, or WorkOrderId branches.
- Progress ordering/position is deferred. Follow-up reads, service-part
  cascade resolution, appointment display/mutation, and workflow mutation
  remain outside D3.
