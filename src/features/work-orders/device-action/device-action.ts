import { ref } from 'vue'
import type { ActionDraftIdentity, ActionDraftRepository } from '@runtimes/action'
import type { DeviceActionPort, DeviceEvent, DeviceKind, DeviceResult } from '@shared/ports/device-action'

export interface DeviceActionState {
  readonly kind: DeviceKind
  readonly phase: 'select' | 'connecting' | 'ready' | 'running' | 'interrupted' | 'finished'
  readonly progress: number
  readonly connected: boolean
  readonly result: DeviceResult | null
  readonly localSaved: boolean
  readonly message: string
}

export function createDeviceAction(input: {
  identity: ActionDraftIdentity
  repository: ActionDraftRepository
  port: DeviceActionPort
  isCurrentScope: () => boolean
}) {
  const initial = (kind: DeviceKind): DeviceActionState => ({ kind, phase: 'select', progress: 0,
    connected: false, result: null, localSaved: false, message: '' })
  const state = ref<DeviceActionState>(initial('pressure'))
  let generation = 0
  let run = 0

  function live(ticket: number): boolean { return ticket === generation && input.isCurrentScope() }
  function invalidate(): void { generation++; input.port.cancel() }
  function select(kind: DeviceKind): void {
    if (!input.isCurrentScope() || state.value.phase === 'running') return
    invalidate()
    state.value = initial(kind)
  }
  async function connect(): Promise<void> {
    if (!input.isCurrentScope() || state.value.phase === 'connecting' || state.value.phase === 'running'
      || state.value.connected) return
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
    if (event.type === 'finished') state.value = { ...state.value, phase: 'finished', progress: 100,
      result: event.result, message: '模拟作业结束，结果可本地保存。' }
    if (event.type === 'disconnected') interrupt('连接已中断。重新连接后需手动重新开始；不会自动重发操作。')
  }
  function start(): void {
    if (!input.isCurrentScope() || !state.value.connected || state.value.phase !== 'ready') return
    const ticket = generation
    const runId = ++run
    const kind = state.value.kind
    state.value = { ...initial(kind), connected: true, phase: 'running', message: '正在模拟作业…' }
    input.port.start(kind, event => onEvent(ticket, runId, event))
  }
  function interrupt(message = '已取消本次作业；重新开始需手动操作。'): void {
    if (!input.isCurrentScope()) return
    invalidate()
    state.value = { ...state.value, connected: false, phase: 'interrupted',
      result: null, localSaved: false, message }
  }
  function dispose(): void { invalidate() }
  async function saveLocal(): Promise<boolean> {
    if (!input.isCurrentScope() || state.value.phase !== 'finished' || !state.value.result) return false
    const ticket = generation
    const result = state.value.result
    const values = { deviceActionV1: { kind: state.value.kind, result } }
    const record = { version: 1 as const, identity: input.identity, values,
      updatedAt: new Date().toISOString(), status: 'unfinished' as const }
    const written = await input.repository.write(record)
    if (!live(ticket) || written.state !== 'succeeded') {
      if (live(ticket)) state.value = { ...state.value, message: '本地保存失败，请重试。' }
      return false
    }
    const read = await input.repository.read<typeof values>(input.identity)
    if (!live(ticket)) return false
    const recovered = read.state === 'succeeded' && read.data?.values.deviceActionV1
    if (!recovered || JSON.stringify(recovered) !== JSON.stringify(values.deviceActionV1)) {
      state.value = { ...state.value, message: '本地保存尚未验证，请重试。' }
      return false
    }
    state.value = { ...state.value, localSaved: true, message: '已保存在本机；尚未上传或提交业务。' }
    return true
  }
  async function restore(): Promise<boolean> {
    if (!input.isCurrentScope() || state.value.phase === 'running') return false
    const ticket = generation
    const read = await input.repository.read<{ deviceActionV1: { kind: DeviceKind; result: DeviceResult } }>(input.identity)
    if (!live(ticket)) return false
    const data = read.state === 'succeeded' && read.data?.status === 'unfinished'
      ? read.data.values.deviceActionV1 : null
    if (!data || (data.kind !== 'pressure' && data.kind !== 'panorama')
      || data.result?.kind !== data.kind || data.result.source !== 'dev_mock'
      || typeof data.result.completedAt !== 'string') return false
    invalidate()
    state.value = { kind: data.kind, phase: 'finished', progress: 100, connected: false,
      result: data.result, localSaved: true, message: '已恢复本机模拟结果；设备未连接。' }
    return true
  }
  return { state, select, connect, start, interrupt, dispose, saveLocal, restore }
}
