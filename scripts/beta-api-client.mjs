#!/usr/bin/env node

/**
 * Small, read-only Beta API client for local contract discovery.
 *
 * The login response contains the opaque JSESSIONID in data.token. The token
 * is returned to the caller for in-process use only; this module never writes
 * it to disk or prints it.
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_BETA_API_BASE_URL = 'https://xlinkbeta.fsgo365.cn/fsgo/wm'
const DEFAULT_BETA_TENANT_ID = '1340835581184723420'
const DEFAULT_BETA_CODE = '999999'
const BETA_HOST = 'xlinkbeta.fsgo365.cn'

const ALLOWED_BETA_READ_PATHS = [
  /^index\/phoneLogin\.do$/,
  /^basic\/serviceAppointment\/querySAWorkflowNode$/,
  /^basic\/serviceAppointment\/queryById\/[^/]+$/,
  /^workflow\/queryNode\/[^/]+$/,
  /^workflowDef\/queryById\/[^/]+$/,
  /^basic\/order\/clearOrderFieldQuery$/,
  /^basic\/order\/queryById$/,
  /^biz\/extField\/query$/,
  /^biz\/extForm\/query\/[^/]+$/,
  /^i\/code\/selectCode\.do$/,
  /^i\/code\/selectMultistageCode\.do$/,
  /^biz\/projPackage\/queryWithRank$/,
  /^biz\/projPackage\/findById\/[^/]+$/,
  /^biz\/procedure\/queryWithRank$/,
  /^basic\/material\/queryWithRank$/,
  /^basic\/material\/query$/,
  /^biz\/measure\/queryWithRank$/,
  /^biz\/extForm\/queryByColName\/inspectionSOP$/,
]

export class BetaApiClientError extends Error {
  constructor(message, code = 'beta_api_failed') {
    super(message)
    this.name = 'BetaApiClientError'
    this.code = code
  }
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function endpoint(baseUrl, path) {
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

function formBody(body) {
  return new URLSearchParams(
    Object.entries(body).map(([key, value]) => [key, String(value)]),
  ).toString()
}

function isSuccessful(value) {
  return value === true || value === 1 || value === '1' || value === 'true'
}

function fetchFunction(fetchImpl) {
  const implementation = fetchImpl ?? globalThis.fetch
  if (typeof implementation !== 'function') {
    throw new BetaApiClientError('Node fetch is unavailable', 'runtime_unavailable')
  }
  return implementation
}

function timeoutSignal(timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return { controller, timer }
}

function normalizedTimeout(value) {
  return Number.isFinite(value) && value > 0 ? value : 15_000
}

export function assertAllowedBetaReadPath(path) {
  const normalized = String(path ?? '').replace(/^\/+/, '')
  const segments = normalized.split('/')
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new BetaApiClientError(
      'Beta contract inspection route is not allowlisted',
      'route_not_allowed',
    )
  }
  if (ALLOWED_BETA_READ_PATHS.some((pattern) => pattern.test(normalized))) return normalized
  throw new BetaApiClientError(
    'Beta contract inspection route is not allowlisted',
    'route_not_allowed',
  )
}

function parseLocalEnv(filePath) {
  let source
  try {
    source = readFileSync(filePath, 'utf8')
  } catch {
    return {}
  }
  const values = {}
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/)
    if (!match) continue
    let value = match[2].trim()
    if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
      value = value.slice(1, -1)
    }
    values[match[1]] = value
  }
  return values
}

function localRuntimeEnv() {
  const localEnvPath = resolve(dirname(fileURLToPath(import.meta.url)), '../.env.local')
  return { ...parseLocalEnv(localEnvPath), ...process.env }
}

async function requestJson(options, path, body) {
  const allowedPath = assertAllowedBetaReadPath(path)
  const request = fetchFunction(options.fetchImpl)
  const { controller, timer } = timeoutSignal(normalizedTimeout(options.timeoutMs))
  try {
    const response = await request(endpoint(options.apiBaseUrl, allowedPath), {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/plain, */*',
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        ...(options.sessionRef ? { Cookie: `JSESSIONID=${options.sessionRef}` } : {}),
      },
      body: formBody(body),
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new BetaApiClientError(`Beta API returned HTTP ${response.status}`, 'http_error')
    }
    let raw
    try {
      raw = await response.json()
    } catch {
      throw new BetaApiClientError('Beta API returned invalid JSON', 'malformed_response')
    }
    // R1 read providers are not envelope-consistent: code/selectCode.do may
    // return a JSON array encoded as a JSON string, while
    // selectMultistageCode.do may return a top-level array. Decode one
    // transport-level string wrapper, then keep the actual wire shape for the
    // caller; login still validates its object-shaped success/session below.
    if (typeof raw === 'string') {
      try {
        raw = JSON.parse(raw)
      } catch {
        throw new BetaApiClientError('Beta API returned invalid JSON content', 'malformed_response')
      }
    }
    if (!isObject(raw) && !Array.isArray(raw)) {
      throw new BetaApiClientError('Beta API returned an invalid response', 'malformed_response')
    }
    return raw
  } catch (error) {
    if (error instanceof BetaApiClientError) throw error
    throw new BetaApiClientError('Beta API request could not be completed', 'network_error')
  } finally {
    clearTimeout(timer)
  }
}

