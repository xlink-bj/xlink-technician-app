const fail = (): never => { throw Error('R1 field option binding or provider response is unverified') }

/** CodeServiceImpl.selectCodeNew returns JSON text. Some transports decode it
 * to an array. Reject duplicate JSON keys before JSON.parse can erase them. */
export function decodeR1ScopedJson(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw
  if (raw.length > 2_000_000) return fail()
  const stack: Array<Set<string> | null> = []
  const stringToken = /"(?:[^"\\\u0000-\u001f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"/y
  for (let i = 0; i < raw.length; i++) {
    const char = raw[i]
    if (char === '"') {
      stringToken.lastIndex = i
      const match = stringToken.exec(raw)
      if (!match) return fail()
      i = stringToken.lastIndex - 1
      let next = i + 1
      while (/\s/.test(raw[next] ?? '') && next < raw.length) next++
      if (raw[next] === ':') {
        const keys = stack[stack.length - 1], key = JSON.parse(match[0]) as string
        if (!keys || keys.has(key)) return fail()
        keys.add(key)
      }
    } else if (char === '{' || char === '[') {
      stack.push(char === '{' ? new Set() : null)
      if (stack.length > 48) return fail()
    } else if (char === '}' || char === ']') stack.pop()
  }
  try { return JSON.parse(raw) as unknown } catch { return fail() }
}

