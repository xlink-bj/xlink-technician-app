import type { FormFieldOptionRead } from '@shared/ports'
import { provinceList, cityList } from './area-region-dictionary'
import { countyList } from './area-county-dictionary'

// Same pinned R1 area.js as placeOrders.vue. Only complete, source-backed
// province/city/county paths are selectable; missing branches are not invented.
const counties = new Map<string, FormFieldOptionRead[]>()
for (const [value, label] of Object.entries(countyList)) {
  const city = value.slice(0, 4) + '00', province = value.slice(0, 2) + '0000'
  if (!/^\d{6}$/.test(value) || !cityList[city] || !provinceList[province]) continue
  const children = counties.get(city) ?? []
  children.push(Object.freeze({ value, label }))
  counties.set(city, children)
}
const cities = new Map<string, FormFieldOptionRead[]>()
for (const [value, label] of Object.entries(cityList)) {
  const province = value.slice(0, 2) + '0000', children = counties.get(value)
  if (!provinceList[province] || !children?.length) continue
  const siblings = cities.get(province) ?? []
  siblings.push(Object.freeze({ value, label, children: Object.freeze(children) }))
  cities.set(province, siblings)
}
export const r1OrderAreaOptions: readonly FormFieldOptionRead[] = Object.freeze(
  Object.entries(provinceList).flatMap(([value, label]) => {
    const children = cities.get(value)
    return children?.length ? [Object.freeze({ value, label, children: Object.freeze(children) })] : []
  }),
)
