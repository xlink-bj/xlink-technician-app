import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const contractFile = fileURLToPath(new URL('../../contracts/beta/survey/g4e-closure-readiness.json', import.meta.url))
const checkerFile = fileURLToPath(new URL('../../scripts/check-g4e-closure-readiness.mjs', import.meta.url))

function readClosure(): Record<string, any> {
  return JSON.parse(readFileSync(contractFile, 'utf8')) as Record<string, any>
}

describe('G4-E closure readiness', () => {
  it('passes the machine-readable closure audit', () => {
    expect(() => execFileSync(process.execPath, [checkerFile], { cwd: process.cwd(), encoding: 'utf8' })).not.toThrow()
  })

  it('keeps product-deferred fields non-blocking and excludes them from execution', () => {
    const closure = readClosure()
    expect(closure.productDeferred).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'serviceGoods-projPackage', status: 'DEFERRED_NON_BLOCKING', blocksFrontendEngineering: false }),
      expect.objectContaining({ id: 'surveyDrawing-surveyTool', status: 'DEFERRED_NON_BLOCKING', blocksFrontendEngineering: false }),
    ]))
    expect(closure.formExecutability.deferredExcludedFieldKeys).toEqual(['serviceGoods', 'surveyDrawing'])
  })

  it('proves there is no visible required unsupported Survey field', () => {
    const closure = readClosure()
    expect(closure.formExecutability).toMatchObject({
      requiredVisibleOrdinaryStatus: 'PASS',
      requiredVisibleMediaSourceBackedStatus: 'PASS',
      requiredVisibleUnsupportedFieldKeys: [],
      requiredVisibleUnknownFieldKeys: [],
      status: 'PASS',
    })
    expect(closure.formExecutability.requiredVisibleOrdinaryFieldKeys).toContain('leakageCause')
  })

  it('separates frontend foundation readiness from external and live production readiness', () => {
    const closure = readClosure()
    expect(closure).toMatchObject({
      frontendEngineeringStatus: 'PASS',
      productCompletionStatus: 'PARTIAL',
      productionReadinessStatus: 'PARTIAL',
      realMutationAuthorization: 'NOT_AUTHORIZED',
      g4fAuthorized: false,
    })
    expect(closure.externalDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'survey-onsite-checkin-record-owner-and-command', status: 'BLOCKED_EXTERNAL', owner: 'BACKEND', blocksFrontendEngineering: false }),
      expect.objectContaining({ id: 'real-watermark-coordinate-contract', status: 'BLOCKED_EXTERNAL', blocksFrontendEngineering: false }),
    ]))
    expect(closure.visualValidationPending).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'authenticated-mp-survey-ui', status: 'VISUAL_VALIDATION_PENDING', owner: 'VISUAL_QA' }),
      expect.objectContaining({ id: 'authenticated-app-survey-ui', status: 'VISUAL_VALIDATION_PENDING', owner: 'VISUAL_QA' }),
    ]))
  })
})
