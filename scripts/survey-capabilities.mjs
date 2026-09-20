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

function optionalNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : undefined
}

function effectiveVisibility(field) {
  const config = object(field.frontEndConfig)
  const directShowField = optionalNonEmptyString(field.showField)
  const configShowField = optionalNonEmptyString(config?.showField)
  const showField = directShowField ?? configShowField
  const showType = field.showType ?? config?.showType
  const configExts = object(config?.exts)
  const candidates = configShowField
    ? [
        { value: config?.showValue, source: 'frontEndConfig.showValue' },
      ]
    : [
        { value: field.showValue, source: 'showValue' },
        { value: field.extsShowValue, source: 'extsShowValue' },
        { value: config?.showValue, source: 'frontEndConfig.showValue' },
        { value: configExts?.showValue, source: 'frontEndConfig.exts.showValue' },
      ]
  const selected = candidates.find(({ value }) =>
    value !== undefined
    && value !== null
    && !(typeof value === 'string' && value.trim().length === 0),
  )
  return {
    showField,
    showType,
    showValue: selected?.value,
    showValueSource: selected?.source,
  }
}

function visibility(field) {
  const effective = effectiveVisibility(field)
  if (!effective.showField) return '无条件显示（以 showList 适用性为前提）'
  const showValue = effective.showValue === undefined ? '未记录' : JSON.stringify(effective.showValue)
  const source = effective.showValueSource ?? '未记录'
  return `条件元数据：showType=${String(effective.showType ?? '未记录')}，showField=${effective.showField}，effectiveShowValue=${showValue}（来源：${source}）`
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
      'Generic media picker + durable MediaUploadQueuePort + explicit form save',
      'INCLUDED_IF_UPLOADED',
      'Survey-specific media contract and weak-network behavior are incomplete',
      mediaNote,
    )
  }

  if (field.valueKey === 'leakageCauseSelect' || field.valueKey === 'leakageCause') {
    const trigger = field.valueKey === 'leakageCauseSelect'
    return common(
      field,
      'CUSTOM_EXPERIENCE',
      'SUPPORTED',
      'Survey Leakage Cause Experience controlled tree selection',
      trigger ? 'EXCLUDED' : 'INCLUDED',
      undefined,
      trigger
        ? 'Trigger/display field only; opens the controlled tree and is not persisted.'
        : 'The full provider result remains grouped and selectable; current part only prioritizes the default group. Values persist as a List<String> of leakageCause identifiers; hidden-to-visible transitions preserve values and visible-to-hidden transitions clear them.',
    )
  }

  if (field.valueKey === 'serviceGoods') {
    return common(
      field,
      'CUSTOM_EXPERIENCE',
      'DEFERRED',
      'Not rendered; Product decision defers the legacy recommendation field',
      'EXCLUDED',
      undefined,
      'Historical recommendation capability only; production use is not proven and it is non-blocking for G4-E.',
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
    '- `SUPPORTED` 表示当前 Runtime 有可验证的安全路径；`PARTIAL` 表示已有部分通路但不能宣称 Survey 能力完成；`DEFERRED` 表示产品明确暂不实现且不阻塞当前 Gate；`UNKNOWN` 继续 fail-closed。',
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
    '媒体字段目前是 `MEDIA_INPUT / PARTIAL`，不是完成态。普通媒体先进入通用 `MediaUploadQueuePort`，本地资产持久化后才允许上传，确认获得远端引用后才进入表单值；表单保存和 workflow completion 仍是独立操作。字段级证据和边界见 `docs/verification/G4E_SURVEY_MEDIA_CONTRACT.md` 与 `docs/verification/G4E_SURVEY_MEDIA_P0.md`；`surveyDrawing` 的 R1 `surveyTool`、普通照片的拍照水印/定位、红外照片、除霉前后照片、设备重启 smoke 和服务端幂等性仍未完成。', '',
    '### leakageCause', '',
    '`leakageCauseSelect` 与 `leakageCause` 是同一业务交互的触发/持久化两层，不是两个普通独立字段。当前由 Survey 专属 Experience 接管：provider 使用 `biz/extForm/queryByColName/leakageCause`，完整保留所有 `part` 分组，子项 ID 使用 `leakageCause`，保存值为 `List<String>`；当前维修部位只用于默认分组优先展示，用户仍可切换并选择其他分组。触发字段不提交，值字段参与提交；可见到可见的维修部位切换保持值，可见到隐藏时清空本地值。', '',
    '### serviceGoods / projPackage', '',
    '`serviceGoods / projPackage` 已由产品决策标记为 LEGACY / DEFERRED / NON-BLOCKING：保留历史证据，不进入新 App Runtime，不阻塞 G4-E；只有新的生产/业务证据才能重新激活。', '',
    '## 来源与下一步', '',
    '- 机器来源：`contracts/beta/survey/historical.json`，semantic identity 为 `all_extfield_rows_colName_survey`。',
    '- R1 参考：`xlink-app/business_jishi/subpackages2/inspectionAppointment/inspectionAppointment.vue`。',
    '- Backend 参考：`Survey.java`、`ExtFormServiceImpl.java`、`BackFileController.java`、`ImageController.java`。',
    '- 本 slice 不实现真实 Survey 写入、workflow completion、真实上传、服务端 watermark 写入或 projPackage provider；本地媒体队列是通用基础设施，真实平台重启 smoke、LBS/report queue 与 uploadAddLogo 仍为 PARTIAL/DEFERRED。',
    '',
  )
  return `${lines.join('\n')}\n`
}
