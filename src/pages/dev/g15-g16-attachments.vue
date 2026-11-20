<template>
  <view class="attachment-fixture" data-testid="g15-g16-app">
    <view v-if="booting" class="section" data-testid="g15-g16-loading">
      <text class="heading">正在核对工单编辑范围</text>
    </view>
    <view v-else-if="!authorized" class="section" data-testid="g15-g16-denied">
      <text class="heading">当前范围不可进入</text>
      <text class="caption">请先在 DEV Mock 中打开本任务的工单详情。</text>
    </view>
    <template v-else>
      <view class="intro" data-testid="g15-g16-ready">
        <text class="dev-label">DEV Mock · 工单 019</text>
        <text class="title">巡检附件</text>
        <text class="caption">合成照片和文件，仅在本地验证。</text>
      </view>
      <view v-if="message" class="error" role="status">{{ message }}</view>
      <view class="section">
        <text class="heading">G15 · 巡检照片</text>
        <view class="actions">
          <button size="mini" class="primary" data-testid="g15-confirmed-case" :disabled="busy" @click="runPhoto('success')">验证合成成图</button>
          <button size="mini" data-testid="g15-quality-case" :disabled="busy" @click="runPhoto('quality')">质量失败</button>
          <button size="mini" data-testid="g15-watermark-case" :disabled="busy" @click="runPhoto('watermark')">水印失败</button>
          <button size="mini" data-testid="g15-unknown-case" :disabled="busy" @click="runPhoto('unknown')">水印结果未知</button>
        </view>
        <text v-if="state" class="caption" data-testid="g15-photo-state">{{ photoLabels[state.photo.status] }}</text>
        <view v-if="state?.photo.original" class="previews">
          <view class="preview">
            <image class="preview-image" :src="state.photo.original.preview" mode="aspectFit" aria-label="原图" data-testid="g15-original" />
            <text>原图回执</text>
          </view>
          <view class="preview">
            <image v-if="state.photo.result" class="preview-image" :src="state.photo.result.preview" mode="aspectFit" aria-label="成图" data-testid="g15-result" />
            <text>{{ state.photo.result ? '已确认成图' : '未确认成图' }}</text>
          </view>
        </view>
      </view>
      <view class="section">
        <text class="heading">G16 · 本地附件</text>
        <text class="caption">经办组织 {{ attachmentMockScope.actingOrgId }} · 已保存记录编辑</text>
        <view class="actions">
          <button size="mini" class="primary" data-testid="g16-seed" :disabled="busy" @click="seedFiles">准备示例</button>
          <button size="mini" data-testid="g16-reopen" :disabled="busy" @click="reopen">模拟冷重开</button>
        </view>
        <view v-for="file in state?.files" :key="file.id" class="file"
          data-testid="g16-file-row" :data-task-id="String(file.id)" :data-state="file.state">
          <view>
            <text class="file-name" data-testid="g16-file-name">{{ file.name }}</text>
            <text class="caption">{{ file.size }} B · {{ fileLabel(file) }}</text>
          </view>
          <view class="actions">
            <button size="mini" data-testid="g16-file-open" @click="toggleFile(file)">查看本地内容</button>
            <button size="mini" data-testid="g16-file-ack" :disabled="busy" @click="runFile(file, 'acknowledge')">
              {{ file.state === 'uploaded' ? '验证不会重传' : file.errorCode === 'ambiguous_upload' ? '检查是否可重发' : '模拟成功' }}
            </button>
            <template v-if="file.state !== 'uploaded' && file.errorCode !== 'ambiguous_upload'">
              <button size="mini" :disabled="busy" @click="runFile(file, 'error')">派发前失败</button>
              <button size="mini" :disabled="busy" @click="runFile(file, 'unknown')">回执未知</button>
            </template>
          </view>
          <text v-if="expanded === file.id" class="file-content" data-testid="g16-file-content">{{ fileText(file) }}</text>
        </view>
        <text v-if="state" class="caption" data-testid="g16-dispatch-count">合成附件派发 {{ state.counters.file }} 次</text>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { onLoad, onUnload } from '@dcloudio/uni-app'
