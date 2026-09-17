<template>
  <AppLoadingState v-if="session.status === 'unknown'" label="正在准备应用" />
  <view v-else-if="showHome" class="home-page">
    <view class="home-hero">
      <view class="home-hero-circles" aria-hidden="true">
        <view class="home-hero-circle home-hero-circle-large" />
        <view class="home-hero-circle home-hero-circle-small" />
      </view>
      <view class="home-hero-inner">
        <view class="home-brand">
          <text class="home-brand-name">修链</text>
          <text class="home-brand-tagline">屋顶维修</text>
        </view>
        <text class="home-greeting">{{ homeGreeting }}</text>
        <text class="home-subtitle">从当前可见的工单开始今天的工作</text>
      </view>
    </view>

    <view class="home-content">
      <view class="home-surface work-surface">
        <view class="section-heading-row">
          <view class="section-heading-copy">
            <text class="section-title">今日任务</text>
            <text class="section-description">优先处理会影响履约节奏的事项</text>
          </view>
          <navigator class="section-link" :url="workOrdersRoute">
            <text>全部任务</text>
            <text class="section-link-arrow" aria-hidden="true">›</text>
          </navigator>
        </view>

        <navigator class="work-orders-entry" :url="workOrdersRoute">
          <view class="entry-icon" aria-hidden="true">
            <text>工</text>
          </view>
          <view class="entry-copy">
            <text class="entry-title">查看当前可见工单</text>
            <text class="entry-subtitle">打开工单列表</text>
          </view>
          <text class="entry-arrow" aria-hidden="true">›</text>
        </navigator>
      </view>

      <view v-if="mockControlVisible" class="home-surface mock-developer-panel">
        <view class="mock-panel-heading">
          <text class="mock-panel-title">业务数据源</text>
          <text class="mock-source-indicator" :class="{ 'mock-source-indicator--real': mockMode === 'off' }">
            {{ businessDataSourceLabel }}
          </text>
        </view>
        <view class="mock-toggle-row">
          <view class="mock-toggle-copy">
            <text class="mock-toggle-label">Mock 数据</text>
            <text class="mock-toggle-hint">仅非生产环境可用</text>
          </view>
          <switch
            class="mock-switch"
            :checked="mockMode !== 'off'"
            :disabled="mockSwitchInFlight"
            @change="handleMockToggle"
          />
        </view>
        <view v-if="mockMode !== 'off'" class="mock-mode-row">
          <text class="mock-mode-label">Mock 场景</text>
          <view class="mock-mode-options">
            <button
              class="mock-mode-button"
              :class="{ 'mock-mode-button-active': mockMode === 'data' }"
              @tap="selectMockMode('data')"
            >
              数据
            </button>
            <button
              class="mock-mode-button"
              :class="{ 'mock-mode-button-active': mockMode === 'empty' }"
              @tap="selectMockMode('empty')"
            >
              空状态
            </button>
          </view>
        </view>
        <view v-if="mockMode === 'data'" class="mock-action-scenarios">
          <text class="mock-mode-label">Action Workspace 场景</text>
          <navigator
            v-for="scenario in mockActionWorkspaceScenarios"
            :key="scenario.key"
            class="mock-action-scenario"
            :url="scenario.route"
          >
            <view class="mock-action-scenario-copy">
              <text class="mock-action-scenario-label">{{ scenario.label }}</text>
              <text class="mock-action-scenario-description">{{ scenario.description }}</text>
            </view>
            <text class="mock-action-scenario-arrow" aria-hidden="true">›</text>
          </navigator>
        </view>
      </view>

      <LocalDraftDiagnosticsPanel
        v-if="mockControlVisible"
        :mock-mode="mockMode"
        :loading="draftDiagnostics.loading"
        :entries="draftDiagnostics.entries"
        :unfinished-total="draftDiagnostics.unfinishedTotal"
        :invalid-total="draftDiagnostics.invalidTotal"
        :error="draftDiagnostics.error"
        :seed-available="draftDiagnostics.seedAvailable"
        :cleanup-available="draftDiagnostics.cleanupAvailable"
        @refresh="refreshDraftDiagnostics"
        @seed="seedMockDrafts"
        @clear="clearMockDrafts"
      />
    </view>

    <view class="home-footer">
      <button class="secondary" :disabled="isBusy" @tap="logout">
        {{ logoutInFlight ? '退出中…' : '退出登录' }}
      </button>
      <text v-if="feedback" class="feedback">{{ feedback }}</text>
    </view>
  </view>
  <view v-else class="login-page">
    <view v-if="loginStage === 'launch'" class="login-stage launch-stage">
      <view class="brand-lockup">
        <view class="brand-copy">
          <text class="brand-name">修链</text>
          <text class="brand-tagline">屋顶维修</text>
        </view>
      </view>

      <text class="launch-message">让屋顶维修更专业、更高效</text>

      <view class="worker-scene" aria-hidden="true">
        <view class="scene-building scene-building-left" />
        <view class="scene-building scene-building-right" />
        <view class="scene-roof scene-roof-back" />
        <view class="scene-roof scene-roof-front" />
        <view class="scene-worker">
          <view class="worker-helmet" />
          <view class="worker-head" />
          <view class="worker-body" />
          <view class="worker-shirt" />
          <view class="worker-arm worker-arm-left" />
          <view class="worker-arm worker-arm-right" />
          <view class="worker-leg worker-leg-left" />
          <view class="worker-leg worker-leg-right" />
          <view class="worker-shoe worker-shoe-left" />
          <view class="worker-shoe worker-shoe-right" />
        </view>
      </view>

      <view class="trust-row">
        <view class="trust-item">
          <text class="trust-icon">♢</text>
          <text>专业可靠</text>
        </view>
        <view class="trust-item">
          <text class="trust-icon">◴</text>
          <text>高效便捷</text>
        </view>
        <view class="trust-item">
          <text class="trust-icon">♙</text>
          <text>安全保障</text>
        </view>
      </view>

      <button class="launch-cta" aria-label="进入登录" @tap="goToMethods">
        <text class="submit-label">进入登录</text>
      </button>
    </view>

    <view v-else-if="loginStage === 'methods'" class="login-stage methods-stage">
      <view class="brand-lockup brand-lockup-compact">
        <view class="brand-copy">
          <text class="brand-name">修链</text>
          <text class="brand-tagline">屋顶维修</text>
        </view>
      </view>

      <text class="stage-title">选择登录方式</text>

      <view class="method-list">
        <button class="method-card method-card-active" @tap="selectMethod('verification_code')">
          <text class="method-icon method-icon-blue">▣</text>
          <view class="method-copy">
            <text class="method-title">验证码登录</text>
            <text class="method-subtitle">通过手机号验证登录</text>
          </view>
          <text class="method-badge">推荐</text>
        </button>

        <view class="method-card method-card-disabled" aria-disabled="true">
          <text class="method-icon method-icon-muted">▥</text>
          <view class="method-copy">
            <text class="method-title method-title-muted">密码登录</text>
            <text class="method-subtitle">暂未开放</text>
          </view>
        </view>

        <button
          class="method-card"
          :class="quickLoginAvailable ? 'method-card-active' : 'method-card-disabled'"
          :disabled="!quickLoginAvailable || isBusy"
          :aria-disabled="!quickLoginAvailable"
          @tap="quickLogin"
        >
          <text class="method-icon method-icon-amber">◒</text>
          <view class="method-copy">
            <text class="method-title" :class="{ 'method-title-muted': !quickLoginAvailable }">快捷登录</text>
            <text class="method-subtitle">
              {{ quickLoginAvailable ? '一键使用测试账号登录' : '仅非生产环境配置后可用' }}
            </text>
          </view>
          <text v-if="quickLoginAvailable" class="method-badge method-badge-amber">测试</text>
        </button>
      </view>

      <text v-if="feedback" class="feedback method-feedback" role="alert">{{ feedback }}</text>

      <text class="policy-note">登录即表示同意《用户协议》与《隐私政策》</text>
      <button class="back-link" @tap="loginStage = 'launch'">返回</button>
    </view>

    <view v-else class="login-stage form-stage">
      <button class="back-button" aria-label="返回登录方式" @tap="loginStage = 'methods'">‹</button>

      <view class="brand-lockup brand-lockup-compact">
        <view class="brand-copy">
          <text class="brand-name">修链</text>
          <text class="brand-tagline">屋顶维修</text>
        </view>
      </view>

      <text class="stage-title">验证码登录</text>
      <text class="form-intro">使用手机号和验证码登录</text>

      <view class="field">
        <text class="label">手机号</text>
        <input
          v-model="phoneNumber"
          class="input"
          type="text"
          maxlength="32"
          placeholder="请输入手机号"
          :disabled="isBusy"
        />
      </view>

      <view class="field code-field">
        <text class="label">验证码</text>
        <view class="code-input-wrap">
          <input
            v-model="verificationCode"
            class="code-input"
            type="number"
            maxlength="16"
            placeholder="请输入短信验证码"
            :disabled="isBusy"
          />
          <button class="code-button" disabled>获取验证码</button>
        </view>
        <text class="field-hint">请输入已收到的验证码</text>
      </view>

      <text v-if="feedback" class="feedback" role="alert">{{ feedback }}</text>
      <text v-if="session.status === 'authenticating'" class="in-flight">登录中，请稍候…</text>

      <button
        class="submit"
        aria-label="登录"
        :disabled="isBusy"
        @tap="submit"
      >
        <text class="submit-label">登录</text>
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { onShow } from '@dcloudio/uni-app'

