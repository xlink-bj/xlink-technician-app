import type { R1NodeFormsSnapshot } from '@features/work-orders/r1-node-forms-read'
import { supportsSurveyConditionalCreate } from '@features/work-orders/r1-survey-conditional-create'
import { surveyHeightConditionIssue } from '@adapters/api/read-models/survey-height-condition'

/** Private reader issuance only. The returned string is kept inside the reader;
 * a caller-supplied snapshot/boolean cannot establish a typed route. */
export function conditionalSurveySourceSeal(snapshot: R1NodeFormsSnapshot,
  ext: Readonly<Record<string, unknown>>, fields: readonly Readonly<Record<string, unknown>>[], tenantId: string): string | undefined {
  if (!supportsSurveyConditionalCreate(snapshot) || fields.length !== 6
    || ext._id !== snapshot.definition.id || ext.tenantId !== tenantId || ext.state !== 1
    || ext.type !== '1' || ext.colName !== 'survey'
    || ['id', 'extId', 'definitionId', 'formDefinitionId'].some(k => Object.hasOwn(ext, k) && ext[k] !== snapshot.definition.id)
    || (Object.hasOwn(ext, 'collectionName') && ext.collectionName !== '' && ext.collectionName !== 'survey')
    || fields.some(f => f.extId !== snapshot.definition.id || f.tenantId !== tenantId || f.state !== 1 || f.colName !== 'survey'
      || (Object.hasOwn(f, 'collectionName') && f.collectionName !== '' && f.collectionName !== 'survey')
      || !snapshot.definition.fields!.some(mapped => mapped.fieldId === f._id && mapped.valueKey === f.name && mapped.type === f.type))
    || fields.find(f => f.name === 'part')?.valueOption !== 'parts'
    || fields.some(f => surveyHeightConditionIssue(f))) return undefined
  return JSON.stringify([tenantId, ext, fields])
}
