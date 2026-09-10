# API Contract Baseline

## Status

**NOT STARTED — foundation placeholder only.**

This file defines the output and evidence rules for the API Contract Baseline.
It contains no completed endpoint inventory and makes no claim that a listed
historical spec is the current public mobile contract.

## Required method

The baseline must follow:

**REUSE → VERIFY → GAP ANALYSIS → TARGETED RESCAN**

Before a new scan is written or run:

1. Inventory the existing R1, R2, and R3 assets in
   [EXISTING_ASSET_INVENTORY.md](./EXISTING_ASSET_INVENTORY.md).
2. Reuse machine-readable specs, existing API tooling, adapter mappings, and
   current Technician call sites as candidate evidence.
3. Verify candidates against current backend behavior and current Technician
   usage where possible.
4. Record gaps and conflicts explicitly.
5. Rescan only the unresolved or stale areas.

## Evidence priority

Use the following practical order, subject to provenance and freshness checks:

1. Current authoritative backend API specification, if provenance is verified.
2. Current backend Java Controller / DTO / service contract.
3. Actual test-environment request / response behavior.
4. Existing machine-readable reverse-engineered API specs.
5. Current Legacy Technician runtime/API usage.
6. `xlink-business-3.0` adapters, Sources, and ERM evidence.
7. Current Legacy source.
8. Derived or historical documentation.

Database schema is authoritative for stored data structure, but not automatically
for public API semantics. ERM/BFF models are domain evidence, but not
automatically the raw mobile API contract.

## Planned endpoint record

Each endpoint record must include:

- method and path;
- operation/domain name;
- source evidence and exact source path;
- source SHA or runtime observation identifier;
- request headers, authentication/session assumptions, query/path/body fields;
- response shape and important field meanings;
- current Technician call site, if any;
- backend Controller/DTO/service evidence, if available;
- normalized/ERM mapping, if applicable;
- confidence and authority level;
- conflict record or explicit `UNKNOWN` fields;
- verification status and next targeted rescan.

## Conflict rule

Never silently merge differences between an API spec, Java backend code,
`xlink-business-3.0` adapter, and the current Technician App. Record the exact
difference, likely explanation, current behavior, and required verification.

## Current gaps

Endpoint-level reuse, verification, gap analysis, and targeted rescans remain
to be performed in a later discovery pass.
