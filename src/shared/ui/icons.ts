export type AppIconName =
  | 'search'
  | 'location'
  | 'phone'
  | 'task'
  | 'contact'
  | 'image'
  | 'appointment'
  | 'order'
  | 'complete'
  | 'unavailable'

const appIconTypeByName: Readonly<Record<AppIconName, string>> = {
  search: 'search',
  location: 'location-filled',
  phone: 'phone-filled',
  task: 'list',
  contact: 'contact-filled',
  image: 'image',
  appointment: 'calendar-filled',
  order: 'compose',
  complete: 'checkmarkempty',
  unavailable: 'minus',
}

export function appIconTypeFor(name: AppIconName): string {
  return appIconTypeByName[name]
}
