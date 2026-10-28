<template>
  <view class="quotation-content" :class="{ 'quotation-content--review': props.productReviewOnly, 'quotation-content--q01': isFirstRepairPartStep, 'quotation-content--baseline': isCommercialBaseline }" data-testid="quotation-action-content">
    <view v-if="!catalogBrowser.isOpen && !isInitialEmptyWorkbench && !isFirstRepairPartStep" class="quotation-content__heading" data-testid="quotation-workbench-heading">
      <text class="quotation-content__eyebrow">报价草稿 · 按部位组织</text>
    </view>

    <view v-if="props.state === 'loading'" class="quotation-content__panel app-surface" data-testid="quotation-state-loading">
      <AppLoadingState variant="inline" label="正在准备报价内容" />
    </view>

    <view v-else-if="props.state === 'ready'" v-show="!catalogBrowser.isOpen" class="quotation-content__panel quotation-content__workbench app-surface" :class="{ 'quotation-content__workbench--initial': isInitialEmptyWorkbench || isFirstRepairPartStep }" data-testid="quotation-state-ready">
      <view v-if="!isInitialEmptyWorkbench && !isFirstRepairPartStep" class="quotation-content__workbench-summary" data-testid="quotation-workbench-summary">
        <view class="quotation-content__workbench-summary-copy">
          <text class="quotation-content__panel-title">维修部位报价</text>
          <text class="quotation-content__line-count">{{ composition.selectionCount }} 项 · {{ composition.groups.length }} 个维修部位</text>
        </view>
        <view v-if="!props.productReviewOnly" class="quotation-content__amount-summary">
          <text class="quotation-content__amount-label">{{ amountPresentation.label }}</text>
          <text class="quotation-content__amount-value" data-testid="quotation-workbench-amount">
            {{ amountPresentation.value }}
          </text>
        </view>
        <text class="quotation-content__local-tag" data-testid="quotation-commercial-draft-badge">{{ composition.localState === 'saved_local' ? '草稿已保存' : composition.localState === 'saving' ? '保存中' : '报价草稿' }}</text>
      </view>

      <AppStatus
        v-if="composition.localStateMessage && !(isCommercialBaseline && composition.localState === 'saved_local')"
        class="quotation-content__local-status"
        :message="composition.localStateMessage"
        :tone="composition.localState === 'save_failed' || composition.localState === 'invalid' || composition.localState === 'unavailable' ? 'warning' : 'neutral'"
        quiet
      />
      <AppStatus
        v-else-if="composition.localState === 'saving'"
        class="quotation-content__local-status"
        message="正在保存草稿…"
        quiet
      />
      <AppStatus
        v-else-if="composition.localState === 'saved_local' && !isCommercialBaseline"
        class="quotation-content__local-status"
        message="报价草稿已保存。"
        tone="success"
        quiet
      />
      <AppStatus
        v-if="workspace.quotationEditState.message"
        class="quotation-content__local-status"
        :message="workspace.quotationEditState.message"
        :tone="workspace.quotationEditState.state === 'blocked' ? 'warning' : 'neutral'"
        quiet
        data-testid="quotation-edit-state"
      />

      <view
        v-if="productReviewReadiness && composition.groups.length > 0 && !isFirstRepairPartStep"
        class="quotation-content__review-readiness"
        data-testid="quotation-review-readiness"
        role="status"
      >
        <text class="quotation-content__review-readiness-title">{{ productReviewReadiness.title }}</text>
        <text class="quotation-content__review-readiness-copy">{{ productReviewReadiness.summary }}</text>
      </view>
      <view v-else-if="composition.groups.length > 0 && !isFirstRepairPartStep" class="quotation-content__engine" data-testid="quotation-engine-readiness">
        <AppLoadingState
          v-if="workspace.quotationEngine.state === 'loading'"
          variant="inline"
          label="正在核对目录、报价规则与金额"
        />
        <template v-else-if="workspace.quotationEngine.result">
          <view v-if="workspace.quotationEngine.result.pricing" class="quotation-content__engine-total" data-testid="quotation-local-gross-total">
            <text class="quotation-content__engine-label">报价金额 · 待确认</text>
            <text class="quotation-content__engine-amount">¥{{ workspace.quotationEngine.result.pricing.calcTotalPrice.totalPrice.toFixed(2) }}</text>
          </view>
          <text v-if="hasMeaningfulRoundingDifference" class="quotation-content__engine-note" data-testid="quotation-rounding-note">分组明细与整体金额按各自规则计算，舍入后可能存在小额差异。</text>
          <AppStatus
            v-if="workspace.quotationEngine.result.state === 'ready'"
            message="报价校验已通过；确认提交前仍为草稿。"
            tone="success"
            quiet
            data-testid="quotation-engine-ready"
          />
          <view v-else class="quotation-content__engine-blocked" data-testid="quotation-engine-blocked">
            <AppStatus
              :message="workspace.quotationEngine.result.pricing
                ? '报价明细已生成，相关订单资料尚未齐备，暂不能提交。'
                : '当前报价内容尚未通过校验或目录核对。'"
              tone="warning"
              quiet
            />
            <text
              v-for="(message, index) in workspace.quotationEngine.issueMessages.slice(0, 4)"
              :key="`${index}:${message}`"
              class="quotation-content__engine-issue"
              role="alert"
            >{{ message }}</text>
          </view>
          <text class="quotation-content__engine-note" data-testid="quotation-engine-local-only">只有确认提交后才会创建正式订单，报价提交不代表工单完成。</text>
        </template>
        <text v-else class="quotation-content__engine-note" data-testid="quotation-engine-local-only">目录与报价依据核验完成前不显示估算金额。</text>
      </view>

      <view v-if="!isInitialEmptyWorkbench && !isFirstRepairPartStep" class="quotation-content__submission" data-testid="quotation-order-submit-boundary">
        <AppStatus
          v-if="workspace.quotationOrderState.message"
          :message="submissionStatusMessage"
          :tone="workspace.quotationOrderState.state === 'succeeded' ? 'success' : workspace.quotationOrderState.state === 'failed_terminal' || workspace.quotationOrderState.state === 'failed_ambiguous_after_dispatch' ? 'warning' : 'neutral'"
          quiet
        />
        <AppButton
          v-if="workspace.quotationOrderState.state === 'write_succeeded_readback_pending'"
          variant="secondary"
          block
          data-testid="quotation-order-readback-retry"
          @tap="workspace.retryQuotationOrderReadback"
        >刷新订单状态（只读）</AppButton>
        <view
          v-if="workspace.quotationOrderState.state === 'succeeded' && workspace.quotationOrderState.order?.qiniuList?.length"
          class="quotation-content__submitted-document"
          data-testid="quotation-order-authoritative-document"
        >服务器已返回报价单文件</view>
      </view>

      <view v-if="composition.localState === 'unscoped_requires_confirmation'"
        class="quotation-content__blocked" data-testid="quotation-draft-role-unscoped">
        <text class="quotation-content__blocked-title">发现未记录角色归属的历史报价草稿</text>
        <text class="quotation-content__copy">旧草稿无法确认属于当前角色。系统不会自动恢复、迁移、覆盖或删除旧数据。可明确选择为当前角色新建独立草稿，历史记录仍保留，后续由授权人员处理。</text>
        <AppButton class="quotation-content__secondary-action" variant="secondary" block
          data-testid="quotation-draft-role-start-new"
          @tap="composition.startNewRoleScopedDraft">为当前角色新建草稿（保留历史）</AppButton>
      </view>
      <view v-else-if="composition.localState === 'legacy_requires_action'" class="quotation-content__blocked" data-testid="quotation-draft-legacy">
        <text class="quotation-content__blocked-title">旧版平铺草稿已保留</text>
        <text class="quotation-content__copy">旧草稿没有可靠的维修部位和工程量归属，系统不会自动迁移、覆盖或清除。请先人工处理；如确认不再需要，可显式放弃并创建分组草稿。</text>
        <AppButton class="quotation-content__secondary-action" variant="secondary" block @tap="composition.discardLegacyDraft">确认放弃旧版草稿并新建</AppButton>
      </view>
      <view v-else-if="composition.localState === 'invalid'" class="quotation-content__blocked" data-testid="quotation-draft-invalid">
        <text class="quotation-content__blocked-title">无法恢复这份本地草稿</text>
        <text class="quotation-content__copy">草稿格式不兼容，原记录已保留。确认不再需要后，可清除异常记录并新建。</text>
        <AppButton class="quotation-content__secondary-action" variant="secondary" block @tap="composition.discardInvalidDraft">清除异常草稿并新建</AppButton>
      </view>
      <view v-else-if="composition.localState === 'unavailable'" class="quotation-content__blocked" data-testid="quotation-draft-unavailable">
        <text class="quotation-content__blocked-title">本地草稿暂不可用</text>
        <text class="quotation-content__copy">为避免覆盖尚未确认的数据，当前报价内容已锁定。请稍后重试或返回工单。</text>
      </view>
      <view v-else>
        <view v-if="composition.groups.length === 0 && isInitialEmptyWorkbench" class="quotation-content__initial-empty" data-testid="quotation-initial-empty-workbench">
          <view class="quotation-content__initial-draft-notice" data-testid="quotation-draft-notice" role="status">
            <text class="quotation-content__initial-draft-notice-mark" aria-hidden="true">i</text>
            <text class="quotation-content__initial-draft-notice-copy">当前为报价草稿；通过校验并确认提交后才会创建正式订单。</text>
          </view>
          <view class="quotation-content__initial-card app-surface" data-testid="quotation-initial-main-card">
            <view class="quotation-content__initial-empty-heading quotation-content__section-heading">
              <view class="quotation-content__section-number">1</view>
              <text class="quotation-content__initial-empty-title">维修部位</text>
            </view>
            <view class="quotation-content__initial-empty-surface">
              <text class="quotation-content__initial-field-label">防水维修部位 <text class="quotation-content__first-step-required">*</text></text>
              <button class="quotation-content__initial-field-value" type="button"
                :class="{ 'quotation-content__initial-field-value--disabled': !canEdit }"
                data-testid="quotation-add-group" :disabled="!canEdit"
                aria-label="添加维修部位" @tap="createRepairGroup()">
                <text>请选择维修部位</text><text class="quotation-content__initial-field-chevron" aria-hidden="true">›</text>
              </button>
              <text class="quotation-content__initial-field-label">维修部位描述 <text class="quotation-content__first-step-required">*</text></text>
              <text class="quotation-content__initial-field-placeholder">添加维修部位后填写描述</text>
              <text class="quotation-content__initial-field-label">工程量 <text class="quotation-content__first-step-required">*</text></text>
              <text class="quotation-content__initial-field-placeholder">添加维修部位后填写工程量</text>
              <text class="quotation-content__initial-empty-copy">先选择维修部位，再填写描述及工程量。</text>
              <view class="quotation-content__initial-empty-artwork" aria-hidden="true">
                <view class="quotation-content__initial-empty-ground" />
                <image class="quotation-content__initial-empty-illustration" :src="emptyBoxArtwork" mode="aspectFit" data-testid="quotation-empty-illustration" />
              </view>
            </view>
          </view>
          <view class="quotation-content__initial-cost-preview app-surface quotation-content__commercial-section">
            <view class="quotation-content__section-heading">
              <view class="quotation-content__section-number">2</view>
              <text class="quotation-content__initial-cost-title">选择产品</text>
            </view>
            <view class="quotation-content__select-tile quotation-content__select-tile--disabled" aria-disabled="true">
              <view class="quotation-content__select-icon"><AppIcon name="order" :size="22" color="#257cf5" /></view>
              <view class="quotation-content__select-tile-copy">
                <text class="quotation-content__select-tile-name">选择产品</text>
                <text class="quotation-content__select-tile-help">套餐、工序、材料、机措</text>
              </view>
              <AppIcon name="chevron-right" :size="17" color="#9caabd" />
            </view>
            <view class="quotation-content__adjustment-actions">
              <button class="quotation-content__adjustment-button quotation-content__adjustment-button--disabled" disabled>＋ 增项</button>
              <button class="quotation-content__adjustment-button quotation-content__adjustment-button--disabled" disabled>－ 减项</button>
            </view>
          </view>
          <view class="quotation-content__initial-cost-preview app-surface quotation-content__commercial-section" data-testid="quotation-quote-process">
            <view class="quotation-content__section-heading">
              <view class="quotation-content__section-number">3</view>
              <text class="quotation-content__initial-cost-title">费用与优惠</text>
            </view>
            <view class="quotation-content__initial-cost-row"><text>折扣</text><text class="quotation-content__fee-value">不打折 <text aria-hidden="true">›</text></text></view>
            <view class="quotation-content__initial-cost-row quotation-content__initial-cost-row--last"><text>优惠金额（元）</text><text class="quotation-content__initial-cost-unavailable">完成选品后按业务规则填写</text></view>
          </view>
          <view class="quotation-content__order-explainer">
            <text class="quotation-content__order-explainer-title">ⓘ 订单说明</text>
            <text>确认提交后才会产生正式订单；草稿不等于正式订单。</text>
            <text>正式下单需满足现有字段、金额及权限校验。</text>
          </view>
        </view>
        <view v-else-if="composition.groups.length === 0" class="quotation-content__empty" data-testid="quotation-draft-empty">
          <view class="quotation-content__empty-mark" aria-hidden="true">＋</view>
          <text class="quotation-content__empty-title">还没有维修部位组</text>
          <text class="quotation-content__copy">先填写维修部位，再在每个分组中整理套餐、工序、材料或机措。</text>
          <AppButton
            class="quotation-content__add-group-button"
            data-testid="quotation-add-group"
            block
            :disabled="!canEdit"
            @tap="createRepairGroup()"
          >添加维修部位组</AppButton>
        </view>

        <template v-else-if="isFirstRepairPartStep && firstRepairPartGroup">
          <Q01EntryScreen
            :group="firstRepairPartGroup"
            :options="composition.repairPartOptions"
            :can-edit="canEdit"
            :show-draft-notice="!hasSharedDraftStatus"
            :product-review-only="props.productReviewOnly"
            :repair-parts-label="repairPartPathLabel(firstRepairPartGroup.repairParts)"
            :errors="{
              repairParts: firstStepFieldError('repairParts'),
              partDescription: firstStepFieldError('partDescription'),
              maintainAreaNum: firstStepFieldError('maintainAreaNum'),
            }"
            @repair-parts-change="onRepairPartChange(firstRepairPartGroup.groupId, $event)"
            @description-input="onGroupDescriptionInput(firstRepairPartGroup.groupId, $event)"
            @quantity-input="onGroupQuantityInput(firstRepairPartGroup.groupId, $event)"
            @select-products="selectProductsForFirstGroup(firstRepairPartGroup.groupId)"
          />
          <view v-if="syntheticReviewEnabled" class="quotation-content__synthetic-review-slot"
            data-testid="synthetic-extfield-slot">
            <slot name="synthetic-review-panel" />
          </view>
        </template>

        <view v-else class="quotation-content__groups" data-testid="quotation-draft-groups">
          <view
            v-for="(group, groupIndex) in composition.groups"
            :key="group.groupId"
            class="quotation-content__group app-surface app-surface--compact"
            :id="`quotation-repair-group-${group.groupId}`"
            :data-testid="`quotation-repair-group-${group.groupId}`"
          >
            <view class="quotation-content__group-overview">
            <view class="quotation-content__group-heading">
              <view class="quotation-content__group-index" aria-hidden="true">{{ String(groupIndex + 1).padStart(2, '0') }}</view>
              <view class="quotation-content__group-title-copy">
                <text class="quotation-content__group-eyebrow">维修部位组</text>
                <text class="quotation-content__group-title">{{ group.partDescription || repairPartPathLabel(group.repairParts) || '待选择维修部位' }}</text>
                <text class="quotation-content__group-location">{{ repairPartPathLabel(group.repairParts) || '尚未选择部位路径' }}<template v-if="group.maintainAreaNum"> · 工程量 {{ group.maintainAreaNum }}</template></text>
              </view>
              <view class="quotation-content__group-heading-actions">
                <text class="quotation-content__group-count">{{ groupSelectionCount(group.groupId) }} 项</text>
                <AppButton
                  class="quotation-content__context-toggle"
                  variant="text"
                  :data-testid="`quotation-group-context-toggle-${group.groupId}`"
                  :aria-expanded="isGroupContextExpanded(group)"
                  @tap="toggleGroupContext(group)"
                >{{ isGroupContextExpanded(group) ? '收起' : '编辑部位' }}</AppButton>
              </view>
            </view>
            <view v-if="groupSubtotal(group.groupId) !== undefined" class="quotation-content__group-total-row">
              <text class="quotation-content__group-total-label">本组报价</text>
              <text class="quotation-content__group-subtotal" :data-testid="`quotation-group-subtotal-${group.groupId}`">¥{{ formatQuotationMoney(groupSubtotal(group.groupId)!) }}</text>
            </view>
            </view>
            <view v-if="isGroupContextExpanded(group)" class="quotation-content__group-context" :data-testid="`quotation-group-context-${group.groupId}`">
              <text class="quotation-content__context-label">维修部位路径</text>
              <AppCascadeSelector
                :options="composition.repairPartOptions"
                :model-value="group.repairParts"
                :hierarchical="true"
                :test-id="`quotation-repair-part-selector-${group.groupId}`"
                :disabled="!canEdit || composition.repairPartOptions.length === 0"
                @update:model-value="onRepairPartChange(group.groupId, $event)"
              />
              <AppStatus
                v-if="composition.repairPartOptions.length === 0"
                message="维修部位选项暂不可用；当前组未绑定部位，不能向其中添加目录项。"
                tone="warning"
                quiet
              />
              <view class="quotation-content__group-fields">
                <label class="quotation-content__context-field">
                  <text class="quotation-content__context-label">部位描述</text>
                  <textarea
                    class="quotation-content__context-input quotation-content__context-input--multiline"
                    :value="group.partDescription"
                    :disabled="!canEdit"
                    placeholder="补充维修部位描述"
                    :data-testid="`quotation-group-description-${group.groupId}`"
                    @input="onGroupDescriptionInput(group.groupId, $event)"
                  />
                </label>
                <label class="quotation-content__context-field">
                  <text class="quotation-content__context-label">工程量</text>
                  <input
                    class="quotation-content__context-input"
                    type="digit"
                    :value="group.maintainAreaNum"
                    :disabled="!canEdit"
                    placeholder="填写工程量"
                    :data-testid="`quotation-group-quantity-${group.groupId}`"
                    @input="onGroupQuantityInput(group.groupId, $event)"
                  />
                </label>
              </view>
            </view>

            <view class="quotation-content__composition" :data-testid="`quotation-group-composition-${group.groupId}`">
              <view class="quotation-content__composition-heading">
                <view>
                  <text class="quotation-content__composition-title">本组项目</text>
                  <text class="quotation-content__composition-meta">{{ groupSelectionCount(group.groupId) }} 项 · 草稿</text>
                </view>
                <AppButton
                  v-if="groupSelectionCount(group.groupId) > 0"
                  class="quotation-content__details-toggle"
                  variant="text"
                  :data-testid="`quotation-group-details-toggle-${group.groupId}`"
                  :aria-expanded="!areGroupDetailsCollapsed(group.groupId)"
                  @tap="toggleGroupDetails(group.groupId)"
                >{{ areGroupDetailsCollapsed(group.groupId) ? '查看明细' : '收起明细' }}</AppButton>
              </view>

              <text
                v-if="areGroupDetailsCollapsed(group.groupId)"
                class="quotation-content__collapsed-summary"
                :data-testid="`quotation-group-collapsed-summary-${group.groupId}`"
              >{{ groupSelectionSummary(group.groupId) }}</text>
              <view v-else-if="groupSelectionCount(group.groupId) > 0" class="quotation-content__selection-list">
                <view
                  v-for="kind in catalogKinds"
                  v-show="composition.selectionsFor(group.groupId, kind).length > 0"
                  :key="kind"
                  class="quotation-content__group-section"
                  :class="`quotation-content__group-section--${kind}`"
                  :data-testid="`quotation-group-section-${group.groupId}-${kind}`"
                >
                  <view class="quotation-content__group-section-heading">
                    <view class="quotation-content__group-section-copy">
                      <text class="quotation-content__group-section-title">{{ composition.catalogKindLabels[kind] }}</text>
                      <text class="quotation-content__group-section-count">{{ composition.selectionsFor(group.groupId, kind).length }} 项</text>
                    </view>
                  </view>
                  <view
                    v-for="selection in composition.selectionsFor(group.groupId, kind)"
                    :key="selection.selectionId"
                    class="quotation-content__selection"
                    :class="{ 'quotation-content__selection--package': selection.kind === 'package' }"
                    data-testid="quotation-composition-selection"
                  >
                    <view class="quotation-content__line-heading">
                      <view class="quotation-content__line-kind-mark" :class="`quotation-content__line-kind-mark--${selection.kind}`" aria-hidden="true">{{ catalogKindMark(selection.kind) }}</view>
                      <view class="quotation-content__line-title-wrap">
                        <text class="quotation-content__line-kind">{{ composition.catalogKindLabels[selection.kind] }}</text>
                        <text class="quotation-content__line-title">{{ selection.label }}</text>
                        <text v-if="catalogUnitPriceFor(group.groupId, selection.selectionId) !== undefined"
                          class="quotation-content__line-unit-price" :data-testid="`quotation-selection-unit-price-${selection.selectionId}`">
                          目录单价 ¥{{ formatQuotationMoney(catalogUnitPriceFor(group.groupId, selection.selectionId)!) }}{{ selection.unit ? '/' + selection.unit : '' }}
                        </text>
                      </view>
                      <text class="quotation-content__selection-unit">{{ selection.unit || '单位待核验' }}</text>
                      <view v-if="lineSubtotalFor(group.groupId, selection.selectionId) !== undefined" class="quotation-content__line-money"
                        :data-testid="`quotation-selection-subtotal-${selection.selectionId}`">
                        <text class="quotation-content__line-money-label">小计</text>
                        <text class="quotation-content__line-money-value">¥{{ formatQuotationMoney(lineSubtotalFor(group.groupId, selection.selectionId)!) }}</text>
                      </view>
                    </view>
                    <view
                      v-if="selection.kind === 'package'"
                      class="quotation-content__package-summary"
                      :data-testid="`quotation-configured-package-${selection.selectionId}`"
                    >
                      <view class="quotation-content__package-summary-heading">
                        <view>
                          <text class="quotation-content__package-summary-title">套餐内配置</text>
                          <text class="quotation-content__package-summary-note">与独立增项分开展示 · 金额关系待核验</text>
                        </view>
                        <AppButton
                          class="quotation-content__package-edit"
                          variant="text"
                          :data-testid="`quotation-package-edit-${group.groupId}-${selection.catalogId}`"
                          @tap="openExistingPackageConfiguration(group.groupId, selection.catalogId)"
                        >{{ selection.configuration ? '编辑配置' : '完成配置' }}</AppButton>
                      </view>
                      <template v-if="selection.configuration">
                        <view class="quotation-content__package-summary-configured">
                          <text class="quotation-content__package-summary-count">{{ selection.configuration.procedures.length }} 项工序 · {{ selection.configuration.materials.length }} 项材料 · {{ selection.configuration.measures.length }} 项机措</text>
                          <AppButton
                            class="quotation-content__package-details-toggle"
                            variant="text"
                            :data-testid="`quotation-package-details-toggle-${selection.selectionId}`"
                            :aria-expanded="isPackageDetailsExpanded(selection.selectionId)"
                            @tap="togglePackageDetails(selection.selectionId)"
                          >{{ isPackageDetailsExpanded(selection.selectionId) ? '收起组成' : '查看组成' }}</AppButton>
                        </view>
                        <view v-if="isPackageDetailsExpanded(selection.selectionId)" class="quotation-content__package-summary-rows">
                          <text v-for="component in selection.configuration.procedures" :key="`procedure-${component.providerComponentId || ''}-${component.providerReferenceId || ''}`" class="quotation-content__package-summary-row">工序 · {{ component.label }}</text>
                          <text v-for="(component, componentIndex) in selection.configuration.materials" :key="`material-${typeof component.layer}-${String(component.layer)}-${component.providerComponentId || ''}-${component.providerReferenceId || ''}`" class="quotation-content__package-summary-row">{{ configuredPackageLayerLabel(selection.configuration.materials, componentIndex) }} · {{ component.label }}</text>
                          <text v-for="component in selection.configuration.measures" :key="`measure-${component.providerComponentId || ''}-${component.providerReferenceId || ''}`" class="quotation-content__package-summary-row">机措 · {{ component.label }}</text>
                        </view>
                      </template>
                      <text v-else class="quotation-content__package-summary-row">套餐尚未完成配置；已填写内容仍会保留。</text>
                    </view>
                    <view v-if="selection.kind === 'material' && selection.skuChoices?.length"
                      class="quotation-content__package-summary" :data-testid="`quotation-material-skus-${selection.selectionId}`">
                      <text class="quotation-content__package-summary-note">SKU 规格明细 · 尚未核验报价金额</text>
                      <view v-for="sku in selection.skuChoices" :key="sku.skuId"
                        class="quotation-content__package-summary-row">
                        <text>规格 SKU · {{ Object.values(sku.attributes).join(' / ') }} · {{ sku.quantity }} 件</text>
                        <AppButton variant="text" :disabled="!canEdit"
                          :data-testid="`quotation-material-sku-remove-${group.groupId}-${sku.skuId}`"
                          @tap="removeLocalSkuFromRepairGroup(group.groupId, selection.selectionId, selection.catalogId, sku.skuId)">
                          {{ selection.skuChoices.length === 1 ? '移除材料及规格' : '移除该规格' }}
                        </AppButton>
                      </view>
                      <AppButton variant="text" :data-testid="`quotation-material-sku-edit-${group.groupId}-${selection.catalogId}`"
                        @tap="openExistingMaterialSkuPreview(group.groupId, selection.catalogId)">编辑规格与数量</AppButton>
                    </view>
                    <AppStatus v-if="skuLocalRemoveErrors[selection.selectionId]"
                      :message="skuLocalRemoveErrors[selection.selectionId]" tone="warning" quiet />
                    <view class="quotation-content__line-controls">
                      <text class="quotation-content__quantity-label">数量</text>
                      <view class="quotation-content__quantity-wrap" :class="{ 'quotation-content__quantity-wrap--error': composition.quantityErrorBySelection[selection.selectionId] }">
                        <input
                          class="quotation-content__quantity"
                          type="digit"
                          :value="composition.quantityTextBySelection[selection.selectionId] ?? String(selection.quantity)"
                          :disabled="!canEdit || (selection.kind === 'material' && Boolean(selection.skuChoices?.length))"
                          :aria-label="`${selection.label}数量`"
                          :data-testid="`quotation-selection-quantity-${selection.selectionId}`"
                          @input="onQuantityInput(group.groupId, selection.selectionId, $event)"
                        />
                        <text v-if="selection.unit" class="quotation-content__unit">{{ selection.unit }}</text>
                      </view>
                      <text v-if="composition.quantityErrorBySelection[selection.selectionId]" class="quotation-content__quantity-error" role="alert">
                        {{ composition.quantityErrorBySelection[selection.selectionId] }}
                      </text>
                      <AppButton
                        class="quotation-content__remove-button"
                        variant="text"
                        :disabled="!canEdit"
                        :data-testid="`quotation-selection-remove-${selection.selectionId}`"
                        @tap="composition.removeSelection(group.groupId, selection.selectionId)"
                      >移除</AppButton>
                    </view>
                  </view>
                </view>
              </view>
              <view v-else class="quotation-content__composition-empty" data-testid="quotation-group-composition-empty">
                <text class="quotation-content__composition-empty-title">此部位还没有报价项目</text>
                <text class="quotation-content__composition-empty-copy">添加套餐、工序、材料或机措；选择后仍可在本组调整数量和配置。</text>
              </view>

              <AppButton
                class="quotation-content__browse-catalog"
                :data-testid="`quotation-browse-${group.groupId}`"
                :disabled="!canEdit"
                block
                @tap="openCatalog(group.groupId, 'package')"
              >＋ 添加项目</AppButton>
            </view>
          </view>
          <AppButton
            class="quotation-content__add-group-button quotation-content__add-group-button--outline"
            data-testid="quotation-add-group"
            variant="secondary"
            block
            :disabled="!canEdit"
            @tap="createRepairGroup()"
          >＋ 添加维修部位组</AppButton>
        </view>
        <view v-if="composition.groups.length > 0 && !isFirstRepairPartStep" class="quotation-content__adjustments app-surface" data-testid="quotation-cost-adjustments">
          <view class="quotation-content__adjustments-title-row">
            <text class="quotation-content__adjustments-title">费用与优惠</text>
            <text class="quotation-content__adjustments-badge">业务规则待核验</text>
          </view>
          <view class="quotation-content__adjustments-row">
            <text>增项 / 减项</text>
            <text class="quotation-content__adjustments-unavailable">尚未开放 <text aria-hidden="true">›</text></text>
          </view>
          <view class="quotation-content__adjustments-row">
            <text>折扣</text>
            <text class="quotation-content__adjustments-unavailable">暂不支持修改</text>
          </view>
          <view class="quotation-content__adjustments-row quotation-content__adjustments-row--last">
            <text>优惠金额</text>
            <text class="quotation-content__adjustments-unavailable">待核验</text>
          </view>
          <text class="quotation-content__adjustments-hint">费用调整暂未开放，不影响已填写的报价草稿。</text>
        </view>
      </view>

      <view
        v-if="localP1Review && composition.selectionCount > 0 && !isInitialEmptyWorkbench && !isFirstRepairPartStep"
        class="quotation-content__p1-review"
        data-testid="quotation-p1-local-review"
      >
        <AppButton
          variant="secondary"
          block
          :aria-expanded="p1ReviewExpanded"
          data-testid="quotation-p1-review-toggle"
          @tap="p1ReviewExpanded = !p1ReviewExpanded"
        >{{ p1ReviewExpanded ? '收起报价核对' : '核对报价草稿' }}</AppButton>
        <view v-if="p1ReviewExpanded" class="quotation-content__p1-review-body" data-testid="quotation-p1-review-details">
          <text class="quotation-content__p1-review-title">分组草稿核对 · 尚未提交</text>
          <text
            v-for="group in localP1Review.groups"
            :key="group.groupId"
            class="quotation-content__p1-review-item"
            :data-testid="`quotation-p1-review-group-${group.groupId}`"
          >维修部位 {{ group.position }} · {{ group.selectedCount }} 项 · {{ group.state === 'local_complete' ? '已填写' : (group.firstIssue || '请完善本组') }}</text>
          <text class="quotation-content__p1-review-warning" data-testid="quotation-p1-review-unverified">部分材料规格与价格待核实，暂不能提交正式报价。</text>
        </view>
      </view>

      <view v-if="composition.localState === 'save_failed'" class="quotation-content__retry">
        <AppButton variant="secondary" block @tap="composition.flushDraft">重试保存本地草稿</AppButton>
      </view>
    </view>

    <view v-else-if="props.state === 'blocked'" class="quotation-content__panel app-surface" data-testid="quotation-state-blocked">
      <AppStatus
        message="报价单业务状态暂不可用；不会用目录数据替代已有报价状态。"
        tone="warning"
        quiet
      />
      <AppButton class="quotation-content__secondary-action" variant="secondary" block @tap="$emit('back')">返回工单详情</AppButton>
    </view>

    <view v-else-if="props.state === 'failed_retryable'" class="quotation-content__panel app-surface" data-testid="quotation-state-retryable">
      <AppStatus message="暂时无法准备报价内容，请检查网络后重试。" tone="warning" quiet />
      <AppButton class="quotation-content__secondary-action" variant="secondary" block @tap="$emit('retry')">重新加载</AppButton>
    </view>

    <view v-else class="quotation-content__panel app-surface" data-testid="quotation-state-terminal">
      <AppStatus message="报价内容暂不可用，请返回工单详情后再试。" tone="warning" quiet />
      <AppButton class="quotation-content__secondary-action" variant="secondary" block @tap="$emit('back')">返回工单详情</AppButton>
    </view>

    <view
      v-if="props.state === 'ready' && catalogBrowser.isOpen"
      class="quotation-content__catalog-page"
      data-testid="quotation-catalog-page"
    >
      <template v-if="!catalogBrowser.selectedPackageId && !catalogBrowser.selectedMaterialId">
        <view class="quotation-content__catalog-topbar">
          <AppButton class="quotation-content__catalog-back" variant="text" aria-label="返回报价工作台" data-testid="quotation-catalog-close" @tap="closeCatalog">‹ 返回</AppButton>
          <view class="quotation-content__catalog-topbar-title">
            <text class="quotation-content__catalog-title">选择产品</text>
          </view>
          <text class="quotation-content__catalog-mode">第 2 步 · 选品</text>
        </view>

        <view class="quotation-content__catalog-target" data-testid="quotation-catalog-target">
          <view class="quotation-content__catalog-target-index">{{ String(activeCatalogGroupNumber).padStart(2, '0') }}</view>
          <view class="quotation-content__catalog-target-copy">
            <text class="quotation-content__catalog-target-label">添加至当前维修部位</text>
            <text class="quotation-content__catalog-target-title">{{ activeCatalogGroupLabel }}</text>
            <text v-if="activeCatalogGroupPathLabel && activeCatalogGroupPathLabel !== activeCatalogGroupLabel" class="quotation-content__catalog-target-meta">维修位置 · {{ activeCatalogGroupPathLabel }}</text>
          </view>
          <text class="quotation-content__catalog-target-count">已选 {{ groupSelectionCount(activeCatalogGroupId || '') }} 项</text>
        </view>

        <view class="quotation-content__catalog-intro">
          <view class="quotation-content__catalog-intro-copy">
            <text class="quotation-content__catalog-intro-title">按类别查找</text>
            <text class="quotation-content__catalog-intro-description">选好项目后，可返回报价调整数量</text>
          </view>
        </view>

        <view class="quotation-content__catalog-main" data-testid="quotation-catalog-main">
          <view class="quotation-content__search-wrap">
            <AppIcon class="quotation-content__search-mark" name="search" :size="19" color="#91a2ba" aria-hidden="true" />
            <input
              class="quotation-content__search-input"
              type="search"
              :value="catalogSearchText"
              :placeholder="catalogSearchPlaceholder"
              placeholder-style="color:#91a0b8; opacity:1"
              confirm-type="search"
              :aria-label="catalogSearchPlaceholder"
              data-testid="quotation-catalog-search"
              @input="onCatalogSearchInput"
              @confirm="confirmCatalogSearch"
            />
            <button class="quotation-content__search-action" type="button" data-testid="quotation-catalog-search-submit" @tap="confirmCatalogSearch">搜索</button>
          </view>

          <view class="quotation-content__category-grid" data-testid="quotation-catalog-categories">
            <button
              v-for="kind in catalogKinds"
              :key="kind"
              class="quotation-content__category"
              :class="{ 'quotation-content__category--active': catalogBrowser.selectedKind === kind }"
              type="button"
              :aria-pressed="catalogBrowser.selectedKind === kind"
              :data-testid="`quotation-catalog-kind-${kind}`"
              @tap="selectCatalogKind(kind)"
            >{{ catalogTabLabel(kind) }}</button>
          </view>
          <view class="quotation-content__catalog-section-heading">
            <text class="quotation-content__catalog-section-title">{{ catalogSectionTitle }}</text>
            <text class="quotation-content__catalog-section-note">当前工单适用</text>
          </view>

          <AppStatus
            v-if="catalogSelectionError"
            class="quotation-content__catalog-state"
            :message="catalogSelectionError"
            tone="warning"
            quiet
          />
          <AppStatus
            v-else-if="catalogBrowser.selectedKind !== 'package' && (!activeCatalogGroup || activeCatalogGroup.repairParts.length === 0)"
            class="quotation-content__catalog-state"
            message="请从已选择维修部位路径的分组打开目录，才能加入工序、材料或机措。"
            tone="neutral"
            quiet
          />

          <view class="quotation-content__catalog-browser"
            :class="{ 'quotation-content__catalog-browser--faceted': catalogNavigationFacets.length > 0 }"
            data-testid="quotation-catalog-browser">
            <scroll-view v-if="catalogNavigationFacets.length > 0" class="quotation-content__catalog-facets" scroll-y
              data-testid="quotation-catalog-facets">
              <button class="quotation-content__catalog-facet"
                :class="{ 'quotation-content__catalog-facet--selected': !selectedCatalogFacet }"
                :aria-pressed="!selectedCatalogFacet" @tap="selectedCatalogFacet = ''">全部</button>
              <button v-for="facet in catalogNavigationFacets" :key="facet.value"
                class="quotation-content__catalog-facet"
                :class="{
                  'quotation-content__catalog-facet--selected': selectedCatalogFacet === facet.value,
                  'quotation-content__catalog-facet--disabled': !catalogFacetAvailable(facet.value),
                }"
                :disabled="!catalogFacetAvailable(facet.value)"
                :data-testid="`quotation-catalog-facet-${facet.value}`"
                :aria-pressed="selectedCatalogFacet === facet.value"
                @tap="selectedCatalogFacet = facet.value">{{ facet.label }}</button>
            </scroll-view>
            <AppLoadingState
              v-if="catalogBrowser.catalogStatesByKind[catalogBrowser.selectedKind] === 'loading'"
              class="quotation-content__catalog-state"
              variant="inline"
              :label="`正在读取${composition.catalogKindLabels[catalogBrowser.selectedKind]}目录`"
            />
            <AppStatus
              v-else-if="catalogBrowser.catalogStatesByKind[catalogBrowser.selectedKind] === 'blocked'"
              class="quotation-content__catalog-state"
              :message="catalogBrowser.listErrorCopyByKind[catalogBrowser.selectedKind] || '当前工单缺少目录适用范围。'"
              tone="warning"
              quiet
            />
            <view
              v-else-if="catalogBrowser.catalogStatesByKind[catalogBrowser.selectedKind] === 'failed_retryable' || catalogBrowser.catalogStatesByKind[catalogBrowser.selectedKind] === 'failed_terminal'"
              class="quotation-content__catalog-state quotation-content__catalog-state-card"
              data-testid="quotation-catalog-list-error"
            >
              <view class="quotation-content__catalog-state-mark quotation-content__catalog-state-mark--warning" aria-hidden="true">!</view>
              <text class="quotation-content__catalog-state-title">暂时无法读取目录</text>
              <text class="quotation-content__catalog-state-copy">本次读取没有改变报价草稿或已选项目。网络恢复后可重试。</text>
              <AppStatus
                :message="catalogBrowser.listErrorCopyByKind[catalogBrowser.selectedKind] || '目录暂不可用。'"
                tone="warning"
                quiet
              />
              <AppButton
                v-if="catalogBrowser.catalogStatesByKind[catalogBrowser.selectedKind] === 'failed_retryable'"
                variant="secondary"
                block
                data-testid="quotation-catalog-list-retry"
                @tap="catalogBrowser.retryList"
              >重试读取</AppButton>
            </view>
            <view
              v-else-if="catalogBrowser.catalogStatesByKind[catalogBrowser.selectedKind] === 'succeeded' && displayedCatalogItems.length === 0"
              class="quotation-content__catalog-state quotation-content__catalog-state-card"
              data-testid="quotation-catalog-empty"
            >
              <view class="quotation-content__catalog-state-mark" aria-hidden="true">{{ catalogKindMark(catalogBrowser.selectedKind) }}</view>
              <text class="quotation-content__catalog-state-title">{{ catalogSearchText ? '没有匹配的项目' : '当前目录暂无项目' }}</text>
              <text class="quotation-content__catalog-state-copy">{{ catalogSearchText ? '试试简化关键词，或切换其他目录类别。' : '当前工单适用范围没有返回可浏览项目；可以切换类别查看。' }}</text>
              <AppStatus v-if="catalogBrowser.catalogMoreByKind[catalogBrowser.selectedKind]"
                data-testid="quotation-catalog-search-partial"
                message="当前仅检索已加载的目录项目，后续页可能仍有匹配内容。" tone="neutral" quiet />
              <AppButton v-if="catalogBrowser.catalogMoreByKind[catalogBrowser.selectedKind]"
                variant="secondary" data-testid="quotation-catalog-search-load-more"
                :disabled="catalogBrowser.catalogPageLoadingByKind[catalogBrowser.selectedKind] || catalogBrowser.catalogPagesByKind[catalogBrowser.selectedKind] >= 50"
                @tap="catalogBrowser.loadNextPage(catalogBrowser.selectedKind)">
                {{ catalogBrowser.catalogPagesByKind[catalogBrowser.selectedKind] >= 50 ? '目录达到单次浏览安全上限' : catalogBrowser.catalogPageLoadingByKind[catalogBrowser.selectedKind] ? '读取下一页中…' : '继续加载目录' }}
              </AppButton>
              <AppStatus v-if="catalogBrowser.catalogPageErrorByKind[catalogBrowser.selectedKind]"
                :message="catalogBrowser.catalogPageErrorByKind[catalogBrowser.selectedKind]"
                data-testid="quotation-catalog-search-page-error" tone="warning" quiet />
            </view>
            <scroll-view v-else class="quotation-content__catalog-list" scroll-y data-testid="quotation-catalog-list">
              <view
                v-for="item in displayedCatalogItems"
                :key="item.id"
                class="quotation-content__catalog-item"
                :data-testid="`quotation-catalog-item-${item.kind}-${item.id}`"
              >
                <view class="quotation-content__catalog-item-main">
                  <view class="quotation-content__catalog-thumbnail" :class="`quotation-content__catalog-thumbnail--${item.kind}`" aria-hidden="true">
                    <AppIcon v-if="item.kind === 'package'" name="home" :size="32" color="#257bf1" />
                    <text v-else class="quotation-content__catalog-thumbnail-mark">{{ catalogKindMark(item.kind) }}</text>
                  </view>
                  <view class="quotation-content__catalog-item-copy">
                    <view class="quotation-content__catalog-item-heading">
                      <text class="quotation-content__catalog-kind-pill">{{ composition.catalogKindLabels[item.kind] }}</text>
                      <text
                        v-if="catalogSelectionFor(item)"
                        class="quotation-content__catalog-selected-tag"
                        :data-testid="`quotation-catalog-selected-${item.kind}-${item.id}`"
                      >已选 × {{ catalogSelectionFor(item)?.quantity }}</text>
                    </view>
                    <text class="quotation-content__catalog-item-title">{{ item.name }}</text>
                    <text v-if="item.description || item.content" class="quotation-content__catalog-item-description">{{ item.description || item.content }}</text>
                    <view v-if="catalogCardDetails(item).length" class="quotation-content__catalog-item-details">
                      <text v-for="detail in catalogCardDetails(item)" :key="detail" class="quotation-content__catalog-item-detail">{{ detail }}</text>
                    </view>
                  </view>
                </view>
                <view class="quotation-content__catalog-item-footer">
                  <view class="quotation-content__catalog-item-price" :data-testid="`quotation-catalog-price-${item.id}`">
                    <text class="quotation-content__catalog-item-price-label">{{ catalogUnitPricePresentation(item).label }}</text>
                    <text v-if="catalogUnitPricePresentation(item).price" class="quotation-content__catalog-item-price-value">{{ catalogUnitPricePresentation(item).price }}</text>
                  </view>
                  <AppButton
                    v-if="item.kind === 'material' && item.saleOptionCandidates && Object.keys(item.saleOptionCandidates).length"
                    class="quotation-content__catalog-item-action"
                    variant="secondary"
                    :data-testid="`quotation-material-options-${item.id}`"
                    @tap="catalogBrowser.openMaterialSkuPreview(item.id)"
                  >查看规格（只读）</AppButton>
                  <AppButton
                    v-if="item.kind === 'package'"
                    class="quotation-content__catalog-item-action"
                    variant="secondary"
                    :data-testid="`quotation-package-detail-${item.id}`"
                    @tap="openPackageConfiguration(item.id)"
                  >{{ packageSelectionFor(item.id)?.configuration ? '编辑配置' : '查看并配置' }}<AppIcon name="chevron-right" :size="14" color="var(--app-color-primary)" aria-hidden="true" /></AppButton>
                  <AppButton
                    v-else-if="isDirectQuotationCatalogKind(item.kind) && !catalogSelectionFor(item)"
                    class="quotation-content__catalog-item-action"
                    variant="secondary"
                    :disabled="!canSelectCatalogItem(item)"
                    :data-testid="`quotation-catalog-add-${item.kind}-${item.id}`"
                    @tap="addCatalogSelection(item.kind, item.id)"
                  >加入本组</AppButton>
                  <AppButton
                    v-else-if="isDirectQuotationCatalogKind(item.kind)"
                    class="quotation-content__catalog-item-action"
                    variant="secondary"
                    :data-testid="`quotation-catalog-adjust-${item.kind}-${item.id}`"
                    @tap="closeCatalog"
                  >在工作台调整</AppButton>
                  <text v-else class="quotation-content__catalog-readonly">只读</text>
                </view>
              </view>
              <view v-if="catalogBrowser.catalogMoreByKind[catalogBrowser.selectedKind]"
                data-testid="quotation-catalog-pagination"
                class="quotation-content__catalog-state">
                <AppStatus v-if="catalogBrowser.catalogPageErrorByKind[catalogBrowser.selectedKind]"
                  :message="catalogBrowser.catalogPageErrorByKind[catalogBrowser.selectedKind]"
                  tone="warning" quiet data-testid="quotation-catalog-page-error" />
                <AppButton variant="secondary"
                  :disabled="catalogBrowser.catalogPageLoadingByKind[catalogBrowser.selectedKind] || catalogBrowser.catalogPagesByKind[catalogBrowser.selectedKind] >= 50"
                  data-testid="quotation-catalog-load-more"
                  @tap="catalogBrowser.loadNextPage(catalogBrowser.selectedKind)">
                  {{ catalogBrowser.catalogPagesByKind[catalogBrowser.selectedKind] >= 50 ? '目录达到单次浏览安全上限' : catalogBrowser.catalogPageLoadingByKind[catalogBrowser.selectedKind] ? '读取下一页中…' : '加载更多项目' }}
                </AppButton>
              </view>
            </scroll-view>
          </view>
        </view>

        <view class="quotation-content__catalog-footer" data-testid="quotation-catalog-footer">
          <view class="quotation-content__catalog-footer-copy">
            <text class="quotation-content__catalog-footer-title">已选 {{ groupSelectionCount(activeCatalogGroupId || '') }} 项 · 保留在当前维修部位</text>
            <text class="quotation-content__catalog-footer-note quotation-content__catalog-footer-note--last">草稿阶段 · 尚未提交报价</text>
          </view>
          <AppButton variant="secondary" data-testid="quotation-catalog-return" @tap="closeCatalog">返回报价</AppButton>
        </view>
      </template>

      <template v-else-if="catalogBrowser.selectedMaterialId">
        <view class="quotation-content__catalog-topbar" data-testid="quotation-material-sku-preview">
          <AppButton class="quotation-content__catalog-back" variant="text"
            data-testid="quotation-sku-preview-back" @tap="catalogBrowser.backToList()">‹ 返回材料目录</AppButton>
          <view class="quotation-content__catalog-topbar-title">
            <text class="quotation-content__catalog-title">选择材料规格</text>
          </view>
        </view>
        <view class="quotation-content__package-detail-content">
          <AppLoadingState v-if="catalogBrowser.materialSkuState === 'loading'"
            label="正在核对材料规格和可选 SKU" quiet />
          <AppStatus v-else-if="catalogBrowser.materialSkuState !== 'succeeded'"
            :message="catalogBrowser.materialSkuErrorCopy || '规格信息暂不可用'" tone="warning" quiet />
          <template v-else-if="catalogBrowser.materialSkuPreview?.state === 'ready'">
            <view v-for="field in catalogBrowser.materialSkuPreview.fields" :key="field.name"
              class="quotation-content__layer-group" :data-testid="`quotation-sku-field-${field.name}`">
              <text class="quotation-content__package-detail-title">{{ field.label }}</text>
              <view class="quotation-content__category-grid">
                <button v-for="option in field.options" :key="option.value" type="button"
                  class="quotation-content__category"
                  :class="{ 'quotation-content__category--active': catalogBrowser.materialSkuSelections[field.name] === option.value }"
                  :aria-pressed="catalogBrowser.materialSkuSelections[field.name] === option.value"
                  :data-testid="`quotation-sku-option-${field.name}-${option.value}`"
                  @tap="catalogBrowser.chooseMaterialSkuOption(field.name, option.value)">{{ option.label }}</button>
              </view>
            </view>
            <AppStatus v-if="catalogBrowser.materialSkuMatch.state === 'matched'"
              message="规格与 SKU 属性精确匹配，可加入当前维修组的草稿；正式报价提交暂未开放。" quiet
              data-testid="quotation-sku-match-exact" />
            <AppStatus v-else-if="catalogBrowser.materialSkuMatch.state === 'incomplete'"
              message="请选择全部规格。该界面不会创建报价或订单。" quiet />
            <AppStatus v-else
              message="该规格组合没有唯一、有效的 SKU；未修改报价。" tone="warning" quiet
              data-testid="quotation-sku-match-unavailable" />
            <view v-if="catalogBrowser.materialSkuMatch.state === 'matched'"
              class="quotation-content__line-controls" data-testid="quotation-sku-local-quantity">
              <text class="quotation-content__quantity-label">该 SKU 数量（件）</text>
              <input class="quotation-content__quantity" type="number"
                :value="skuQuantityText" :disabled="!canEdit"
                data-testid="quotation-sku-quantity-input"
                @input="onSkuQuantityInput($event)" />
              <AppButton variant="secondary"
                :disabled="!canEdit || !selectedMaterialAlreadyInGroup || skuLocalSaving"
                data-testid="quotation-sku-save-local"
                @tap="saveMatchedSkuToLocalDraft">保存 SKU 数量</AppButton>
            </view>
            <AppStatus v-if="!selectedMaterialAlreadyInGroup"
              message="先返回材料目录，使用“加入本组”添加该材料，再保存规格数量。" tone="warning" quiet />
            <AppStatus v-if="skuLocalSaveError" :message="skuLocalSaveError" tone="warning" quiet
              data-testid="quotation-sku-local-save-error" />
          </template>
          <AppStatus v-else :message="materialSkuPreviewStatusMessage"
            tone="warning" quiet data-testid="quotation-sku-preview-unavailable" />
          <view class="quotation-content__catalog-footer">
            <text class="quotation-content__catalog-footer-note">当前可编辑数量；金额和正式订单提交暂未开放。</text>
            <AppButton variant="secondary" data-testid="quotation-sku-preview-return"
              @tap="catalogBrowser.backToList()">返回材料目录</AppButton>
          </view>
        </view>
      </template>

      <template v-else>
        <view class="quotation-content__catalog-topbar">
          <AppButton class="quotation-content__catalog-back" variant="text" aria-label="返回目录" data-testid="quotation-package-detail-back" @tap="backFromPackageConfiguration">‹ 目录</AppButton>
          <view class="quotation-content__catalog-topbar-title">
            <text class="quotation-content__catalog-title">套餐配置</text>
            <text class="quotation-content__catalog-step">{{ activeCatalogGroupTitle }}</text>
          </view>
          <text class="quotation-content__catalog-topbar-spacer" aria-hidden="true" />
        </view>

        <scroll-view class="quotation-content__package-detail" scroll-y data-testid="quotation-package-detail">
          <AppLoadingState
            v-if="catalogBrowser.packageDetailState === 'loading'"
            class="quotation-content__catalog-state"
            variant="inline"
            label="正在读取套餐详情"
          />
          <view v-else-if="catalogBrowser.packageDetailState === 'failed_retryable' || catalogBrowser.packageDetailState === 'failed_terminal' || catalogBrowser.packageDetailState === 'blocked'" class="quotation-content__catalog-state" data-testid="quotation-package-detail-error">
            <AppStatus :message="catalogBrowser.packageDetailErrorCopy || '套餐详情暂不可用。'" tone="warning" quiet />
            <AppButton
              v-if="catalogBrowser.packageDetailState === 'failed_retryable'"
              variant="secondary"
              block
              data-testid="quotation-package-detail-retry"
              @tap="catalogBrowser.retryPackageDetail"
            >重试读取</AppButton>
          </view>
          <view v-else-if="catalogBrowser.packageDetail" class="quotation-content__package-detail-content">
            <view class="quotation-content__package-hero" data-testid="quotation-package-config-focus">
              <view class="quotation-content__package-hero-thumbnail" aria-hidden="true">
                <text class="quotation-content__package-hero-thumbnail-label">套餐</text>
                <text class="quotation-content__package-hero-placeholder">图片未提供</text>
              </view>
              <view class="quotation-content__package-hero-copy">
                <text class="quotation-content__package-detail-title">{{ catalogBrowser.packageDetail.package.name }}</text>
                <text class="quotation-content__package-meta">{{ catalogMetadata(catalogBrowser.packageDetail.package) }}</text>
                <text class="quotation-content__package-detail-note">配置已加入目标维修部位组草稿，尚未提交正式报价。</text>
              </view>
            </view>

            <view class="quotation-content__package-selection-summary" data-testid="quotation-package-selection-summary">
              <view>
                <text class="quotation-content__package-selection-label">材料选择进度</text>
                <text class="quotation-content__package-selection-value">{{ selectedPackageLayerCount }}/{{ catalogBrowser.packageMaterialLayers.length }} 个材料层级已选</text>
              </view>
              <view class="quotation-content__package-selection-side">
                <text class="quotation-content__package-selection-target">{{ activeCatalogGroupTitle }}</text>
                <text class="quotation-content__package-selection-price">金额待核验</text>
              </view>
            </view>

            <view class="quotation-content__detail-section" data-testid="quotation-package-procedures">
              <view class="quotation-content__detail-heading-row">
                <text class="quotation-content__detail-heading">方案组成 · 工序</text>
                <text class="quotation-content__detail-section-note">结构信息 · 价格关系待核验</text>
              </view>
              <text v-if="catalogBrowser.packageDetail.procedures.length === 0" class="quotation-content__empty-section">套餐详情未提供工序</text>
              <view v-for="(row, index) in catalogBrowser.packageDetail.procedures" :key="row.id || row.referenceId || index" class="quotation-content__included-row">
                <text class="quotation-content__included-mark" aria-hidden="true">工</text>
                <text class="quotation-content__detail-row">{{ row.item?.name || '工序引用暂不可解析' }}<template v-if="row.unit"> · {{ row.unit }}</template></text>
              </view>
            </view>

            <view class="quotation-content__detail-section" data-testid="quotation-package-materials">
              <view class="quotation-content__detail-heading-row">
                <text class="quotation-content__detail-heading">材料层级选择</text>
                <text class="quotation-content__detail-section-note">每个层级选择 1 项</text>
              </view>
              <view v-for="layer in catalogBrowser.packageMaterialLayers" :key="layer.key" class="quotation-content__layer-group" :data-testid="`quotation-material-layer-${layer.key}`">
                <view class="quotation-content__layer-heading-row">
                  <view>
                    <text class="quotation-content__layer-heading">{{ layer.label }}</text>
                    <text class="quotation-content__layer-help">请选择该层级的材料</text>
                  </view>
                  <text v-if="selectedMaterialForLayer(layer.key)" class="quotation-content__layer-selected">已选择</text>
                  <text v-else class="quotation-content__layer-required">待选择</text>
                </view>
                <AppStatus
                  v-if="layer.key === 'missing-layer'"
                  message="此套餐材料缺少来源层级，不能安全配置。"
                  tone="warning"
                  quiet
                />
                <AppButton
                  v-for="(row, index) in layer.materials"
                  :key="`${row.id || ''}:${row.referenceId || ''}:${index}`"
                  class="quotation-content__material-choice"
                  variant="secondary"
                  :pressed="isPackageMaterialSelected(row)"
                  :disabled="!canChoosePackageMaterial(row, layer.materials)"
                  :data-testid="`quotation-package-material-choice-${layer.key}-${index}`"
                  @tap="choosePackageMaterial(row)"
                >
                  <view class="quotation-content__material-choice-content">
                    <view class="quotation-content__material-choice-copy">
                      <text class="quotation-content__material-choice-name">{{ row.item?.name || '材料引用暂不可解析' }}</text>
                      <text class="quotation-content__material-choice-meta">{{ row.item ? catalogMetadata(row.item) : (row.unit || '单位待核验') }}</text>
                    </view>
                    <text v-if="isPackageMaterialSelected(row)" class="quotation-content__material-choice-check" aria-hidden="true">✓</text>
                  </view>
                </AppButton>
              </view>
              <text v-if="catalogBrowser.packageDetail.materials.length === 0" class="quotation-content__empty-section">套餐详情未提供材料选项</text>
            </view>

            <view class="quotation-content__detail-section" data-testid="quotation-package-measures">
              <view class="quotation-content__detail-heading-row">
                <text class="quotation-content__detail-heading">方案组成 · 机措</text>
                <text class="quotation-content__detail-section-note">结构信息 · 价格关系待核验</text>
              </view>
              <text v-if="catalogBrowser.packageDetail.measures.length === 0" class="quotation-content__empty-section">套餐详情未提供机措</text>
              <view v-for="(row, index) in catalogBrowser.packageDetail.measures" :key="row.id || row.referenceId || index" class="quotation-content__included-row">
                <text class="quotation-content__included-mark quotation-content__included-mark--measure" aria-hidden="true">机</text>
                <text class="quotation-content__detail-row">{{ row.item?.name || '机措引用暂不可解析' }}<template v-if="row.unit"> · {{ row.unit }}</template></text>
              </view>
            </view>
            <AppStatus
              v-if="packageConfigurationValidation.state !== 'succeeded'"
              class="quotation-content__package-config-status"
              :message="packageConfigurationValidation.error?.message || '请完成套餐材料层级选择。'"
              tone="warning"
              quiet
            />
          </view>
        </scroll-view>

        <view v-if="catalogBrowser.packageDetail" class="quotation-content__catalog-footer" data-testid="quotation-package-config-footer">
          <view class="quotation-content__catalog-footer-copy">
            <text class="quotation-content__catalog-footer-title">{{ selectedPackageLayerCount }}/{{ catalogBrowser.packageMaterialLayers.length }} 个材料层级已选</text>
            <text class="quotation-content__catalog-footer-note">确认后更新当前维修部位组的草稿</text>
          </view>
          <AppButton
            class="quotation-content__package-config-commit"
            :disabled="packageConfigurationValidation.state !== 'succeeded'"
            data-testid="quotation-package-configure-commit"
            @tap="commitPackageConfiguration"
          >{{ existingPackageSelection?.configuration ? '保存配置到当前组' : '加入当前维修部位组' }}</AppButton>
        </view>
      </template>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { reviewLocalQuotationForP1 } from './local-review-closure'
