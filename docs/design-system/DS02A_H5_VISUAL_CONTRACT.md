# DS-02.A — H5 Commercial Visual Contract v1.0

**Status:** Engineering candidate. Baselines and business screens require Owner visual signoff before being called GOLDEN/ACCEPTED.  
**Scope:** true uni-app H5 only, **not** Web-only mockups; mobile 320 / 375 / 390 CSS px, device scale factor 1; local credential-free development fixtures. MP/iOS/Android visual calibration explicitly deferred.

## Why

DS-01.1 standardized actions, but real pages continue to own many local colors, card treatments, loading/empty states and spacing. DS-02.A establishes the stable visual contract and a repeatable regression harness *before* extracting content patterns (DS-02.B-E). Not a redesign or migration of 1000+ CSS rules in one PR.

## Semantic tokens

The canonical token source remains `src/shared/ui/design-system.scss` — **additive aliases** for typography, surface levels, border/elevation, shape, icon sizes, subdued content, accessible feedback and disabled visuals. Existing `--app-color-*` and `--app-font-*` values remain backward compatible. Feature UI must consume roles rather than hardcode new equivalent values; existing overrides are tracked migration debt, not silently rewritten.

| Roles | Meaning | Evidence |
|---|---|---|
| `--app-type-*`, `--app-text-*` | display/section/body/caption, strong/secondary/muted text | source-linked to existing type scale |
| `--app-surface-*`, `--app-outline-*` | page/raised/control and subdued separator | existing surface tokens |
| `--app-elevation-*`, `--app-shape-*` | flat/card/overlay depth and shape | no extra gradients or shadow stacking |
| `--app-icon-*` | three icon sizes for action/content use | real H5 render |
| `--app-feedback-*`, `--app-disabled-*` | success, warning, error and unavailable presentation | semantic status, no optimistic fake success |

## Deterministic H5 visual suites

- `pnpm test:ds02a:gallery`: **real uni-app** Gallery, full Button and Action Bar masters, 320/375/390.
- `pnpm test:ds02a:business`: **real app** work-order list, work-order detail, quotation Q01 editor, 320/375/390; synthetic `MOCK-018` only, no authoritative write.
- `expect(...).toHaveScreenshot()`: 0.4% maximum pixel-diff ratio, per-pixel threshold 0.16, CSS-scale screenshots, hidden caret and disabled animations. Fixed Chromium via lockfile and `ubuntu-24.04` + installed `fonts-noto-cjk`; strict local-only route guards.
- Width/state/DOM checks run **alongside**, not instead of, screenshot comparisons. Failures retain PNG expected/actual/diff and traces.
- Existing 50-frame S2 and G4-F business QA remain intact and separate.

## Baseline admission and governance

1. Exact-target PR branch creates baseline **candidates** only if snapshot files are missing. A GitHub Actions job runs `--update-snapshots`, commits generated PNG into *that PR branch only*, then the new HEAD re-runs strict pixel comparisons. This prevents a false green simply because no baseline existed.
2. **Normal PR/commit runs never overwrite snapshots.** To change baseline later: intentionally update PNG in a reviewed PR with screenshot-diff explanation. CI must reject unreviewed drift. No broad `--update-snapshots` in regression mode.
3. A passing diff test means *unchanged from the committed candidate*, not "this design is beautiful." The user/Owner must review Gallery and live business screenshots and then explicitly mark the approved baseline set for future use. Until then report `ENGINEERING PASS / VISUAL OWNER REVIEW PENDING`.
4. The capture runner must not fetch Production, credentials or external APIs. `VITE_XLINK_ENABLE_REAL_WRITES=false`, no auth override, no synthetic financial success.
5. If a stable content fixture changes, update it deliberately and re-review all affected baselines. Do not mask business text, amounts, status, or buttons to hide failures.

## H5 acceptance checklist

- Text and card hierarchy consistent; no horizontal overflow at 320/375/390; no cropped 4-character primary actions.
- Real Button and Action Bar masters remain unchanged; meaningful spacing, status color and type changes fail visual diff.
- List/detail/Q01 cross-page visual regression checks are reproducible. Retry and mock provenance remain explicit.
- Full `verify`, Main H5 compatibility, and S2 visual checks still required to integrate into #132.
- Owner visual signoff happens separately; MP simulator/device/OS rendering checks belong to future release stages.

**DS-02.B handoff:** Extract only existing stable section/card/status patterns with at least two real consumers. Do not create a new general-purpose page DSL.
