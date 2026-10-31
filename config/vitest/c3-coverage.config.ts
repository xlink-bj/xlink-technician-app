import { defineConfig, mergeConfig } from 'vitest/config'
import baseline from './unit.config'

/**
 * C3 dedicated executed-V8 coverage pilot.
 * Instrument ONLY these named source modules, not the entire repo.
 * Provider is pinned transiently by dedicated CI job; no production bundle.
 */
export default mergeConfig(baseline, defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      enabled: true,
      all: true,
      include: [
        'src/features/work-orders/action-workspace-read-model.ts',
        'src/features/work-orders/quotation/order-submission.ts',
        'src/adapters/api/uni-api-command-transport.ts',
      ],
      reporter: ['json-summary', 'text-summary'],
      reportsDirectory: 'coverage',
    },
  },
}))