import emptyBoxArtwork from './empty-box-illustration.png'
import type { SkuLineageAudit } from './sku-identity-review'
import type { SameCatalogComparison } from './sku-identity-review'
import type { QuoteSkuReadiness } from './sku-readiness-view'

import Q01EntryScreen from './Q01EntryScreen.vue'
import AppButton from '@shared/ui/AppButton.vue'
import AppCascadeSelector from '@shared/ui/AppCascadeSelector.vue'
import AppIcon from '@shared/ui/AppIcon.vue'
import AppLoadingState from '@shared/ui/AppLoadingState.vue'
import AppStatus from '@shared/ui/AppStatus.vue'
import { useActionWorkspaceStore } from '../action-workspace'
import { useQuotationCompositionStore } from './composition-store'
import { formatQuotationMoney, quotationAmountPresentation } from './amount-presentation'
import { catalogUnitPricePresentation } from './catalog-price-presentation'
import { evaluateLocalQuotationPreflight } from './local-preflight'
import { quotationReviewReadinessCopy } from './review-readiness-copy'
import { isFirstQuotationRepairPartStep, isInitialQuotationWorkbenchEmpty } from './empty-workbench-state'
import {
  quotationCatalogSearchMatches,
  quotationCatalogSearchPlaceholder as placeholderForCatalogKind,
  quotationCatalogSearchScopeKey,
} from './catalog-search'
import { isDirectQuotationCatalogKind } from './model'
import { quotationCatalogKindLabels } from './catalog'
import { useQuotationCatalogBrowserStore } from './catalog-browser-store'
import type { QuotationLineKind } from './model'
import { quotationSubmissionDisplayCopy } from './submission-display-copy'
import { validateQuotationDraft, type QuotationValidationField } from './validation'
import type { CodeOptionRead, QuotationCatalogItemRead, QuotationPackageMaterialRead } from '@shared/ports'
import {
  quotationPackageLayerKey,
  quotationPackageMaterialChoiceFor,
  quotationPackageMaterialChoiceToken,
  quotationPackageMaterialMatchesChoice,
  type QuotationPackageMaterialChoice,
} from './package-configuration'

