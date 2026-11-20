import { isDevMockJourneyEnabled } from '@adapters/api/mock/journey'
import { loadApplicationRuntimeConfig } from '@app/runtime-config'
import {
  pipePhotoFixtures, pipeScanFixtures, type PipePhotoFixture, type PipePhotoReceipt,
  type PipeScanFixture, type PipeVerificationMock, type PipeVerificationSnapshot,
} from '@features/work-orders/pipe-verification/pipe-verification'
import { mockJourneyRoleId, mockJourneyUserId } from '@shared/mock-journey-identity'
import type { SessionSnapshot } from '@shared/ports'
import { sessionAuthorizationFingerprint } from '@shared/session-authorization'

const workOrderId = 'mock-work-order-002'
const registry = new Map([['MOCK-PPR-2401', '演练管材样本 2401']])
const scanCodes: Readonly<Record<PipeScanFixture, string | null>> = {
  registered: 'MOCK-PPR-2401',
  unregistered: 'MOCK-PPR-2402',
  damaged: null,
}
const photoReceipts: Readonly<Record<PipePhotoFixture, PipePhotoReceipt>> = {
  marked: { imageId: 'marked', outcome: 'recognized', marking: 'PP-R' },
  obscured: { imageId: 'obscured', outcome: 'inconclusive', reason: '样本标记被遮挡，无法确认材质。' },
}

interface PipeVerificationContext {
  readonly session: SessionSnapshot | null
  readonly routeOrderId: string
  readonly readOrderId: string
  readonly isCurrentlyListed: boolean
}

// Keep only synthetic receipt metadata for this one work order while the app
// is open. Images are bundled originals. No business API, device or log port.
let saved: { scope: string; snapshot: PipeVerificationSnapshot } | null = null

function scanSample(fixtureId: PipeScanFixture, attempt: number): NonNullable<PipeVerificationSnapshot['scan']> {
  const code = scanCodes[fixtureId]
  if (!code) return { fixtureId, attempt, outcome: 'unknown', reason: '样本编码残缺，无法读取完整编码。' }
  const sampleRef = registry.get(code)
  if (sampleRef) return { fixtureId, attempt, outcome: 'found', code, sampleRef }
  return { fixtureId, attempt, outcome: 'not-found', code }
}

export function createDevPipeVerificationMock(getContext: () => PipeVerificationContext): PipeVerificationMock {
  const activeScope = () => {
    const { session, routeOrderId, readOrderId, isCurrentlyListed } = getContext()
    const actor = session?.user.id === mockJourneyUserId
      && session.currentRole?.id === mockJourneyRoleId
      && session.sessionRef === 'local-mock-only-session'
      ? sessionAuthorizationFingerprint({
          sessionRef: session.sessionRef, userId: session.user.id,
          roleId: session.currentRole.id, roleVersion: session.roleVersion,
        })
      : null
    if (saved && saved.scope !== actor) saved = null
    if (!actor || !isCurrentlyListed || routeOrderId !== workOrderId || readOrderId !== workOrderId
      || import.meta.env.VITE_XLINK_PIPE_VERIFICATION_MOCK !== 'true'
      || !isDevMockJourneyEnabled()) return null
    const config = loadApplicationRuntimeConfig()
    return config.ok && config.value.devMockUxSession && config.value.authOnlyMockBusiness ? actor : null
  }

  const read = (): PipeVerificationSnapshot | null => {
    const scope = activeScope()
    if (!scope) return null
    return saved?.scope === scope ? saved.snapshot : {}
  }

  function scan(fixtureId: PipeScanFixture, recheck = false): PipeVerificationSnapshot | null {
    const scope = activeScope()
    if (!scope || !pipeScanFixtures.some(fixture => fixture.id === fixtureId)) return null
    const previous = saved?.snapshot ?? {}
    const attempt = recheck && previous.scan?.fixtureId === fixtureId ? previous.scan.attempt + 1 : 1
    const snapshot = { ...previous, scan: scanSample(fixtureId, attempt) }
    saved = { scope, snapshot }
    return snapshot
  }

  return {
    available: () => activeScope() !== null,
    read,
    scan,
    recheck: () => {
      const fixtureId = read()?.scan?.fixtureId
      return fixtureId ? scan(fixtureId, true) : null
    },
    recognize: imageId => {
      const scope = activeScope()
      if (!scope || !pipePhotoFixtures.some(fixture => fixture.id === imageId)) return null
      const snapshot = { ...saved?.snapshot, photo: photoReceipts[imageId] }
      saved = { scope, snapshot }
      return snapshot
    },
  }
}
