import { ref } from 'vue'
import type { ActionDraftIdentity, ActionDraftRepository } from '@runtimes/action'
import type { DeviceActionPort, DeviceEvent, DeviceKind, DeviceResult, PressureReading } from '@shared/ports/device-action'

export interface DeviceActionState {
  readonly kind: DeviceKind
  readonly phase: 'select' | 'connecting' | 'ready' | 'running' | 'interrupted' | 'finished'
  readonly progress: number
  readonly connected: boolean
  readonly result: DeviceResult | null
  readonly history: readonly DeviceResult[]
  readonly localSaved: boolean
  readonly saving: boolean
  readonly message: string
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function isPressure(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

export function validManualPressure(value: unknown): value is PressureReading {
  const reading = record(value)
  return !!reading && isPressure(reading.startMpa) && isPressure(reading.endMpa)
    && typeof reading.holdMinutes === 'number' && Number.isSafeInteger(reading.holdMinutes) && reading.holdMinutes > 0
}

export function pressureSummary(result: DeviceResult | null): PressureReading | null {
  if (result?.kind !== 'pressure') return null
  if (result.manualPressure) return result.manualPressure
  const first = result.samples?.[0], last = result.samples?.at(-1)
  if (!first || !last || last.minute <= first.minute) return null
  return { startMpa: first.pressure, endMpa: last.pressure, holdMinutes: last.minute - first.minute }
}

/** Persisted drafts are untrusted JSON, even when the storage API returned success. */
export function validDeviceResult(value: unknown, kind: DeviceKind): value is DeviceResult {
  const result = record(value)
  if (!result || result.kind !== kind || result.source !== 'dev_mock'
    || typeof result.completedAt !== 'string' || !Number.isFinite(Date.parse(result.completedAt))
    || typeof result.dataComplete !== 'boolean') return false
  if (kind === 'pressure') {
    if (result.measurement !== 'unverified' || result.dataComplete !== true) return false
    if (Object.hasOwn(result, 'manualPressure')) {
      return !Object.hasOwn(result, 'samples') && validManualPressure(result.manualPressure)
    }
    return Array.isArray(result.samples) && result.samples.length > 0
      && result.samples.every(sample => {
        const point = record(sample)
        return point && Number.isInteger(point.minute) && Number(point.minute) >= 0
          && isPressure(point.pressure) && point.unit === 'MPa'
      })
  }
  const panorama = record(result.panorama)
  return !Object.hasOwn(result, 'manualPressure') && result.measurement === 'not_applicable' && result.dataComplete === false
    && !!panorama && typeof panorama.scene === 'string' && panorama.scene.length > 0
    && typeof panorama.asset === 'string' && panorama.asset.length > 0
    && panorama.stitched === true
}

function validHistory(value: unknown, kind: DeviceKind): value is readonly DeviceResult[] {
  return Array.isArray(value) && value.length > 0 && value.every(result => validDeviceResult(result, kind))
}

export function createDeviceAction(input: {
  identity: ActionDraftIdentity
  repository: ActionDraftRepository
  port: DeviceActionPort
  isCurrentScope: () => boolean
}) {
  const initial = (kind: DeviceKind, history: readonly DeviceResult[] = []): DeviceActionState => ({
    kind, phase: 'select', progress: 0, connected: false, result: null, history,
    localSaved: false, saving: false, message: '',
  })
  const state = ref<DeviceActionState>(initial('pressure'))
  let generation = 0
  let run = 0

  const draftIdentity = (kind: DeviceKind): ActionDraftIdentity => ({
    ...input.identity, contentIdentity: (input.identity.contentIdentity ?? 'device-action') + ':' + kind,
  })
  function live(ticket: number): boolean { return ticket === generation && input.isCurrentScope() }
  function invalidate(): void { generation++; input.port.cancel() }
  async function select(kind: DeviceKind, newAttempt = false): Promise<void> {
    if (!input.isCurrentScope() || state.value.phase === 'running' || state.value.saving) return
    const history = state.value.kind === kind ? [...state.value.history] : []
    invalidate()
    state.value = { ...initial(kind, history), message: newAttempt && history.length
      ? '已保存结果仍在本机，可从下方记录找回。' : '' }
    if (!newAttempt) await restore(kind)
  }
  async function connect(): Promise<void> {
    if (!input.isCurrentScope() || state.value.phase === 'connecting' || state.value.phase === 'running'
      || state.value.connected || state.value.saving) return
    const ticket = ++generation
    state.value = { ...state.value, phase: 'connecting', message: '' }
    try {
      await input.port.connect(state.value.kind)
      if (!live(ticket)) return
      state.value = { ...state.value, connected: true, phase: 'ready', message: '设备已连接，可开始本次模拟作业。' }
    } catch {
      if (!live(ticket)) return
      state.value = { ...state.value, connected: false, phase: 'interrupted', message: '连接失败，请重新连接。' }
    }
  }
  function onEvent(ticket: number, runId: number, event: DeviceEvent): void {
    if (!live(ticket) || runId !== run || state.value.phase !== 'running') return
    if (event.type === 'progress') state.value = { ...state.value, progress: event.progress, message: event.label }
    if (event.type === 'finished') {
      if (!validDeviceResult(event.result, state.value.kind) || event.result.manualPressure) {
        interrupt('模拟结果不完整，未保存；请重新开始。')
        return
      }
      state.value = { ...state.value, phase: 'finished', progress: 100,
        result: event.result, message: '模拟作业结束，结果可本地保存。' }
    }
    if (event.type === 'disconnected') interrupt('连接已中断。重新连接后需手动重新开始；不会自动重发操作。')
  }
  function start(): void {
    if (!input.isCurrentScope() || !state.value.connected || state.value.phase !== 'ready') return
    const ticket = generation
    const runId = ++run
    const kind = state.value.kind
    state.value = { ...initial(kind, state.value.history), connected: true, phase: 'running', message: '正在模拟作业…' }
    try { input.port.start(kind, event => onEvent(ticket, runId, event)) }
    catch { interrupt('启动失败，请重新连接后手动再试。') }
  }
  function interrupt(message = '已取消本次作业；重新开始需手动操作。'): void {
    if (!input.isCurrentScope()) return
    invalidate()
    state.value = { ...state.value, connected: false, phase: 'interrupted',
      result: null, localSaved: false, saving: false, message }
  }
  function enterManualPressure(reading: PressureReading): boolean {
    if (!input.isCurrentScope() || state.value.kind !== 'pressure' || state.value.phase !== 'interrupted'
      || !validManualPressure(reading)) return false
    invalidate()
    state.value = { ...state.value, phase: 'finished', progress: 100,
      result: { kind: 'pressure', source: 'dev_mock', completedAt: new Date().toISOString(),
        dataComplete: true, measurement: 'unverified',
        manualPressure: { startMpa: reading.startMpa, endMpa: reading.endMpa, holdMinutes: reading.holdMinutes } },
      message: '已录入手填结果，可核对后保存到本机。' }
    return true
  }
  function dispose(): void { invalidate() }
  function showSaved(index: number): void {
    if (!input.isCurrentScope() || state.value.phase === 'running' || state.value.saving) return
    const result = state.value.history[index]
    if (!validDeviceResult(result, state.value.kind)) return
    invalidate()
    state.value = { ...state.value, phase: 'finished', progress: 100, connected: false,
      result, localSaved: true, message: '已打开本机保存的模拟结果。' }
  }
  async function saveLocal(): Promise<boolean> {
    if (!input.isCurrentScope() || state.value.phase !== 'finished' || !state.value.result
      || state.value.localSaved || state.value.saving) return false
    const ticket = generation
    const kind = state.value.kind
    const result = state.value.result
    const identity = draftIdentity(kind)
    state.value = { ...state.value, saving: true, message: '正在保存本机结果…' }
    try {
      const previous = await input.repository.read<{ deviceActionV2: { kind: DeviceKind; results: DeviceResult[] } }>(identity)
      if (!live(ticket)) return false
      if (previous.state !== 'succeeded') throw Error('read_failed')
      const prior = previous.data?.values.deviceActionV2
      if (previous.data && (previous.data.status !== 'unfinished' || prior?.kind !== kind
        || !validHistory(prior.results, kind))) throw Error('invalid_existing_draft')
      const results = [...(prior?.results ?? []), result]
      const values = { deviceActionV2: { kind, results } }
      const written = await input.repository.write({ version: 1, identity, values,
        updatedAt: new Date().toISOString(), status: 'unfinished' }, { stillCurrent: () => live(ticket) })
      if (!live(ticket)) return false
      if (written.state !== 'succeeded') throw Error('write_failed')
      const readback = await input.repository.read<typeof values>(identity)
      if (!live(ticket)) return false
      const saved = readback.state === 'succeeded' ? readback.data?.values.deviceActionV2 : null
      if (!saved || saved.kind !== kind || !validHistory(saved.results, kind)
        || JSON.stringify(saved.results) !== JSON.stringify(results)) throw Error('readback_failed')
      state.value = { ...state.value, history: results, localSaved: true, saving: false,
        message: '已保存在本机；尚未上传或提交业务。' }
      return true
    } catch {
      if (live(ticket)) state.value = { ...state.value, saving: false,
        message: '本机保存失败或已有记录损坏；未覆盖旧结果。' }
      return false
    }
  }
  async function restore(kind: DeviceKind = state.value.kind): Promise<boolean> {
    if (!input.isCurrentScope() || state.value.phase === 'running' || state.value.saving) return false
    const ticket = generation
    try {
      const read = await input.repository.read<{ deviceActionV2: { kind: DeviceKind; results: DeviceResult[] } }>(draftIdentity(kind))
      if (!live(ticket)) return false
      if (state.value.kind !== kind || (state.value.phase !== 'select' && state.value.phase !== 'interrupted')) return false
      if (read.state !== 'succeeded') throw Error('read_failed')
      if (!read.data) return false
      const data = read.data.values.deviceActionV2
      if (read.data.status !== 'unfinished' || data?.kind !== kind || !validHistory(data.results, kind)) {
        throw Error('invalid_draft')
      }
      invalidate()
      state.value = { kind, phase: 'finished', progress: 100, connected: false,
        result: data.results[data.results.length - 1], history: data.results,
        localSaved: true, saving: false, message: '已恢复本机模拟结果；设备未连接。' }
      return true
    } catch {
      if (live(ticket)) state.value = { ...initial(kind),
        message: '本机结果读取失败或格式不兼容；未恢复，请保留原记录。' }
      return false
    }
  }
  return { state, select, connect, start, interrupt, enterManualPressure, dispose, showSaved, saveLocal, restore }
}