import { loadApplicationRuntimeConfig } from '@app/runtime-config'
import {
  attachmentMockScope, createAttachmentMock,
  type AttachmentMockAccess, type AttachmentMockSnapshot, type MockFileRow,
  type PhotoScenario, type UploadScenario,
} from '@features/work-orders/attachments-dev/attachment-mock'
import { useWorkOrderDetailStore } from '@features/work-orders/detail'
import { useWorkOrderListStore } from '@features/work-orders/list'
import { sessionAuthorizationFingerprint } from '@shared/session-authorization'
import { useSessionStore } from '@shared/state'

const session = useSessionStore()
const list = useWorkOrderListStore()
const detail = useWorkOrderDetailStore()
const route = shallowRef<Record<string, unknown> | null>(null)
const entryIdentity = ref<string | null>(null)
const booting = ref(true)
let entryGeneration = 0
let initialized = false
const runtime = loadApplicationRuntimeConfig()
const h5OptIn = import.meta.env.DEV === true && typeof window !== 'undefined'
  && runtime.ok && runtime.value.devMockUxSession
const currentIdentity = computed(() => {
  const active = session.session
  return session.status === 'authenticated' && active ? sessionAuthorizationFingerprint({
    sessionRef: active.sessionRef, userId: active.user.id, roleId: active.currentRole?.id,
    roleVersion: active.roleVersion,
  }) : null
})

const photoLabels = {
  idle: '选择一组样例开始验证', quality: '质量未通过，未上传原图',
  pending: '照片仍待处理，暂无成图',
  watermark: '水印未通过，保留原图回执',
  unknown: '水印结果待核对，禁止重复派发', success: '成图已确认，可以回填',
}

function routeMatches(): boolean {
  const query = route.value
  return !!query && query.id === attachmentMockScope.workOrderId
    && query.node === attachmentMockScope.workflowNodeId
    && query.org === attachmentMockScope.actingOrgId
    && query.record === attachmentMockScope.formDataId
    && query.editScope === attachmentMockScope.editScope
}

function fixtureRoleMatches(): boolean {
  const active = session.session
  return !!active && String(active.user.id) === attachmentMockScope.userId
    && String(active.currentRole?.id) === attachmentMockScope.roleId
}

function access(): AttachmentMockAccess | null {
  const identity = currentIdentity.value
  const id = attachmentMockScope.workOrderId
  if (!h5OptIn || !routeMatches() || !fixtureRoleMatches()
    || !identity || identity !== entryIdentity.value
    || detail.loadState !== 'succeeded' || String(detail.detail?.id) !== id
    || !list.items.some(item => String(item.id) === id)) return null
  return { ...attachmentMockScope, sessionIdentity: identity, devOptedIn: true }
}

async function prepareEntry() {
  if (!route.value || initialized) return
  if (!h5OptIn || !routeMatches()) {
    initialized = true
    booting.value = false
    return
  }
  const identity = currentIdentity.value
  if (!identity) {
    // App boot restores the credential-free DEV actor asynchronously on a full
    // document reopen. Wait for it rather than accepting identity from the URL.
    if (session.status === 'unknown' || session.status === 'authenticating') return
    booting.value = false
    return
  }
  initialized = true
  if (!fixtureRoleMatches()) {
    booting.value = false
    return
  }
  entryIdentity.value = identity
  const attempt = ++entryGeneration
  const id = attachmentMockScope.workOrderId
  try {
    if (!list.items.some(item => String(item.id) === id)) await list.load()
    if (attempt !== entryGeneration || identity !== currentIdentity.value || !routeMatches()
      || !fixtureRoleMatches() || !list.items.some(item => String(item.id) === id)) return
    if (detail.loadState !== 'succeeded' || String(detail.detail?.id) !== id) {
      await detail.loadFromRoute(id)
    }
  } catch {
    if (attempt === entryGeneration) entryIdentity.value = null
  } finally {
    if (attempt === entryGeneration) booting.value = false
  }
}

const authorized = computed(() => Boolean(access()))
const state = shallowRef<AttachmentMockSnapshot | null>(null)
const message = ref('')
const busy = ref(false)
const expanded = ref<string | null>(null)
let generation = 0
let controller: ReturnType<typeof createAttachmentMock> | null = null

function dispose() {
  generation += 1
  controller?.dispose()
  controller = null
  state.value = null
  expanded.value = null
  busy.value = false
}

