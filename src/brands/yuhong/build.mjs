// Node.js 18+, no packages. All outputs belong to the Yuhong package only.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const folder = path.dirname(fileURLToPath(import.meta.url))
const hex = /^#[\da-f]{6}$/i
const tokenKey = /^[a-z][a-z0-9-]*(?:\.[a-z0-9-]+)+$/
const varName = key => 'yh-' + key.replaceAll('.', '-')
const header = 'Generated from this package’s tokens.json by build.mjs.'
const own = (obj, key) => Object.hasOwn(obj, key)

function metricValue(key, entry) {
  if (entry.type === 'dimension' || entry.type === 'number') {
    if (!Number.isFinite(entry.value) || entry.value < 0) throw Error('Invalid metric: ' + key)
    return String(entry.value) + (entry.type === 'dimension' ? 'px' : '')
  }
  if (!['fontFamily', 'shadow'].includes(entry.type) || typeof entry.value !== 'string' ||
      !entry.value || /[;{}<>]|\/\*|(?:url|var)\s*\(|@/i.test(entry.value)) {
    throw Error('Invalid local style value: ' + key)
  }
  return entry.value
}

function rgbLuminance(value) {
  const linear = value.slice(1).match(/../g).map(channel => {
    const x = parseInt(channel, 16) / 255
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
  })
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722
}

export function build(source) {
  if (source.id !== 'yuhong-service' || source.scope !== '.yh-service') throw Error('Invalid product or scope')
  const values = new Map()
  const aliases = new Map()
  const cssLines = ['/* ' + header + ' */', '.yh-service {']
  const sassLines = ['// ' + header, '// Import with @use and an explicit Sass namespace.']
  const names = new Set()
  function declare(name, resolved, cssValue = resolved) {
    if (names.has(name)) throw Error('Duplicated CSS variable: ' + name)
    names.add(name)
    cssLines.push('  --' + name + ': ' + cssValue + ';')
    sassLines.push('$' + name + ': ' + resolved + ';')
  }
  for (const section of ['palette', 'semantic', 'metrics']) {
    for (const [key, entry] of Object.entries(source[section])) {
      if (!tokenKey.test(key) || !entry.use || !entry.state || !entry.avoid || !entry.source) throw Error('Incomplete token: ' + key)
      let value, cssValue
      if (section === 'palette') {
        if (!key.startsWith('palette.') || entry.type !== 'color' || !hex.test(entry.value)) throw Error('Invalid base color: ' + key)
        value = entry.value.toUpperCase()
      } else if (section === 'semantic') {
        const ref = /^\{(palette\.[a-z0-9.-]+)\}$/.exec(entry.value || '')?.[1]
        if (!key.startsWith('color.') || entry.type !== 'color' || !ref || !own(source.palette, ref)) throw Error('Unresolved local color alias: ' + key)
        value = values.get(ref)
        cssValue = 'var(--' + varName(ref) + ')'
        aliases.set(key, ref)
      } else {
        value = metricValue(key, entry)
      }
      values.set(key, value)
      declare(varName(key), value, cssValue)
    }
  }
  for (const [name, key] of Object.entries(source.compatibility)) {
    if (!/^yh-[a-z0-9-]+$/.test(name) || !values.has(key)) throw Error('Invalid public alias: ' + name)
    declare(name, values.get(key), 'var(--' + varName(key) + ')')
  }
  const report = ['use\tforegroundToken\tforeground\tbackgroundToken\tbackground\tratio\tminimum']
  for (const pair of source.contrastPairs) {
    const fg = values.get(pair.foreground), bg = values.get(pair.background)
    if (!aliases.has(pair.foreground) || !aliases.has(pair.background) || ![3,4.5].includes(pair.min)) throw Error('Invalid contrast pair: ' + pair.use)
    const sorted = [rgbLuminance(fg), rgbLuminance(bg)].sort((a,b) => b-a)
    const ratio = (sorted[0]+0.05) / (sorted[1]+0.05)
    if (ratio < pair.min) throw Error(pair.foreground + ' on ' + pair.background + ' measured ' + ratio.toFixed(4) + ', expected ' + pair.min)
    report.push([pair.use, pair.foreground, fg, pair.background, bg, ratio.toFixed(4), pair.min].join('\t'))
  }
  return new Map([
    ['theme.css', [...cssLines, '}',''].join('\n')],
    ['_theme.scss', [...sassLines, ''].join('\n')],
    ['contrast.tsv', [...report, ''].join('\n')]
  ])
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const args = process.argv.slice(2)
    if (args.length > 1 || (args.length === 1 && args[0] !== '--check')) throw Error('Usage: node build.mjs [--check]')
    const source = JSON.parse(fs.readFileSync(path.join(folder,'tokens.json'),'utf8'))
    const results = build(source)
    for (const [name, content] of results) {
      const file = path.join(folder, name)
      if (args[0] === '--check') {
        if (!fs.existsSync(file) || fs.readFileSync(file,'utf8') !== content) throw Error('Regenerate: ' + name)
      } else {
        fs.writeFileSync(file, content)
      }
    }
    console.log('Yuhong · ' + source.contrastPairs.length + ' contrast pairs · ' + results.size + ' local outputs checked')
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
