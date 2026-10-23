<template>
  <main>
    <h1>Production repeat 只读组件合成验收</h1>
    <div class="controls" aria-label="测试情境">
      <button data-testid="scenario-one" @click="scenario = 'one'">1 条</button>
      <button data-testid="scenario-empty" @click="scenario = 'empty'">空列表</button>
      <button data-testid="scenario-error" @click="scenario = 'error'">读取失败</button>
      <button data-testid="scenario-more" @click="scenario = 'more'">还有后续页</button>
      <button data-testid="switch-identity" @click="switchIdentity">切换身份</button>
    </div>
    <p data-testid="request-count">合成请求 {{ requestCount }} 次</p>
    <R1ProductionMainRepeatPanel :node="node" :read="read" @read="load" />
  </main>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import type { WorkflowNodeRead } from '@shared/ports'
import type { R1RepeatRecordsReadState } from '@features/work-orders/detail'
import R1ProductionMainRepeatPanel from '@features/work-orders/R1ProductionMainRepeatPanel.vue'

type Scenario = 'one' | 'empty' | 'error' | 'more'
const scenario = ref<Scenario>('one')
const requestCount = ref(0)
const node = ref({ id: 'synthetic-node-a', runId: 'synthetic-run-a', formDefinitionId: 'synthetic-def-a',
  category: 'repeat', sourceNodeType: 'repeat', lifecycle: 'active' } as WorkflowNodeRead)
const read = ref<R1RepeatRecordsReadState>({ state: 'idle', entries: [], hasMore: false })

function load(nodeId: string): void {
  if (String(node.value.id) !== nodeId) return
  requestCount.value += 1
  read.value = scenario.value === 'error'
    ? { state: 'failed_retryable', entries: [], hasMore: false }
    : scenario.value === 'empty'
      ? { state: 'succeeded', entries: [], hasMore: false }
      : { state: 'succeeded', entries: [{ id: 'synthetic-record-a', state: 'active' } as R1RepeatRecordsReadState['entries'][number]],
          hasMore: scenario.value === 'more' }
}

function switchIdentity(): void {
  node.value = { ...node.value, id: 'synthetic-node-b', runId: 'synthetic-run-b', formDefinitionId: 'synthetic-def-b' } as WorkflowNodeRead
  read.value = { state: 'idle', entries: [], hasMore: false }
}

// Plain Vue does not provide uni-app's click-to-tap browser adapter. Bridge
// only the panel button so a Playwright click exercises AppButton's real tap
// handler and the panel's real read emit; this fixture never mounts App APIs.
function bridgeTap(event: MouseEvent): void {
  const button = (event.target as Element | null)?.closest('.main-repeat .app-button')
  if (button) button.dispatchEvent(new Event('tap'))
}
onMounted(() => document.addEventListener('click', bridgeTap))
onUnmounted(() => document.removeEventListener('click', bridgeTap))
</script>

<style>
body { margin: 0; background: #f3f6fa; color: #1d304b; font: 16px/1.5 system-ui, sans-serif; }
main { padding: 16px; }
h1 { font-size: 18px; }
.controls { display: flex; flex-wrap: wrap; gap: 8px; }
.controls button { min-height: 36px; }
.main-repeat view, .main-repeat text { display: block; }
.main-repeat button { min-height: 44px; margin-top: 12px; }
</style>
