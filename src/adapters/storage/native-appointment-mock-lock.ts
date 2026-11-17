/** Native Mock receipt lock. In-process no-queue exclusion + durable uni receipt;
 * no browser globals, no real-write authority, no automatic uncertain replay. */
const running=new Set<string>()
type Receipt={version:1;revision:number;status:'ready'|'uncertain'|'completed'}
const deny=():never=>{throw Error('本地预约结果尚未核实，禁止重复保存。')}
export function createNativeAppointmentMockLock(key:string){
  function read():string|null{
    const raw=uni.getStorageSync(key)
    if(raw===''||raw===undefined)return null
    if(typeof raw!=='string')return deny()
    const value=JSON.parse(raw) as Receipt
    if(!value||value.version!==1||!Number.isSafeInteger(value.revision)||value.revision<1
      ||!['ready','uncertain','completed'].includes(value.status))return deny()
    return raw
  }
  let observed:string|null|undefined
  try{observed=read()}catch{/* Unsafe storage stays locked. */}
  return{
    get locked(){try{return running.has(key)||observed===undefined||read()!==observed||Boolean(observed&&(JSON.parse(observed) as Receipt).status!=='ready')}catch{return true}},
    async run<T>(action:(mark:(state:'ready'|'uncertain'|'completed')=>void)=>Promise<T>):Promise<T>{
      if(running.has(key)||observed===undefined)return deny()
      running.add(key)
      try{
        let current=read(),dispatched=false
        if(current!==observed||current&&(JSON.parse(current) as Receipt).status!=='ready')return deny()
        let revision=current?(JSON.parse(current) as Receipt).revision:0
        return await action(state=>{
          if(read()!==current||(state==='uncertain'?dispatched:!dispatched))return deny()
          if(state==='uncertain'){if(revision>=Number.MAX_SAFE_INTEGER)return deny();revision++;dispatched=true}
          const raw=JSON.stringify({version:1,revision,status:state} satisfies Receipt)
          uni.setStorageSync(key,raw)
          if(uni.getStorageSync(key)!==raw)return deny()
          current=raw;observed=raw
        })
      }finally{running.delete(key)}
    },
  }
}
