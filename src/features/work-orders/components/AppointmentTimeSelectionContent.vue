<template>
    <view class="time-selection-content app-surface">
      <view class="time-selection-heading">
        <text class="time-selection-title">选择上门时间</text>
        <text class="time-selection-copy">请根据与客户确认的安排选择日期和时间</text>
      </view>

      <view class="time-section">
        <text class="time-section-label">预约日期</text>
        <view class="date-shortcuts">
          <button
            v-for="shortcut in dateShortcuts"
            :key="shortcut.key"
            class="date-shortcut" :disabled="disabled"
            :class="{ 'date-shortcut--selected': shortcut.date === selectedDate }"
            @tap="emit('select-date', shortcut.date)"
          >
            <text class="date-shortcut-label">{{ shortcut.label }}</text>
            <text class="date-shortcut-date">{{ shortcut.date.slice(5) }}</text>
          </button>
          <picker class="date-shortcuts-more" mode="date" :disabled="disabled" :value="selectedDate" @change="handleDateChange">
            <view class="date-shortcut date-shortcut--more">
              <text class="date-shortcut-label">更多日期</text>
              <AppIcon name="chevron-right" :size="16" aria-hidden="true" />
            </view>
          </picker>
        </view>
        <view class="selected-date-card">
          <text class="selected-date-label">已选日期</text>
          <text class="selected-date-value">{{ dateLabelFor(selectedDate) }}</text>
        </view>
      </view>

      <view class="time-section time-section--slots">
        <text class="time-section-label">预约时间</text>
        <view class="time-slots">
          <button
            v-for="option in timeOptions"
            :key="option.key"
            class="time-slot" :disabled="disabled"
            :class="{ 'time-slot--selected': selectedOptionKey === option.key }"
            @tap="emit('select-option', option.key)"
          >
            <text>{{ option.label }}</text>
            <AppIcon v-if="selectedOptionKey === option.key" class="time-slot-check" name="complete" :size="14" color="var(--app-color-surface)" aria-hidden="true" />
          </button>
        </view>
        <text v-if="timeError" class="time-selection-error">{{ timeError }}</text>
      </view>
    </view>
</template>
<script setup lang="ts">
import AppIcon from '@shared/ui/AppIcon.vue'
import {dateLabelFor,type AppointmentDateShortcut,type AppointmentTimeOption} from '../appointment-time'
defineProps<{selectedDate:string;selectedOptionKey:string;dateShortcuts:readonly AppointmentDateShortcut[];timeOptions:readonly AppointmentTimeOption[];timeError?:string;disabled?:boolean}>()
const emit=defineEmits<{(e:'select-date',value:string):void;(e:'select-option',value:string):void}>()
function handleDateChange(event:unknown){const value=(event as {detail?:{value?:unknown}})?.detail?.value;if(typeof value==='string'&&value)emit('select-date',value)}
</script>
<style>
.time-selection-content {
  margin-top: var(--app-space-md);
  padding: var(--app-card-padding);
}

.time-selection-heading { border-bottom: 1rpx solid var(--app-color-divider); padding-bottom: var(--app-space-lg); }
.time-selection-title { color: var(--app-color-text-primary); display: block; font-size: var(--app-font-section-title); font-weight: 800; }
.time-selection-copy { color: var(--app-color-text-secondary); display: block; font-size: var(--app-font-field-label); margin-top: var(--app-space-xs); }
.time-section { margin-top: var(--app-section-gap); }
.time-section--slots { border-top: 1rpx solid var(--app-color-divider); padding-top: var(--app-section-gap); }
.time-section-label { color: var(--app-color-text-primary); display: block; font-size: var(--app-font-body); font-weight: 800; margin-bottom: var(--app-space-sm); }

.date-shortcuts { display: flex; gap: 10rpx; }
.date-shortcuts-more { flex: 1; }

.date-shortcut {
  align-items: center;
  background: var(--app-color-control-surface);
  border: 1rpx solid var(--app-color-border-control);
  border-radius: var(--app-radius-control);
  box-sizing: border-box;
  color: var(--app-color-text-secondary);
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: var(--app-touch-target);
  justify-content: center;
  margin: 0;
  padding: 0 4rpx;
}

.date-shortcut::after { border: 0; }
.date-shortcut--selected { background: var(--app-color-primary-soft); border-color: var(--app-color-primary); color: var(--app-color-primary); }
.date-shortcut-label { font-size: var(--app-font-field-label); font-weight: 700; }
.date-shortcut-date { font-size: 18rpx; margin-top: 4rpx; }
.date-shortcut--more { color: var(--app-color-text-secondary); font-size: var(--app-font-meta); }

.selected-date-card {
  align-items: center;
  background: var(--app-color-control-surface);
  border-radius: var(--app-radius-control);
  display: flex;
  justify-content: space-between;
  margin-top: var(--app-space-sm);
  padding: var(--app-space-md) 18rpx;
}

.selected-date-label { color: var(--app-color-text-secondary); font-size: var(--app-font-status); }
.selected-date-value { color: var(--app-color-text-primary); font-size: var(--app-font-value); font-weight: 700; }
.time-slots { display: flex; flex-direction: column; gap: var(--app-control-gap); }

.time-slot {
  align-items: center;
  background: var(--app-color-surface);
  border: 1rpx solid var(--app-color-border-control);
  border-radius: var(--app-radius-control);
  color: var(--app-color-text-primary);
  display: flex;
  font-size: var(--app-font-body);
  justify-content: space-between;
  line-height: 1;
  margin: 0;
  min-height: var(--app-touch-target);
  padding: 0 20rpx;
  text-align: left;
}

.time-slot::after { border: 0; }
.time-slot--selected { background: var(--app-color-primary-soft); border-color: var(--app-color-primary); color: var(--app-color-primary); }
.time-slot-check { background: var(--app-color-primary); border-radius: 50%; color: var(--app-color-surface); height: 32rpx; padding: 0; text-align: center; width: 32rpx; }
.time-selection-error { color: var(--app-color-danger); display: block; font-size: var(--app-font-status); margin-top: var(--app-space-sm); }
</style>
