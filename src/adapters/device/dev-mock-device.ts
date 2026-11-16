import type { DeviceActionPort, DeviceEvent, DeviceKind, DeviceResult } from '@shared/ports/device-action'

/** H5 DEV fixture. No browser Bluetooth, camera, network or SDK calls. */
export function createDevMockDevicePort(): DeviceActionPort & { disconnect(): void } {
  let timers: ReturnType<typeof setTimeout>[] = []
  let current: ((event: DeviceEvent) => void) | null = null
  const cancel = () => { timers.forEach(clearTimeout); timers = []; current = null }
  return {
    async connect(_kind: DeviceKind) { await Promise.resolve() },
    start(kind, emit) {
      cancel()
      current = emit
      const stages = kind === 'pressure'
        ? ['准备采样', '记录压力变化', '整理测量结果']
        : ['准备拍摄', '采集全景画面', '模拟拼接中']
      stages.forEach((label, index) => timers.push(setTimeout(() => {
        current?.({ type: 'progress', progress: (index + 1) * 25, label })
      }, (index + 1) * 450)))
      timers.push(setTimeout(() => {
        const result: DeviceResult = kind === 'pressure'
          ? { kind, source: 'dev_mock', completedAt: new Date().toISOString(), dataComplete: true,
            measurement: 'unverified', samples: [
              { minute: 0, pressure: 0.81, unit: 'MPa' },
              { minute: 1, pressure: 0.80, unit: 'MPa' },
              { minute: 2, pressure: 0.79, unit: 'MPa' },
            ] }
          : { kind, source: 'dev_mock', completedAt: new Date().toISOString(), dataComplete: false,
            measurement: 'not_applicable', panorama: { scene: '现场空间', asset: '模拟拼接预览', stitched: true } }
        current?.({ type: 'finished', result })
        cancel()
      }, 1800))
    },
    cancel,
    disconnect() { current?.({ type: 'disconnected' }); cancel() },
  }
}
