<template>
  <view v-if="screen === 'entry'" class="sop-entry">
    <button class="sop-button sop-secondary" data-testid="construction-sop-entry" @click="open">
      施工开单与任务
    </button>
  </view>
  <view v-else class="sop-workspace" data-testid="construction-sop-workspace">
    <view class="sop-heading">
      <button class="sop-back" :disabled="busy" @click="back">{{ screen === 'list' ? '返回日志' : '返回施工' }}</button>
      <text class="sop-title">{{ title }}</text>
    </view>

    <view v-if="feedback" class="sop-message" :class="{ 'sop-attention': pending || readFailed }"
      data-testid="construction-sop-feedback" role="status">
      <text>{{ feedback }}</text>
      <button v-if="pending || readFailed" class="sop-button sop-secondary"
        data-testid="construction-sop-recheck" :disabled="busy" @click="recheck">重新核对</button>
    </view>
    <text v-if="busy" class="sop-caption" role="status">正在核对施工记录…</text>

    <view v-if="screen === 'list' && data && !readFailed" class="sop-content">
      <view class="sop-section">
        <text class="sop-label">我的施工任务</text>
        <button class="sop-record-link" data-testid="construction-sop-assigned" :disabled="busy || !!pending"
          @click="openRecord('assigned')">
          <text>{{ data.assigned.location }} · {{ data.assigned.task.name }}</text>
          <text class="sop-caption">{{ data.assigned.task.state === 10 ? '已办理' : '待办理' }}　›</text>
        </button>
      </view>
      <view class="sop-section">
        <text class="sop-label">主动开单</text>
        <button v-if="data.created" class="sop-record-link" data-testid="construction-sop-created"
          :disabled="busy || !!pending" @click="openRecord('created')">
          <text>施工单 {{ data.created.target.constructionId }}</text>
          <text class="sop-caption">查看原单　›</text>
        </button>
        <button v-else class="sop-button sop-primary" data-testid="construction-sop-add"
          :disabled="busy || !!pending" @click="screen = 'create'">新建施工单</button>
      </view>
    </view>

    <view v-if="screen === 'create' && data && !readFailed" class="sop-content">
      <view class="sop-section">
        <text class="sop-label">施工部位</text>
        <view class="sop-choices">
          <button v-for="option in constructionLocations" :key="option" class="sop-choice"
            :class="{ 'sop-selected': location === option }" :aria-pressed="location === option"
            :disabled="busy || !!pending" @click="location = option">{{ option }}</button>
        </view>
      </view>
      <view class="sop-section">
        <text class="sop-label">施工内容</text>
        <textarea v-model="description" class="sop-input" data-testid="construction-sop-description"
          aria-label="施工内容" placeholder="填写本次需要处理的问题" :maxlength="120" :disabled="busy || !!pending" />
        <text class="sop-caption">提交后关联本次服务单和工程单。</text>
      </view>
      <button class="sop-button sop-primary" data-testid="construction-sop-create" :disabled="!canCreate"
        @click="create">确认创建施工单</button>
    </view>

    <view v-if="screen === 'record' && record && !readFailed" class="sop-content" data-testid="construction-sop-record">
      <view class="sop-section">
        <view class="sop-order-heading">
          <text class="sop-label">{{ record.location }}</text>
          <text class="sop-status" :class="{ 'sop-done': record.task.state === 10 && !pending }">
            {{ pending ? '待核对' : record.task.state === 10 ? '已办理' : '待办理' }}
          </text>
        </view>
        <text>{{ record.description }}</text>
        <view class="sop-ids">
          <text>施工单 <text class="sop-id">{{ record.target.constructionId }}</text></text>
          <text>服务单 <text class="sop-id">{{ record.target.serviceId }}</text></text>
          <text>工程单 <text class="sop-id">{{ record.target.projectId }}</text></text>
          <text v-if="selected === 'created'">创单回执 <text class="sop-id">{{ record.requestId }}</text></text>
        </view>
      </view>
      <view class="sop-section">
        <text class="sop-label">{{ record.task.name }}</text>
        <text class="sop-caption">{{ record.task.version }}</text>
        <view v-if="record.task.receipt && !pending" class="sop-receipt" data-testid="construction-sop-node-receipt">
          <text class="sop-label">节点办理回执</text>
          <text>{{ record.task.receipt.note }}</text>
          <text class="sop-caption">办理时间 {{ showDate(record.task.receipt.completedAt) }}</text>
        </view>
        <template v-else-if="!pending">
          <text class="sop-caption">复核当前部位的基层、收口和接缝，填写本次结论。</text>
          <textarea v-model="note" class="sop-input" data-testid="construction-sop-note"
            aria-label="复核结论" :maxlength="120" :disabled="busy" placeholder="填写现场复核结论" />
          <button v-if="!confirming" class="sop-button sop-primary" data-testid="construction-sop-review-node"
            :disabled="!canProcess" @click="confirming = true">核对并办理</button>
          <view v-else class="sop-confirm">
            <text>确认完成本施工单的{{ record.task.name }}？</text>
            <button class="sop-button sop-primary" data-testid="construction-sop-process" :disabled="!canProcess"
              @click="process">确认完成节点</button>
            <button class="sop-button sop-secondary" :disabled="busy" @click="confirming = false">继续编辑</button>
          </view>
        </template>
      </view>
    </view>
    <text class="sop-caption sop-provenance">演练记录，仅保留在本机。</text>
  </view>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import {
  constructionLocations, sameConstructionSopTarget,
  type ConstructionLocation, type ConstructionSopPort, type ConstructionSopRead, type ConstructionSopTarget,
} from '@shared/construction-sop-mock-contract'

