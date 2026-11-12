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
      <AppButton :disabled="view.disabled || !view.valid" data-testid="normal-appointment-review"
        @tap="pane='confirm'">核对改约信息</AppButton>
    </template>
    <template v-else-if="pane === 'time'">
      <AppointmentTimeSelectionContent :selected-date="selectedDate" :selected-option-key="selectedOptionKey"
        :date-shortcuts="dateShortcuts" :time-options="appointmentTimeOptions" :disabled="view.disabled"
        @select-date="selectedDate=$event" @select-option="selectedOptionKey=$event" />
      <AppButton :disabled="view.disabled || !selectedOption" data-testid="normal-appointment-time-confirm" @tap="confirmTime">确认选择</AppButton>
      <AppButton variant="text" :disabled="view.disabled" data-testid="normal-appointment-time-cancel" @tap="pane='fields'">返回修改</AppButton>
    </template>
    <template v-else>
      <view v-for="field in view.fields.filter(f=>f.visible)" :key="field.fieldId" class="normal-appointment-summary">
        <AppInformationRow><template #label>{{ field.label }}</template><template #value>{{ displayValue(field) }}</template></AppInformationRow>
      </view>
      <text class="form-read__hint">仅保存本条改约记录，不会完成当前节点。</text>
      <AppButton :disabled="view.disabled || !view.valid" data-testid="normal-appointment-save" @tap="view.saveOnly()">确认保存记录</AppButton>
      <AppButton variant="text" :disabled="view.disabled" data-testid="normal-appointment-review-back" @tap="pane='fields'">返回修改</AppButton>
    </template>
  </view>
</template>
<script setup lang="ts">
import {computed,ref} from 'vue'
import type {R1LocalField,R1LocalFieldValue} from '../r1-local-form-fields'
import R1FormFieldControl from '../R1FormFieldControl.vue'
import AppButton from '@shared/ui/AppButton.vue'
import AppField from '@shared/ui/AppField.vue'
import AppSelector from '@shared/ui/AppSelector.vue'
import AppInformationRow from '@shared/ui/AppInformationRow.vue'
import AppointmentTimeSelectionContent from './AppointmentTimeSelectionContent.vue'
import {appointmentDisplayFor,appointmentTimeOptions,dateShortcutsFor,dateStringFor,parseAppointmentDateTime} from '../appointment-time'
const props=defineProps<{view:{readonly recordId:string;readonly fields:readonly(R1LocalField&{readonly visible:boolean})[];
  readonly values:Readonly<Record<string,unknown>>;readonly disabled:boolean;readonly valid:boolean;
  updateValue(key:string,value:R1LocalFieldValue):void;saveOnly():Promise<void>}}>()
// Only an unconfirmed picker selection is local. All form values remain in Panel.
const pane=ref<'fields'|'time'|'confirm'>('fields'),selectedDate=ref(''),selectedOptionKey=ref('')
const dateShortcuts=dateShortcutsFor()
const timeField=computed(()=>props.view.fields.find(f=>f.visible&&f.supported&&f.type==='datetime'))
const timeDisplay=computed(()=>timeField.value?appointmentDisplayFor(props.view.values[timeField.value.valueKey]):undefined)
const selectedOption=computed(()=>appointmentTimeOptions.find(o=>o.key===selectedOptionKey.value))
function fieldValue(key:string):R1LocalFieldValue|undefined{const v=props.view.values[key];return typeof v==='string'?v:undefined}
function displayValue(field:R1LocalField):string{const v=props.view.values[field.valueKey];return field.options?.find(o=>o.value===v)?.label??(typeof v==='string'?v:'—')}
function openTime(){if(props.view.disabled||!timeField.value)return;const parsed=parseAppointmentDateTime(props.view.values[timeField.value.valueKey]);selectedDate.value=parsed?.date??dateStringFor();selectedOptionKey.value=appointmentTimeOptions.find(o=>o.value===parsed?.time)?.key??'';pane.value='time'}
function confirmTime(){const field=timeField.value,option=selectedOption.value;if(props.view.disabled||!field||!option)return;const value=`${selectedDate.value} ${option.value}`;if(!parseAppointmentDateTime(value))return;props.view.updateValue(field.valueKey,value);pane.value='fields'}
</script>
