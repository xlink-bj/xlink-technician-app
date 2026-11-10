import { mockSyntheticSpecialMediaDefinitionResponse } from './fixtures'

/** Opt-in synthetic sibling rows, not captured Survey provider/configuration. */
export function duplicateFileDefinition(reverse = false) {
  const base = mockSyntheticSpecialMediaDefinitionResponse
  const file = base.data.find(row => row.name === 'inspectionFiles')!
  const note = base.data.find(row => row.name === 'inspectionNote')!
  const siblings = [
    { ...file, _id: 'mock-file-safe', frontEndConfig: { showField: 'inspectionResult', showValue: 'safe' } },
    { ...file, _id: 'mock-file-follow-up', frontEndConfig: { showField: 'inspectionResult', showValue: 'follow_up' } },
    { ...note, _id: 'mock-note-safe', frontEndConfig: { showField: 'inspectionResult', showValue: 'safe' } },
    { ...note, _id: 'mock-note-follow-up', frontEndConfig: { showField: 'inspectionResult', showValue: 'follow_up' } },
  ]
  const data = [...base.data.filter(row => row.name !== 'inspectionFiles' && row.name !== 'inspectionNote'), ...(reverse ? siblings.reverse() : siblings)]
  return { ...base, data, total: data.length }
}
