# G4-UX Detail D3 Workflow Scenario Matrix

This matrix is a read-only harness for the accepted synthetic Detail fixtures.
Each scenario follows the same path:

```text
raw backend-shaped workflowNode → API Adapter → Workflow Runtime → Detail projection
```

The page never receives `nodeDef`, numeric `state`, or raw handler strings.
The Runtime selects the Detail Current Task only when there is exactly one
visible, active, supported, actionable candidate. A CTA may be displayed for
visual review, but D3 execution is always disabled. Status labels remain an
independent order read field; they do not select or name the Current Task.

| Synthetic WorkOrderId | Raw workflow shape exercised | Normalized category / lifecycle | Visibility | Current Task | Action intent / domain policy / execution | Expected Detail blocks |
| --- | --- | --- | --- | --- | --- | --- |
| `mock-work-order-001` | one `forms` node, `state: 0` | `forms / active` | visible; 1 visible / 1 actionable | `勘察` | `interact_with_form / allowed / disabled_read_only` | Current Task shown; presentation CTA `处理表单` disabled; Progress deferred; Task Context absent |
| `mock-work-order-002` | one `placeOrder` node, `state: 0` | `placeOrder / active` | visible; 1 visible / 1 actionable | `下单` | `place_order / allowed / disabled_read_only` | Current Task shown; presentation CTA `去下单` disabled; Progress deferred; Task Context absent |
| `mock-work-order-003` | one `subflows` node, `state: 0` | `subworkflow / active` | visible; 1 visible / 1 actionable | `派工` | `open_subworkflow / allowed / disabled_read_only` | Current Task shown; presentation CTA `查看子流程` disabled; Progress deferred; Task Context absent |
| `mock-work-order-004` | one closed `forms` node plus one active `placeOrder` node | `forms / closed`, `placeOrder / active` | active candidate visible; closed node lifecycle-filtered | `下单` | `place_order / allowed / disabled_read_only` | Current Task shown; presentation CTA `去下单` disabled; Progress deferred; Task Context absent |
| `mock-work-order-005` | one active `forms` node with a non-matching bare handler id | `forms / active` | hidden by Runtime handler policy; 0 visible / 0 actionable | absent | no candidate / `not_handler` / no execution | Current Task collapsed; Progress deferred; Task Context absent |
| `mock-work-order-006` | unknown node type and unknown lifecycle state | `unsupported / unknown` | hidden by Runtime policy; 0 visible / 0 actionable | absent | no candidate / `policy_unverified` / no execution | Current Task collapsed; Progress deferred; Task Context absent |

## Boundaries

- `workflowNode.state` is normalized to `active` (`0`), `closed` (`10`),
  `inactive` (`-1`), or explicit `unknown`; no other state is guessed.
- Known R1 node types are normalized to Runtime categories, including the
  observed `subflows` → `subworkflow` compatibility spelling.
- A bare R1 `handlerIds` value is retained as an adapter-owned
  `unclassified` identity because the wire value does not identify whether it
  is a user, role, or organization-role reference. It is never rendered.
- Runtime action-candidate selection never uses status labels, first-node
  rules, array order, screenshots, or WorkOrderId branches. The page consumes
  the Runtime projection and adds only the small presentation mapping from
  semantic action intent to a label/tone.
- Progress ordering/position is deferred. Follow-up reads, appointment
  display/mutation, and workflow mutation remain outside D3.

## Harness contract

The six IDs above are direct Detail entry points in Mock DATA mode. They are
not page-level branches: each raw response is normalized by the Technician API
Adapter and then passed to the same Runtime projection used for a real Detail
read. The matrix records the expected semantic result so Product Owner review
can inspect each state without changing List density or production behavior.