const props = defineProps<{ port: ConstructionSopPort }>()
const emit = defineEmits<{ focused: [value: boolean] }>()
const screen = ref<'entry' | 'list' | 'create' | 'record'>('entry')
const selected = ref<keyof ConstructionSopRead>('assigned')
const data = shallowRef<ConstructionSopRead>()
const record = computed(() => data.value?.[selected.value])
const title = computed(() => screen.value === 'create' ? '新建施工单' : screen.value === 'record' ? '施工单详情' : '施工办理')
const location = ref<ConstructionLocation>()
const description = ref('')
const note = ref('')
const confirming = ref(false)
const busy = ref(false)
const readFailed = ref(false)
const feedback = ref('')
type Pending = { kind: 'create'; location: ConstructionLocation; description: string }
  | { kind: 'process'; key: keyof ConstructionSopRead; target: ConstructionSopTarget; note: string }
const pending = shallowRef<Pending>()
const canCreate = computed(() => !busy.value && !pending.value && !!location.value && !!description.value.trim())
const canProcess = computed(() => !busy.value && !pending.value && record.value?.task.state === 0 && !!note.value.trim())
let generation = 0
onBeforeUnmount(() => { generation++ })

watch(() => props.port, () => {
  generation++
  screen.value = 'entry'
  data.value = undefined
  pending.value = undefined
  busy.value = false
  writeFeedback('')
  emit('focused', false)
}, { flush: 'sync' })

function writeFeedback(value: string) {
  feedback.value = value
  readFailed.value = false
}

function showDate(value: string): string {
  return value.slice(0, 16).replace('T', ' ') + ' UTC'
}

function back() {
  if (busy.value) return
  if (screen.value === 'list') {
    screen.value = 'entry'
    data.value = undefined
    emit('focused', false)
  } else {
    screen.value = 'list'
    confirming.value = false
    if (!pending.value) writeFeedback('')
  }
}

function openRecord(key: keyof ConstructionSopRead) {
  if (!props.port.isCurrent() || !data.value?.[key] || pending.value || busy.value) return
  selected.value = key
  note.value = ''
  confirming.value = false
  writeFeedback('')
  screen.value = 'record'
}

function open() {
  if (!props.port.isCurrent()) return
  emit('focused', true)
  screen.value = 'list'
  void recheck()
}

async function readOriginal(port: ConstructionSopPort, ticket: number) {
  const result = await port.read()
  if (ticket !== generation || !port.isCurrent()) return
  if (result.state !== 'ready') {
    readFailed.value = true
    feedback.value = pending.value ? '结果待核对，请重新读取原记录。' : '暂时无法读取施工记录，请重试。'
    return
  }
  data.value = result.data
  const expected = pending.value
  if (!expected) {
    writeFeedback('')
    return
  }
  if (expected.kind === 'create') {
    const created = result.data.created
    if (!created || created.location !== expected.location || created.description !== expected.description) {
      writeFeedback('创单结果待核对，请重新读取原请求。')
      return
    }
    pending.value = undefined
    selected.value = 'created'
    screen.value = 'record'
    writeFeedback('施工单已创建，三级单据已核对。')
    return
  }
  const original = result.data[expected.key]
  if (!original || !sameConstructionSopTarget(original.target, expected.target)
    || original.task.state !== 10 || original.task.receipt?.note !== expected.note) {
    writeFeedback('节点结果待核对，请重新读取原任务。')
    return
  }
  pending.value = undefined
  selected.value = expected.key
  screen.value = 'record'
  writeFeedback('已核对同一施工节点的办理结果。')
}

async function recheck() {
  const port = props.port
  if (busy.value || !port.isCurrent()) return
  const ticket = generation
  busy.value = true
  try { await readOriginal(port, ticket) }
  finally { if (ticket === generation) busy.value = false }
}