const props = defineProps<{
  readonly state: 'loading' | 'ready' | 'blocked' | 'failed_retryable' | 'failed_terminal'
  readonly syntheticFieldsReview?: boolean
  readonly productReviewOnly?: boolean
  readonly aStageMockOrder?: boolean
  readonly skuLineageAudit?: SkuLineageAudit | null
  readonly sameCatalogLineage?: SameCatalogComparison | null
  readonly syntheticSkuReadiness?: QuoteSkuReadiness | null
  readonly syntheticReviewValidateSelection?: () => boolean
  readonly syntheticReviewFocusFirstError?: () => void
}>()

const emit = defineEmits<{
  (event: 'retry'): void
  (event: 'back'): void
  (event: 'return-to-group', groupId: string): void
  (event: 'first-step-presentation', state: { active: boolean; canEdit: boolean }): void
}>()

const composition = useQuotationCompositionStore()
const catalogBrowser = useQuotationCatalogBrowserStore()
const skuQuantityText = ref('1')
const skuLocalSaveError = ref('')
const skuLocalRemoveErrors = ref<Readonly<Record<string, string>>>({})
const skuLocalSaving = ref(false)
const materialSkuPreviewStatusMessage = computed(() => {
  const preview = catalogBrowser.materialSkuPreview
  return preview && preview.state !== 'ready' ? preview.message : '当前材料没有可用规格'
})
const workspace = useActionWorkspaceStore()
const submissionStatusMessage = computed(() => quotationSubmissionDisplayCopy({
  state: workspace.quotationOrderState.state,
  message: workspace.quotationOrderState.message,
  aStageMockOrder: import.meta.env.DEV && props.aStageMockOrder === true,
}))
const syntheticReviewEnabled = computed(() => import.meta.env.DEV
  && props.syntheticFieldsReview === true
  && Boolean(props.syntheticReviewValidateSelection)
  && Boolean(props.syntheticReviewFocusFirstError))
