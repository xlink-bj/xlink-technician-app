# G4-F P0 Catalog Safety — Implementation Evidence

**Implementation status:** `READY_FOR_LEAD_ABA_REVIEW`
**Base:** `858fd50fd11a484dab1f86244038682dbde15479`
**Scope:** synthetic tests and source-level implementation only. No Production/Beta login, API request, Mongo access, or business mutation.

## D2 — Production `sourceType` gate

All four Production catalog list methods reject absent, explicitly `undefined`, `null`, empty, whitespace-only, and non-string `sourceType` before calling `ApiReadTransport.execute()`:

| Kind | Route |
| --- | --- |
| Package | `biz/projPackage/queryWithRank` |
| Procedure | `biz/procedure/queryWithRank` |
| Material | `basic/material/queryWithRank` |
| Measure | `biz/measure/queryWithRank` |

The failure uses the existing terminal `authorization_denied` operation shape and tells the user that the Work Order lacks verified source context and the request was not sent. A nonblank source string is forwarded unchanged; the established service type and list filters remain unchanged. Outside Production, absent `sourceType` remains omittable as before; no Mock/Beta behavior was broadened.

The R1/backend wire-level meaning of absent/null `sourceType` remains `UNKNOWN`. This implementation does not claim wire parity; it enforces the Lead-approved fail-closed rule until that question is separately resolved.

Synthetic production-mode adapter fixture: 28 invalid cases (7 source states × 4 routes) rejected with zero transport calls, plus one exact concrete-source request per route. The fixture's `ApiReadTransport` is an in-memory fake; the Production host setting only selects the adapter safety branch and does not initiate a network request.

## D3 — Production Package list/detail identity and Work Order context

Production package detail authorization is now bound to the complete in-memory identity tuple:

```text
sessionRef + userId + roleId + roleVersion
```

An absent, blank, or unknown tuple invalidates cached package IDs and denies by-ID detail. Successful list-derived Package IDs are also bound to the active Work Order/catalog context (`workOrderId`, `serviceType`, `sourceType`); `workOrderId` is local cache scope only and is not added to any catalog request. Thus even two Work Orders with identical provider filters do not share by-ID Package authorization. Any of the four catalog list routes observing another Work Order context clears that Package authorization set. Detail is available only for IDs returned by a successful Package list in the current identity/context.

Each observed identity or Work Order context transition increments a monotonic in-memory authorization-context generation. List and detail reads capture that generation before dispatch and reject their results if it changes, even if the visible identity/context returns to the original value before the request completes (A→B→A). This prevents stale Package IDs from being re-registered and stale detail from surfacing after an observed ABA transition. Tests cover each identity component changing independently, logout/incomplete identity, context changes observed via a non-Package route, identity and Work Order A→B→A on both pending list and pending detail reads, accumulation across successful pages in one generation, and valid same-generation list→detail.

This is client-side least-privilege scoping for the existing by-ID read path, not a claim of server authorization. No `function/changeRole` call is used; tests simulate identity snapshots only.

The ABA correction adds a monotonic generation that advances on every observed identity or catalog-context transition. Deferred fake-transport regressions prove that stale package-list responses cannot re-register Package IDs and stale detail responses cannot be returned after both identity A→B→A and Work Order context A→B→A. Same-generation package list→detail remains valid. These tests use synthetic identities, contexts, and IDs only.

## D4 — Order ExtField foundation

The mapping proposal and synthetic fixtures are documented in [G4F_ORDER_EXTFIELD_MAPPING_CONTRACT.md](./G4F_ORDER_EXTFIELD_MAPPING_CONTRACT.md). No live schema reader, mapper, UI wiring, or Order serializer was added. Active tenant schema and provider behavior remain unknown, and unsupported required fields must remain blocking when a later authorized integration is undertaken.

## Verification boundary

- Full local `pnpm run verify`: passed (boundary/governance checks, typecheck, 574 unit tests).
- H5 review build and isolated quotation mount/network-safety smoke: passed.
- ABA correction verification: `VITE_XLINK_ENVIRONMENT=test pnpm run verify` passed (574/574); the focused true uni-app H5 quotation mount/network-safety smoke passed (1/1, Playwright 153.0.8010.12).
- Broader `test:uni-h5-g4f-review`: 15 passed / 5 failed. The failures are stale assertions against existing UX text/labels (`维修部位组 1`, `屋面檐口修复`, `图片未提供`) that differ from the current displayed target (`屋面`, `已选 N 项`, no image placeholder). They are outside D2/D3 and no UI/test-selector changes were made to mask or repair them in this safety slice.
- MP-Weixin and App builds: passed.
- `git diff --check`: required before publication.

No Production/Beta requests, customer reads, uploads, quote/order writes, workflow mutations, or credentials occurred in this implementation.
