import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const contractFile = fileURLToPath(new URL('../../contracts/beta/survey/onsite-checkin-contract.json', import.meta.url))
const checkerFile = fileURLToPath(new URL('../../scripts/check-survey-onsite-checkin.mjs', import.meta.url))

function readContract(): Record<string, any> {
  return JSON.parse(readFileSync(contractFile, 'utf8')) as Record<string, any>
}

describe('G4-E Survey onsite check-in contract', () => {
  it('passes the machine-checkable contract without treating legacy evidence as Survey truth', () => {
    expect(() => execFileSync(process.execPath, [checkerFile], { cwd: process.cwd(), encoding: 'utf8' })).not.toThrow()
    const contract = readContract()

    expect(contract.domainSeparation.survey).toContain('勘查')
    expect(contract.domainSeparation.inspectionAppointment).toContain('巡检')
    expect(contract.ownership.recordOwner).toBe('UNKNOWN')
    expect(contract.command.endpoint).toBe('UNKNOWN')
    expect(contract.command.legacyEvidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ endpoint: '/biz/punch/dot' }),
      expect.objectContaining({ endpoint: '/biz/sign/signDetail/upsert' }),
    ]))
  })

  it('keeps location/time and appointment-near semantics explicit instead of inventing rules', () => {
    const contract = readContract()

    expect(contract.location).toMatchObject({
      source: 'LocationPort',
      coordinateSystem: 'UNKNOWN',
      geofenceOrRadius: 'UNKNOWN_NO_INVENTED_THRESHOLD',
      fabricatedCoordinates: false,
    })
    expect(contract.time).toMatchObject({ authority: 'UNKNOWN', authoritativeCheckInTime: 'UNKNOWN' })
    expect(contract.appointmentNear).toMatchObject({
      status: 'UNKNOWN_NEEDS_BUSINESS_CONFIG',
      timeWindow: 'UNKNOWN',
      distanceRule: 'UNKNOWN',
      autoImplemented: false,
      backgroundMutation: false,
    })
  })

  it('keeps check-in separate from Survey save, workflow completion, quotation and offline mutation replay', () => {
    const contract = readContract()

    expect(contract.domainSeparation).toMatchObject({
      photoLocationEvidence: 'media watermark evidence only',
      checkInBusinessRecord: 'separate business record',
      sharedBusinessState: false,
      sharedMediaQueueState: false,
    })
    expect(contract.manual).toMatchObject({
      saveSurvey: false,
      completeWorkflow: false,
      createQuote: false,
    })
    expect(contract.offline.businessMutationQueue).toBe(false)
    expect(contract.realExecution).toMatchObject({
      realWritesEnabled: false,
      betaWrites: 'NONE',
      productionWrites: 'NONE',
    })
  })

  it('does not authorize auto check-in or blind retry while the command contract is unknown', () => {
    const contract = readContract()

    expect(contract.appointmentNear.autoImplemented).toBe(false)
    expect(contract.appointmentNear.backgroundMutation).toBe(false)
    expect(contract.idempotency).toMatchObject({
      status: 'UNKNOWN',
      reconciliation: 'UNKNOWN',
      blindRetry: false,
    })
  })
})
