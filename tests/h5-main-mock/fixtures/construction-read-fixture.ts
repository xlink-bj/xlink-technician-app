import { constructionMockReadPort } from '../../../src/adapters/api/mock/construction-read'
const original = constructionMockReadPort.execute
let mode = 'normal', release: (() => void) | undefined
export const ledger: Array<unknown> = []
export function selectConstructionReadMode(value: string) { mode = value }
export function releaseConstructionRead() { mode = 'normal'; release?.(); release = undefined }
export function installConstructionReadVariants() {
  constructionMockReadPort.execute = async request => {
    // Always run the real scoped Mock reader before varying only its response.
    const data: any = await original(request); ledger.push(request)
    if (mode === 'loading') await new Promise<void>(resolve => { release = resolve })
    if (mode === 'failed') throw Error('Synthetic read transport failure')
    if (mode === 'empty') return { data: [] }
    if (mode === 'wrong-scope') data.data[0].serviceAppointmentId = 'other-work-order'
    return data
  }
}