const verifiedPricing = computed(() => {
  const result = workspace.quotationEngine.result
  return result && result.draftVersion === composition.draft?.draftVersion ? result.pricing : undefined
})
// An R1 rounding caveat is only relevant when fillOrder and top-level totals actually differ.
const hasMeaningfulRoundingDifference = computed(() => {
  const pricing = verifiedPricing.value
  return Boolean(pricing && Math.abs(pricing.fillOrder.orderListTotalAmount - pricing.calcTotalPrice.totalPrice) >= 0.005)
})
const isInitialEmptyWorkbench = computed(() => isInitialQuotationWorkbenchEmpty({
  contentState: props.state,
  editState: workspace.quotationEditState.state,
  draftState: composition.localState,
  groupCount: composition.groups.length,
  catalogOpen: catalogBrowser.isOpen,
}))
const firstRepairPartGroup = computed(() => composition.groups.length === 1 ? composition.groups[0] : undefined)
// A successful local-save confirmation is represented once in the header badge.
const isCommercialBaseline = computed(() => !catalogBrowser.isOpen
  && !isInitialEmptyWorkbench.value && !isFirstRepairPartStep.value
  && composition.groups.length > 0)
const isFirstRepairPartStep = computed(() => isFirstQuotationRepairPartStep({
  contentState: props.state,
  editState: workspace.quotationEditState.state,
  draftState: composition.localState,
  groupCount: composition.groups.length,
  selectionCount: composition.selectionCount,
  catalogOpen: catalogBrowser.isOpen,
}))
const hasSharedDraftStatus = computed(() =>
  ['saving', 'saved_local', 'restore_available', 'save_failed'].includes(workspace.draftStatus),
)
const amountPresentation = computed(() => quotationAmountPresentation({
  result: workspace.quotationEngine.result,
  draftVersion: composition.draft?.draftVersion,
  isLoading: workspace.quotationEngine.state === 'loading',
}))
const groupSubtotal = (groupId: string): number | undefined =>
  verifiedPricing.value?.fillOrder.groups.find((group) => group.groupId === groupId)?.subtotal