import {
  isBusinessMockDeveloperModeAvailable,
  isBusinessMockMode,
  setBusinessMockMode,
  type BusinessMockMode,
} from '@app/business-mock'
import { mockActionWorkspaceScenarios } from '@app/action-workspace-harness'
import { hasAuthenticatedSession, workOrdersRoute } from '@features/home/access'
import LocalDraftDiagnosticsPanel from '@features/home/components/LocalDraftDiagnosticsPanel.vue'
import {
  reloadBusinessReadStores,
  switchBusinessDataSource,
} from '@features/home/business-data-source'
import { useLocalDraftDiagnosticsStore } from '@features/home/draft-diagnostics'
import { submitLogin, type LoginSubmissionState } from '@features/session/login'
import { resolveQuickLoginInput } from '@features/session/quick-login'
import {
  advanceLoginStage,
  stageForLoginMethod,
  type LoginMethod,
  type LoginStage,
} from '@features/session/login-flow'
import { useSessionStore } from '@shared/state'
import type { OperationError } from '@shared/types'
import AppLoadingState from '@shared/ui/AppLoadingState.vue'
import { useWorkOrderDetailStore } from '@features/work-orders/detail'
import { useWorkOrderListStore } from '@features/work-orders/list'

const session = useSessionStore()
const workOrders = useWorkOrderListStore()
const workOrderDetail = useWorkOrderDetailStore()
const draftDiagnostics = useLocalDraftDiagnosticsStore()
const phoneNumber = ref('')
const verificationCode = ref('')
const loginStage = ref<LoginStage>('launch')
const message = ref('')
const logoutInFlight = ref(false)
const mockControlVisible = computed(() => isBusinessMockDeveloperModeAvailable())
const mockMode = ref<BusinessMockMode>(isBusinessMockMode())
const mockSwitchInFlight = ref(false)
const submissionState = reactive<LoginSubmissionState>({ inFlight: false })
const homeGreeting = computed(() => {
  const displayName = session.session?.user.displayName?.trim()
  return displayName ? `您好，${displayName}` : '您好'
})
const isBusy = computed(
  () => submissionState.inFlight || logoutInFlight.value || session.status === 'authenticating',
)
const showHome = computed(() => hasAuthenticatedSession(session.status, session.session))
const quickLoginAvailable = computed(() => resolveQuickLoginInput() !== null)
const businessDataSourceLabel = computed(() => (mockMode.value === 'off' ? 'Real API' : 'Mock'))
const feedback = computed(() => message.value || userFacingLoginMessage(session.error))

