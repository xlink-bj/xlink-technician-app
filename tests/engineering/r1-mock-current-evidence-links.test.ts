import { strict as assert } from 'node:assert'
import { describe, it } from 'vitest'
import manifest from '../../contracts/r1-mock-mapping.json'

// These are links to executable, synthetic supported slices. Adding a link
// neither executes that test nor upgrades any live or production evidence.
describe('current supported R1 Mock slices remain reachable from the mapping command', () => {
  it('keeps Repeat query, bounded controller and scoped-reader regressions in F07', () => {
    const actual = manifest.domains.find(row => row.id === 'F07')!.unitTests
    const required = [
      'tests/engineering/mock-repeat-query-parity.test.ts',
      'tests/engineering/a-stage-main-app-special-controller.test.ts',
      'tests/engineering/r1-scoped-form-read.test.ts',
    ]
    assert.deepEqual(required.filter(path => !actual.includes(path)), [])
  })

  it('keeps the separate Survey sample regressions in F09 without relabelling F04', () => {
    const actual = manifest.domains.find(row => row.id === 'F09')!.unitTests
    const required = [
      'tests/engineering/survey-59-mock-fields.test.ts',
      'tests/engineering/survey-59-read-projection.test.ts',
      'tests/engineering/survey-59-storage-wire.test.ts',
      'tests/engineering/survey-59-conditions-matrix.test.ts',
      'tests/engineering/survey-effective-read-slot.test.ts',
      'tests/engineering/survey-leakage-binding-read.test.ts',
    ]
    assert.deepEqual(required.filter(path => !actual.includes(path)), [])
  })

  it('indexes the actual Repeat query H5 scenario under M02', () => {
    assert.ok(manifest.scenarios.find(row => row.id === 'M02')!.browserTests
      .includes('tests/h5-main-mock/mock-repeat-query.spec.ts'))
  })

  it('indexes normal Survey read-only H5 under M03', () => {
    assert.ok(manifest.scenarios.find(row => row.id === 'M03')!.browserTests
      .includes('tests/h5-main-mock/survey-59-read.spec.ts'))
  })

  it('never promotes bounded synthetic coverage into live parity or business-write approval', () => {
    assert.equal(manifest.scope, 'SOURCE_MAPPED_SYNTHETIC_SUPPORTED_SLICE_NOT_LIVE_PARITY')
    assert.equal(manifest.productionBusinessWrites, 'HOLD_201')
    assert.ok(manifest.domains.every(row => row.liveParity === 'NOT_VERIFIED'))
    assert.equal(manifest.scenarios.find(row => row.id === 'M08')!.status,
      'PARTIAL_SCALE_EQUIVALENCE_NOT_PROVEN')
  })
})