const lineSubtotalFor = (groupId: string, selectionId: string): number | undefined =>
  verifiedPricing.value?.fillOrder.groups.find((group) => group.groupId === groupId)
    ?.selectionAmounts.find((line) => line.selectionId === selectionId)?.fillOrderTotalAmount
const catalogUnitPriceFor = (groupId: string, selectionId: string): number | undefined =>
  verifiedPricing.value?.fillOrder.groups.find((group) => group.groupId === groupId)
    ?.selectionAmounts.find((line) => line.selectionId === selectionId)?.catalogUnitPrice

// DEV product preview has NO source-verified effective tenant/work-order ExtFields.
// Expose only a truthful local draft message; never use it to enable submission.
const p1ReviewExpanded = ref(false)
const localP1Review = computed(() => import.meta.env.DEV && props.productReviewOnly && composition.draft
  ? reviewLocalQuotationForP1(composition.draft) : null)

const productReviewReadiness = computed(() => {
  if (!import.meta.env.DEV || props.productReviewOnly !== true || !composition.draft) return null
  return quotationReviewReadinessCopy(evaluateLocalQuotationPreflight({
    draft: composition.draft,
    schemaEvidence: 'unverified',
    engineResult: workspace.quotationEngine.result,
  }))
})

let engineRefreshTimer: ReturnType<typeof setTimeout> | undefined
watch(
  () => [
    composition.draft?.draftVersion,
    workspace.descriptor?.workflowNodeId,
    workspace.detail?.quotationCatalogContext?.serviceType,
    workspace.detail?.quotationCatalogContext?.sourceType,
  ],
  () => {
    if (engineRefreshTimer) clearTimeout(engineRefreshTimer)
    workspace.quotationEngine.clear()
    engineRefreshTimer = setTimeout(() => {
      engineRefreshTimer = undefined
      void workspace.refreshQuotationEngine()
    }, 500)
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  if (engineRefreshTimer) clearTimeout(engineRefreshTimer)
})
const catalogKinds: readonly QuotationLineKind[] = ['package', 'procedure', 'material', 'measure']
const canEdit = computed(() => ['fresh', 'restored', 'dirty', 'saving', 'saved_local', 'save_failed'].includes(composition.localState))
watch([isFirstRepairPartStep, canEdit], ([active, permitted]) => {
  emit('first-step-presentation', { active, canEdit: permitted })
}, { immediate: true })
const activeCatalogGroupId = ref<string | null>(null)
const catalogSelectionError = ref('')
const firstStepValidationRequestedFor = ref<string | null>(null)
const packageMaterialChoicesByLayer = ref<Readonly<Record<string, QuotationPackageMaterialChoice>>>({})
const pendingPackageChoicesByTarget = ref<Readonly<Record<string, Readonly<Record<string, QuotationPackageMaterialChoice>>>>>({})
const groupContextExpandedById = ref<Readonly<Record<string, boolean>>>({})
const groupDetailsCollapsedById = ref<Readonly<Record<string, boolean>>>({})
const packageDetailsExpandedBySelectionId = ref<Readonly<Record<string, boolean>>>({})
const catalogSearchByScope = ref<Readonly<Record<string, string>>>({})
const catalogSearchScope = computed(() => quotationCatalogSearchScopeKey(
  activeCatalogGroupId.value ?? '',
  catalogBrowser.selectedKind,
))
const catalogSearchText = computed({
  get: () => catalogSearchByScope.value[catalogSearchScope.value] ?? '',
  set: (value: string) => {
    catalogSearchByScope.value = { ...catalogSearchByScope.value, [catalogSearchScope.value]: value }
  },
})
const activeCatalogGroup = computed(() => composition.groups.find((group) => group.groupId === activeCatalogGroupId.value))
const activeCatalogGroupNumber = computed(() => {
  const index = composition.groups.findIndex((group) => group.groupId === activeCatalogGroupId.value)
  return index < 0 ? 1 : index + 1
})
const activeCatalogGroupPathLabel = computed(() => {
  const group = activeCatalogGroup.value
  return group ? repairPartPathLabel(group.repairParts) : ''
})
const activeCatalogGroupLabel = computed(() => {
  const group = activeCatalogGroup.value
  if (!group) return '未指定维修部位'
  // The technician's concrete task disambiguates repairs that share a broad part path.
  // Preserve the R1 repair-part path as separate secondary context, not as a replacement.
  return group.partDescription.trim() || activeCatalogGroupPathLabel.value || '维修部位待选择'
})
const selectedMaterialAlreadyInGroup = computed(() => activeCatalogGroup.value?.materials.some(
  material => material.catalogId === catalogBrowser.selectedMaterialId,
) ?? false)
const matchedMaterialSkuChoice = computed(() => {
  const match = catalogBrowser.materialSkuMatch
  if (match.state !== 'matched') return undefined
  return activeCatalogGroup.value?.materials
    .find(material => material.catalogId === catalogBrowser.selectedMaterialId)
    ?.skuChoices?.find(sku => sku.skuId === match.skuId)
})
watch(() => [catalogBrowser.selectedMaterialId, catalogBrowser.materialSkuMatch.state,
  catalogBrowser.materialSkuMatch.state === 'matched' ? catalogBrowser.materialSkuMatch.skuId : '',
  activeCatalogGroupId.value] as const, () => {
  skuLocalSaveError.value = ''
  skuQuantityText.value = matchedMaterialSkuChoice.value ? String(matchedMaterialSkuChoice.value.quantity) : '1'
})
const catalogSearchPlaceholder = computed(() => placeholderForCatalogKind(catalogBrowser.selectedKind))
const catalogSectionTitle = computed(() => ({
  package: '套餐方案',
  procedure: '工序项目',
  material: '材料目录',
  measure: '机措项目',
}[catalogBrowser.selectedKind]))
const activeCatalogGroupTitle = computed(() => {
  if (!activeCatalogGroup.value) return '未指定分组'
  const index = composition.groups.findIndex((group) => group.groupId === activeCatalogGroup.value?.groupId)
  const groupLabel = activeCatalogGroup.value.partDescription.trim() || repairPartPathLabel(activeCatalogGroup.value.repairParts)
  return groupLabel ? `维修部位组 ${index + 1} · ${groupLabel}` : `维修部位组 ${index + 1}`
})
const currentPackageId = computed(() => catalogBrowser.selectedPackageId)
const existingPackageSelection = computed(() => activeCatalogGroup.value?.projPackages.find(
  (selection) => selection.catalogId === currentPackageId.value,
))
const packageMaterialChoices = computed(() => Object.values(packageMaterialChoicesByLayer.value))
const selectedPackageLayerCount = computed(() => catalogBrowser.packageMaterialLayers.filter(
  (layer) => Boolean(packageMaterialChoicesByLayer.value[layer.key]),
).length)
const filteredCatalogItems = computed(() => {
  const query = catalogSearchText.value
  if (!query) return catalogBrowser.visibleCatalogItems
  return catalogBrowser.visibleCatalogItems.filter((item) => quotationCatalogSearchMatches(item, query))
})
// R1 repair-part facets appear ONLY when the current package records expose
// compatible authoritative classification codes. Never assign a category
// by product name or hide unclassified packages on the default "全部".
const selectedCatalogFacet = ref('')
function descendantCodes(node: CodeOptionRead): readonly string[] {
  return [node.value, ...(node.children ?? []).flatMap(descendantCodes)]
}
// Only real source-classified package facets can be shown as navigation.
// Disabled taxonomy rails with no matching products waste the field operator's screen.
function catalogFacetAvailable(code: string): boolean {
  return catalogFacets.value.some(facet => facet.value === code)
}
const catalogFacets = computed(() => {
  if (catalogBrowser.selectedKind !== 'package') return []
  const packages = filteredCatalogItems.value.filter(
    (item): item is Extract<QuotationCatalogItemRead, { kind: 'package' }> =>
      item.kind === 'package' && Boolean(item.r1RepairPartsCodes?.length),
  )
  if (!packages.length) return []
  return composition.repairPartOptions.filter(facet => {
    const codes = new Set(descendantCodes(facet))
    return packages.some(item => item.r1RepairPartsCodes?.some(code => codes.has(code)))
  })
})
const catalogNavigationFacets = computed(() => catalogFacets.value)
const displayedCatalogItems = computed(() => {
  const facet = catalogFacets.value.find(option => option.value === selectedCatalogFacet.value)
  if (!facet) return filteredCatalogItems.value
  const codes = new Set(descendantCodes(facet))
  return filteredCatalogItems.value.filter(item => item.kind !== 'package'
    || item.r1RepairPartsCodes?.some(code => codes.has(code)))
})
const packageConfigurationValidation = computed(() => {
  const packageId = currentPackageId.value
  if (!packageId || catalogBrowser.packageDetailState !== 'succeeded') {
    return { state: 'failed_terminal' as const }
  }
  return workspace.validateQuotationPackageConfiguration(
    activeCatalogGroupId.value ?? '',
    packageId,
    packageMaterialChoices.value,
  )
})
const kindLabels = quotationCatalogKindLabels

