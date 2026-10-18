# EQ-05B — Bounded per-request Mock fault/latency contract

Parent: [EQ-05A #174](https://github.com/xlink-bj/xlink-technician-app/pull/174) exact `4b00a3ccff29b60c10b11d750168c31b84e80999`. This is a **Draft/no-merge**, synthetic-only enhancement.

## Behavior
- `tryMockRead` accepts optional `fault: retryable|terminal` only in the already existing per-request options. **No application caller supplies it by default**, so existing production and DEV behavior is unchanged.
- A response must match the existing route/fixture ownership first. Unknown paths return `null` even with a fault specified; no synthetic result may create fake authorization or mask a real unknown route.
- DEV/Test Mock=OFF and Prod Mock=OFF always return `null` before simulation. The fault replaces the matched synthetic response only, never writes a WorkOrder or returns actual PII.
- Delay is explicit, deterministic and bounded to integer 0–5000 milliseconds; no indefinite network waits. Historical default 300ms preserved.
- Existing `createIsolatedMockCommandStateStore` remains the only state owner. Fault injection is request-scoped, never persisted or shared across scenarios.

## Exit
- Dedicated behavior tests verify failure kind, no fabricated route, no Production/Mock-OFF execution, no scenario mutation and invalid delay rejection.
- `pnpm verify:full`, H5/MP/App builds, exact original Gallery 3 and business 9 Goldens, and existing main-H5 Mock business/contract flows PASS.
- No source SKU, formal Order type=1 write, Contract signing, actual server ACL, Golden updates or merge permitted.

## Further work
The registry and factory now support repeatable local negative tests, but the legacy mutation dispatcher is not fully dependency-injected. This remains an architectural task if actual new workflows cause test bleed; no claim of complete scenario engine rewrite is made.
