<template>
  <!-- DS-06 one-point proof: visual rendering only. The existing detail page
       owns Workflow eligibility, source title and action routing. -->
  <view class="current-task-card task-focus-panel" :class="`task-focus-panel--${tone}`"
    data-testid="task-focus-panel">
    <view class="task-focus-panel__eyebrow">
      <view class="task-focus-panel__marker" aria-hidden="true" />
      <text>当前任务</text>
    </view>
    <text class="task-focus-panel__title" data-testid="task-focus-title">{{ title }}</text>
    <button class="primary-task-action task-focus-panel__action" type="button"
      :disabled="disabled" :aria-disabled="disabled"
      :aria-label="actionLabel"
      hover-class="task-focus-panel__action--pressed"
      :hover-start-time="0" :hover-stay-time="70"
      data-testid="task-focus-action" @tap="activate">
      <text class="task-focus-panel__action-label">{{ actionLabel }}</text>
      <text class="task-focus-panel__chevron" aria-hidden="true">›</text>
    </button>
    <text v-if="disabled && note" class="task-focus-panel__note"
      data-testid="task-focus-disabled-note">{{ note }}</text>
  </view>
</template>
<script setup lang="ts">
const props = withDefaults(defineProps<{
  readonly title: string
  readonly actionLabel: string
  readonly tone?: 'blue' | 'red' | 'orange' | 'purple' | 'green' | 'gray'
  readonly disabled: boolean
  readonly note?: string
}>(), { tone: 'blue', note: '' })
const emit = defineEmits<{ (event: 'action'): void }>()
function activate(): void {
  if (props.disabled) return
  emit('action')
}
</script>
<style scoped>
/* Independent master geometry. No old page selectors drive its materials. */
.task-focus-panel.current-task-card {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
  height: 169px;
  position: relative;
  padding: 20px 18px 18px;
  margin-top: 13px;
  overflow: hidden;
  border: 1px solid #162c4a;
  border-radius: 19px;
  background: #162c4a;
  box-shadow: 0 9px 18px rgba(11,35,69,.12), 0 1px 2px rgba(10,31,57,.08);
  color: #fff;
}
.task-focus-panel__eyebrow {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #b7c8df;
  font-size: 12px;
  line-height: 17px;
  font-weight: 570;
}
.task-focus-panel__marker {
  width: 6px;
  height: 6px;
  flex: 0 0 6px;
  border-radius: 999px;
  background: #7aafff;
  box-shadow: 0 0 0 3px rgba(122,175,255,.10);
}
.task-focus-panel--red .task-focus-panel__marker { background: #f9a5b3; box-shadow: 0 0 0 3px rgba(249,165,179,.1); }
.task-focus-panel--orange .task-focus-panel__marker { background: #ffd298; box-shadow: 0 0 0 3px rgba(255,210,152,.1); }
.task-focus-panel--purple .task-focus-panel__marker { background: #c4b1fc; box-shadow: 0 0 0 3px rgba(196,177,252,.1); }
.task-focus-panel--green .task-focus-panel__marker { background: #9adbbb; box-shadow: 0 0 0 3px rgba(154,219,187,.1); }
.task-focus-panel--gray .task-focus-panel__marker { background: #b8c4d4; box-shadow: 0 0 0 3px rgba(184,196,212,.1); }
.task-focus-panel__title {
  display: block;
  color: #fff;
  margin-top: 7px;
  font-size: 25px;
  line-height: 33px;
  font-weight: 720;
  letter-spacing: -.55px;
  overflow-wrap: anywhere;
}
.task-focus-panel .primary-task-action.task-focus-panel__action {
  box-sizing: border-box;
  position: absolute;
  left: 18px;
  right: 18px;
  bottom: 17px;
  width: auto;
  height: 51px;
  min-height: 51px;
  padding: 0 36px;
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 12px;
  color: #fff;
  background: #2677ed;
  box-shadow: 0 3px 6px rgba(4,29,70,.10);
  font-size: 15px;
  font-weight: 650;
  line-height: 20px;
  letter-spacing: .1px;
  text-align: center;
  transition: background-color .15s ease, transform .15s ease;
}
.task-focus-panel .primary-task-action.task-focus-panel__action::after { border: 0; }
.task-focus-panel .primary-task-action.task-focus-panel__action--pressed:not([disabled]) {
  background: #1765d8;
  transform: translateY(1px);
}
.task-focus-panel .primary-task-action.task-focus-panel__action[disabled] {
  background: #385371;
  color: #c9d5e5;
  box-shadow: none;
  opacity: 1;
}
.task-focus-panel__action-label { display: block; color: inherit; line-height: 20px; }
.task-focus-panel__chevron {
  position: absolute;
  right: 17px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 18px;
  font-weight: 400;
  line-height: 18px;
  color: inherit;
}
.task-focus-panel__note {
  display: block;
  position: absolute;
  bottom: 0;
  left: 18px;
  right: 18px;
  padding: 5px 0;
  font-size: 10px;
  line-height: 14px;
  text-align: center;
  color: #b7c8df;
}
.task-focus-panel:has(.task-focus-panel__note) .primary-task-action.task-focus-panel__action {
  bottom: 27px;
}
@media (max-width: 360px) {
  .task-focus-panel.current-task-card { padding-left: 16px; padding-right: 16px; }
  .task-focus-panel .primary-task-action.task-focus-panel__action { left: 16px; right: 16px; }
}
@media (prefers-reduced-motion: reduce) {
  .task-focus-panel .primary-task-action.task-focus-panel__action { transition: none; }
}
</style>