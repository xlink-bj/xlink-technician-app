import type { AppIconName } from '@shared/ui/icons'

export type WorkOrderCardTone = 'blue' | 'red' | 'orange' | 'purple' | 'green' | 'gray'

const exactToneByTaskLabel: Readonly<Record<string, WorkOrderCardTone>> = {
  待接单: 'blue',
  待预约: 'orange',
  联系客户: 'red',
  预约上门: 'orange',
  上门服务: 'orange',
  上门跟进: 'orange',
  跟进签约: 'orange',
  跟进方案: 'purple',
  待下单: 'purple',
  待确认: 'purple',
  暂不上门: 'gray',
  验收回款: 'green',
  已完工: 'green',
  待评价: 'green',
  跟进超时: 'red',
  现场服务: 'orange',
}

export function workOrderCardToneFor(taskLabel?: string): WorkOrderCardTone {
  const value = taskLabel?.trim() ?? ''
  const exact = exactToneByTaskLabel[value]
  if (exact) return exact
  if (value.includes('联系') || value.includes('超时')) return 'red'
  if (value.includes('验收') || value.includes('完工') || value.includes('回款')) return 'green'
  if (value.includes('方案') || value.includes('下单') || value.includes('确认')) return 'purple'
  if (value.includes('上门') || value.includes('签约') || value.includes('现场')) return 'orange'
  return 'blue'
}

export function workOrderCardIconFor(taskLabel?: string): AppIconName {
  switch (workOrderCardToneFor(taskLabel)) {
    case 'red':
      return 'contact'
    case 'orange':
      return 'appointment'
    case 'purple':
      return 'order'
    case 'green':
      return 'complete'
    case 'gray':
      return 'unavailable'
    default:
      return 'task'
  }
}

const workOrderCardIconColorByTone: Readonly<Record<WorkOrderCardTone, string>> = {
  blue: '#2878f2',
  red: '#f06445',
  orange: '#ff941f',
  purple: '#8a69e8',
  green: '#35b978',
  gray: '#8d99aa',
}

export function workOrderCardIconColorFor(taskLabel?: string): string {
  return workOrderCardIconColorByTone[workOrderCardToneFor(taskLabel)]
}
