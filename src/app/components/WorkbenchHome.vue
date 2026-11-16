<template>
  <view class="home-page c1-workbench">
    <view class="c1-brandbar">
      <view><text class="c1-brand">{{ homeBrand.name }}服务</text><text class="c1-title">工作台</text></view>
      <text v-if="board.demoDate" class="c1-demo">演示数据</text>
    </view>
    <view class="c1-welcome">
      <view class="c1-roof" aria-hidden="true" />
      <view class="c1-welcome-row"><text class="home-greeting c1-greeting">{{ greeting }}</text><text class="c1-date">{{ dateText }}</text></view>
      <text class="c1-role">{{ session.session?.currentRole?.name || '当前身份待确认' }}</text>
    </view>
    <view class="c1-content">
      <view class="c1-card c1-todos">
        <button v-for="item in categories" :key="item.key" class="c1-todo" :data-testid="`home-todo-${item.key}`" @tap="openCategory(item.key)">
          <text class="c1-count">{{ board.state === 'loading' ? '…' : board.counts[item.key] ?? '—' }}</text>
          <text class="c1-todo-label">{{ item.label }}<text aria-hidden="true"> ›</text></text>
        </button>
      </view>
      <text v-if="board.state === 'ready' && !board.demoDate" class="c1-note">待办统计未接入，可按分类查看当前可见工单</text>
      <view v-if="board.state === 'loading' || board.state === 'idle'" class="c1-card c1-state" role="status"><text class="c1-section">正在整理工作事项</text><text class="c1-muted">核对当前身份与可见工单</text></view>
      <view v-else-if="board.state === 'unavailable'" class="c1-card c1-state"><text class="c1-section">当前身份待确认</text><text class="c1-muted">暂不能读取工单，请确认登录身份后重试</text></view>
      <view v-else-if="board.state === 'error'" class="c1-card c1-state" role="alert"><text class="c1-section">工作事项加载失败</text><text class="c1-muted">未能确认当前任务，请重试</text><button class="c1-text-button" @tap="board.refresh">重新加载</button></view>
      <view v-else-if="board.next" class="c1-card c1-next">
        <view class="c1-section-row"><text class="c1-section">{{ board.demoDate ? '下一项任务' : '当前可查看工单' }}</text><text v-if="board.next.time" class="c1-time">{{ board.next.time }}</text></view>
        <view class="c1-task-main">
          <view class="c1-task-icon"><AppIcon name="order" :size="25" color="var(--wb-primary)" /></view>
          <view class="c1-task-copy"><text class="c1-task-title">{{ board.next.title }}</text><text class="c1-muted">{{ location(board.next.order) }}</text></view>
        </view>
        <view class="c1-task-footer"><text class="c1-instruction">{{ board.next.instruction }}</text><button class="c1-primary" :disabled="navigating" data-testid="home-next" @tap="openTask(board.next)">查看工单</button></view>
      </view>
      <view v-else class="c1-card c1-state"><text class="c1-section">暂无可查看的工单</text><text class="c1-muted">可在待办分类中查看待接单事项</text></view>
      <view class="c1-card c1-schedule">
        <view class="c1-section-row"><text class="c1-section">今日安排</text><text class="c1-muted">{{ board.state === 'error' ? '暂不可用' : board.state !== 'ready' ? '待加载' : board.demoDate ? `${board.tasks.length} 项` : '未接入' }}</text></view>
        <button v-for="task in board.tasks" :key="String(task.order.id)" class="c1-schedule-row" :disabled="navigating" :data-testid="`home-schedule-${task.order.id}`" @tap="openTask(task)">
          <text class="c1-time">{{ task.time }}</text><view class="c1-task-copy"><text class="c1-task-title">{{ task.title }}</text><text class="c1-muted">{{ location(task.order) }}</text></view><text class="c1-arrow" aria-hidden="true">›</text>
        </button>
        <text v-if="!board.tasks.length" class="c1-muted c1-state-copy">{{ board.state === 'error' ? '加载失败，暂不能确认安排' : board.demoDate ? '今日暂无演示安排' : '预约日程尚未接入，请在工单中核对约定时间' }}</text>
      </view>
      <view class="c1-card c1-common">
        <text class="c1-section">常用入口</text>
        <view class="c1-common-grid"><button v-for="item in shortcuts" :key="item.key" class="c1-shortcut" :class="{ 'work-orders-entry': item.key === 'all' }" :data-testid="`home-work-${item.key}`" @tap="openWork(item.key)"><view class="c1-shortcut-icon" :class="`c1-shortcut-icon--${item.key}`"><AppIcon :name="item.icon" :size="26" color="currentColor" /></view><text>{{ item.label }}</text></button></view>
      </view>
      <view class="c1-card c1-month"><AppIcon name="complete" :size="23" color="var(--wb-primary)" /><text>本月已完成</text><text class="c1-month-value">{{ board.state === 'error' ? '暂不可用' : board.state !== 'ready' ? '待加载' : board.completed === null ? '未接入' : `${board.completed} 单` }}</text></view>
      <text class="c1-note">{{ board.demoDate ? '演示安排与统计仅用于本地体验；工单权限仍逐项核验' : '本月完成口径尚未接入，暂不展示统计数值' }}</text>
      <text v-if="feedback" class="c1-note" role="alert">{{ feedback }}</text>
    </view>
  </view>
