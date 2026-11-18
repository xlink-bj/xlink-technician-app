<template>
  <view data-testid="normal-appointment-experience">
    <template v-if="pane === 'fields'">
      <AppField v-for="field in view.fields.filter(f => f.visible)" :key="field.fieldId"
        :label="field.label" :required="field.required" :data-testid="`r1-normal-input-${field.valueKey}`">
        <AppSelector v-if="field.type === 'datetime' && field.supported" :disabled="view.disabled"
          :selected="Boolean(timeDisplay)" data-testid="normal-appointment-time-open" @tap="openTime">
          {{ timeDisplay ? `${timeDisplay.dateLabel} ${timeDisplay.timeLabel}` : '请选择上门时间' }}
        </AppSelector>
        <R1FormFieldControl v-else-if="field.supported" :field="field" :model-value="fieldValue(field.valueKey)"
          :disabled="view.disabled" @update:model-value="view.updateValue(field.valueKey,$event)" />
        <text v-else>{{ field.reason || '当前字段不可编辑' }}</text>
      </AppField>
    </template>
    <template v-else-if="pane === 'time'">
      <AppointmentTimeSelectionContent :selected-date="selectedDate" :selected-option-key="selectedOptionKey"
        :date-shortcuts="dateShortcuts" :time-options="appointmentTimeOptions" :disabled="view.disabled"
        :allow-minute-selection="true" :minute-time="selectedMinute"
        @select-date="selectedDate=$event" @select-option="selectShortcut" @select-minute="selectMinute" />
    </template>
    <template v-else>
      <view v-for="field in view.fields.filter(f=>f.visible)" :key="field.fieldId" class="normal-appointment-summary">
        <AppInformationRow><template #label>{{ field.label }}</template><template #value>{{ displayValue(field) }}</template></AppInformationRow>
        <text v-if="view.originalValues && view.originalValues[field.valueKey] !== view.values[field.valueKey]" class="normal-appointment-hint" :data-testid="`appointment-before-${field.valueKey}`">修改前：{{ displayValue(field,view.originalValues) }}</text>
      </view>
      <text class="normal-appointment-hint">此操作仅保存本条改约记录。</text>
    </template>
    <view v-if="!workspaceActions" class="normal-appointment-actions">
      <AppButton v-for="action in actions" :key="action.id" :variant="action.variant" :disabled="action.disabled"
        :data-testid="action.id" @tap="action.run">{{ action.label }}</AppButton>
    </view>
  </view>
</template>
<script setup lang="ts">
import {computed,ref} from 'vue'
import type {R1LocalField,R1LocalFieldValue} from '../r1-local-form-fields'
import type {R1FormFooterAction} from '../r1-form-workspace-presentation'
import R1FormFieldControl from '../R1FormFieldControl.vue'
import AppButton from '@shared/ui/AppButton.vue'
import AppField from '@shared/ui/AppField.vue'
import AppSelector from '@shared/ui/AppSelector.vue'
import AppInformationRow from '@shared/ui/AppInformationRow.vue'
import AppointmentTimeSelectionContent from './AppointmentTimeSelectionContent.vue'
import {appointmentDisplayFor,appointmentTimeOptions,dateShortcutsFor,dateStringFor,parseAppointmentDateTime,appointmentDateForSelection,appointmentDateTimeForSelection} from '../appointment-time'
const props=defineProps<{workspaceActions?:boolean;view:{readonly recordId:string;readonly fields:readonly(R1LocalField&{readonly visible:boolean})[];
  readonly values:Readonly<Record<string,unknown>>;readonly disabled:boolean;readonly valid:boolean;
  readonly originalValues?:Readonly<Record<string,unknown>>;
  updateValue(key:string,value:R1LocalFieldValue):void;saveOnly():Promise<void>}}>()