function openCatalog(groupId: string, kind: QuotationLineKind): void {
  selectedCatalogFacet.value = ''
  activeCatalogGroupId.value = groupId
  catalogSelectionError.value = ''
  packageMaterialChoicesByLayer.value = {}
  catalogBrowser.open(kind)
}

function firstStepFieldError(field: QuotationValidationField): string {
  const group = firstRepairPartGroup.value
  const draft = composition.draft
  if (!group || !draft || firstStepValidationRequestedFor.value !== group.groupId) return ''
  return validateQuotationDraft(draft).issues.find((issue) => issue.groupId === group.groupId && issue.field === field)?.message ?? ''
}

function advanceFirstRepairPartStep(): Promise<void> {
  const group = firstRepairPartGroup.value
  return group ? selectProductsForFirstGroup(group.groupId) : Promise.resolve()
}
defineExpose({ advanceFirstRepairPartStep })

async function selectProductsForFirstGroup(groupId: string): Promise<void> {
  const group = firstRepairPartGroup.value
  const draft = composition.draft
  if (!canEdit.value || !group || group.groupId !== groupId || !draft || composition.repairPartOptions.length === 0) return

  firstStepValidationRequestedFor.value = groupId
  const contextIssues = validateQuotationDraft(draft).issues.filter((issue) =>
    issue.groupId === groupId
      && (issue.field === 'repairParts' || issue.field === 'partDescription' || issue.field === 'maintainAreaNum'),
  )
  if (contextIssues.length > 0) return

  if (syntheticReviewEnabled.value && !props.syntheticReviewValidateSelection?.()) {
    await nextTick()
    props.syntheticReviewFocusFirstError?.()
    return
  }

  openCatalog(groupId, 'package')
}

