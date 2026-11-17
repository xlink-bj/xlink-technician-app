import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { buildSurveyMediaContract } from '../../scripts/survey-media-contract.mjs'

const historicalFile = fileURLToPath(new URL('../../contracts/beta/survey/historical.json', import.meta.url))
const mediaFile = fileURLToPath(new URL('../../contracts/beta/survey/media-contract.json', import.meta.url))

describe('G4-E Survey media contract', () => {
  it('derives all 24 mobile Survey media rows from the verified historical contract', () => {
    const historical = JSON.parse(readFileSync(historicalFile, 'utf8'))
    const media = JSON.parse(readFileSync(mediaFile, 'utf8'))
    const expected = buildSurveyMediaContract(historical)

    expect(media.rows).toHaveLength(24)
    expect(media.rows).toEqual(expected.rows)
    expect(media.policies).toMatchObject({
      aggregateMaxCount: 'UNKNOWN',
      offlineSupport: 'NOT_IMPLEMENTED',
      uploadIsSeparateFromFormSave: true,
      formSaveIsSeparateFromWorkflowCompletion: true,
    })
  })

  it('keeps Survey-specific media semantics explicit and fail-closed', () => {
    const media = JSON.parse(readFileSync(mediaFile, 'utf8'))
    const byKey = new Map(media.rows.map((row: { valueKey: string }) => [row.valueKey, row]))

    expect(byKey.get('surveyDrawing')).toMatchObject({
      selectionMode: 'SPECIAL_SURVEY_TOOL',
      onlineStatus: 'UNKNOWN_SPECIAL_TOOL',
      maxCount: 1,
    })
    expect(byKey.get('infraredImageList')).toMatchObject({
      selectionMode: 'ALBUM_ONLY_UNVERIFIED_DEVICE_SEMANTICS',
      maxCount: 4,
    })
    expect(byKey.get('beforeMoldRemoval')).toMatchObject({
      selectionMode: 'CAMERA_OR_ALBUM_EVIDENCED',
      locationPolicy: 'REQUIRED_FOR_CAMERA_WATERMARK',
    })
    expect(byKey.get('images1')).toMatchObject({ required: true, maxCount: 'UNKNOWN' })
    expect(byKey.get('images2')).toMatchObject({ required: true, maxCount: 'UNKNOWN' })
    expect(media.rows.every((row: { persistedShape: string }) => row.persistedShape === 'LIST_OF_MEDIA_OBJECTS_URL_NAME_EXTNAME')).toBe(true)
  })
})