watch(
  () => session.status,
  (status) => {
    if (status === 'unauthenticated') loginStage.value = 'launch'
    void draftDiagnostics.refresh()
  },
)

watch(
  () => session.session?.user.id,
  () => {
    void draftDiagnostics.refresh()
  },
)

onShow(() => {
  if (showHome.value) void draftDiagnostics.refresh()
})

function goToMethods(): void {
  loginStage.value = advanceLoginStage(loginStage.value)
}

function selectMethod(method: LoginMethod): void {
  const nextStage = stageForLoginMethod(method)
  if (nextStage) loginStage.value = nextStage
}

async function quickLogin(): Promise<void> {
  if (isBusy.value) return
  const input = resolveQuickLoginInput()
  if (!input) {
    message.value = '快捷登录仅在非生产环境配置后可用'
    return
  }

  message.value = ''
  const result = await submitLogin(input, submissionState, (request) => session.login(request))
  if (result.state !== 'succeeded') message.value = userFacingLoginMessage(result.error)
}

async function handleMockToggle(event: Event): Promise<void> {
  if (mockSwitchInFlight.value) return
  const detail = (event as Event & { detail?: { value?: boolean } }).detail
  const enabled = detail?.value === true
  mockSwitchInFlight.value = true
  try {
    await switchBusinessDataSource(
      enabled ? 'mock' : 'real',
      setBusinessMockMode,
      { list: workOrders, detail: workOrderDetail },
    )
  } finally {
    mockMode.value = isBusinessMockMode()
    await draftDiagnostics.refresh()
    mockSwitchInFlight.value = false
  }
}

