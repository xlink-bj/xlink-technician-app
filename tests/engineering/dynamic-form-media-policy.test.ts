import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

import {
  mediaCapacityError,
  mediaPersistedCount,
  mediaSelectionError,
} from '@runtimes/media/field-policy'
import { dynamicMediaPolicyFor } from '@features/work-orders/dynamic-media-policy'
import { surveyMediaDescriptorFor, surveyMediaCapacityError } from '@features/work-orders/survey-media'

/**
 * All dynamic forms share the SAME media lifecycle. This suite deliberately
 * covers non-Survey fields to prevent policy/queue code from drifting into a
 * Survey-only implementation.
 */
describe('generic Dynamic Form media policy', () => {
  it('supports ordinary non-Survey file and image fields with field-level limits', () => {
    const acceptance = { type: 'file', valueKey: 'acceptanceEvidence', presentation: { max: 3 } }
    const workOrder = { type: 'image', valueKey: 'sitePhotos', presentation: { max: 2 } }
    const plain = { type: 'file', valueKey: 'attachments' }
    expect(dynamicMediaPolicyFor(undefined, acceptance)).toEqual({ maxCount: 3 })
    expect(dynamicMediaPolicyFor('survey', { type: 'file', valueKey: 'otherEvidence', presentation: { max: 3 } }))
      .toEqual({ maxCount: 3 })
    expect(dynamicMediaPolicyFor(undefined, plain)).toEqual({})
    expect(mediaCapacityError(dynamicMediaPolicyFor(undefined, acceptance),
      [{ url: 'https://synthetic.invalid/1' }, { url: 'https://synthetic.invalid/2' }], 2))
      .toMatch(/最多选择 3 项/)
    expect(mediaCapacityError(dynamicMediaPolicyFor(undefined, acceptance),
      [{ url: 'https://synthetic.invalid/1' }, { url: 'https://synthetic.invalid/2' }], 1))
      .toBeUndefined()
    expect(mediaCapacityError(dynamicMediaPolicyFor(undefined, workOrder), ['a.jpg', 'b.jpg'], 1))
      .toMatch(/最多选择 2 项/)
    expect(mediaSelectionError(dynamicMediaPolicyFor(undefined, acceptance), 'camera')).toBeUndefined()
    expect(mediaSelectionError(dynamicMediaPolicyFor(undefined, acceptance), 'library')).toBeUndefined()
  })

  it('preserves verified Survey exceptions as DATA policy, not a separate media engine', () => {
    const infrared = { valueKey: 'infraredImageList', type: 'file', presentation: { max: 6 } }
    const domain = surveyMediaDescriptorFor('survey', infrared)
    const policy = dynamicMediaPolicyFor('survey', infrared)
    expect(policy).toMatchObject({ persistedShape: 'media_object_list', maxCount: 4, selectionMode: 'album_only' })
    expect(policy.maxCount).toBe(4)
    expect(mediaSelectionError(policy, 'camera')).toMatch(/相册/)
    expect(mediaSelectionError(policy, 'library')).toBeUndefined()
    expect(surveyMediaCapacityError(domain, [{ url: 'https://synthetic.invalid/photo' }], 4))
      .toEqual(mediaCapacityError(domain, [{ url: 'https://synthetic.invalid/photo' }], 4))
    expect(dynamicMediaPolicyFor('survey', { ...infrared, presentation: { max: 2 } }).maxCount).toBe(2)
    expect(dynamicMediaPolicyFor('survey', { type: 'file', valueKey: 'images1' }).persistedShape)
      .toBe('media_object_list')
    expect(dynamicMediaPolicyFor(undefined, { type: 'file', valueKey: 'images1' }).persistedShape)
      .toBeUndefined()
  })

  it('treats the max count as an aggregate, including persisted scalar or object-list values', () => {
    expect(mediaPersistedCount(undefined)).toBe(0)
    expect(mediaPersistedCount('')).toBe(0)
    expect(mediaPersistedCount({ url: 'https://synthetic.invalid/photo' })).toBe(1)
    expect(mediaPersistedCount([{ url: 'a' }, { url: 'b' }])).toBe(2)
    expect(mediaCapacityError({ maxCount: 0 }, [], 1)).toMatch(/最多选择 0 项/)
    expect(mediaCapacityError({ maxCount: 2 }, 'already.jpg', 2)).toMatch(/最多选择 2 项/)
    expect(mediaCapacityError({ maxCount: 2 }, 'already.jpg', 1)).toBeUndefined()
    expect(mediaCapacityError(undefined, [], 100)).toBeUndefined()
    expect(mediaCapacityError({ maxCount: 2 }, [], -1)).toMatch(/最多选择 2 项/)
  })

  it('can restrict a non-Survey field to camera without coupling to its FormDef purpose', () => {
    const policy = { selectionMode: 'camera_only' as const }
    expect(mediaSelectionError(policy, 'library')).toMatch(/相机/)
    expect(mediaSelectionError(policy, 'camera')).toBeUndefined()
    expect(mediaSelectionError({ selectionMode: 'special_tool', blocker: '专用录入器尚未接入' }, 'library'))
      .toBe('专用录入器尚未接入')
  })

  it('keeps shared Media Runtime unaware of Survey and Workflow commands', () => {
    const shared = readFileSync(new URL('../../src/runtimes/media/field-policy.ts', import.meta.url), 'utf8')
    const workspace = readFileSync(new URL('../../src/features/work-orders/action-workspace.ts', import.meta.url), 'utf8')
    expect(shared).not.toContain('surveyMediaDescriptorFor')
    expect(shared).not.toContain('workflow/process')
    expect(shared).not.toContain('formPurpose')
    expect(workspace).toContain('dynamicMediaPolicyFor(form.purpose, field)')
    expect(workspace).not.toContain('surveyMediaCapacityError(')
  })
})
