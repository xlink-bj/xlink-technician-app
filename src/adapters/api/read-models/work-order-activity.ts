import type { WorkOrderActivity } from '@shared/ports'
import { optionalRecord, optionalString, type AdapterRecord } from '../../common/records'

// Historical activity event labels remain adapter-owned; status is never used as business authorization.

type ActivityTypeCode = 1 | 2 | 3 | 4 | 5 | 6

const activityTypeMeta: Readonly<Record<ActivityTypeCode, { title: string; titleFromName?: boolean; icon: WorkOrderActivity['icon']; tone: WorkOrderActivity['tone']; badge: string }>> = {
  1: { title: '跟进笔记', icon: 'task', tone: 'blue', badge: '笔记' },
  2: { title: '系统记录', titleFromName: true, icon: 'complete', tone: 'gray', badge: '系统' },
  3: { title: '通话记录', icon: 'phone', tone: 'blue', badge: '电话' },
  4: { title: '施工日志', icon: 'location', tone: 'green', badge: '施工' },
  5: { title: '调度记录', icon: 'task', tone: 'orange', badge: '调度' },
  6: { title: '跟进记录', icon: 'task', tone: 'blue', badge: '跟进' },
}

function activityDisplayTime(value: string | undefined): string {
  const time = value?.trim() ?? ''
  if (!time) return '—'

  const dateTime = time.match(/^(\d{4}[-/]\d{1,2}[-/]\d{1,2})\s+(\d{1,2}:\d{2})(?::\d{2})?/)
  if (dateTime) return `${dateTime[1]} ${dateTime[2]}`

  const iso = time.match(/^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2})(?::\d{2})?/)
  if (iso) return `${iso[1]} ${iso[2]}`

  return time.replace(/(\d{1,2}:\d{2}):\d{2}\b/, '$1')
}

function activityRows(raw: unknown): AdapterRecord[] {
  const envelope = optionalRecord(raw)
  if (!envelope) return []
  const responseStatus = optionalString(envelope, ['status'])
  if (responseStatus && responseStatus !== '1') return []

  let data: unknown = envelope.data
  if (typeof data === 'string' && data.trim()) {
    try {
      data = JSON.parse(data)
    } catch {
      return []
    }
  }
  if (!Array.isArray(data)) return []
  return data.map(optionalRecord).filter((row): row is AdapterRecord => Boolean(row))
}

function activityPresentation(
  type: ActivityTypeCode,
  title: string,
  content: string,
): Pick<WorkOrderActivity, 'icon' | 'tone' | 'badge'> {
  const base = activityTypeMeta[type]
  const text = `${title} ${content}`.toLocaleLowerCase()
  const failed = /失败|未成功|错误|异常|error/i.test(text)
  const success = /成功|完成/.test(text) && !failed

  if (failed) return { icon: 'unavailable', tone: 'red', badge: base.badge }
  if (/语音|电话|通话|呼叫/.test(text)) {
    return { icon: 'phone', tone: success ? 'green' : 'blue', badge: base.badge }
  }
  if (/施工|上门|现场|交底|勘察/.test(text)) {
    return { icon: 'location', tone: success ? 'green' : 'orange', badge: base.badge }
  }
  if (/分派|调度|派单|工队/.test(text)) {
    return { icon: 'task', tone: success ? 'green' : 'orange', badge: base.badge }
  }
  if (/接单|处理|流转|节点|工程师/.test(text)) {
    return { icon: 'task', tone: success ? 'green' : 'blue', badge: base.badge }
  }
  if (success) return { icon: 'complete', tone: 'green', badge: base.badge }
  return { icon: base.icon, tone: base.tone, badge: base.badge }
}

function activitySortKey(row: AdapterRecord): string {
  return optionalString(row, ['sortTime', 'createTime', 'time'])?.trim() ?? ''
}

function mapActivityRow(row: AdapterRecord): WorkOrderActivity | null {
  const typeValue = optionalString(row, ['type'])
  const typeNumber = typeValue ? Number.parseInt(typeValue, 10) : Number.NaN
  if (!Number.isInteger(typeNumber) || typeNumber < 1 || typeNumber > 6) return null

  const type = typeNumber as ActivityTypeCode
  const meta = activityTypeMeta[type]
  const name = optionalString(row, ['name'])?.trim() ?? ''
  const title = meta.titleFromName && name ? name : meta.title
  const content = optionalString(row, ['content', 'data'])?.trim() ?? ''
  const time = activityDisplayTime(optionalString(row, ['createTime', 'time']))
  const id = optionalString(row, ['typeId', 'id', '_id'])?.trim() ?? `${type}-${time}`
  const present = activityPresentation(type, title, content)

  return {
    id,
    title,
    content,
    owner: optionalString(row, ['createUserName', 'owner'])?.trim() ?? '—',
    time,
    icon: present.icon,
    tone: present.tone,
    badge: present.badge,
  }
}

export function workOrderActivities(raw: unknown): readonly WorkOrderActivity[] {
  const rows = activityRows(raw)
    .sort((left, right) => activitySortKey(right).localeCompare(activitySortKey(left)))
  const activities: WorkOrderActivity[] = []
  for (const row of rows) {
    const activity = mapActivityRow(row)
    if (activity) activities.push(activity)
  }
  return activities
}

