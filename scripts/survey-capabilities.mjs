import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

export const contractFile = resolve(fileURLToPath(new URL('../contracts/beta/survey/historical.json', import.meta.url)))
export const inventoryFile = resolve(fileURLToPath(new URL('../contracts/beta/survey/capabilities.json', import.meta.url)))
export const matrixFile = resolve(fileURLToPath(new URL('../docs/verification/G4E_SURVEY_CAPABILITY_MATRIX.md', import.meta.url)))

const MOBILE_DETAIL = '4'
const MEDIA_KEYS = new Set([
  'surveyDrawing',
  ...Array.from({ length: 20 }, (_, index) => `images${index + 1}`),
  'infraredImageList',
  'beforeMoldRemoval',
  'afterMoldRemoval',
])

function visibility(field) {
  if (!field.showField) return '无条件显示（以 showList 适用性为前提）'
  return `条件元数据：showType=${String(field.showType ?? '未记录')}，showField=${field.showField}，showValue=${JSON.stringify(field.showValue ?? '')}`
}

function common(field, capabilityClass, implementationStatus, renderer, submissionMode, blocker, notes) {
  return {
    fieldId: field.fieldId,
    valueKey: field.valueKey,
    label: field.label,
    type: field.type,
    required: field.required,
    mobileApplicable: field.showList.map(String).includes(MOBILE_DETAIL),
    conditionalVisibility: visibility(field),
    provider: field.valueOption ?? null,
    capabilityClass,
    currentRenderer: renderer,
    implementationStatus,
    submissionMode,
    ...(blocker ? { blocker } : {}),
    notes,
  }
}

function classify(field) {
  if (field.type === 'gap') {
    return common(
      field,
      'PRESENTATION_ONLY',
      'SUPPORTED',
      'Dynamic Form Runtime presentation divider; no input control',
      'EXCLUDED',
      undefined,
      'Backend type=gap is structural. It remains visible when applicable and its condition is true.',
    )
  }

  if (field.valueKey === 'part') {
    return common(
      field,
      'OPTION_INPUT',
      'SUPPORTED',
      'AppCascadeSelector through verified parts provider',
      'INCLUDED',
      undefined,
      'R1 groups later conditional fields by the selected repair part; field-row identity remains separate from valueKey.',
    )
  }

  if (field.valueKey === 'isMoldRemoved') {
    return common(
      field,
      'OPTION_INPUT',
      'SUPPORTED',
      'AppChoiceGroup through verified IS code provider',
      'INCLUDED',
      undefined,
      'The historical contract proves the IS provider options; no mold workflow semantics are added here.',
    )
  }

  if (MEDIA_KEYS.has(field.valueKey)) {
    const mediaNote = field.valueKey === 'surveyDrawing'
      ? 'R1 marks this field with surveyTool behavior; the new generic upload path is not equivalent to the drawing tool.'
      : field.valueKey === 'infraredImageList'
        ? 'Backend stores a media list and R1 treats infrared photos as a distinct field; capture/location semantics remain unverified.'
        : field.valueKey === 'beforeMoldRemoval' || field.valueKey === 'afterMoldRemoval'
          ? 'Mold-photo meaning is evidenced by field labels, but the complete save/weak-network contract is not verified.'
          : 'R1 uses the shared upload path, but max-count, 18-photo aggregate rule, camera watermark and persistence semantics are not portable yet.'
    return common(
      field,
      'MEDIA_INPUT',
      'PARTIAL',
      'Generic AppButton media picker + immediate upload',
      'INCLUDED_IF_UPLOADED',
      'Survey-specific media contract and weak-network behavior are incomplete',
      mediaNote,
    )
  }

  if (field.valueKey === 'leakageCauseSelect' || field.valueKey === 'leakageCause') {
    return common(
      field,
      'CUSTOM_EXPERIENCE',
      'UNKNOWN',
      'Not rendered as a safe generic control; Runtime blocks unresolved semantics',
      'BLOCKED',
      'R1 proves a coupled repair-part tree interaction, but the provider/value shape and reset semantics are not yet a new-App contract',
      field.valueKey === 'leakageCauseSelect'
        ? 'Trigger/display field for the coupled leakageCause selection flow; not an independent scalar select.'
        : 'Persisted Survey field is a list of selected leakage-cause identifiers; the source tree is queried separately.',
    )
  }

  if (field.valueKey === 'serviceGoods') {
    return common(
      field,
      'CUSTOM_EXPERIENCE',
      'UNKNOWN',
      'Not rendered; Runtime blocks unresolved bizSelect provider',
      'BLOCKED',
      'projPackage Survey-stage query and downstream quotation relationship are not verified for the new Runtime',
      'R1 filters recommendations by serviceType, sourceType and repairPart; this is recommended service product data, not proven quotation pricing.',
    )
  }

  if (field.type === 'text' || field.type === 'digit') {
    return common(
      field,
      'GENERIC_INPUT',
      'SUPPORTED',
      field.type === 'digit' ? 'AppInput with Runtime decimal normalization' : 'AppInput',
      'INCLUDED',
      undefined,
      field.type === 'digit'
        ? 'Backend Survey measurement properties are numeric and R1 uses decimal-compatible inputs; no new measurement rule is inferred.'
        : 'Scalar text is normalized by the generic Dynamic Form Runtime.',
    )
  }

  return common(
    field,
    'UNSUPPORTED_UNKNOWN',
    'UNKNOWN',
    'Not rendered; Runtime blocks unknown semantics',
    'BLOCKED',
    `No verified renderer contract for backend type=${field.type}`,
    'Fail-closed until R1 and backend evidence support a typed control.',
  )
}

