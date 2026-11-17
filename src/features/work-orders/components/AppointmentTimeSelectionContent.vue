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
            :aria-pressed="shortcut.date === selectedDate"
            @tap="emit('select-date', shortcut.date)"
          >
            <view class="date-shortcut-label"><AppIcon v-if="shortcut.date === selectedDate" name="complete" :size="14" color="var(--app-color-primary)" aria-hidden="true" /><text>{{ shortcut.label }}</text></view>
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
            :aria-pressed="selectedOptionKey === option.key"
            @tap="emit('select-option', option.key)"
          >
            <text>{{ option.label }}</text>
            <AppIcon v-if="selectedOptionKey === option.key" class="time-slot-check" name="complete" :size="14" color="var(--app-color-surface)" aria-hidden="true" />
          </button>
        </view>
        <picker v-if="allowMinuteSelection" mode="time" :value="minuteTime || '09:00'" :disabled="disabled" @change="handleMinuteChange" data-testid="appointment-minute-picker">
          <view class="time-slot" :class="{'time-slot--selected': Boolean(minuteTime)}">{{ minuteTime ? `已选 ${minuteTime} · 调整时间` : '选择其他时间（到分钟）' }}</view>
        </picker>
        <text v-if="timeError" class="time-selection-error">{{ timeError }}</text>
      </view>
    </view>
</template>
<script setup lang="ts">
import AppIcon from '@shared/ui/AppIcon.vue'
import {dateLabelFor,type AppointmentDateShortcut,type AppointmentTimeOption} from '../appointment-time'
defineProps<{selectedDate:string;selectedOptionKey:string;dateShortcuts:readonly AppointmentDateShortcut[];timeOptions:readonly AppointmentTimeOption[];timeError?:string;disabled?:boolean;allowMinuteSelection?:boolean;minuteTime?:string}>()
const emit=defineEmits<{(e:'select-date',value:string):void;(e:'select-option',value:string):void;(e:'select-minute',value:string):void}>()
function handleDateChange(event:unknown){const value=(event as {detail?:{value?:unknown}})?.detail?.value;if(typeof value==='string'&&value)emit('select-date',value)}
function handleMinuteChange(event:unknown){const value=(event as {detail?:{value?:unknown}})?.detail?.value;if(typeof value==='string'&&value)emit('select-minute',value)}
</script>
<style>
@import "@brand-ui/appointment-time.scss";
</style>