async function submit(expected: Pending) {
  const port = props.port
  if (busy.value || pending.value || !port.isCurrent()) return
  const ticket = generation
  busy.value = true
  confirming.value = false
  writeFeedback('')
  try {
    const outcome = await (expected.kind === 'create'
      ? port.create({ location: expected.location, description: expected.description })
      : port.process(expected.target, expected.note))
    if (ticket !== generation || !port.isCurrent()) return
    if (outcome === 'rejected' || outcome === 'denied') {
      writeFeedback(expected.kind === 'create' ? '未能创建施工单，请核对内容后重试。' : '节点未办理，可核对结论后重试。')
      return
    }
    pending.value = expected
    if (outcome === 'unknown') {
      writeFeedback('结果待核对，请重查原记录。')
      return
    }
    await readOriginal(port, ticket)
  } finally {
    if (ticket === generation) busy.value = false
  }
}

function create() {
  if (!canCreate.value || !location.value) return
  void submit({ kind: 'create', location: location.value, description: description.value.trim() })
}

function process() {
  if (!canProcess.value || !confirming.value || !record.value) return
  void submit({ kind: 'process', key: selected.value, target: record.value.target, note: note.value.trim() })
}
</script>

<style scoped lang="scss">
.sop-entry { padding: 0 0 12px; }
.sop-workspace { padding: 4px 0 24px; color: var(--app-text-strong); }
.sop-heading, .sop-content, .sop-section, .sop-confirm, .sop-receipt, .sop-ids {
  display: flex; flex-direction: column;
}
.sop-heading { align-items: flex-start; gap: 8px; margin-bottom: 16px; }
.sop-title { font-size: 24px; font-weight: 650; line-height: 1.3; }
.sop-content { gap: 16px; }
.sop-section, .sop-message {
  padding: 16px;
  border: 1px solid var(--app-outline-subtle);
  border-radius: 12px;
  background: var(--app-surface-raised);
  line-height: 1.55;
}
.sop-section, .sop-confirm, .sop-receipt { gap: 10px; }
.sop-label { font-size: 17px; font-weight: 650; overflow-wrap: anywhere; }
.sop-caption { color: var(--app-craft-secondary); font-size: 13px; line-height: 1.5; }
.sop-provenance { display: block; margin-top: 16px; }
.sop-message { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }
.sop-attention { background: var(--app-feedback-warning-surface); }
.sop-order-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.sop-status { flex-shrink: 0; font-size: 13px; color: var(--app-craft-secondary); }
.sop-done { color: var(--app-feedback-success-ink, var(--app-craft-secondary)); }
.sop-ids, .sop-receipt { border-top: 1px solid var(--app-outline-subtle); padding-top: 12px; }
.sop-ids { gap: 6px; color: var(--app-craft-secondary); font-size: 14px; }
.sop-id { font-variant-numeric: tabular-nums; color: var(--app-text-strong); }
.sop-button, .sop-back, .sop-choice, .sop-record-link {
  min-height: 44px; box-sizing: border-box; margin: 0; padding: 10px 12px;
  font-size: 15px; line-height: 1.4; border-radius: 8px; background: var(--app-surface-raised);
}
.sop-button::after, .sop-back::after, .sop-choice::after, .sop-record-link::after { border: none; }
.sop-button:focus-visible, .sop-back:focus-visible, .sop-choice:focus-visible,
.sop-record-link:focus-visible { outline: 2px solid var(--app-craft-action); outline-offset: 2px; }
.sop-button[disabled], .sop-choice[disabled], .sop-back[disabled], .sop-record-link[disabled] {
  background: var(--app-disabled-surface); color: var(--app-color-text-body);
}
.sop-button { width: 100%; }
.sop-primary { background: var(--app-craft-action); color: white; font-weight: 650; }
.sop-back, .sop-secondary { color: var(--app-craft-action); }
.sop-back { padding-left: 0; background: transparent; }
.sop-secondary, .sop-choice { border: 1px solid var(--app-outline-subtle); }
.sop-record-link {
  display: flex; flex-direction: column; text-align: left; width: 100%; padding: 10px 0;
  color: var(--app-text-strong); border-top: 1px solid var(--app-outline-subtle);
}
.sop-choices { display: flex; flex-wrap: wrap; gap: 8px; }
.sop-choice { color: var(--app-text-strong); }
.sop-selected { color: var(--app-craft-action); background: var(--app-craft-action-surface); border-color: var(--app-craft-action); }
.sop-input {
  width: 100%; min-height: 88px; height: 88px; box-sizing: border-box; padding: 10px 12px;
  border: 1px solid var(--app-outline-control); border-radius: 8px; background: var(--app-surface-muted);
  font-size: 15px; line-height: 1.5;
}
</style>
