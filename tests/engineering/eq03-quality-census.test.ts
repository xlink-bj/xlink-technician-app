import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'

describe('EQ03 measurable quality gate — source and stylesheet census', () => {
  it('reports style LOC separately so splitting a Vue SFC cannot fake a decrease in code size', () => {
    const output = execFileSync(
      process.execPath,
      ['scripts/eq01-quality-census.mjs', '--check'],
      { cwd: process.cwd(), encoding: 'utf8', timeout: 15000 },
    )
    const report = JSON.parse(output.trim()) as {
      sourceFiles: number
      sourceLines: number
      styleFiles: number
      styleLines: number
      applicationLinesIncludingStyles: number
      testFiles: number
      staticContractFiles: number
      staticAssertions: number
      note: string
    }
    expect(report.sourceFiles).toBeGreaterThan(150)
    expect(report.styleFiles).toBeGreaterThan(0)
    expect(report.styleLines).toBeGreaterThan(1000)
    expect(report.applicationLinesIncludingStyles).toBe(
      report.sourceLines + report.styleLines,
    )
    expect(report.testFiles).toBeGreaterThan(100)
    expect(report.staticContractFiles).toBeGreaterThan(0)
    expect(report.staticAssertions).toBeGreaterThan(0)
    expect(report.note).toContain('NOT behavior, mutation or branch coverage')
  })
})
