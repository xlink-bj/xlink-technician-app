import { describe, expect, it } from 'vitest'
import { asOpaqueId, type LocalMedia } from '@shared/types'
import { isR1DefaultImageFieldConfig, isR1NormalImageMedia, isR1NormalImageUrl, isR1NormalImageWireArray } from '@shared/form/r1-normal-image-contract'

const wire = { url: 'https://synthetic.invalid/image.png', name: 'opaque-object-key', extname: 'png' }
const media = (mimeType: string, name?: string): LocalMedia => ({ ref: asOpaqueId<'LocalMediaRef'>('synthetic-image'), source: 'file', mimeType, ...(name !== undefined ? { name } : {}) })

describe('normal default image URL contract', () => {
  it.each([
    'https://synthetic.invalid/%', 'https://synthetic.invalid/%zz', 'https://synthetic.invalid/%2',
    'https://synthetic.invalid/image.png?signature=%GG',
  ])('rejects malformed percent escape without relying on URL canonicalization: %s', url => {
    expect(isR1NormalImageUrl(url)).toBe(false)
  })
  it.each([
    'https://synthetic.invalid/image.png', 'https://synthetic.invalid:443/image.png', 'https://[::1]:5443/image.png',
    'https://synthetic.invalid/opaque?key=a%2Fb&Signature=AB%2f+CD%3d', 'https://synthetic.invalid/encoded%20name.png',
  ])('accepts a strict HTTPS source without serializing its signed bytes: %s', url => {
    const input = { url }
    expect(isR1NormalImageUrl(input.url)).toBe(true)
    expect(input.url).toBe(url)
  })
  it.each([
    undefined, null, 12, '', 'http://synthetic.invalid/a.png', 'data:image/png;base64,AAA', '//synthetic.invalid/a.png',
    'https://', 'https:///synthetic.invalid/a.png', 'https:////synthetic.invalid/a.png', 'https://:443/a.png',
    'https://synthetic.invalid:', 'https://synthetic.invalid:/a.png', 'https://synthetic.invalid:65536/a.png', 'https://synthetic.invalid:bad/a.png',
    'https://user@synthetic.invalid/a.png', 'https://user:pass@synthetic.invalid/a.png', 'https://@synthetic.invalid/a.png',
    ' https://synthetic.invalid/a.png', 'https://synthetic.invalid/a.png ', 'https://synthetic.invalid/a b.png',
    'https://synthetic.invalid/a\nb.png', 'https://synthetic.invalid/a\tb.png', 'https://synthetic.invalid/a\\b.png',
    'https://synthetic.invalid/\u0000a.png', 'https://synthetic.invalid/\u007fa.png', 'https://synthetic.invalid/\u0085a.png',
    'https://synthetic.invalid/\u200ba.png', 'https://synthetic.invalid/\u202ea.png',
    'https://[::1/a.png', 'https://[not-an-ipv6]/a.png',
  ])('rejects a non-strict original URL %#', raw => expect(isR1NormalImageUrl(raw)).toBe(false))
})

describe('normal image media and exact R1 wire', () => {
  it.each(['__proto__', 'constructor', 'toString'])('rejects prototype MIME lookup %s without throwing', mime => {
    expect(isR1NormalImageMedia(media(mime))).toBe(false)
    expect(isR1NormalImageMedia(media(mime, 'image.png'))).toBe(false)
  })
  it.each([
    ['image/png', 'photo.png'], ['image/jpeg', 'photo.jpg'], ['image/jpeg', 'photo.jpeg'], ['image/webp', 'photo.webp'],
    ['IMAGE/PNG', 'photo.PNG'], ['image/png', undefined], ['image/png', 'opaque-no-suffix'],
  ])('accepts only a declared image MIME with nonconflicting known suffix: %s/%s', (mime, name) => {
    expect(isR1NormalImageMedia(media(mime!, name))).toBe(true)
  })
  it.each([
    ['application/pdf', 'file.pdf'], ['image/svg+xml', 'vector.svg'], ['image/gif', 'animated.gif'], ['image/jpg', 'photo.jpg'],
    ['image/png', 'file.pdf'], ['image/jpeg', 'photo.png'], ['image/webp', 'photo.jpeg'], ['image/png', 'photo.'],
    ['image/png', 'photo.png '], ['image/png', 'photo.png.exe'], ['image/png', ''], ['image/png', 'a\u0000.png'],
    ['image/png;charset=utf-8', 'photo.png'], ['', 'photo.png'],
  ])('rejects unsupported MIME or an explicit suffix conflict: %s/%s', (mime, name) => {
    expect(isR1NormalImageMedia(media(mime!, name))).toBe(false)
  })
  it.each(['png', 'jpg', 'jpeg', 'webp', 'PNG'])('allows known extension %s without deriving keys from URL/name', extname => {
    expect(isR1NormalImageWireArray([{ ...wire, url: 'https://synthetic.invalid/opaque?signature=literal%2B', extname }])).toBe(true)
  })
  it.each([
    [{ ...wire, extname: 'pdf' }], [{ ...wire, extname: 'gif' }], [{ ...wire, extname: 'svg' }],
    [{ ...wire, url: 'https://user:secret@synthetic.invalid/a.png' }], [{ ...wire, path: 'legacy' }],
    [{ url: wire.url }], [wire.url], [wire, wire],
    Array.from({ length: 11 }, (_, i) => ({ ...wire, url: `https://synthetic.invalid/${i}.png` })),
  ].map(value => ({ value })))('rejects non-image, non-exact or overbound wire %#', ({ value }) => {
    expect(isR1NormalImageWireArray(value)).toBe(false)
  })
  it('retains the ten-item bound and accepts optional empty lists', () => {
    expect(isR1NormalImageWireArray([])).toBe(true)
    expect(isR1NormalImageWireArray(Array.from({ length: 10 }, (_, i) => ({ ...wire, url: `https://synthetic.invalid/${i}` })))).toBe(true)
  })
})

describe('raw default R1 image configuration is not inferred from an explicit fileType', () => {
  it.each([
    { type: 'file' }, { type: 'file', frontEndConfig: {} }, { type: 'file', frontEndConfig: '{}' },
    { type: 'file', frontEndConfig: ' { "max": 2 } ' }, { type: 'file', frontEndConfig: { max: 0, showField: 'need' } },
  ])('accepts absent fileType without granting the other raw metadata %#', raw => {
    expect(isR1DefaultImageFieldConfig(raw)).toBe(true)
  })
  it.each([
    null, undefined, {}, { type: 'image' }, { type: 'file', frontEndConfig: null }, { type: 'file', frontEndConfig: '' },
    { type: 'file', frontEndConfig: '{bad' }, { type: 'file', frontEndConfig: [] }, { type: 'file', frontEndConfig: '[]' },
    ...['image', 'all', 'video', '', null, undefined, ['image'], { image: true }].map(fileType => ({ type: 'file', frontEndConfig: { fileType } })),
    { type: 'file', frontEndConfig: '{"fileType":"image"}' },
    { type: 'file', frontEndConfig: Object.create({ fileType: 'video' }) },
  ])('rejects malformed or explicitly configured fileType %#', raw => {
    expect(isR1DefaultImageFieldConfig(raw)).toBe(false)
  })
})
