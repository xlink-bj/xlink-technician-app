# P1: Exact identity, NOT demo source conflation

R1 direct Material SKU keys: selected quote Material catalogId equals source Material SPU id; the chosen SKU id is separate. R1 package keys: quote Package catalogId, each material body providerComponentId (package body _id), selected Material catalogId, optional providerReferenceId, and source layer. All must correspond to the same source.

The independently authored DEV quotation catalog package/material IDs (mock-catalog-*) differ from the independent P0 SKU sample identifiers (synthetic-*). These are not the same material, even if displayed names resemble each other. Numeric material layer values are preserved by quote model but string-normalized by the P0 SKU read projection, so this audit conservatively leaves typed numeric layer correspondences UNVERIFIED.

This work adds read-side strict identity comparison with distinct missing/ambiguous/mismatch/unverified states, and displays a compact diagnostic inside P1's existing collapsed local quotation review. A positive match in contrived synthetic test fixtures means ONLY the IDs correspond for that demonstration, not that sale attributes are selected, a tenant/role WorkOrder read is authorized or prices/orders are valid.

HARD GATES: #75 real backend authorized SKU/SPU source; #41 Owner quotation catalog UX; #64 native device. NO live read, no conversion of unrelated fixture IDs, no official type-1 Order writes, no main merge.