function closeCatalog(): void {
  const returnGroupId = activeCatalogGroupId.value
  catalogBrowser.close()
  if (returnGroupId) emit('return-to-group', returnGroupId)
  activeCatalogGroupId.value = null
  catalogSelectionError.value = ''
  packageMaterialChoicesByLayer.value = {}
}


function selectCatalogKind(kind: QuotationLineKind): void {
  selectedCatalogFacet.value = ''
  catalogSelectionError.value = ''
  catalogBrowser.selectKind(kind)
}

function catalogTabLabel(kind: QuotationLineKind): string {
  return { package: '套餐', procedure: '工序', material: '材料', measure: '机措' }[kind]
}

function canSelectCatalogItem(item: QuotationCatalogItemRead): boolean {
  return isDirectQuotationCatalogKind(item.kind)
    && canEdit.value
    && Boolean(activeCatalogGroup.value?.repairParts.length)
}

function addCatalogSelection(kind: QuotationLineKind, catalogId: string): void {
  const groupId = activeCatalogGroupId.value
  if (!groupId) {
    catalogSelectionError.value = '尚未指定维修部位组，目录项未加入。'
    return
  }
  const result = workspace.addQuotationCatalogSelection(groupId, kind, catalogId)
  if (result.state === 'succeeded') {
    closeCatalog()
    return
  }
  catalogSelectionError.value = result.error?.category === 'unsupported_capability'
    ? '当前报价草稿不可编辑，目录项未加入。'
    : '目录项或维修部位组已变化，请重新打开目录后再试。'
}

function packageSelectionFor(packageId: string) {
  return activeCatalogGroup.value?.projPackages.find((selection) => selection.catalogId === packageId)
}

function catalogSelectionFor(item: QuotationCatalogItemRead) {
  const groupId = activeCatalogGroupId.value
  if (!groupId) return undefined
  return composition.selectionsFor(groupId, item.kind).find((selection) => selection.catalogId === item.id)
}

function packageTargetKey(groupId: string, packageId: string): string {
  return `${groupId}\u0000${packageId}`
}

async function openExistingPackageConfiguration(groupId: string, packageId: string): Promise<void> {
  activeCatalogGroupId.value = groupId
  catalogSelectionError.value = ''
  packageMaterialChoicesByLayer.value = {}
  catalogBrowser.open('package')
  await openPackageConfiguration(packageId)
}

async function openPackageConfiguration(packageId: string): Promise<void> {
  packageMaterialChoicesByLayer.value = {}
  catalogSelectionError.value = ''
  await catalogBrowser.openPackageDetail(packageId)
  if (catalogBrowser.packageDetailState !== 'succeeded' || !activeCatalogGroup.value) return
  const targetKey = packageTargetKey(activeCatalogGroup.value.groupId, packageId)
  const pendingChoices = pendingPackageChoicesByTarget.value[targetKey]
  if (pendingChoices) {
    packageMaterialChoicesByLayer.value = { ...pendingChoices }
    return
  }
  const existing = activeCatalogGroup.value.projPackages.find((selection) => selection.catalogId === packageId)
  const choices: Record<string, QuotationPackageMaterialChoice> = {}
  for (const material of existing?.configuration?.materials ?? []) {
    const choice: QuotationPackageMaterialChoice = {
      layer: material.layer,
      ...(material.providerComponentId ? { componentId: material.providerComponentId } : {}),
      ...(material.providerReferenceId ? { referenceId: material.providerReferenceId } : {}),
    }
    choices[quotationPackageLayerKey(material.layer)] = choice
  }
  packageMaterialChoicesByLayer.value = choices
}