async function selectMockMode(mode: Exclude<BusinessMockMode, 'off'>): Promise<void> {
  if (mockMode.value === 'off') return
  mockSwitchInFlight.value = true
  setBusinessMockMode(mode)
  try {
    await reloadBusinessReadStores({ list: workOrders, detail: workOrderDetail })
  } finally {
    mockMode.value = isBusinessMockMode()
    await draftDiagnostics.refresh()
    mockSwitchInFlight.value = false
  }
}

async function refreshDraftDiagnostics(): Promise<void> {
  await draftDiagnostics.refresh()
}

async function seedMockDrafts(): Promise<void> {
  await draftDiagnostics.seedMockDrafts()
}

async function clearMockDrafts(): Promise<void> {
  await draftDiagnostics.clearMockDrafts()
}

async function submit(): Promise<void> {
  if (isBusy.value) return
  message.value = ''
  const result = await submitLogin(
    { phoneNumber: phoneNumber.value, verificationCode: verificationCode.value },
    submissionState,
    (request) => session.login(request),
  )
  if (result.state === 'succeeded') {
    verificationCode.value = ''
  } else {
    message.value = userFacingLoginMessage(result.error)
  }
}

async function logout(): Promise<void> {
  if (logoutInFlight.value) return
  logoutInFlight.value = true
  message.value = ''
  try {
    const result = await session.endSession()
    if (result.state !== 'succeeded') {
      message.value = userFacingLoginMessage(result.error) || '退出登录失败，请稍后重试'
    }
  } finally {
    logoutInFlight.value = false
  }
}

function userFacingLoginMessage(error: OperationError | null | undefined): string {
  if (!error) return ''
  switch (error.category) {
    case 'validation':
      if (error.message.includes('Phone number')) return '请输入手机号'
      if (error.message.includes('Verification code')) return '请输入验证码'
      return '请检查输入后重试'
    case 'network_retryable':
      return '网络暂时不可用，请稍后重试'
    case 'session_invalid':
      return '登录状态已失效，请重新登录'
    case 'authorization_denied':
      return '当前账号暂无登录权限'
    case 'unsupported_capability':
      return '当前登录方式暂不可用'
    case 'cancelled':
      return '登录已取消'
    case 'server_terminal':
    default:
      return '登录失败，请稍后重试'
  }
}
</script>

<style>
.home-page {
  background: #f5f7fb;
  box-sizing: border-box;
  display: block;
  min-height: 100vh;
  padding-bottom: calc(48rpx + constant(safe-area-inset-bottom));
  padding-bottom: calc(48rpx + env(safe-area-inset-bottom));
  width: 100%;
}

