import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { mediaPickerLabelFor, verifiedMediaMaxFor } from '@features/work-orders/media-presentation'

const mediaComponentFile = fileURLToPath(new URL('../../src/features/work-orders/components/GenericDynamicFormActionContent.vue', import.meta.url))

describe('G4-E media presentation metadata', () => {
  it('preserves a verified max of zero as present', () => {
    expect(verifiedMediaMaxFor({ presentation: { max: 0 } })).toBe(0)
  })

  it('does not invent or accept invalid media maxima', () => {
    expect(verifiedMediaMaxFor({})).toBeUndefined()
    expect(verifiedMediaMaxFor({ presentation: { max: -1 } })).toBeUndefined()
    expect(verifiedMediaMaxFor({ presentation: { max: Number.NaN } })).toBeUndefined()
  })

  it('derives Survey photo copy from the verified descriptor, not ExtField type', () => {
    expect(mediaPickerLabelFor('survey', { valueKey: 'images1', type: 'file' })).toBe('选择图片')
    expect(mediaPickerLabelFor('survey', { valueKey: 'infraredImageList', type: 'file' })).toBe('选择图片')
    expect(mediaPickerLabelFor('survey', { valueKey: 'beforeMoldRemoval', type: 'file' })).toBe('选择图片')
  })

  it('keeps generic files on file terminology', () => {
    expect(mediaPickerLabelFor('survey', { valueKey: 'genericAttachment', type: 'file' })).toBe('选择文件')
    expect(mediaPickerLabelFor('appointment', { valueKey: 'images1', type: 'file' })).toBe('选择文件')
  })

  it('keeps production tiles on the native image path without a background duplicate', () => {
    const source = readFileSync(mediaComponentFile, 'utf8')
    expect(source).toContain('<image class="dynamic-action-media-thumbnail" :src="media.url" mode="aspectFill" />')
    expect(source).not.toContain('mediaThumbnailStyle')
    expect(source).not.toContain(':style="mediaThumbnailStyle(media.url)"')
  })
})