const emit = defineEmits<{ (event: 'cancel'): void }>()
// Only an unconfirmed picker selection is local. All form values remain in Panel.
const pane=ref<'fields'|'time'|'confirm'>('fields'),selectedDate=ref(''),selectedOptionKey=ref(''),selectedMinute=ref('')
const dateShortcuts=dateShortcutsFor()
const timeField=computed(()=>props.view.fields.find(f=>f.visible&&f.supported&&f.type==='datetime'))
const timeDisplay=computed(()=>timeField.value?appointmentDisplayFor(props.view.values[timeField.value.valueKey]):undefined)
const selectedValue=computed(()=>appointmentDateTimeForSelection(props.view.values[timeField.value?.valueKey??''],selectedDate.value,selectedMinute.value))
const hasChanges = computed(() => {
  const { values, originalValues } = props.view
  return !!originalValues && [...new Set([...Object.keys(values), ...Object.keys(originalValues)])]
    .some(key => !Object.is(values[key], originalValues[key]))
})
const actions = computed<readonly R1FormFooterAction[]>(() => {
  const { disabled, valid } = props.view
  const action = (id: string, label: string, variant: R1FormFooterAction['variant'], run: () => void, blocked = disabled): R1FormFooterAction =>
    ({ id, label, variant, disabled: blocked, run })
  if (pane.value === 'time') return [
    action('normal-appointment-time-confirm', '确认选择', 'primary', confirmTime, disabled || !selectedValue.value),
    action('normal-appointment-time-cancel', '返回修改', 'text', backToFields),
  ]
  if (pane.value === 'confirm') return [
    action('normal-appointment-save', '确认保存记录', 'primary', () => props.view.saveOnly(), disabled || !valid),
    action('normal-appointment-review-back', '返回修改', 'text', backToFields),
  ]
  const review = action('normal-appointment-review', '核对改约信息', 'primary', () => { pane.value = 'confirm' }, disabled || !valid)
  return props.workspaceActions
    ? [review, action('appointment-edit-cancel', '取消修改', 'text', () => emit('cancel'))]
    : [review]
})
function backToFields() { pane.value = 'fields' }
function backPress() {
  if (props.view.disabled) return true
  if (pane.value === 'fields') return false
  backToFields()
  return true
}
defineExpose({ actions, pane, hasChanges, backPress })
function fieldValue(key:string):R1LocalFieldValue|undefined{const v=props.view.values[key];return typeof v==='string'?v:undefined}
function displayValue(field:R1LocalField,values=props.view.values):string{const v=values[field.valueKey];const parsed=field.type==='datetime'?appointmentDisplayFor(v):undefined;return parsed?`${parsed.date} ${parsed.timeLabel}`:field.options?.find(o=>o.value===v)?.label??(typeof v==='string'&&v?v:'—')}
function openTime(){if(props.view.disabled||!timeField.value)return;const value=props.view.values[timeField.value.valueKey],parsed=parseAppointmentDateTime(value);selectedDate.value=appointmentDateForSelection(value)??dateStringFor();selectedMinute.value=parsed?.timeLabel??'';selectedOptionKey.value=appointmentTimeOptions.find(o=>o.value===parsed?.timeLabel)?.key??'';pane.value='time'}
function selectShortcut(key:string){if(props.view.disabled)return;const option=appointmentTimeOptions.find(o=>o.key===key);if(option){selectedOptionKey.value=key;selectedMinute.value=option.value}}
function selectMinute(value:string){if(props.view.disabled)return;selectedMinute.value=value;selectedOptionKey.value=appointmentTimeOptions.find(o=>o.value===value)?.key??''}
function confirmTime(){const field=timeField.value,value=selectedValue.value;if(props.view.disabled||!field||!value)return;props.view.updateValue(field.valueKey,value);pane.value='fields'}
</script>

<style scoped lang="scss">
.normal-appointment-hint{display:block;margin:var(--app-space-sm) 0;color:var(--app-color-text-secondary);font-size:var(--app-font-meta);line-height:1.6;overflow-wrap:anywhere}
.normal-appointment-summary{padding-bottom:var(--app-space-xs)}
.normal-appointment-actions{padding-top:var(--app-space-md)}
</style>
