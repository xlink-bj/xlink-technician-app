# EQ-05B — Independent Mock Workflow Transitions and Deterministic Scenario Plans

**Stacked on EQ-05A [#174](https://github.com/xlink-bj/xlink-technician-app/pull/174), exact `4b00a3ccff29b60c10b11d750168c31b84e80999`. Draft review only, no production access or command execution.**

## Design and changes

The Mock Router had one default resettable state instance but retained all Appointment / Survey / Accept mutations embedded in the route dispatcher. Now `createMockCommandTransitionEngine({ current })` accepts an injected `MockCommandState` provider and owns existing WorkOrder acceptance, save Appointment/DynamicForm payload, complete Appointment/DynamicForm node and detail lookups. Function bodies / mock wire shape were extracted with no business algorithm changes; router retains existing singleton adapter via lazy injected `mockCommandState`. Independent engines cannot mutate each other's List/Detail/FormData state.

`mock/scenario-policy.ts` centralizes the **existing** retryable/terminal fixture classification for explicit Accept vs Appointment intents. Wrong action, unknown WorkOrder or nonmatching scenario do not invent a positive entitlement. `mockScenarioResponsePlanFor` resolves a registered synthetic scenario with 0..10,000ms bounded deterministic *test-only latency* (default 300ms) and `synthetic-only` business/no-network provenance. This describes the existing optional `tryMockRead(...,{ latencyMs })`; it does not add a new real network route, override security or change the default app UX delay.

Behavior tests use two independent real state-store instances and a fake clock: accepting one synthetic WorkOrder never changes another, reset restores original baseline, Appointment FormData and workflow completion are scoped, dynamic form strips transport metadata, invalid payloads cannot mutate state, retryable/terminal policies are stable, and delayed reads are deterministic. Existing full Mock / role / order / signing gates remain mandatory.

## Non-goals / architectural boundaries

This is not a completely generic mock backend / an unrestricted programmable API dispatcher. Synthetic scenario state remains memory-only, owned by the explicit DEV Mock path; Production mock remains disabled; Mock OFF must not forward synthetic IDs. Backend R1 tenant ACL, source SKU / prices, official type=1 Order, Contract signed-state, device acceptance, and main merge remain **HOLD**.

## Required acceptance

Same exact Draft HEAD: focused suites plus `pnpm verify:full`, three platform builds, 3 Gallery + 9 business Golden (unchanged), and 27 existing H5 mock quotation/signing workflows PASS. Any failure stops the stage rather than blessing Goldens, skipping old guards or relaxing `check:g4f-phase1a/phase1b`.
