import {
  buildOrderExtFieldRequestBody,
  isAllowedOrderExtFieldTarget,
  ORDER_EXTFIELD_ROUTE,
  sanitizeOrderExtFieldPage,
} from './lib/g4f-order-extfield-shape.mjs'

const NETWORK_AUTHORIZATION_FLAG = '--authorize-bounded-prod-read'
const PREFLIGHT_FLAG = '--preflight-only'
const MAX_RESPONSE_BYTES = 1_000_000
const rawArgs = process.argv.slice(2)
const args = rawArgs[0] === '--' ? rawArgs.slice(1) : rawArgs

function output(value, exitCode = 0) {
  process.stdout.write(`${JSON.stringify(value)}\n`)
  process.exitCode = exitCode
}

async function readBoundedJson(response) {
  if (!response.body) return { ok: false, reason: 'EMPTY_RESPONSE_BODY' }
  const reader = response.body.getReader()
  const chunks = []
  let byteCount = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      byteCount += value.byteLength
      if (byteCount > MAX_RESPONSE_BYTES) {
        await reader.cancel()
        return { ok: false, reason: 'RESPONSE_TOO_LARGE' }
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(byteCount)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) }
  } catch {
    return { ok: false, reason: 'INVALID_JSON' }
  }
}

function readPreflight() {
  const target = process.env.XLINK_SCHEMA_API_BASE_URL
  const sessionRef = process.env.XLINK_SCHEMA_SESSION_REF
  return {
    targetAllowed: isAllowedOrderExtFieldTarget(target),
    existingSessionPresent: typeof sessionRef === 'string' && /^[A-Za-z0-9._~-]{1,512}$/.test(sessionRef),
    existingSessionVerified: process.env.XLINK_SCHEMA_EXISTING_SESSION_VERIFIED === 'true',
    noLoginPath: true,
    routeFixed: ORDER_EXTFIELD_ROUTE === 'biz/extField/query',
    maxRows: 50,
    pageCount: 1,
    allFlagOmitted: !Object.hasOwn(buildOrderExtFieldRequestBody(), '_all'),
  }
}

const hasInvalidArgs = args.some((arg) => ![NETWORK_AUTHORIZATION_FLAG, PREFLIGHT_FLAG].includes(arg))
  || args.includes('--')
  || args.filter((arg) => arg === NETWORK_AUTHORIZATION_FLAG).length > 1
  || args.filter((arg) => arg === PREFLIGHT_FLAG).length > 1
  || args.includes(NETWORK_AUTHORIZATION_FLAG) && args.includes(PREFLIGHT_FLAG)

if (hasInvalidArgs) {
  output({ status: 'BLOCKED_INVALID_ARGUMENTS', requests: 0 }, 2)
} else if (args.includes(PREFLIGHT_FLAG)) {
  const preflight = readPreflight()
  const preflightPassed = preflight.targetAllowed && preflight.existingSessionPresent && preflight.existingSessionVerified
  output({ status: preflightPassed ? 'PREFLIGHT_PASS' : 'BLOCKED_ENV', preflight, requests: 0 }, preflightPassed ? 0 : 1)
} else if (!args.includes(NETWORK_AUTHORIZATION_FLAG)) {
  output({
    status: 'NO_NETWORK_DEFAULT',
    requests: 0,
    hint: 'Use --preflight-only for zero-network checks; a separate explicit authorization flag is required for the single bounded read.',
  })
} else {
  const target = process.env.XLINK_SCHEMA_API_BASE_URL
  const sessionRef = process.env.XLINK_SCHEMA_SESSION_REF
  const preflight = readPreflight()
  const preflightPassed = preflight.targetAllowed && preflight.existingSessionPresent && preflight.existingSessionVerified
  if (!preflightPassed) {
    output({ status: 'BLOCKED_ENV', preflight, requests: 0 }, 1)
  } else {
    let requests = 0
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    try {
      const endpoint = new URL(ORDER_EXTFIELD_ROUTE, `${target.replace(/\/+$/, '')}/`)
      const body = new URLSearchParams(buildOrderExtFieldRequestBody())
      requests += 1
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          Cookie: `JSESSIONID=${sessionRef}`,
          Accept: 'application/json',
        },
        body,
        redirect: 'error',
        signal: controller.signal,
      })

      if (!response.ok) {
        output({ status: 'READ_FAILED', category: `HTTP_${response.status}`, requests }, 1)
      } else {
        const parsedPayload = await readBoundedJson(response)
        if (!parsedPayload.ok) {
          output({ status: 'READ_FAILED', category: parsedPayload.reason, requests }, 1)
        } else {
          const summary = sanitizeOrderExtFieldPage(parsedPayload.value)
          if (!summary.ok) {
            output({ status: 'READ_FAILED', category: summary.reason, requests }, 1)
          } else {
            output({ status: summary.truncated ? 'SHAPE_READ_TRUNCATED_ONE_PAGE' : 'SHAPE_READ_COMPLETE', requests, summary })
          }
        }
      }
    } catch {
      output({ status: 'OUTCOME_UNKNOWN_NO_RETRY', requests })
      process.exitCode = 1
    } finally {
      clearTimeout(timeout)
    }
  }
}
