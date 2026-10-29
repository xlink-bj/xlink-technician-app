# DS-02.A / DS-02.B visual baseline governance

## Owner decision — 2026-10-29

**APPROVED: 9 main business Golden PNGs only**, W01 work-order list, W02 work-order detail and Q01 quotation editor, each at 320 / 375 / 390 CSS px. Owner previously accepted the commercial layout and expressly authorized rebaseline of these nine screenshots on 2026-10-29. PR #234 preserves the prior Git history and tracks the new actual PNGs independently.

Source: accepted mainline `d7f08853636ade019040fa19eaa29eefd9357e92` using local deterministic Mock; subsequent PR #234 edits before rebaseline were test-only. Visual review inspected all nine PNGs for clipping/layout. The Playwright run asserts no horizontal overflow, suitable touch targets, no external business requests or JS errors; GitHub CI must still go green before merging.

**NOT APPROVED:** six Gallery snapshots (unchanged engineering candidates), native MP / iOS / Android visual baselines, Production or Beta writes, any deployment. Any future visual change requires a fresh baseline diff and Owner review; regular CI stays read-only.
