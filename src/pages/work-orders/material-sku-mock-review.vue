<template>
  <view v-if="!authorized" class="sku-review-blocked" data-testid="sku-mock-blocked">
    <text>材料规格演示不可用</text>
    <text>仅本机 DEV Mock 身份可访问；不读取真实材料或客户订单。</text>
  </view>
  <ActionWorkspaceShell
    v-else
    customer-name="材料规格 · DEV MOCK"
    display-number="MOCK-019"
    lifecycle="available"
    draft-status="clean"
    :can-submit="false"
    submit-label="业务操作禁用"
  >
    <view class="sku-review-card app-surface" data-testid="sku-mock-workbench">
      <text class="sku-review-eyebrow">R1 SPU → 销售属性 → SKU · 仿真</text>
      <text class="sku-review-title">材料规格选择</text>
      <text class="sku-review-help">独立数据契约评审，不是当前工单真实商品。套餐材料层须走另一条规格配置路径。</text>
    </view>
    <view class="sku-review-card app-surface">
      <text class="sku-review-section-title">异常与边界场景</text>
      <view class="sku-review-actions">
        <AppButton
          v-for="item in materialSkuScenarios"
          :key="item.value"
          :data-testid="'sku-mock-scenario-' + item.value"
          variant="secondary"
          :pressed="scenario === item.value"
          @tap="setScenario(item.value)"
        >{{ item.label }}</AppButton>
      </view>
      <text class="sku-review-help">此处只切换静态合成响应，不调用 SKU、价格或订单接口。</text>
    </view>
    <view class="sku-review-card app-surface" data-testid="sku-mock-source">
      <text class="sku-review-section-title">当前合成 SPU</text>
      <text class="sku-review-value">屋面防水卷材 · SPU 示例</text>
      <text class="sku-review-help">两个销售属性：厚度、颜色。必须全部明确选择后，才进行唯一 SKU 匹配。</text>
      <template v-if="read.state === 'blocked'">
        <text class="sku-review-warning" data-testid="sku-mock-source-blocked">数据异常 · 不允许选择 SKU（{{ read.reason }}）</text>
      </template>
      <template v-else-if="read.state === 'not_configured'">
        <text class="sku-review-warning" data-testid="sku-mock-not-configured">未配置有效销售属性；不能推断 SKU。</text>
      </template>
      <template v-else>
        <view v-for="field in read.fields" :key="field.name" class="sku-review-attribute">
          <text class="sku-review-field">{{ field.label }} · {{ selected[field.name] || '未选择' }}</text>
          <view class="sku-review-actions">
            <AppButton
              v-for="value in field.values"
              :key="value"
              variant="secondary"
              :pressed="selected[field.name] === value"
              :data-testid="'sku-mock-choice-' + field.name + '-' + value"
              @tap="choose(field.name, value)"
            >{{ value }}</AppButton>
          </view>
        </view>
        <view v-if="read.state === 'no_skus'" class="sku-review-warning" data-testid="sku-mock-no-skus">当前合成 SPU 没有 SKU 列表，不提供可选项。</view>
        <view v-else class="sku-review-result" data-testid="sku-mock-result">
          <text class="sku-review-section-title">规格匹配结果</text>
          <text v-if="match.state === 'incomplete'" class="sku-review-help" data-testid="sku-mock-incomplete">请完成全部销售属性选择。</text>
          <text v-else-if="match.state === 'unavailable'" class="sku-review-warning" data-testid="sku-mock-unavailable">无匹配 SKU；不能以近似规格替代。</text>
          <text v-else-if="match.state === 'ambiguous'" class="sku-review-warning" data-testid="sku-mock-ambiguous">多个 SKU 匹配同一组属性；已阻止自动选用。</text>
          <text v-else-if="match.state === 'matched'" class="sku-review-value" data-testid="sku-mock-matched">唯一匹配 · {{ match.skuId }}</text>
          <text v-if="match.state === 'matched' && match.existingQuantity !== undefined" class="sku-review-help" data-testid="sku-mock-existing-quantity">原订单历史数量：{{ match.existingQuantity }}（只读，不自动加入报价）</text>
          <text class="sku-review-help">无价格、库存承诺、正式订单写入或工作流推进。</text>
        </view>
      </template>
    </view>

    <view class="sku-review-card app-surface" data-testid="package-sku-mock-workbench">
      <text class="sku-review-eyebrow">套餐材料 · 独立的 R1 SKU 配置路径</text>
      <text class="sku-review-title">套餐材料层与规格</text>
      <text class="sku-review-help">合成套餐含两个材料层；第一层可以替换材料，每层 SKU 必须独立核实。无真实报价、价格或数量提交。</text>
      <view class="sku-review-actions">
        <AppButton
          v-for="group in packageMockGroups"
          :key="group.value"
          variant="secondary"
          :pressed="activePackageGroup === group.value"
          :data-testid="'package-mock-group-' + group.value"
          @tap="setPackageGroup(group.value)"
        >{{ group.label }}</AppButton>
      </view>
      <text class="sku-review-help">模拟维修分组选择相互隔离，不代表正式订单创建。</text>
      <view class="sku-review-actions">
        <AppButton
          v-for="item in packageSkuMockScenarios"
          :key="item.value"
          variant="secondary"
          :pressed="packageScenario === item.value"
          :data-testid="'package-mock-scenario-' + item.value"
          @tap="setPackageScenario(item.value)"
        >{{ item.label }}</AppButton>
      </view>
      <template v-if="packageRead.state === 'blocked'">
        <text class="sku-review-warning" data-testid="package-mock-blocked">套餐 SKU 数据已阻止 · {{ packageRead.reason }}</text>
      </template>
      <template v-else-if="packageRead.state === 'not_applicable'">
        <text class="sku-review-help" data-testid="package-mock-not-applicable">此合成套餐计价方式不走 SKU 用量分支，禁止套用 SKU 匹配。</text>
      </template>
      <template v-else>
        <view v-for="layer in packageRead.layers" :key="layer.layer" class="sku-review-attribute" :data-testid="'package-mock-layer-' + layer.layer">
          <text class="sku-review-section-title">材料层 {{ layer.layer }}</text>
          <text class="sku-review-help">选择本层材料，不影响其他层或其他维修分组。</text>
          <view class="sku-review-actions">
            <AppButton
              v-for="option in layer.options"
              :key="option.linkId"
              variant="secondary"
              :pressed="packageChosenLink(layer.layer) === option.linkId"
              :data-testid="'package-mock-material-' + option.linkId"
              @tap="choosePackageMaterial(layer.layer, option.linkId)"
            >{{ option.name }}</AppButton>
          </view>
          <template v-for="option in layer.options" :key="option.linkId">
            <view v-if="packageChosenLink(layer.layer) === option.linkId" class="sku-review-attribute">
              <template v-if="option.skuRead.state === 'ready' || option.skuRead.state === 'no_skus'">
                <view v-for="field in option.skuRead.fields" :key="field.name" class="sku-review-attribute">
                  <text class="sku-review-field">{{ field.label }} · {{ packageChosenValue(layer.layer, field.name) || '未选择' }}</text>
                  <view class="sku-review-actions">
                    <AppButton
                      v-for="value in field.values"
                      :key="value"
                      variant="secondary"
                      :pressed="packageChosenValue(layer.layer, field.name) === value"
                      :data-testid="'package-mock-choice-' + layer.layer + '-' + field.name + '-' + value"
                      @tap="choosePackageAttribute(layer.layer, field.name, value)"
                    >{{ value }}</AppButton>
                  </view>
                </view>
              </template>
              <text v-if="option.skuRead.state === 'no_skus'" class="sku-review-warning">本材料无 SKU 列表，不能选用。</text>
              <text v-else class="sku-review-help">属性仅用于该材料自身的 SKU 唯一匹配。</text>
            </view>
          </template>
        </view>
        <view class="sku-review-result" data-testid="package-mock-result">
          <text class="sku-review-section-title">分组 {{ activePackageGroup }} · 套餐 SKU 核对</text>
          <text v-if="packageMatch.state === 'incomplete'" class="sku-review-help" data-testid="package-mock-incomplete">尚未完成全部材料层和规格选择。</text>
          <text v-else-if="packageMatch.state === 'unavailable'" class="sku-review-warning" data-testid="package-mock-unavailable">至少一个材料层找不到完全匹配的 SKU。</text>
          <text v-else-if="packageMatch.state === 'ambiguous'" class="sku-review-warning" data-testid="package-mock-ambiguous">至少一个材料层存在多个 SKU 匹配，禁止自动选取。</text>
          <text v-else-if="packageMatch.state === 'blocked'" class="sku-review-warning" data-testid="package-mock-choice-blocked">材料关联或属性无效，不能继续。</text>
          <view v-else-if="packageMatch.state === 'ready'" data-testid="package-mock-ready" class="sku-review-attribute">
            <text class="sku-review-value">所有材料层均有唯一匹配 · 仅读</text>
            <text v-for="row in packageMatch.rows" :key="row.linkId" class="sku-review-help" :data-testid="'package-mock-selected-' + row.layer">
              材料层 {{ row.layer }}：{{ row.skuId }} · 历史数量 {{ row.historicalQuantity ?? '未记录' }}
            </text>
          </view>
          <text class="sku-review-help">未生成报价项目、SKU 用量、金额或正式订单。</text>
        </view>
      </template>
    </view>
    <template #actions>
      <text class="sku-review-footer" data-testid="sku-mock-footer">DEV Mock 仅读 · 不支持提交或修改数量</text>
      <navigator class="sku-review-back" open-type="navigateBack" :delta="1">返回开发演示</navigator>
    </template>
  </ActionWorkspaceShell>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { useSessionStore } from '@shared/state'
