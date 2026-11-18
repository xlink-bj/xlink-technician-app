<template>
  <view class="archive-heading" :class="{ 'archive-summary-heading': summary }"><text class="archive-title">预约信息</text>
    <navigator v-if="snapshot?.records.length && !busy && (summary || recordId)" class="archive-link" data-testid="appointment-archive-open"
      :url="recordRoute(summary && snapshot.records.length === 1 ? String(snapshot.records[0]!.id) : undefined)">
      {{ summary ? (snapshot.records.length === 1 ? '查看详情' : `查看全部 ${snapshot.records.length} 条`) : '全部预约' }} ›
    </navigator>
  </view>
  <text v-if="loading" class="archive-hint" data-testid="appointment-archive-loading">正在读取预约记录…</text>
  <view v-else-if="!snapshot" class="archive-failure" data-testid="appointment-archive-error">
    <text class="archive-hint">{{ message || '预约记录尚未读取' }}</text>
    <AppButton variant="text" size="compact" :disabled="busy" @tap="emit('reload')">重新读取</AppButton>
  </view>
  <template v-else>
    <text v-if="!snapshot.records.length" class="archive-hint" data-testid="appointment-archive-empty">暂无预约记录</text>
    <text v-else-if="summary && snapshot.records.length > 1" class="archive-copy">共 {{ snapshot.records.length }} 条预约，请选择记录查看</text>
    <view v-else-if="summary" :class="{ 'appointment-preview': appointmentSummaryFields.length }"
      data-testid="appointment-archive-summary">
      <view v-for="field in appointmentSummaryFields" :key="field.fieldId" class="archive-copy appointment-preview__row">
        <text>{{ field.label }}<text class="appointment-preview__separator">：</text></text><text class="appointment-preview__value">{{ field.text }}</text>
      </view>
    </view>
    <template v-else>
      <text v-if="message && showFeedback" class="archive-hint" role="status" data-testid="r1-normal-form-read-message">{{ message }}</text>
      <text v-if="recordId && !archiveRecords.length" class="archive-hint" data-testid="appointment-record-unavailable">这条预约暂不可查看，请返回全部预约重新选择。</text>
      <navigator v-for="(record,index) in !recordId ? snapshot.records : []" :key="String(record.id)"
        :url="recordRoute(String(record.id))" class="archive-entry archive-navigator" :data-testid="`appointment-record-${record.id}`">
        <view class="archive-heading"><text class="archive-entry-title">预约记录 {{ index + 1 }}</text><text class="archive-link">查看详情 ›</text></view>
        <text v-for="field in appointmentPreview(record)" :key="field.fieldId" class="archive-copy">{{ field.label }}：{{ field.text }}</text>
      </navigator>
      <view v-for="record in archiveRecords" :key="String(record.id)" data-testid="appointment-record-detail">
        <AppInformationRow v-for="field in appointmentReadFields(record)" :key="field.fieldId" :data-testid="`r1-normal-value-${field.valueKey}`">
          <template #label>{{ field.label }}</template><template #value>{{ field.text }}</template>
        </AppInformationRow>
        <AppButton v-if="canEdit" data-testid="appointment-modify" @tap="emit('edit', String(record.id))">修改预约</AppButton>
        <text v-else class="archive-hint" data-testid="appointment-read-only">此预约当前仅可查看，不能修改。</text>
      </view>
    </template>
  </template>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { FormDataRead } from '@shared/ports'
import AppButton from '@shared/ui/AppButton.vue'
import AppInformationRow from '@shared/ui/AppInformationRow.vue'
import { appointmentArchiveRoute } from './appointment-archive'
import { appointmentDisplayFor } from './appointment-time'
import type { R1NodeFormsSnapshot } from './r1-node-forms-read'
import { projectR1RecordReadFields } from './r1-record-read-fields'

defineOptions({ options: { virtualHost: true } })

const props = defineProps<{
  readonly workOrderId: string
  readonly runtimeNodeId: string
  readonly summary: boolean
  readonly recordId?: string
  readonly snapshot: R1NodeFormsSnapshot | null
  readonly loading: boolean
  readonly busy: boolean
  readonly message: string
  readonly showFeedback: boolean
  readonly canEdit: boolean
}>()
const emit = defineEmits<{
  (event: 'reload'): void
  (event: 'edit', recordId: string): void
}>()

function recordRoute(recordId?: string): string {
  return appointmentArchiveRoute(props.workOrderId, props.runtimeNodeId, recordId)
}
const archiveRecords = computed(() => props.recordId
  ? props.snapshot?.records.filter(record => String(record.id) === props.recordId) ?? [] : [])
function appointmentReadFields(record: FormDataRead) {
  const source = props.snapshot
  return source ? projectR1RecordReadFields(source.definition, record).map(field =>
    !field.unavailable && source.definition.fields?.find(f => f.fieldId === field.fieldId)?.type === 'datetime'
      ? { ...field, text: appointmentMinuteText(record.values?.[field.valueKey]) } : field) : []
}
function appointmentMinuteText(value: unknown): string {
  const parsed = appointmentDisplayFor(value)
  return parsed ? `${parsed.date} ${parsed.timeLabel}` : typeof value === 'string' && value ? value : '—'
}
function appointmentPreview(record: FormDataRead) { return appointmentReadFields(record).filter(field => ['need','datetime'].includes(field.valueKey)) }
const appointmentSummaryFields = computed(() => {
  const record = props.snapshot?.records[0]
  return record ? appointmentPreview(record) : []
})
</script>

<style scoped lang="scss">
@import "@brand-ui/detail-archives.scss";
</style>
