import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'

describe('source and stylesheet census accounting', () => {
  it('includes styles in the reported application total', () => {
    const output = execFileSync(
      process.execPath,
      ['scripts/quality-census.mjs'],
      { cwd: process.cwd(), encoding: 'utf8', timeout: 15000 },
    )
    const report = JSON.parse(output.trim()) as {
      sourceLines: number
      styleLines: number
      applicationLinesIncludingStyles: number
    }
    expect(report.applicationLinesIncludingStyles).toBe(
      report.sourceLines + report.styleLines,
    )
  })
})
