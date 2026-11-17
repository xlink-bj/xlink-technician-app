export function workOrderOrderLineageReadState(readStates) {
  const states = [...readStates]
  if (states.length === 0) return 'NOT_RUN'
  return states.every(state => state === 'SUCCEEDED') ? 'SUCCEEDED' : 'PARTIAL'
}
