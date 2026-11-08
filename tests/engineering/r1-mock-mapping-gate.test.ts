import { describe, expect, it } from 'vitest'
import manifest from '../../contracts/r1-mock-mapping.json'
import { validateR1MockMapping } from '../../scripts/check-r1-mock-mapping.mjs'

describe('whole R1/Mock mapping governance', () => {
  it('indexes executable evidence for all domains without calling an index a test PASS', () => {
    expect(validateR1MockMapping(manifest)).toMatchObject({ domains: 21, scenarios: 8, state: 'MAPPING_INDEX_VALIDATED_NOT_EXECUTION_PASS', liveParity: 'NOT_VERIFIED' })
  })
  it('rejects dropped domains, lost failure scenarios and invented live acceptance', () => {
    for (const mutate of [
      (copy: typeof manifest) => copy.domains.pop(),
      (copy: typeof manifest) => copy.scenarios.pop(),
      (copy: typeof manifest) => { copy.domains[0].liveParity = 'PASS' },
      (copy: typeof manifest) => { copy.productionBusinessWrites = 'ENABLED' },
      (copy: typeof manifest) => { copy.domains[0].unitTests = [] },
      (copy: typeof manifest) => { copy.scenarios[0].browserTests = [] },
      (copy: typeof manifest) => { copy.domains[0].unresolved = 'Everything verified' },
      (copy: typeof manifest) => { copy.currentEvidence = '' },
      (copy: typeof manifest) => { copy.domains[3].unresolved = '节点 FormDef 引用可证；Production extId 字段请求不在现有白名单，未执行' },
    ]) {
      const copy = structuredClone(manifest); mutate(copy)
      expect(() => validateR1MockMapping(copy)).toThrow('R1_MOCK_MAPPING_BLOCKED')
    }
  })
  it('maps existing matched/refresh/empty Contract H5 evidence and the new adapter-store failures', () => {
    expect(manifest.scenarios.find(row => row.id === 'M06')?.browserTests).toEqual([
      'tests/h5-main-mock/m1-signing-official-order-read.spec.ts',
      'tests/h5-main-mock/m1-r1-contract-preview.spec.ts',
      'tests/h5-main-mock/a-stage-p1-acceptance.spec.ts',
    ])
    for (const id of ['F20', 'F21']) expect(manifest.domains.find(row => row.id === id)?.unitTests)
      .toContain('tests/engineering/r1-contract-mock-anomalies.test.ts')
  })
})