.login-page {
  background:
    radial-gradient(circle at 50% 12%, rgba(20, 120, 242, 0.08), transparent 34%),
    linear-gradient(180deg, #ffffff 0%, #f8fbff 58%, #f4f8ff 100%);
  box-sizing: border-box;
  display: block;
  min-height: 100vh;
  padding: 0 32rpx calc(96rpx + constant(safe-area-inset-bottom));
  padding-bottom: calc(96rpx + env(safe-area-inset-bottom));
  width: 100%;
}

.home-content,
.home-footer {
  margin: 0;
  max-width: none;
  width: 100%;
}

.home-hero {
  background: linear-gradient(135deg, #0876ff 0%, #0068f4 44%, #0b84ff 100%);
  box-sizing: border-box;
  min-height: 468rpx;
  overflow: hidden;
  position: relative;
  width: 100%;
}

.home-hero::after {
  background: #f5f7fb;
  border-radius: 50% 50% 0 0 / 100% 100% 0 0;
  bottom: -72rpx;
  content: '';
  height: 112rpx;
  left: -20%;
  position: absolute;
  width: 140%;
  z-index: 1;
}

.home-hero-inner {
  box-sizing: border-box;
  margin: 0 auto;
  max-width: none;
  padding: 56rpx 32rpx 164rpx;
  position: relative;
  width: 100%;
  z-index: 2;
}

.home-hero-circles {
  bottom: 0;
  left: 0;
  pointer-events: none;
  position: absolute;
  right: 0;
  top: 0;
}

.home-hero-circle {
  background: rgba(255, 255, 255, 0.06);
  border-radius: 50%;
  position: absolute;
}

.home-hero-circle-large {
  bottom: -20rpx;
  height: 300rpx;
  right: -116rpx;
  width: 300rpx;
}

.home-hero-circle-small {
  bottom: -48rpx;
  height: 216rpx;
  right: -4rpx;
  width: 216rpx;
}

.home-brand {
  align-items: baseline;
  display: flex;
  gap: 16rpx;
}

.mock-developer-panel {
  border-color: rgba(23, 105, 223, 0.35);
  box-shadow: 0 12rpx 28rpx rgba(28, 66, 117, 0.06);
}

.mock-panel-heading {
  align-items: center;
  display: flex;
  justify-content: space-between;
}

.mock-panel-title {
  color: #1d3154;
  font-size: 28rpx;
  font-weight: 800;
}

.mock-source-indicator {
  background: #eaf7ef;
  border: 1rpx solid #b9e6ca;
  border-radius: 999rpx;
  color: #21864b;
  font-size: 22rpx;
  font-weight: 800;
  line-height: 1;
  padding: 10rpx 16rpx;
}

.mock-source-indicator--real {
  background: #eef4ff;
  border-color: #cbdcff;
  color: #296bcf;
}

.mock-toggle-copy {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.mock-toggle-hint {
  color: #8a98ad;
  font-size: 24rpx;
  line-height: 1.5;
  margin-top: 8rpx;
}

.mock-toggle-row {
  align-items: center;
  border-top: 1rpx solid #edf1f7;
  display: flex;
  justify-content: space-between;
  margin-top: 24rpx;
  padding-top: 24rpx;
}

.mock-toggle-label {
  color: #243858;
  font-size: 28rpx;
  font-weight: 700;
}

.mock-mode-row {
  align-items: center;
  border-top: 1rpx solid #edf1f7;
  display: flex;
  justify-content: space-between;
  margin-top: 24rpx;
  padding-top: 24rpx;
}

.mock-mode-label {
  color: #243858;
  font-size: 26rpx;
  font-weight: 700;
}

.mock-mode-options {
  display: flex;
  gap: 12rpx;
}

.mock-mode-button {
  background: #f4f7fc;
  border: 1rpx solid #d9e3f2;
  border-radius: 999rpx;
  color: #637593;
  font-size: 24rpx;
  line-height: 1;
  margin: 0;
  min-height: 60rpx;
  padding: 0 20rpx;
}

.mock-mode-button::after {
  border: 0;
}

.mock-mode-button-active {
  background: #eaf2ff;
  border-color: #6d9ff3;
  color: #1769df;
  font-weight: 800;
}

.mock-action-scenarios {
  border-top: 1rpx solid #edf1f7;
  margin-top: 24rpx;
  padding-top: 24rpx;
}

.mock-action-scenario {
  align-items: center;
  border-top: 1rpx solid #f0f3f8;
  display: flex;
  justify-content: space-between;
  margin-top: 14rpx;
  padding-top: 14rpx;
}

.mock-action-scenario-copy {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.mock-action-scenario-label {
  color: #243858;
  font-size: 24rpx;
  font-weight: 700;
}

.mock-action-scenario-description {
  color: #8a98ad;
  font-size: 20rpx;
  margin-top: 4rpx;
}

.mock-action-scenario-arrow {
  color: #1769df;
  font-size: 34rpx;
  padding-left: 16rpx;
}

.home-brand-name {
  color: #ffffff;
  font-size: 32rpx;
  font-weight: 900;
  letter-spacing: 2rpx;
}

.home-brand-tagline {
  color: rgba(255, 255, 255, 0.82);
  font-size: 20rpx;
  font-weight: 700;
  letter-spacing: 4rpx;
}

.home-greeting {
  color: #ffffff;
  display: block;
  font-size: 56rpx;
  font-weight: 900;
  letter-spacing: -1rpx;
  line-height: 1.2;
  margin-top: 64rpx;
}

.home-subtitle {
  color: rgba(255, 255, 255, 0.84);
  display: block;
  font-size: 26rpx;
  line-height: 1.55;
  margin-top: 16rpx;
}

.home-content {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 28rpx;
  margin-top: -32rpx;
  padding: 0 24rpx;
  position: relative;
  z-index: 3;
}

.home-surface {
  background: #ffffff;
  border: 0;
  border-radius: 28rpx;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  padding: 32rpx 24rpx 24rpx;
  box-shadow: 0 36rpx 100rpx rgba(28, 48, 82, 0.07);
  width: 100%;
}

.section-heading-row {
  align-items: flex-start;
  display: flex;
  gap: 16rpx;
  justify-content: space-between;
}

.section-heading-copy {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.section-title {
  color: #101827;
  font-size: 36rpx;
  font-weight: 900;
  line-height: 1.3;
}

.section-description {
  color: #6b7485;
  font-size: 24rpx;
  line-height: 1.5;
  margin-top: 8rpx;
}

.section-link {
  align-items: center;
  color: #697589;
  display: flex;
  flex: 0 0 auto;
  font-size: 24rpx;
  gap: 4rpx;
  line-height: 1.5;
  padding-top: 4rpx;
}

.section-link-arrow {
  color: #9aa5b5;
  font-size: 32rpx;
  line-height: 1;
}

.home-surface .work-orders-entry {
  margin-top: 28rpx;
}

.work-orders-entry {
  align-items: center;
  background: #ffffff;
  border: 2rpx solid #e8edf4;
  border-radius: 20rpx;
  box-sizing: border-box;
  display: flex;
  gap: 20rpx;
  min-height: 140rpx;
  padding: 20rpx;
  box-shadow: none;
  width: 100%;
}

.entry-icon {
  align-items: center;
  background: linear-gradient(145deg, #1478ff 0%, #3a8cff 100%);
  border-radius: 20rpx;
  color: #ffffff;
  display: flex;
  flex: 0 0 84rpx;
  font-size: 32rpx;
  font-weight: 900;
  height: 84rpx;
  justify-content: center;
}

.entry-copy {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.entry-title {
  color: #101827;
  font-size: 30rpx;
  font-weight: 900;
}

.entry-subtitle {
  color: #6b7485;
  font-size: 24rpx;
  margin-top: 8rpx;
}

.entry-arrow {
  color: #a6acb8;
  flex: 0 0 auto;
  font-size: 48rpx;
  font-weight: 300;
  line-height: 1;
}

.home-footer {
  padding: 44rpx 24rpx 0;
  text-align: center;
}

.login-stage {
  box-sizing: border-box;
  margin: 0 auto;
  max-width: 680rpx;
  width: 100%;
}

.launch-stage {
  align-items: center;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  padding: 72rpx 0 48rpx;
}

.methods-stage,
.form-stage {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  padding: 56rpx 0 48rpx;
}

.brand-lockup {
  align-items: center;
  display: flex;
  flex-direction: column;
}

.brand-lockup-compact {
  justify-content: center;
}

.brand-copy {
  display: flex;
  flex-direction: column;
}

.brand-name {
  color: #1f77f0;
  font-size: 64rpx;
  font-weight: 900;
  line-height: 1;
}

.brand-tagline {
  color: #1f77f0;
  font-size: 22rpx;
  font-weight: 800;
  letter-spacing: 8rpx;
  margin-top: 14rpx;
}

.launch-message {
  color: #102340;
  font-size: 30rpx;
  font-weight: 700;
  line-height: 1.6;
  margin-top: 72rpx;
  text-align: center;
}

.worker-scene {
  background: linear-gradient(180deg, #f8fbff 0%, #e9f1ff 100%);
  border-radius: 56rpx 56rpx 0 0;
  height: 344rpx;
  margin-top: 56rpx;
  overflow: hidden;
  position: relative;
  width: 520rpx;
}

.scene-building {
  background: #c8dcf9;
  bottom: 80rpx;
  position: absolute;
  width: 100rpx;
}

.scene-building-left {
  height: 154rpx;
  left: 58rpx;
}

.scene-building-right {
  bottom: 68rpx;
  height: 188rpx;
  right: 34rpx;
  width: 112rpx;
}

.scene-roof {
  background: #9fc9ff;
  border-radius: 999rpx;
  height: 8rpx;
  left: 116rpx;
  position: absolute;
  transform: rotate(-10deg);
  width: 270rpx;
}

.scene-roof-back {
  bottom: 106rpx;
}

.scene-roof-front {
  background: #c8ddff;
  bottom: 90rpx;
  left: 102rpx;
  transform: rotate(-8deg);
  width: 232rpx;
}

.scene-worker {
  bottom: 40rpx;
  height: 220rpx;
  left: 250rpx;
  position: absolute;
  width: 126rpx;
}

.worker-helmet {
  background: #ffc500;
  border-radius: 36rpx 36rpx 6rpx 6rpx;
  height: 36rpx;
  left: 30rpx;
  position: absolute;
  top: 0;
  width: 72rpx;
}

.worker-head {
  background: #ffd2ae;
  border-radius: 50%;
  height: 40rpx;
  left: 44rpx;
  position: absolute;
  top: 28rpx;
  width: 40rpx;
}

.worker-body {
  background: #1f77f0;
  border-radius: 16rpx;
  height: 96rpx;
  left: 30rpx;
  position: absolute;
  top: 66rpx;
  width: 70rpx;
}

.worker-shirt {
  background: #f7fbff;
  height: 46rpx;
  left: 54rpx;
  position: absolute;
  top: 68rpx;
  transform: skew(-12deg);
  width: 22rpx;
}

.worker-arm {
  background: #155fca;
  border-radius: 14rpx;
  height: 74rpx;
  position: absolute;
  top: 68rpx;
  width: 22rpx;
}

.worker-arm-left {
  left: 12rpx;
  transform: rotate(34deg);
}

.worker-arm-right {
  right: 8rpx;
  transform: rotate(-34deg);
}

.worker-leg {
  background: #1f77f0;
  bottom: 10rpx;
  height: 82rpx;
  position: absolute;
  width: 12rpx;
}

.worker-leg-left {
  left: 44rpx;
}

.worker-leg-right {
  right: 34rpx;
}

.worker-shoe {
  background: #173f79;
  border-radius: 8rpx;
  bottom: 2rpx;
  height: 16rpx;
  position: absolute;
  width: 40rpx;
}

.worker-shoe-left {
  left: 24rpx;
}

.worker-shoe-right {
  right: 6rpx;
}

.trust-row {
  border-top: 1rpx solid #eaf0f8;
  display: flex;
  justify-content: space-around;
  margin-top: 48rpx;
  padding-top: 32rpx;
  width: 100%;
}

.trust-item {
  align-items: center;
  color: #31415b;
  display: flex;
  flex-direction: column;
  font-size: 24rpx;
  font-weight: 600;
  gap: 12rpx;
  text-align: center;
}

.trust-icon {
  color: #1478f2;
  font-size: 36rpx;
  font-weight: 800;
  line-height: 1;
}

.launch-cta,
.submit {
  background: linear-gradient(90deg, #006cff 0%, #1382ff 100%);
  border: 0;
  border-radius: 24rpx;
  box-shadow: 0 14rpx 28rpx rgba(0, 108, 255, 0.26);
  color: #ffffff;
  font-size: 30rpx;
  font-weight: 800;
  height: 92rpx;
  line-height: 92rpx;
  min-height: 92rpx;
  padding: 0;
  position: relative;
  text-align: center;
  width: 100%;
}

.submit-label {
  color: #ffffff;
  display: block;
  font-size: 30rpx;
  font-weight: 800;
  height: 92rpx;
  line-height: 92rpx;
  text-align: center;
  width: 100%;
}

.launch-cta {
  margin-top: 48rpx;
}

.brand-lockup-compact + .stage-title {
  margin-top: 72rpx;
}

.stage-title {
  color: #111b31;
  font-size: 44rpx;
  font-weight: 800;
  line-height: 1.35;
  text-align: center;
}

.method-list {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
  margin-top: 56rpx;
}

.method-card {
  align-items: center;
  background: rgba(255, 255, 255, 0.92);
  border: 1rpx solid #e0e9f5;
  border-radius: 32rpx;
  box-sizing: border-box;
  display: flex;
  gap: 24rpx;
  min-height: 112rpx;
  padding: 24rpx 28rpx;
  text-align: left;
  width: 100%;
}

.method-card-active {
  box-shadow: 0 12rpx 22rpx rgba(29, 78, 145, 0.06);
}

.method-card-disabled {
  opacity: 0.62;
}

.method-icon {
  align-items: center;
  border-radius: 24rpx;
  display: flex;
  flex: 0 0 80rpx;
  font-size: 36rpx;
  height: 80rpx;
  justify-content: center;
  text-align: center;
}

.method-icon-blue {
  background: #ecf5ff;
  color: #1478f2;
}

.method-icon-muted {
  background: #eef2f7;
  color: #7d8a9e;
}

.method-icon-amber {
  background: #fff8e4;
  color: #b88700;
}

.method-copy {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.method-title {
  color: #17233d;
  font-size: 30rpx;
  font-weight: 800;
}

.method-title-muted {
  color: #526079;
}

.method-subtitle {
  color: #8b97aa;
  font-size: 24rpx;
  margin-top: 8rpx;
}

.method-badge {
  background: #dff8e8;
  border-radius: 999rpx;
  color: #19b66a;
  flex-shrink: 0;
  font-size: 22rpx;
  font-weight: 800;
  padding: 6rpx 12rpx;
}

.method-badge-amber {
  background: #fff4d6;
  color: #b88700;
}

.policy-note {
  color: #9aa7bb;
  font-size: 22rpx;
  line-height: 1.6;
  margin-top: auto;
  padding-top: 72rpx;
  text-align: center;
}

.back-link {
  background: transparent;
  border: 0;
  color: #1478f2;
  font-size: 26rpx;
  font-weight: 800;
  margin: 24rpx auto 0;
  min-height: 72rpx;
}

.back-button {
  align-items: center;
  background: transparent;
  border: 0;
  color: #16243d;
  display: flex;
  font-size: 64rpx;
  font-weight: 300;
  height: 72rpx;
  justify-content: flex-start;
  line-height: 1;
  padding: 0;
  width: 72rpx;
}

.form-stage > .brand-lockup-compact {
  margin-top: 8rpx;
}

.form-intro {
  color: #8a95a8;
  font-size: 26rpx;
  line-height: 1.6;
  margin: 12rpx auto 0;
  text-align: center;
}

.form-stage > .field:first-of-type {
  margin-top: 56rpx;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.code-field {
  margin-top: 32rpx;
}

.label {
  color: #526079;
  font-size: 24rpx;
  font-weight: 700;
}

.input,
.code-input-wrap {
  background: #ffffff;
  border: 1rpx solid #dbe5f2;
  border-radius: 24rpx;
  box-sizing: border-box;
  min-height: 96rpx;
  width: 100%;
}

.input {
  color: #19253d;
  font-size: 30rpx;
  padding: 20rpx 24rpx;
}

.code-input-wrap {
  align-items: center;
  display: flex;
  padding-right: 12rpx;
}

.code-input {
  background: transparent;
  box-sizing: border-box;
  color: #19253d;
  flex: 1;
  font-size: 30rpx;
  height: 94rpx;
  min-width: 0;
  padding: 20rpx 24rpx;
}

.code-button {
  background: #f1f5fa;
  border: 0;
  border-radius: 16rpx;
  color: #9aa7bb;
  flex-shrink: 0;
  font-size: 22rpx;
  min-height: 64rpx;
  padding: 0 16rpx;
}

.field-hint {
  color: #8995a7;
  font-size: 22rpx;
  line-height: 1.5;
}

.feedback,
.in-flight {
  font-size: 24rpx;
  line-height: 1.5;
  margin-top: 24rpx;
}

.feedback {
  color: #b42318;
}

.in-flight {
  color: #526079;
}

.form-stage > .submit {
  margin-top: 40rpx;
}

.login-page button::after {
  border: 0;
}

.secondary {
  background: transparent;
  border: 0;
  border-radius: 0;
  color: #7a879a;
  display: inline-flex;
  font-size: 24rpx;
  line-height: 72rpx;
  min-height: 72rpx;
  padding: 0 20rpx;
}

.secondary::after {
  border: 0;
}

.secondary[disabled] {
  opacity: 0.55;
}

.eyebrow {
  color: #667085;
  font-size: 26rpx;
}

.title {
  color: #101828;
  font-size: 52rpx;
  font-weight: 700;
}

.subtitle {
  color: #667085;
  font-size: 30rpx;
}
</style>
