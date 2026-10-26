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
              {{ quickLoginSubtitle }}
            </text>
          </view>
          <text v-if="quickLoginAvailable" class="method-badge method-badge-amber">{{ quickLoginBadge }}</text>
        </button>
      </view>

      <text v-if="feedback" class="feedback method-feedback" role="alert">{{ feedback }}</text>

      <text class="policy-note">手机号登录须主动阅读并同意用户协议与隐私政策</text>
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
          data-testid="r1-manual-phone"
          class="input"
          type="text"
          maxlength="11"
          placeholder="请输入手机号"
          :disabled="isBusy"
        />
      </view>

      <view class="field code-field">
        <text class="label">验证码</text>
        <view class="code-input-wrap">
          <input
            v-model="verificationCode"
            data-testid="r1-manual-code"
            class="code-input"
            type="number"
            maxlength="6"
            placeholder="请输入短信验证码"
            :disabled="isBusy"
          />
          <button class="code-button" disabled>获取验证码</button>
        </view>
        <text class="field-hint">请输入已收到的验证码</text>
      </view>

      <view class="login-consent-panel" data-testid="r1-login-consent">
        <checkbox-group @change="onLoginConsentChange">
          <label class="login-consent-label">
            <checkbox value="accepted" :checked="manualConsent" :disabled="isBusy || !loginPoliciesReady" />
            <text>我已阅读并同意以下协议</text>
          </label>
        </checkbox-group>
        <view class="login-legal-links">
          <navigator v-if="loginPolicies.privacyUrl" class="login-legal-link" url="/pages/legal/legal?kind=privacy">隐私政策</navigator>
          <text v-else class="login-legal-link login-legal-link--disabled">隐私政策</text>
          <navigator v-if="loginPolicies.agreementUrl" class="login-legal-link" url="/pages/legal/legal?kind=agreement">用户协议</navigator>
          <text v-else class="login-legal-link login-legal-link--disabled">用户协议</text>
        </view>
        <text v-if="!loginPoliciesReady" class="login-consent-unavailable">登录协议尚未配置，请联系管理员</text>
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
import { onLoad } from '@dcloudio/uni-app'

import { hasAuthenticatedSession, workOrdersRoute } from '@features/home/access'
import { submitLogin, type LoginSubmissionState } from '@features/session/login'
import {
  legalLoginPolicies, manualLoginConsentIssue, manualLoginConsentMessage,
  submitR1ManualLogin,
} from '@features/session/login-consent'
import { r1ManualLoginIssue, r1ManualLoginIssueText } from '@features/session/r1-manual-login-preflight'
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
import { redirectToIsolatedQaConsole } from '@app/dev-qa-navigation'

const session = useSessionStore()
const phoneNumber = ref('')
const verificationCode = ref('')
const manualConsent = ref(false)
const loginPolicies = legalLoginPolicies(import.meta.env)
const loginPoliciesReady = computed(() => Boolean(loginPolicies.privacyUrl && loginPolicies.agreementUrl))
const loginStage = ref<LoginStage>('launch')
const message = ref('')
const logoutInFlight = ref(false)
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
const quickLoginSubtitle = computed(() => {
  if (quickLoginAvailable.value) return '使用已配置的账号继续'
  return '当前未配置快捷登录'
})
const quickLoginBadge = computed(() => '快捷')
const feedback = computed(() => message.value || userFacingLoginMessage(session.error))

// Legacy QA deep links are redirected to a distinct DEV surface. The Home DOM
// remains identical for the same business session, with or without query flags.
onLoad((options) => {
  if (import.meta.env.DEV && options?.devReview === '1') {
    redirectToIsolatedQaConsole()
  }
})

watch(
  () => session.status,
  (status) => {
    if (status === 'unauthenticated') loginStage.value = 'launch'
  },
)


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
    message.value = '快捷登录仅在本机开发运行或非生产环境配置后可用'
    return
  }

  message.value = ''
  const result = await submitLogin(input, submissionState, (request) => session.login(request))
  if (result.state !== 'succeeded') message.value = userFacingLoginMessage(result.error)
}

function onLoginConsentChange(event: Event): void {
  const values = (event as Event & { detail?: { value?: string[] } }).detail?.value ?? []
  manualConsent.value = loginPoliciesReady.value && values.includes('accepted')
}

async function submit(): Promise<void> {
  if (isBusy.value) return
  message.value = ''
  const issue = r1ManualLoginIssue({ phoneNumber: phoneNumber.value, verificationCode: verificationCode.value })
  if (issue) {
    message.value = r1ManualLoginIssueText(issue)
    return
  }
  const consentIssue = manualLoginConsentIssue(manualConsent.value, loginPolicies)
  if (consentIssue) {
    message.value = manualLoginConsentMessage(consentIssue)
    return
  }
  const result = await submitR1ManualLogin(
    { phoneNumber: phoneNumber.value, verificationCode: verificationCode.value },
    submissionState,
    manualConsent.value,
    loginPolicies,
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

.home-demo-provenance {
  display: block;
  color: var(--app-color-text-secondary);
  font-size: var(--app-font-meta);
  line-height: 1.45;
  text-align: center;
  margin: 0 0 6rpx;
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

.login-consent-panel {
  margin-top: 24rpx;
  padding: 14rpx 0;
}
.login-consent-label {
  align-items: center;
  display: flex;
  gap: 6rpx;
  color: inherit;
}
.login-legal-links {
  display: flex;
  justify-content: flex-start;
  gap: 14rpx;
  margin-top: 4rpx;
}
.login-legal-link {
  background: transparent;
  border: 0;
  color: var(--login-link-color, royalblue);
  margin: 0;
  padding: 0;
}
.login-legal-link--disabled {
  color: gray;
}
.login-consent-unavailable {
  color: firebrick;
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