export async function readSurveyContract() {
  return JSON.parse(await readFile(contractFile, 'utf8'))
}

export function buildSurveyCapabilityInventory(contract) {
  const mobileFields = contract.fieldRows.filter((field) => field.showList.map(String).includes(MOBILE_DETAIL))
  return {
    schemaVersion: 1,
    source: {
      contract: 'contracts/beta/survey/historical.json',
      fingerprint: contract.fingerprint,
      semanticIdentity: contract.semanticIdentity,
      surface: 'mobile_detail',
      showListCode: MOBILE_DETAIL,
    },
    historicalFieldCount: contract.fieldRows.length,
    mobileDetailFieldCount: mobileFields.length,
    classifiedFieldCount: mobileFields.length,
    capabilities: mobileFields.map(classify),
  }
}

function markdownCell(value) {
  return String(value ?? '—').replaceAll('|', '\\|').replaceAll('\n', '<br>')
}

export function buildSurveyCapabilityMatrixMarkdown(inventory) {
  const counts = new Map()
  for (const row of inventory.capabilities) counts.set(row.capabilityClass, (counts.get(row.capabilityClass) ?? 0) + 1)
  const countText = [...counts.entries()].map(([key, count]) => `${key}: ${count}`).join('； ')
  const lines = [
    '# G4-E Survey Capability Matrix',
    '',
    '本矩阵是 G4-E 当前 Survey（勘查）移动端详情面的能力边界，不是 InspectionAppointment（巡检）或报价单的字段字典。它从 `contracts/beta/survey/historical.json` 的 61 行历史 Beta 合同派生，当前 `showList` 包含 `4` 的 45 行全部列出。',
    '',
    '## 判定原则',
    '',
    '- R1 负责业务交互行为，Backend Java 负责持久化/API 类型，R2 只负责视觉/信息架构参考。',
    '- `PRESENTATION_ONLY`、隐藏/不适用、条件隐藏和 `UNSUPPORTED_UNKNOWN` 是不同状态。',
    '- `SUPPORTED` 表示当前 Runtime 有可验证的安全路径；`PARTIAL` 表示已有部分通路但不能宣称 Survey 能力完成；`UNKNOWN` 继续 fail-closed。',
    `- 当前类别统计：${countText}。`,
    '',
    '## 45 个移动端详情字段',
    '',
    '| fieldId | valueKey | 中文标签 | backend type | required | 条件显示 | provider/valueOption | 当前 renderer / capability | target class | submission | status | evidence / notes |',
    '|---|---|---|---|---:|---|---|---|---|---|---|---|',
  ]
  for (const row of inventory.capabilities) {
    lines.push(`| ${row.fieldId} | ${row.valueKey} | ${row.label} | ${row.type} | ${row.required ? '是' : '否'} | ${markdownCell(row.conditionalVisibility)} | ${row.provider ?? '无'} | ${markdownCell(row.currentRenderer)} | ${row.capabilityClass} | ${row.submissionMode} | ${row.implementationStatus} | ${markdownCell(`${row.blocker ? `${row.blocker}；` : ''}${row.notes}`)} |`)
  }
  lines.push('', '## 重点结论', '',
    '### gap / 分隔槽', '',
    '`type=gap` 已由 Dynamic Form Runtime 识别为 `PRESENTATION_ONLY`。适用且条件可见时渲染为 restrained divider；不可编辑、不进入 submission、不产生 unsupported warning、不阻塞校验。', '',
    '### Survey Media', '',
    '媒体字段目前是 `MEDIA_INPUT / PARTIAL`，不是完成态。`surveyDrawing` 的 R1 `surveyTool`、普通照片的拍照水印/定位、红外照片、除霉前后照片、数量限制、保存时序和弱网恢复仍需单独证据。', '',
    '### leakageCause', '',
    '`leakageCauseSelect` 与 `leakageCause` 是同一业务交互的触发/持久化两层，不是两个普通独立字段。R1 证明了按维修部位分组的树形选择与 `leakageCause[]`，但新 Runtime 的 provider、清理和提交契约尚未完成，因此继续阻断。', '',
    '### serviceGoods / projPackage', '',
    '当前只称为“推荐服务商品”。R1 查询使用 `serviceType`、`sourceType`、维修部位过滤 `biz/projPackage/queryWithRank`；未证明它等于报价套餐、报价金额或最终报价输入，因此不实现 provider。', '',
    '## 来源与下一步', '',
    '- 机器来源：`contracts/beta/survey/historical.json`，semantic identity 为 `all_extfield_rows_colName_survey`。',
    '- R1 参考：`xlink-app/business_jishi/subpackages2/inspectionAppointment/inspectionAppointment.vue`。',
    '- Backend 参考：`Survey.java`、`ExtFormServiceImpl.java`、`BackFileController.java`、`ImageController.java`。',
    '- 本 slice 不实现真实 Survey 写入、workflow completion、离线上传队列、LBS、watermark、leakageCause UX 或 projPackage provider。',
    '',
  )
  return `${lines.join('\n')}\n`
}
