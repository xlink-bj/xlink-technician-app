# G4-F P0 Material SKU DEV Mock UI

This Draft stacks only on R1 pure read-contract PR #71. It is an independent actual uni-app page, accessible from the DEV Mock home panel only with session user=synthetic-user, role=synthetic-role, the exact synthetic workOrder ID and enabled DEV Mock. No Quote Action command, no backend SKU adapter, no writes, prices or inventory.

SPU / sales fields / SKUs are static R1-shaped read examples. Normal screen shows two sales attributes and exact matched SKU; the quantity is historical read-only. Incomplete, unavailable, ambiguous, no SKU, foreign-parent and malformed schema are distinct. Changing scenario only resets local input; no persistence or network. Package-material SKU is not implied by this direct Material SPU screen.

Real main App Playwright captures 375/390px overview, matched, ambiguous and blocked 8-screen evidence while retaining 6 original main App and 25 legacy G4-F test checks. MP/App compile is required but does not substitute for native device Gate #64. Owner commercial catalogue visual gate #41 remains separate. The original R1 Mobile had stronger interactions but no actual new App live SKU read authorization; no implied SKU availability/price.

Gate: SKU_DEV_MOCK_READONLY_CODE_PENDING_CI / REAL_SKU_PROVIDER_AUTH_UNKNOWN / NO_BUSINESS_WRITE / NO_MAIN_MERGE.
