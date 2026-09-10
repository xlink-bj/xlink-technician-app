# G1 Discovery

## Program control issue #2

**G1 — Technician Rebuild Discovery & Contract Baseline**

## Purpose

G1 — Technician Rebuild Discovery & Contract Baseline establishes the evidence
base for the new Technician / Field Service application.

Existing XLink discovery artifacts must be harvested and evaluated before new
scanning is performed. The program follows **REUSE → VERIFY → GAP ANALYSIS →
TARGETED RESCAN**.

The discovery work is organized into five workstreams:

0. Existing Evidence & Asset Harvest
A. API Contract Baseline
B. Legacy Hardcode / Exception Inventory
C. Workflow & Dynamic Form Capability Matrix
D. Native / Platform Capability Matrix

## Repository boundary

All reference repositories are read-only for this program. Only the following
repository is writable:

`/Users/yesun/Code/xlink-technician-app`

The reference repositories and their initial evidence are catalogued in
[EXISTING_ASSET_INVENTORY.md](./EXISTING_ASSET_INVENTORY.md).

## Foundation status

The initial evidence inventory schema and known repository records are created.
Detailed discovery remains **NOT STARTED** for workstreams A–D. No full API scan,
deep legacy exception scan, workflow/form capability scan, or native/platform
capability scan has been performed as part of this foundation step.

G1 is not ready to pass until the existing artifacts have been evaluated, the
current Technician contract is traceable to evidence, conflicts are explicit,
and remaining UNKNOWN areas are bounded.

## Planned outputs

- [EXISTING_ASSET_INVENTORY.md](./EXISTING_ASSET_INVENTORY.md)
- [API_CONTRACT_BASELINE.md](./API_CONTRACT_BASELINE.md)
- [LEGACY_EXCEPTION_INVENTORY.md](./LEGACY_EXCEPTION_INVENTORY.md)
- [DYNAMIC_FORM_WORKFLOW_MATRIX.md](./DYNAMIC_FORM_WORKFLOW_MATRIX.md)
- [NATIVE_PLATFORM_CAPABILITY_MATRIX.md](./NATIVE_PLATFORM_CAPABILITY_MATRIX.md)
