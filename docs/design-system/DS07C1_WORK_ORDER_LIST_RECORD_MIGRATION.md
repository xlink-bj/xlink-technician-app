# DS-07.C1 · Work Order List / Record Tone Migration

**Stage:** first migrated *real* business surface. Engineering candidate, no visual rebaseline, no business/API/Workflow changes. This is the first sub-slice of DS-07.C, not a claim that work-order list/detail or all M1 flows are complete.

## Single visual authority

Before: `src/pages/work-orders/work-orders.vue` allocated six `card-accent--{tone}` backgrounds and six `card-mark--{tone}` local palettes, duplicating `AppRecordCard` tone colors in `design-system.scss` and business icon mapping.

After:
- `AppRecordCard` owns optional decorative `accent` geometry and color (default false: other consumers unchanged).
- Shared `AppRecordMark` owns icon-container geometry; colors are inherited from its enclosing `AppRecordCard` tone via `--app-record-mark-*` custom properties, defined for blue/red/orange/purple/green/gray/neutral in `design-system.scss`.
- The Work Order List supplies only task-label-derived `tone`, source business icon name/color, and content. Its `card-accent/card-mark` markup/CSS palette is removed.
- The existing task→tone business projection in `@features/work-orders/card` remains the sole decision source; the icon color mapping remains unchanged for native uni-app compatibility.
- All search, list, status, contact, accept, navigation, production read-only, paging, loading/error/empty behavior are unchanged.
- All existing reference screenshots remain untouched; actual H5 comparison must verify pixel stability, not simply compile.

## Measured debt reduction

| File/metric | Before | After |
|---|---:|---:|
| `work-orders.vue` hardcoded CSS hex values | 85 | **60** |
| Removed local tone CSS and markup | 12 tone blocks + local card-accent/mark presentation | Shared primitives |
| Global style debt ratchet | old limit 85 | **locked to 60** |
| Existing Work Order Detail | not touched | DS-07.C2 later |

A different page now gets an accented, toned record without copying the six status palette CSS blocks: `<AppRecordCard accent tone="red"><AppRecordMark icon="contact" />...</AppRecordCard>`.

## Gate

1. **Validate**: TypeScript, visual debt ratchet, business boundaries.
2. **DS01 H5 Gallery**: real red and green AppRecordCard/Mark at 320/375/390; computed colors from global palette; MP-Weixin Review build.
3. **DS02A main H5**: original Work Order List screenshots for 320/375/390 must remain unchanged at strict golden if deterministic. Historical Q01 and Detail image differences are unrelated ancestors, must not be silently approved or rebaselined.
4. **Owner**: legacy record appearance unchanged in this engineering-only migration. Further commercial aesthetics handled separately.

**No Production writes; no batch restyle.** Continue with Work Order Detail only after this first slice passes.
