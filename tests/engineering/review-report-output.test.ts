import { beforeEach, expect, it, vi } from 'vitest'
import { resolve } from 'node:path'
import type { Browser, Page } from '@playwright/test'
import { captureReviewFrame, finishReviewSession, type ReviewSession } from '../s2-ux-review/review-sheet'

const files = vi.hoisted(() => new Map<string, string | Buffer>())
vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn(async () => undefined),
  writeFile: vi.fn(async (path: string, data: string | Buffer) => { files.set(path, data) }),
}))
beforeEach(() => files.clear())

it('excludes only the DEV journey driver while capturing a commercial frame', async () => {
  const screenshot = vi.fn(async () => Buffer.from('synthetic-frame'))
  const page = { viewportSize: () => ({ width: 390, height: 844 }), screenshot,
    url: () => 'http://localhost:5174/#/pages/work-orders/action-workspace' } as unknown as Page
  const session: ReviewSession = { viewport: { width: 390, height: 844 }, frames: [] }
  await captureReviewFrame(page, session, { id: '02-appointment', stage: 'A',
    label: '预约上门', description: 'Synthetic frame', status: 'accepted_baseline' })
  expect(screenshot).toHaveBeenCalledWith({ animations: 'disabled', caret: 'hide', fullPage: false,
    style: '[data-testid="mock-journey-progress"] { display: none !important; }',
  })
  expect(session.frames[0].image).toEqual(Buffer.from('synthetic-frame'))
})

it('keeps S2 images at their original paths while reports link to them from test-results', async () => {
  const session: ReviewSession = {
    viewport: { width: 390, height: 844 },
    frames: Array.from({ length: 7 }, (_, i) => ({
      id: `0${i + 1}-fixture`, stage: 'W', label: 'Synthetic frame', description: '',
      status: 'review_candidate', path: '#/pages/index/index', image: Buffer.from('synthetic-image'),
    })),
  }
  const screenshot = vi.fn(async () => Buffer.from('synthetic-sheet'))
  const close = vi.fn(async () => undefined)
  const browser = { newPage: vi.fn(async () => ({
    setContent: vi.fn(async () => undefined),
    locator: () => ({ first: () => ({ waitFor: vi.fn(async () => undefined) }),
      evaluateAll: vi.fn(async () => true) }),
    screenshot, close,
  })) } as unknown as Browser

  const reportDir = await finishReviewSession(browser, session)
  expect(reportDir).toBe(resolve('test-results/m1-s2/generated/390x844'))
  const manifest = JSON.parse(String(files.get(resolve(reportDir, 'manifest.json'))))
  expect(manifest.frameCount).toBe(7)
  expect(manifest.provenance).toBe('DEV_ONLY_SOURCE_MODELED_MOCK')
  const html = String(files.get(resolve(reportDir, 'index.html')))
  const sources = [...html.matchAll(/<img src="([^"]+)"/g)].map(match => match[1]!)
  expect(sources).toHaveLength(7)
  for (const [i, frame] of session.frames.entries()) {
    const imagePath = resolve('.review/m1-s2/generated/390x844/frames', frame.id + '.png')
    expect(resolve(reportDir, sources[i]!)).toBe(imagePath)
    expect(files.get(imagePath)).toEqual(frame.image)
    expect(manifest.frames[i].file).toBe('frames/' + frame.id + '.png')
  }
  expect(files.has(resolve('.review/m1-s2/generated/390x844/manifest.json'))).toBe(false)
  expect(files.has(resolve('.review/m1-s2/generated/390x844/index.html'))).toBe(false)
  expect(screenshot).toHaveBeenCalledWith({
    path: resolve('.review/m1-s2/generated/390x844/review-sheet.png'),
    fullPage: true, animations: 'disabled',
  })
  expect(close).toHaveBeenCalledOnce()
})
