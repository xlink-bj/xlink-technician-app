<template>
  <AppLoadingState v-if="session.status === 'unknown'" label="正在准备身份信息" />
  <view v-else-if="!canAccess" class="main-guard">
    <text v-if="feedback" role="alert">{{ feedback }}</text>
    <text v-else>{{ session.status === 'error' ? '登录状态无法确认，请重新登录' : '登录后查看我的' }}</text>
    <button @tap="openMainRoute('home')">返回登录</button></view>
  <view v-else class="main-page me-page">
    <view class="main-brandbar"><view><text class="main-brand">{{ homeBrand.name }}服务</text>
      <text class="main-brand-title">我的</text></view></view>
    <view class="me-content">
      <view class="me-profile main-panel">
        <view class="me-avatar"><AppIcon name="contact" :size="44" color="currentColor" aria-hidden="true" /></view>
        <view class="me-profile-copy"><text class="me-name">{{ displayName }}</text>
          <text class="me-role">{{ roleName }}</text><text class="me-service">{{ homeBrand.name }}服务</text></view>
      </view>
      <view class="main-panel me-section"><text class="me-section-title">账户信息</text>
        <view class="me-info-row"><text>姓名</text><text class="me-info-value">{{ displayName }}</text></view>
        <view class="me-info-row"><text>岗位</text><text class="me-info-value">{{ roleName }}</text></view>
        <view class="me-info-row"><text>所属服务</text><text class="me-info-value">{{ homeBrand.name }}服务</text></view>
      </view>
      <view class="main-panel me-section"><text class="me-section-title">应用信息</text>
        <view class="me-info-row"><text>当前版本</text><text class="me-info-value">{{ manifest.versionName || '版本未提供' }}</text></view>
        <view class="me-info-row"><text>品牌</text><text class="me-info-value">{{ homeBrand.name }}服务</text></view>
        <navigator v-if="policies.agreementUrl" class="me-info-row me-link" url="/pages/legal/legal?kind=agreement"><text>用户协议</text><text class="me-info-value">›</text></navigator>
        <navigator v-if="policies.privacyUrl" class="me-info-row me-link" url="/pages/legal/legal?kind=privacy"><text>隐私政策</text><text class="me-info-value">›</text></navigator>
      </view>
      <button class="main-logout" :disabled="loggingOut" @tap="logout">
        {{ loggingOut ? '退出中…' : '退出登录' }}</button>
      <text v-if="feedback" class="main-error" role="alert">{{ feedback }}</text>
      <text class="me-footer">专注服务 · 用心交付</text>
    </view>
  </view>
  <AppMainNavigation v-if="canAccess" active="me" />
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { openMainRoute } from '@app/main-navigation'
import { confirmLogout } from '@app/logout-confirmation'
import { hasAuthenticatedSession } from '@features/home/access'
import { legalLoginPolicies } from '@features/session/login-consent'
import { homeBrand } from '@brand-ui/home-brand'
import { useSessionStore } from '@shared/state'
import manifest from '../../manifest.json'
import AppMainNavigation from '@app/components/AppMainNavigation.vue'
import AppLoadingState from '@shared/ui/AppLoadingState.vue'
import AppIcon from '@shared/ui/AppIcon.vue'
const session = useSessionStore()
const policies = legalLoginPolicies(import.meta.env)
const canAccess = computed(() => hasAuthenticatedSession(session.status, session.session))
const displayName = computed(() => session.session?.user.displayName?.trim() || '姓名未提供')
const roleName = computed(() => session.session?.currentRole?.name?.trim() || '岗位未提供')
const loggingOut = ref(false)
const feedback = ref('')
async function logout(): Promise<void> {
  if (loggingOut.value) return
  loggingOut.value = true
  feedback.value = ''
  try {
    if (!await confirmLogout()) return
    const result = await session.endSession()
    if (result.state === 'succeeded') await openMainRoute('home')
    else feedback.value = '退出登录失败，请稍后重试'
  } finally { loggingOut.value = false }
}
</script>
<style lang="scss">@import '@brand-ui/main-pages.scss';</style>
