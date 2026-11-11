import type {FormDefinitionRead} from '@shared/ports'
import {configuredFileStorage,createConfiguredFileCodec} from './r1-configured-file-storage'
/** Legacy entry name; both profiles use the same metadata-bound codec. */
export function createSurveyCreateMediaCodec(definition:FormDefinitionRead,ext:Readonly<Record<string,unknown>>){
 const storage=configuredFileStorage(definition,ext)
 if(!storage)throw Error('当前字段的存储类型尚未支持读取。')
 return createConfiguredFileCodec(storage,{allowLegacyNull:true})
}