import ActionWorkspaceShell from '@shared/ui/ActionWorkspaceShell.vue'
import AppButton from '@shared/ui/AppButton.vue'
import { matchR1MaterialSku } from '@shared/material-sku-contract'
import { matchR1PackageMaterialSku, type PackageSkuChoice } from '@shared/package-material-sku-contract'
import {
  materialSkuScenarios, canReadMaterialSkuMock, readMaterialSkuReview,
  type MaterialSkuReviewScenario, packageSkuMockScenarios, readPackageSkuMockReview,
  type PackageSkuMockScenario,
} from '@app/material-sku-mock-review'

const session = useSessionStore()
const routeId = ref('')
const scenario = ref<MaterialSkuReviewScenario>('normal')
const selected = ref<Readonly<Record<string, string>>>({})
onLoad((options) => { routeId.value = typeof options?.id === 'string' ? options.id : '' })
const authorized = computed(() =>
  session.status === 'authenticated' && canReadMaterialSkuMock({
    workOrderId: routeId.value,
    userId: session.session?.user.id,
    roleId: session.session?.currentRole?.id,
  }))
const read = computed(() => readMaterialSkuReview(scenario.value))
const match = computed(() => matchR1MaterialSku(read.value, selected.value))
function choose(name: string, value: string): void {
  if (!authorized.value || read.value.state !== 'ready' && read.value.state !== 'no_skus') return
  if (!read.value.fields.some((field) => field.name === name && field.values.includes(value))) return
  selected.value = { ...selected.value, [name]: value }
}
function setScenario(next: MaterialSkuReviewScenario): void {
  if (!authorized.value) return
  scenario.value = next
  selected.value = {}
}