function backFromPackageConfiguration(): void {
  catalogBrowser.backToList()
  catalogSelectionError.value = ''
}

function canChoosePackageMaterial(row: QuotationPackageMaterialRead, layerRows: readonly QuotationPackageMaterialRead[]): boolean {
  const choice = quotationPackageMaterialChoiceFor(row)
  const detailRows = catalogBrowser.packageDetail?.materials ?? []
  return canEdit.value
    && Boolean(row.item && row.item.kind === 'material' && row.item.id.trim() && row.item.name.trim())
    && choice !== null
    && layerRows.filter((candidate) => quotationPackageMaterialMatchesChoice(candidate, choice)).length === 1
    && detailRows.filter((candidate) => quotationPackageMaterialMatchesChoice(candidate, choice)).length === 1
}

function isPackageMaterialSelected(row: QuotationPackageMaterialRead): boolean {
  const choice = quotationPackageMaterialChoiceFor(row)
  if (!choice) return false
  return quotationPackageMaterialChoiceToken(packageMaterialChoicesByLayer.value[quotationPackageLayerKey(choice.layer)] ?? {
    layer: choice.layer,
  }) === quotationPackageMaterialChoiceToken(choice)
}

function selectedMaterialForLayer(layerKey: string): boolean {
  return Boolean(packageMaterialChoicesByLayer.value[layerKey])
}

function choosePackageMaterial(row: QuotationPackageMaterialRead): void {
  const choice = quotationPackageMaterialChoiceFor(row)
  if (!choice || !canChoosePackageMaterial(row, [row])) return
  const nextChoices = {
    ...packageMaterialChoicesByLayer.value,
    [quotationPackageLayerKey(choice.layer)]: choice,
  }
  packageMaterialChoicesByLayer.value = nextChoices
  const groupId = activeCatalogGroupId.value
  const packageId = currentPackageId.value
  if (groupId && packageId) {
    const targetKey = packageTargetKey(groupId, packageId)
    pendingPackageChoicesByTarget.value = {
      ...pendingPackageChoicesByTarget.value,
      [targetKey]: nextChoices,
    }
  }
}

function commitPackageConfiguration(): void {
  const packageId = currentPackageId.value
  const groupId = activeCatalogGroupId.value
  if (!packageId || !groupId) return
  const result = workspace.configureQuotationPackageSelection(groupId, packageId, packageMaterialChoices.value)
  if (result.state === 'succeeded') {
    const targetKey = packageTargetKey(groupId, packageId)
    const nextPending = { ...pendingPackageChoicesByTarget.value }
    delete nextPending[targetKey]
    pendingPackageChoicesByTarget.value = nextPending
    closeCatalog()
    return
  }
  catalogSelectionError.value = result.error?.message || '套餐配置未完成，未写入草稿。'
}

async function openExistingMaterialSkuPreview(groupId: string, materialId: string): Promise<void> {
  activeCatalogGroupId.value = groupId
  skuLocalSaveError.value = ''
  catalogBrowser.open('material')
  await catalogBrowser.loadList('material')
  await catalogBrowser.openMaterialSkuPreview(materialId)
}

function removeLocalSkuFromRepairGroup(
  groupId: string, selectionId: string, materialId: string, skuId: string,
): void {
  const result = composition.removeLocalMaterialSkuChoice(groupId, materialId, skuId)
  const nextErrors = { ...skuLocalRemoveErrors.value }
  if (result.state === 'succeeded') delete nextErrors[selectionId]
  else nextErrors[selectionId] = result.error?.message ?? 'SKU 规格未移除，请重试。'
  skuLocalRemoveErrors.value = nextErrors
}

function onSkuQuantityInput(event: unknown): void {
  const detail = event && typeof event === 'object'
    ? (event as { detail?: { value?: unknown } }).detail : undefined
  const raw = detail?.value
  skuQuantityText.value = typeof raw === 'string' || typeof raw === 'number' ? String(raw) : ''
  skuLocalSaveError.value = ''
}

async function saveMatchedSkuToLocalDraft(): Promise<void> {
  const match = catalogBrowser.materialSkuMatch
  const groupId = activeCatalogGroupId.value
  const materialId = catalogBrowser.selectedMaterialId
  if (!canEdit.value || skuLocalSaving.value || match.state !== 'matched'
    || !groupId || !materialId || !selectedMaterialAlreadyInGroup.value
    || catalogBrowser.materialSkuPreview?.state !== 'ready') {
    skuLocalSaveError.value = '当前材料、维修部位或规格匹配已变化，未保存。'
    return
  }
  const quantity = Number(skuQuantityText.value)
  if (!/^\d+$/.test(skuQuantityText.value.trim())
    || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 9999) {
    skuLocalSaveError.value = 'SKU 数量必须为 1–9999 的整数。'
    return
  }
  const selectedAttrs = { ...catalogBrowser.materialSkuSelections }
  const updated = composition.saveLocalMaterialSkuChoice(groupId, materialId, {
    skuId: match.skuId, quantity, attributes: selectedAttrs,
  })
  if (updated.state !== 'succeeded') {
    skuLocalSaveError.value = updated.error?.message ?? 'SKU 本机选择未保存。'
    return
  }
  skuLocalSaving.value = true
  const result = await composition.flushDraft()
  skuLocalSaving.value = false
  if (result.state !== 'succeeded') {
    skuLocalSaveError.value = result.error?.message ?? '草稿保存失败，请重试。'
    return
  }
  catalogBrowser.backToList()
}

function eventValue(event: unknown): string {
  const detail = typeof event === 'object' && event !== null
    ? (event as { detail?: { value?: unknown } }).detail
    : undefined
  return typeof detail?.value === 'string' ? detail.value : ''
}

function onRepairPartChange(groupId: string, repairParts: readonly string[]): void {
  composition.updateGroupContext(groupId, { repairParts })
}

function onGroupDescriptionInput(groupId: string, event: unknown): void {
  composition.updateGroupContext(groupId, { partDescription: eventValue(event) })
}

function onGroupQuantityInput(groupId: string, event: unknown): void {
  composition.updateGroupContext(groupId, { maintainAreaNum: eventValue(event) })
}

function onQuantityInput(groupId: string, selectionId: string, event: unknown): void {
  composition.setQuantityText(groupId, selectionId, eventValue(event))
}

function onCatalogSearchInput(event: unknown): void {
  catalogSearchText.value = eventValue(event)
}

function confirmCatalogSearch(): void {
  catalogSearchText.value = catalogSearchText.value.trim()
}

function createRepairGroup(): void {
  const result = composition.createGroup()
  if (result.state === 'succeeded' && result.data) {
    groupContextExpandedById.value = { ...groupContextExpandedById.value, [result.data]: true }
  }
}

function isGroupContextExpanded(group: (typeof composition.groups)[number]): boolean {
  const explicit = groupContextExpandedById.value[group.groupId]
  if (explicit !== undefined) return explicit
  return group.repairParts.length === 0 || !group.partDescription.trim() || !group.maintainAreaNum.trim()
}

function toggleGroupContext(group: (typeof composition.groups)[number]): void {
  groupContextExpandedById.value = {
    ...groupContextExpandedById.value,
    [group.groupId]: !isGroupContextExpanded(group),
  }
}

function groupSelectionCount(groupId: string): number {
  return catalogKinds.reduce((total, kind) => total + composition.selectionsFor(groupId, kind).length, 0)
}

function repairPartPathLabel(path: readonly string[]): string {
  let options = composition.repairPartOptions
  const labels: string[] = []
  for (const value of path) {
    const option = findCodeOption(options, value)
    if (!option) return labels.length ? `${labels.join(' / ')} / 部位已更新` : '部位已更新'
    labels.push(option.label)
    options = option.children ?? []
  }
  return labels.join(' / ')
}

function findCodeOption(options: readonly CodeOptionRead[], value: string): CodeOptionRead | undefined {
  for (const option of options) {
    if (option.value === value) return option
    const nested = findCodeOption(option.children ?? [], value)
    if (nested) return nested
  }
  return undefined
}

function catalogKindMark(kind: QuotationLineKind): string {
  return { package: '套', procedure: '工', material: '材', measure: '机' }[kind]
}

function catalogDetails(item: QuotationCatalogItemRead): string[] {
  const details: string[] = []
  if (item.specification) details.push(`规格 ${item.specification}`)
  if (item.unit) details.push(`单位 ${item.unit}`)
  if ((item.kind === 'package' || item.kind === 'material') && item.code) details.push(`编码 ${item.code}`)
  return details
}

function catalogMetadata(item: QuotationCatalogItemRead): string {
  const parts = catalogDetails(item)
  return parts.length ? parts.join(' · ') : kindLabels[item.kind]
}
// Product cards prioritize attributes useful for selection. Keep the provider
// code available in actual product detail and search, rather than displaying
// implementation identifiers as primary commerce badges.
function catalogCardDetails(item: QuotationCatalogItemRead): string[] {
  return catalogDetails(item).filter(detail => !detail.startsWith('编码 '))
}

function areGroupDetailsCollapsed(groupId: string): boolean {
  const explicit = groupDetailsCollapsedById.value[groupId]
  if (explicit !== undefined) return explicit
  // Product UX review only: summarize long groups so the original "添加项目"
  // action remains reachable without traversing a long list on small phones.
  // Never change the default expanded state on live business routes.
  return props.productReviewOnly === true && groupSelectionCount(groupId) >= 3
}

function toggleGroupDetails(groupId: string): void {
  groupDetailsCollapsedById.value = {
    ...groupDetailsCollapsedById.value,
    [groupId]: !areGroupDetailsCollapsed(groupId),
  }
}

function isPackageDetailsExpanded(selectionId: string): boolean {
  return packageDetailsExpandedBySelectionId.value[selectionId] ?? false
}

function togglePackageDetails(selectionId: string): void {
  packageDetailsExpandedBySelectionId.value = {
    ...packageDetailsExpandedBySelectionId.value,
    [selectionId]: !isPackageDetailsExpanded(selectionId),
  }
}

function groupSelectionSummary(groupId: string): string {
  const selections = catalogKinds.flatMap((kind) => composition.selectionsFor(groupId, kind))
  const labels = selections.slice(0, 2).map((selection) =>
    `${selection.label} × ${selection.quantity}${selection.unit ? ` ${selection.unit}` : ''}`)
  if (selections.length > labels.length) labels.push(`另有 ${selections.length - labels.length} 项`)
  return labels.join(' · ')
}

function configuredPackageLayerLabel(
  materials: readonly { readonly layer: string | number }[],
  index: number,
): string {
  const material = materials[index]
  if (!material) return `材料层级 ${index + 1}`
  const key = quotationPackageLayerKey(material.layer)
  const ordinal = [...new Set(materials.map((candidate) => quotationPackageLayerKey(candidate.layer)))].indexOf(key) + 1
  return `材料层级 ${ordinal}`
}
</script>

<style src="./QuotationShared.css"></style>
<style src="./QuotationGroups.css"></style>
<style src="./QuotationEditor.css"></style>
<style src="./QuotationCatalog.css"></style>
<style src="./QuotationPackageConfiguration.css"></style>
<style src="./QuotationActionContent.styles.css"></style>
<style src="./Q01CommercialBaseline.css"></style>
<style src="./Q03CommercialBaseline.css"></style>
