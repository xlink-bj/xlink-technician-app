export type AppIconName =
  | 'search'
  | 'refresh'
  | 'location'
  | 'home'
  | 'phone'
  | 'task'
  | 'contact'
  | 'image'
  | 'appointment'
  | 'order'
  | 'complete'
  | 'restore'
  | 'warning'
  | 'notification'
  | 'unavailable'
  | 'chevron-right'

const appIconTypeByName: Readonly<Record<AppIconName, string>> = {
  search: 'search',
  refresh: 'refresh',
  location: 'location-filled',
  home: 'home-filled',
  phone: 'phone-filled',
  task: 'list',
  contact: 'contact-filled',
  image: 'image',
  appointment: 'calendar-filled',
  order: 'compose',
  complete: 'checkmarkempty',
  restore: 'undo',
  warning: 'info-filled',
  notification: 'notification',
  unavailable: 'minus',
  'chevron-right': 'forward',
}

export function appIconTypeFor(name: AppIconName): string {
  return appIconTypeByName[name]
}