const packageMockGroups = [
  { value: 'A', label: '模拟维修部位 A' },
  { value: 'B', label: '模拟维修部位 B' },
] as const
type PackageMockGroup = typeof packageMockGroups[number]['value']
const activePackageGroup = ref<PackageMockGroup>('A')
const packageScenario = ref<PackageSkuMockScenario>('normal')
const packageSelections = ref<Readonly<Record<PackageMockGroup, readonly PackageSkuChoice[]>>>({ A: [], B: [] })
const packageRead = computed(() => readPackageSkuMockReview(packageScenario.value))
const currentPackageChoices = computed(() => packageSelections.value[activePackageGroup.value])
const packageMatch = computed(() => matchR1PackageMaterialSku(packageRead.value, currentPackageChoices.value))
function packageCurrentChoice(layer: string): PackageSkuChoice | undefined {
  return currentPackageChoices.value.find((choice) => choice.layer === layer)
}
function packageChosenLink(layer: string): string {
  return packageCurrentChoice(layer)?.linkId ?? ''
}
function packageChosenValue(layer: string, name: string): string {
  return packageCurrentChoice(layer)?.attributes[name] ?? ''
}
function setPackageGroup(next: PackageMockGroup): void {
  if (!authorized.value) return
  activePackageGroup.value = next
}
function setPackageScenario(next: PackageSkuMockScenario): void {
  if (!authorized.value || !packageSkuMockScenarios.some((item) => item.value === next)) return
  packageScenario.value = next
  packageSelections.value = { A: [], B: [] }
}
function choosePackageMaterial(layer: string, linkId: string): void {
  if (!authorized.value || packageRead.value.state !== 'ready') return
  const group = packageRead.value.layers.find((entry) => entry.layer === layer)
  if (!group?.options.some((item) => item.linkId === linkId)) return
  const others = currentPackageChoices.value.filter((choice) => choice.layer !== layer)
  packageSelections.value = {
    ...packageSelections.value,
    [activePackageGroup.value]: [...others, { layer, linkId, attributes: {} }],
  }
}
function choosePackageAttribute(layer: string, name: string, value: string): void {
  if (!authorized.value || packageRead.value.state !== 'ready') return
  const choice = packageCurrentChoice(layer)
  if (!choice) return
  const group = packageRead.value.layers.find((entry) => entry.layer === layer)
  const option = group?.options.find((entry) => entry.linkId === choice.linkId)
  if (!option || (option.skuRead.state !== 'ready' && option.skuRead.state !== 'no_skus')) return
  if (!option.skuRead.fields.some((field) => field.name === name && field.values.includes(value))) return
  packageSelections.value = {
    ...packageSelections.value,
    [activePackageGroup.value]: currentPackageChoices.value.map((row) =>
      row.layer === layer ? { ...row, attributes: { ...row.attributes, [name]: value } } : row),
  }
}
</script>
<style scoped>
.sku-review-card { margin: 18rpx 24rpx; padding: 24rpx; display:flex; flex-direction:column; gap:14rpx; }
.sku-review-eyebrow {font-size:21rpx;color:var(--app-color-primary);font-weight:700;}
.sku-review-title {font-size:34rpx;font-weight:800;color:var(--app-color-text-primary);}
.sku-review-section-title {font-size:27rpx;font-weight:750;color:var(--app-color-text-primary);}
.sku-review-help {font-size:22rpx;line-height:1.5;color:var(--app-color-text-secondary);}
.sku-review-value {font-size:25rpx;font-weight:700;color:var(--app-color-primary);overflow-wrap:anywhere;}
.sku-review-warning {font-size:24rpx;font-weight:700;color:var(--app-color-danger);line-height:1.5;}
.sku-review-field {font-size:25rpx;color:var(--app-color-text-primary);font-weight:700;}
.sku-review-attribute,.sku-review-result {display:flex;flex-direction:column;gap:12rpx;border-top:1rpx solid var(--app-color-divider);padding-top:16rpx;}
.sku-review-actions {display:flex;flex-wrap:wrap;gap:12rpx;}
.sku-review-actions .app-button {min-height:44px;min-width:90px;}
.sku-review-footer {display:block;text-align:center;font-size:21rpx;color:var(--app-color-text-secondary);margin-bottom:14rpx;}
.sku-review-back {display:block;text-align:center;padding:20rpx;border:1rpx solid var(--app-color-border);border-radius:16rpx;color:var(--app-color-primary);font-size:26rpx;}
.sku-review-blocked {min-height:70vh;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:20rpx;padding:32rpx;text-align:center;}
</style>