async function operate(action: (mock: NonNullable<typeof controller>) => Promise<AttachmentMockSnapshot>) {
  const active = controller
  if (busy.value || !active?.canAccess()) return
  const started = generation
  busy.value = true
  message.value = ''
  try {
    const result = await action(active)
    if (started === generation && active.canAccess()) state.value = result
  } catch (error) {
    if (started === generation && active.canAccess()) {
      message.value = error instanceof Error ? error.message : '本地 Mock 操作失败'
    }
  } finally {
    if (started === generation) busy.value = false
  }
}

function reopen() {
  if (busy.value || !authorized.value) return
  dispose()
  controller = createAttachmentMock({ readAccess: access, getStorage: () => window.localStorage })
  void operate(mock => mock.snapshot())
}

const runPhoto = (scenario: PhotoScenario) => operate(mock => mock.runPhoto(scenario))
const seedFiles = () => operate(mock => mock.seedFiles())
const runFile = (file: MockFileRow, scenario: UploadScenario) => operate(mock => mock.runFile(file.id, scenario))

function toggleFile(file: MockFileRow) {
  expanded.value = expanded.value === file.id ? null : file.id
}

function fileText(file: MockFileRow) {
  const prefix = 'data:text/plain;base64,'
  if (!file.preview.startsWith(prefix)) return '本地文件内容不可用'
  try { return new TextDecoder().decode(Uint8Array.from(atob(file.preview.slice(prefix.length)), c => c.charCodeAt(0))) }
  catch { return '本地文件内容不可用' }
}

function fileLabel(file: MockFileRow) {
  if (file.state === 'uploaded') return '已确认'
  if (file.errorCode === 'ambiguous_upload' || file.state === 'uploading') return '回执未知'
  return file.state === 'queued' ? '未发送' : '合成失败'
}

watch(authorized, valid => {
  if (valid) reopen()
  else dispose()
})

watch([route, currentIdentity, () => session.status], () => { void prepareEntry() })
onLoad(query => { route.value = query ?? {} })
onUnload(() => { entryGeneration += 1; dispose() })
</script>

<style scoped>
.attachment-fixture { min-height: 100vh; padding: 20px 14px 40px; background: var(--app-surface-page); color: var(--app-text-strong); }
.intro, .section, .error { max-width: 720px; margin: 0 auto 14px; }
.dev-label, .title, .heading, .caption, .file-name { display: block; }
.dev-label { color: var(--app-color-primary-action); font-size: var(--app-type-caption-size); font-weight: 700; }
.title { margin: 4px 0 6px; font-size: var(--app-type-display-size); font-weight: 700; }
.section { padding: 15px; border: 1px solid var(--app-outline-subtle); border-radius: var(--app-shape-card); background: var(--app-surface-raised); }
.heading { font-size: var(--app-type-section-size); font-weight: 700; }
.caption { margin-top: 6px; color: var(--app-text-secondary); font-size: var(--app-type-caption-size); line-height: 1.55; }
.actions { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0; }
.actions button { min-height: 36px; padding: 0 10px; margin: 0; border: 1px solid var(--app-outline-control); border-radius: var(--app-shape-control); background: var(--app-surface-raised); color: var(--app-text-strong); }
.actions .primary { color: var(--app-surface-raised); background: var(--app-color-primary-action); border-color: var(--app-color-primary-action); }
.previews { display: flex; gap: 8px; margin-top: 10px; }
.preview { flex: 1; min-width: 0; border: 1px solid var(--app-outline-subtle); border-radius: var(--app-shape-control); padding: 5px; font-size: var(--app-type-caption-size); }
.preview-image { display: block; width: 100%; height: 100px; }
.file { border-top: 1px solid var(--app-outline-subtle); margin-top: 10px; padding-top: 10px; }
.file-name { font-size: var(--app-type-body-size); font-weight: 650; }
.file-content { display: block; white-space: pre-wrap; overflow-wrap: anywhere; background: var(--app-surface-muted); padding: 8px; font-size: var(--app-type-caption-size); }
.error { padding: 10px; border-radius: var(--app-shape-control); background: var(--app-feedback-warning-surface); color: var(--app-feedback-warning-ink); }
</style>
