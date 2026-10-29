# DS-02.A — H5 Commercial Visual Contract v1.0

**Status:** DS-02.A **main business 9 PNGs Owner-approved on 2026-10-29** (W01/W02/Q01 at 320/375/390 CSS px). Gallery 6 PNGs remain engineering candidates; no MP/iOS/Android visual signoff implied.  
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

1. **Bootstrap completed exactly once in PR #141:** 15 PNGs were created by a restricted internal staging workflow and committed to that PR branch as **CANDIDATES**. At this point the workflow has been intentionally replaced with **read-only** PR regression; it can no longer create or rewrite baselines.
2. Baselines are now regular reviewed source-controlled assets. Normal CI has `contents: read` and never invokes `--update-snapshots`; missing/partial baseline collections fail closed. No bot or developer may rebaseline implicitly.
3. Any later deliberate visual change requires a dedicated PR change to the relevant PNGs, a screenshot diff/reason and Owner visual approval before labeling it `GOLDEN`. A green comparison proves consistency with the signed baseline, not necessarily aesthetic excellence.
4. The fixtures use only local DEV Mock, no production reads/writes, no realistic user credentials or authorized Order mutations. Do not mask prices, business statuses, warnings, labels, loading indicators or controls to hide differences.
5. The original 15 candidates remain in the historical record. As of 2026-10-29 the **nine main business baselines are signed**; the six Gallery candidates are still pending separate Owner signoff. Approval must never be inferred from green CI alone.

## 2026-10-29 Owner decision — DS-02.A business 9/9

- **Owner approval:** User explicitly approved replacing the nine W01 list / W02 detail / Q01 quotation snapshots at 320, 375 and 390 CSS px with the previously accepted commercial UI. Only `tests/ds02a-main/snapshots/ds02a-{list,detail,quote}-{320,375,390}.png` is rebaselined in PR #234.
- **Evidence:** Real uni-app H5 Playwright actual PNGs from the no-business-write, network-guarded run; individual visual inspection found no cropped primary action or horizontal overflow. Snapshot source is the accepted mainline `d7f08853636ade019040fa19eaa29eefd9357e92`; the later #234 changes before signoff touched tests only, not `src/`. CI reruns compare new baselines without auto-updating them.
- **Isolation:** Six `tests/ds02a-gallery/snapshots` PNGs unchanged and still candidate. The baseline does not certify native WeChat MP or physical iPhone UI, does not enable Production/Beta business writes, and does not approve deployment.

## Initial UX audit — examples from real H5 screenshots (390px)

- **Work-order list:** task/customer identity is readable, but the dense location/meta line, tone-varied status markers and card footer actions still need a shared Card/Status design grammar (DS-02.B).
- **Work-order detail:** work-order context, task CTA and tabs are functionally clear, yet secondary information, tab typography and empty-state density should be normalized across List/Detail (DS-02.B/C).
- **Q01 quotation:** structured sections and action progression are stronger; reuse this direction without copying its feature CSS into future pages.
- These are evidence-backed migration priorities, *not* approval of the present screenshots as visually finished. DS-02.A intentionally does not patch each screen with another layer of CSS.

## H5 acceptance checklist

- Text and card hierarchy consistent; no horizontal overflow at 320/375/390; no cropped 4-character primary actions.
- Real Button and Action Bar masters remain unchanged; meaningful spacing, status color and type changes fail visual diff.
- List/detail/Q01 cross-page visual regression checks are reproducible. Retry and mock provenance remain explicit.
- Full `verify`, Main H5 compatibility, and S2 visual checks still required to integrate into #132.
- Owner visual signoff happens separately; MP simulator/device/OS rendering checks belong to future release stages.

**DS-02.B handoff:** Extract only existing stable section/card/status patterns with at least two real consumers. Do not create a new general-purpose page DSL.