export function assertBetaApiBaseUrl(value) {
  let parsed
  try {
    parsed = new URL(value)
  } catch {
    throw new BetaApiClientError('Beta API base URL is invalid', 'invalid_base_url')
  }
  if (parsed.protocol !== 'https:' || parsed.hostname !== BETA_HOST) {
    throw new BetaApiClientError('This local login tool only permits the Beta API host', 'non_beta_host')
  }
  return parsed.toString().replace(/\/+$/, '')
}

export function normalizeBetaLoginMethod(value = 'code') {
  if (value === '1' || value === 'code' || value === 'sms') return '1'
  if (value === '2' || value === 'password') return '2'
  throw new BetaApiClientError('Beta login method must be code or password', 'invalid_login_method')
}

export function betaDefaults(env = process.env) {
  const configuredTimeout = Number(env.XLINK_BETA_TIMEOUT_MS ?? 15_000)
  return {
    apiBaseUrl: env.XLINK_BETA_API_BASE_URL?.trim() || env.VITE_XLINK_API_BASE_URL?.trim() || DEFAULT_BETA_API_BASE_URL,
    tenantId: env.XLINK_BETA_TENANT_ID?.trim() || env.VITE_XLINK_AUTH_TENANT?.trim() || DEFAULT_BETA_TENANT_ID,
    phone: env.XLINK_BETA_PHONE?.trim() || env.VITE_XLINK_QUICK_LOGIN_PHONE?.trim() || '',
    method: normalizeBetaLoginMethod(env.XLINK_BETA_LOGIN_METHOD?.trim() || env.VITE_XLINK_AUTH_METHOD?.trim() || 'code'),
    code: env.XLINK_BETA_CODE?.trim() || env.VITE_XLINK_QUICK_LOGIN_CODE?.trim() || DEFAULT_BETA_CODE,
    password: env.XLINK_BETA_PASSWORD?.trim() || '',
    timeoutMs: normalizedTimeout(configuredTimeout),
  }
}

export function betaLocalDefaults(env = localRuntimeEnv()) {
  const environment = env.VITE_XLINK_ENVIRONMENT?.trim()
  if (!environment || environment === 'prod') {
    throw new BetaApiClientError(
      'Local Beta login is available only in a configured non-production environment',
      'non_production_only',
    )
  }
  // Keep the local discovery path aligned with App quick-login. Do not let
  // ad-hoc XLINK_BETA_PHONE/CODE values silently diverge from the App's
  // VITE_XLINK_QUICK_LOGIN_* configuration.
  return betaDefaults({
    VITE_XLINK_API_BASE_URL: env.VITE_XLINK_API_BASE_URL,
    VITE_XLINK_AUTH_TENANT: env.VITE_XLINK_AUTH_TENANT,
    VITE_XLINK_AUTH_METHOD: env.VITE_XLINK_AUTH_METHOD,
    VITE_XLINK_QUICK_LOGIN_PHONE: env.VITE_XLINK_QUICK_LOGIN_PHONE,
    VITE_XLINK_QUICK_LOGIN_CODE: env.VITE_XLINK_QUICK_LOGIN_CODE,
    XLINK_BETA_TIMEOUT_MS: env.XLINK_BETA_TIMEOUT_MS,
  })
}

export async function loginBeta(options) {
  const apiBaseUrl = assertBetaApiBaseUrl(options.apiBaseUrl || DEFAULT_BETA_API_BASE_URL)
  const method = normalizeBetaLoginMethod(options.method)
  const phone = String(options.phone || '').replace(/\s+/g, '').trim()
  const credential = String(options.credential || '').trim()
  const tenantId = String(options.tenantId || DEFAULT_BETA_TENANT_ID).trim()
  if (!phone || !credential || !tenantId) {
    throw new BetaApiClientError('Beta login requires phone, credential and tenant', 'missing_login_input')
  }
  const raw = await requestJson({
    apiBaseUrl,
    timeoutMs: Number.isFinite(options.timeoutMs) ? options.timeoutMs : 15_000,
    fetchImpl: options.fetchImpl,
  }, 'index/phoneLogin.do', {
    method,
    phone,
    // R1 sends both SMS codes and password credentials in the code field.
    code: credential,
    tenantId,
  })
  if (!isSuccessful(raw.success)) {
    throw new BetaApiClientError('Beta login was rejected', 'login_rejected')
  }
  const data = isObject(raw.data) ? raw.data : undefined
  const token = typeof data?.token === 'string' ? data.token.trim() : ''
  if (!token) throw new BetaApiClientError('Beta login returned no session', 'missing_session')
  return { sessionRef: token }
}

export function createBetaReadClient(options) {
  const apiBaseUrl = assertBetaApiBaseUrl(String(options.apiBaseUrl || '').trim())
  const sessionRef = String(options.sessionRef || '').trim()
  if (!apiBaseUrl || !sessionRef) {
    throw new BetaApiClientError('Beta read requires API base URL and authenticated session', 'missing_read_input')
  }
  return {
    read(path, body = {}) {
      return requestJson({
        apiBaseUrl,
        sessionRef,
        timeoutMs: normalizedTimeout(options.timeoutMs),
        fetchImpl: options.fetchImpl,
      }, path, body)
    },
  }
}

export { DEFAULT_BETA_API_BASE_URL, DEFAULT_BETA_TENANT_ID }
