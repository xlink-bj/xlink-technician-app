import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { Browser, Page } from '@playwright/test'

/**
 * S2 reusable actual-main-App UX screenshot pipeline.
 * Capture exactly the requested viewport; no synthetic collage mockups,
 * user data, external image providers or inaccessible font artifacts.
 */
export interface ReviewFrame {
  readonly id: string
  readonly stage: 'W' | 'A' | 'S' | 'Q' | 'C'
  readonly label: string
  readonly description: string
  readonly status: 'accepted_baseline' | 'review_candidate'
  readonly path: string
  readonly image: Buffer
}
export interface ReviewSession {
  readonly viewport: { readonly width: number; readonly height: number }
  readonly frames: ReviewFrame[]
}

const OUTPUT = resolve(process.cwd(), '.review/m1-s2/generated')
const allowedId = /^[0-9]{2}-[a-z][a-z0-9-]{2,70}$/
const escapeHtml = (str: string): string => str
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;')

export async function captureReviewFrame(
  page: Page,
  session: ReviewSession,
  input: Omit<ReviewFrame, 'image' | 'path'>,
): Promise<void> {
  if (!allowedId.test(input.id) || session.frames.some(frame => frame.id === input.id)) {
    throw new Error('S2 Review frame IDs must be unique and stable')
  }
  const { width, height } = page.viewportSize() ?? { width: 0, height: 0 }
  if (width !== session.viewport.width || height !== session.viewport.height) {
    throw new Error('S2 viewport drift: refuse non-comparable capture')
  }
  const image = await page.screenshot({ animations: 'disabled', caret: 'hide', fullPage: false })
  session.frames.push({ ...input, path: new URL(page.url()).hash.split('?')[0], image })
  // Keep partial capture evidence even if a later UI state or sheet fails.
  // The final contact sheet is generated only after every required frame.
  const shotDir = join(OUTPUT, `${width}x${height}`, 'frames')
  await mkdir(shotDir, { recursive: true })
  await writeFile(join(shotDir, input.id + '.png'), image)
}

function layout(
  session: ReviewSession,
  frameSrc: (frame: ReviewFrame) => string,
): string {
  const { width, height } = session.viewport
  const cards = session.frames.map((frame, index) => `
    <article class="card" data-frame="${escapeHtml(frame.id)}">
      <div class="metadata">
        <span class="sequence">${String(index + 1).padStart(2, '0')}</span>
        <div class="name"><strong>${escapeHtml(frame.label)}</strong><small>${escapeHtml(frame.description)}</small></div>
        <span class="state">${frame.status === 'accepted_baseline' ? '已认可基线' : '待审核'}</span>
      </div>
      <img src="${frameSrc(frame)}" alt="${escapeHtml(frame.label)}" width="${width}" height="${height}" />
      <div class="path">${escapeHtml(frame.id)} · ${escapeHtml(frame.path)}</div>
    </article>`).join('')
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>XLink M1-S2 UX Review Sheet — ${width}×${height}</title>
<style>
  * { box-sizing: border-box; }
  body { margin:0; padding:28px; background:#f2f5f8; color:#13273c;
    font-family:"Noto Sans CJK SC", "Microsoft YaHei", Arial, sans-serif; }
  header { background:white; border-radius:14px; padding:20px 24px; margin-bottom:20px;
    border:1px solid #d9e2ea; display:flex; justify-content:space-between; align-items:center; }
  header h1 { font-size:21px; margin:0 0 7px; font-weight:700; letter-spacing:-.3px; }
  header p { margin:0; color:#54677c; font-size:12px; }
  .stamp { font-size:12px; line-height:1.9; color:#315a7c; text-align:right; }
  .grid { display:grid; grid-template-columns:repeat(3, 1fr); gap:16px; }
  .card { min-width:0; background:white; border:1px solid #d9e2ea;
    border-radius:12px; padding:11px; box-shadow:0 2px 7px #233e590b; }
  .metadata { min-height:55px; display:flex; align-items:center; gap:9px; padding:0 1px 10px; }
  .sequence { width:29px;height:29px;display:grid;place-items:center;
    border-radius:7px;background:#e9eff6;color:#285175;font-weight:700;font-size:13px; }
  .name { flex:1; min-width:0; }
  strong { display:block;font-size:14px; }
  small { display:block;color:#65778a;font-size:11px;margin-top:3px;line-height:1.35; }
  .state { font-size:10px; white-space:nowrap; color:#4a6381;
    border:1px solid #cbd9e7; padding:4px 6px;border-radius:5px; }
  .card img { display:block; width:100%; height:auto; background:#fff; border:1px solid #ecf0f3; }
  .path { padding:8px 2px 2px; font-size:10px; color:#8090a0; overflow-wrap:anywhere; }
  footer { color:#5e7185; padding:20px 5px 0; font-size:11px; line-height:1.6; }
  @media(max-width:850px) { body{padding:12px;} .grid{grid-template-columns:repeat(2,1fr);} }
</style>
</head>
<body>
  <header>
    <div><h1>修链 · M1 S2 界面全景审查</h1>
      <p>真实主 App H5 · ${width}×${height} · 源模型 Mock · 按业务操作顺序排布</p>
    </div>
    <div class="stamp"><strong>DEV MOCK / NO REAL DATA</strong>先审查信息层级，再修改界面<br/>不包含生产客户资料</div>
  </header>
  <main class="grid">${cards}</main>
  <footer>基线：工单 / 预约。审核重点：勘察 → 报价 → 签约。
  本 Sheet 仅反映 H5 模拟状态；不代表真机、正式订单、签约或生产 API 验收。</footer>
</body></html>`
}

export async function finishReviewSession(browser: Browser, session: ReviewSession): Promise<string> {
  if (session.frames.length < 7) throw new Error('S2 visual review missing required business-state frames')
  const dir = join(OUTPUT, `${session.viewport.width}x${session.viewport.height}`)
  const shots = join(dir, 'frames')
  await mkdir(shots, { recursive: true })
  for (const frame of session.frames) {
    await writeFile(join(shots, frame.id + '.png'), frame.image)
  }
  await writeFile(join(dir, 'manifest.json'), JSON.stringify({
    schemaVersion: 1,
    provenance: 'DEV_ONLY_SOURCE_MODELED_MOCK',
    actualApp: true,
    viewport: session.viewport,
    commit: process.env.GITHUB_SHA ?? 'local',
    frameCount: session.frames.length,
    frames: session.frames.map(({ image: _image, ...entry }) => ({
      ...entry, file: 'frames/' + entry.id + '.png',
    })),
  }, null, 2))

  await writeFile(join(dir, 'index.html'), layout(
    session, frame => './frames/' + frame.id + '.png',
  ))

  // Generate a true single-file PNG contact sheet using the installed
  // Playwright Chromium itself — no new image processing libraries.
  const preview = await browser.newPage({ viewport: { width: 1320, height: 920 }, deviceScaleFactor: 1 })
  try {
    await preview.setContent(layout(session, frame => 'data:image/png;base64,' + frame.image.toString('base64')), {
      waitUntil: 'load', timeout: 30_000,
    })
    await preview.locator('.card img').first().waitFor({ state: 'visible' })
    const loaded = await preview.locator('.card img').evaluateAll(imgs =>
      imgs.every(img => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0))
    if (!loaded) throw new Error('S2 review sheet has unloaded or blank screenshot')
    await preview.screenshot({ path: join(dir, 'review-sheet.png'), fullPage: true, animations: 'disabled' })
  } finally {
    await preview.close()
  }
  return dir
}