</template>
<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { onShow, onHide } from '@dcloudio/uni-app'
import { homeBrand } from '@brand-ui/home-brand'
import { openMainRoute } from '@app/main-navigation'
import { useSessionStore } from '@shared/state'
import type { WorkOrderCategory, WorkOrderSummary } from '@shared/ports'
import AppIcon from '@shared/ui/AppIcon.vue'
import { useWorkbenchStore, type WorkbenchTask } from '@features/home/workbench'
import { workOrderCategories } from '@features/work-orders/list-categories'
import { useWorkOrderListStore } from '@features/work-orders/list'
import { workOrderDetailRouteFor } from '@features/work-orders/detail'
import { workOrderListActionFor } from '@features/work-orders/list-actions'
import { workOrderReadScopeKey } from '@features/work-orders/read-identity-scope'
import type { WorkKind } from '@features/work-orders/work-kind'
const session = useSessionStore(), board = useWorkbenchStore(), list = useWorkOrderListStore()
const navigating = ref(false), feedback = ref('')
let active = true
const categories = workOrderCategories.filter(item => item.key !== 'all')
const shortcuts = [ { key: 'all', label: '全部工单', icon: 'task' }, { key: 'survey', label: '勘查作业', icon: 'search' }, { key: 'construction', label: '施工记录', icon: 'order' }, { key: 'acceptance', label: '验收记录', icon: 'complete' } ] as const
const greeting = computed(() => `您好${session.session?.user.displayName?.trim() ? `，${session.session.user.displayName.trim()}` : ''}`)
const dateText = computed(() => { const date = new Date(); return `${date.getMonth() + 1}月${date.getDate()}日 周${'日一二三四五六'[date.getDay()]}` })
function location(order: WorkOrderSummary) { return [order.customerName, order.serviceAddress || order.serviceDistrict].filter(Boolean).join(' · ') || '客户与地点待确认' }
watch(() => workOrderReadScopeKey(session.session), () => { feedback.value = ''; if (active) void board.refresh() }, { immediate: true, flush: 'sync' })
onHide(() => { active = false; board.clear() })
onShow(() => { active = true; if (board.state !== 'loading') void board.refresh() })
onBeforeUnmount(() => board.clear())
async function openCategory(category: WorkOrderCategory) {
  if (navigating.value) return
  navigating.value = true; board.clear()
  try { list.prepareEntry(category); if (!await openMainRoute('workOrders')) await board.refresh() } finally { navigating.value = false }
}
async function openWork(kind: WorkKind) {
  if (navigating.value) return
  navigating.value = true; board.clear()
  try { list.prepareEntry('all', kind); if (!await openMainRoute('workOrders')) await board.refresh() } finally { navigating.value = false }
}
async function openTask(task: WorkbenchTask) {
  if (navigating.value || board.state !== 'ready') return
  const scope = workOrderReadScopeKey(session.session)
  navigating.value = true; feedback.value = ''; board.clear()
  try {
    // Re-establish ordinary list membership immediately before detail navigation.
    const result = await list.selectWorkKind('all')
    if (!scope || scope !== workOrderReadScopeKey(session.session)) return
    const current = list.items.find(item => item.id === task.order.id)
    if (result.state !== 'succeeded' || !current || !workOrderListActionFor(current, session.session).detailAccessible) {
      board.clear(); board.state = 'error'; feedback.value = '该任务已变化或暂不可访问，请重新加载工作台'; return
    }
    await list.navigateTo(workOrderDetailRouteFor(current.id))
  } finally { navigating.value = false }
}
</script>
<style lang="scss">
@import "@brand-ui/workbench.scss";
</style>
