<template>
  <view class="quotation-content" data-testid="quotation-action-content">
    <view v-if="!catalogBrowser.isOpen && !isInitialEmptyWorkbench" class="quotation-content__heading" data-testid="quotation-workbench-heading">
      <text class="quotation-content__eyebrow">报价草稿 · 按部位组织</text>
      <text class="quotation-content__title">报价工作台</text>
      <text class="quotation-content__description">选择维修部位，逐组整理项目；当前内容仅保存在本机。</text>
    </view>

    <view v-if="props.state === 'loading'" class="quotation-content__panel app-surface" data-testid="quotation-state-loading">
      <AppLoadingState variant="inline" label="正在准备报价内容" />
    </view>

    <view v-else-if="props.state === 'ready'" v-show="!catalogBrowser.isOpen" class="quotation-content__panel quotation-content__workbench app-surface" data-testid="quotation-state-ready">
      <view v-if="!isInitialEmptyWorkbench" class="quotation-content__workbench-summary" data-testid="quotation-workbench-summary">
        <view class="quotation-content__workbench-summary-copy">
          <text class="quotation-content__panel-title">项目概览</text>
          <text class="quotation-content__line-count">{{ composition.selectionCount }} 项 · {{ composition.groups.length }} 个维修部位</text>
        </view>
        <view class="quotation-content__amount-summary">
          <text class="quotation-content__amount-label">{{ amountPresentation.label }}</text>
          <text class="quotation-content__amount-value" data-testid="quotation-workbench-amount">
            {{ amountPresentation.value }}
          </text>
        </view>
        <text class="quotation-content__local-tag">本机草稿</text>
      </view>

      <AppStatus
        v-if="composition.localStateMessage"
        class="quotation-content__local-status"
        :message="composition.localStateMessage"
        :tone="composition.localState === 'save_failed' || composition.localState === 'invalid' || composition.localState === 'unavailable' ? 'warning' : 'neutral'"
        quiet
      />
      <AppStatus
        v-else-if="composition.localState === 'saving'"
        class="quotation-content__local-status"
        message="正在保存本地草稿…"
        quiet
      />
      <AppStatus
        v-else-if="composition.localState === 'saved_local'"
        class="quotation-content__local-status"
        message="报价草稿已保存在本机。"
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

      <view v-if="composition.groups.length > 0" class="quotation-content__engine" data-testid="quotation-engine-readiness">
        <AppLoadingState
          v-if="workspace.quotationEngine.state === 'loading'"
          variant="inline"
          label="正在核对目录、报价规则与本地金额"
        />
        <template v-else-if="workspace.quotationEngine.result">
          <view v-if="workspace.quotationEngine.result.pricing" class="quotation-content__engine-total" data-testid="quotation-local-gross-total">
            <text class="quotation-content__engine-label">本机金额预览 · 未提交</text>
            <text class="quotation-content__engine-amount">¥{{ workspace.quotationEngine.result.pricing.calcTotalPrice.totalPrice.toFixed(2) }}</text>
          </view>
          <text v-if="workspace.quotationEngine.result.pricing" class="quotation-content__engine-note" data-testid="quotation-rounding-note">分组明细与整体金额按各自规则计算，舍入后可能存在小额差异。</text>
          <AppStatus
            v-if="workspace.quotationEngine.result.state === 'ready'"
            message="本机报价校验已通过，订单结构仅作本地预览，尚未提交服务器。"
            tone="success"
            quiet
            data-testid="quotation-engine-ready"
          />
          <view v-else class="quotation-content__engine-blocked" data-testid="quotation-engine-blocked">
            <AppStatus
              :message="workspace.quotationEngine.result.pricing
                ? '金额可预览，但当前合同不足以安全生成完整载荷。'
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
          <text class="quotation-content__engine-note" data-testid="quotation-engine-local-only">以上为本机核验预览；只有单独确认“提交订单/报价方案”后才会创建服务器订单，不会完成当前工单工作流。</text>
        </template>
        <text v-else class="quotation-content__engine-note" data-testid="quotation-engine-local-only">目录与报价依据核验完成前不显示估算金额。</text>
      </view>

      <view v-if="!isInitialEmptyWorkbench" class="quotation-content__submission" data-testid="quotation-order-submit-boundary">
        <AppStatus
          v-if="workspace.quotationOrderState.message"
          :message="workspace.quotationOrderState.message"
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

      <view v-if="composition.localState === 'legacy_requires_action'" class="quotation-content__blocked" data-testid="quotation-draft-legacy">
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
          <view class="quotation-content__initial-empty-heading">
            <text class="quotation-content__initial-empty-title">维修部位报价</text>
            <text class="quotation-content__initial-empty-description">请先添加维修部位，再为对应分组选择套餐、工序、材料或机措。</text>
          </view>
          <view class="quotation-content__initial-empty-surface">
            <view class="quotation-content__initial-empty-mark" aria-hidden="true">
              <AppIcon name="order" :size="32" color="var(--app-color-primary)" />
            </view>
            <text class="quotation-content__empty-title">暂无维修部位</text>
            <text class="quotation-content__initial-empty-copy">从添加维修部位开始整理报价，项目会归入对应的部位分组。</text>
            <AppButton
              class="quotation-content__initial-empty-action"
              data-testid="quotation-add-group"
              :disabled="!canEdit"
              @tap="createRepairGroup()"
            >＋ 添加维修部位</AppButton>
            <text class="quotation-content__initial-empty-note">当前为本机报价草稿；成功提交后将创建正式订单。</text>
          </view>
        </view>
        <view v-else-if="composition.groups.length === 0" class="quotation-content__empty" data-testid="quotation-draft-empty">
          <view class="quotation-content__empty-mark" aria-hidden="true">＋</view>
          <text class="quotation-content__empty-title">还没有维修部位组</text>
          <text class="quotation-content__copy">先建立部位上下文，再在每个分组中整理套餐、工序、材料或机措。当前内容仅保存在本机。</text>
          <AppButton
            class="quotation-content__add-group-button"
            data-testid="quotation-add-group"
            block
            :disabled="!canEdit"
            @tap="createRepairGroup()"
          >添加维修部位组</AppButton>
        </view>

        <view v-else class="quotation-content__groups" data-testid="quotation-draft-groups">
          <view
            v-for="(group, groupIndex) in composition.groups"
            :key="group.groupId"
            class="quotation-content__group app-surface app-surface--compact"
            :id="`quotation-repair-group-${group.groupId}`"
            :data-testid="`quotation-repair-group-${group.groupId}`"
          >
            <view class="quotation-content__group-heading">
              <view class="quotation-content__group-index" aria-hidden="true">{{ String(groupIndex + 1).padStart(2, '0') }}</view>
              <view class="quotation-content__group-title-copy">
                <text class="quotation-content__group-eyebrow">维修部位组</text>
                <text class="quotation-content__group-title">{{ group.partDescription || repairPartPathLabel(group.repairParts) || '待选择维修部位' }}</text>
                <text class="quotation-content__group-location">{{ repairPartPathLabel(group.repairParts) || '尚未选择部位路径' }}<template v-if="group.maintainAreaNum"> · 工程量 {{ group.maintainAreaNum }}</template></text>
                <text v-if="groupSubtotal(group.groupId) !== undefined" class="quotation-content__group-subtotal" :data-testid="`quotation-group-subtotal-${group.groupId}`">已核验组金额 ¥{{ groupSubtotal(group.groupId)?.toFixed(2) }}</text>
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
                  <text class="quotation-content__composition-meta">{{ groupSelectionCount(group.groupId) }} 项 · 仅保存在本机</text>
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
                      </view>
                      <text class="quotation-content__selection-unit">{{ selection.unit || '单位待核验' }}</text>
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
                      <text v-else class="quotation-content__package-summary-row">套餐尚未完成配置；现有本机记录已保留。</text>
                    </view>
                    <view class="quotation-content__line-controls">
                      <text class="quotation-content__quantity-label">数量</text>
                      <view class="quotation-content__quantity-wrap" :class="{ 'quotation-content__quantity-wrap--error': composition.quantityErrorBySelection[selection.selectionId] }">
                        <input
                          class="quotation-content__quantity"
                          type="digit"
                          :value="composition.quantityTextBySelection[selection.selectionId] ?? String(selection.quantity)"
                          :disabled="!canEdit"
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
      <template v-if="!catalogBrowser.selectedPackageId">
        <view class="quotation-content__catalog-topbar">
          <AppButton class="quotation-content__catalog-back" variant="text" aria-label="返回报价工作台" data-testid="quotation-catalog-close" @tap="closeCatalog">‹ 返回</AppButton>
          <view class="quotation-content__catalog-topbar-title">
            <text class="quotation-content__catalog-title">服务目录</text>
            <text class="quotation-content__catalog-step">报价工作台 <text aria-hidden="true">/</text> 项目目录</text>
          </view>
          <text class="quotation-content__catalog-topbar-spacer" aria-hidden="true" />
        </view>

        <view class="quotation-content__catalog-target" data-testid="quotation-catalog-target">
          <text class="quotation-content__catalog-target-label">添加到当前维修部位</text>
          <text class="quotation-content__catalog-target-title">{{ activeCatalogGroupTitle }}</text>
          <text class="quotation-content__catalog-target-meta">{{ activeCatalogGroupSummary }}</text>
        </view>

        <view class="quotation-content__catalog-toolbar">
          <view class="quotation-content__category-grid" data-testid="quotation-catalog-categories">
            <AppButton
              v-for="kind in catalogKinds"
              :key="kind"
              class="quotation-content__category"
              variant="secondary"
              :pressed="catalogBrowser.selectedKind === kind"
              :data-testid="`quotation-catalog-kind-${kind}`"
              @tap="selectCatalogKind(kind)"
            >{{ catalogTabLabel(kind) }}</AppButton>
          </view>
          <view class="quotation-content__search-wrap">
            <text class="quotation-content__search-mark" aria-hidden="true">⌕</text>
            <input
              class="quotation-content__search-input"
              type="text"
              :value="catalogSearchText"
              placeholder="搜索名称、编码或规格"
              confirm-type="search"
              data-testid="quotation-catalog-search"
              @input="onCatalogSearchInput"
            />
            <AppButton v-if="catalogSearchText" class="quotation-content__search-clear" variant="text" aria-label="清除搜索" @tap="catalogSearchText = ''">清除</AppButton>
          </view>
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

        <view class="quotation-content__catalog-browser" data-testid="quotation-catalog-browser">
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
          v-else-if="catalogBrowser.catalogStatesByKind[catalogBrowser.selectedKind] === 'succeeded' && filteredCatalogItems.length === 0"
          class="quotation-content__catalog-state quotation-content__catalog-state-card"
          data-testid="quotation-catalog-empty"
        >
          <view class="quotation-content__catalog-state-mark" aria-hidden="true">{{ catalogKindMark(catalogBrowser.selectedKind) }}</view>
          <text class="quotation-content__catalog-state-title">{{ catalogSearchText ? '没有匹配的项目' : '当前目录暂无项目' }}</text>
          <text class="quotation-content__catalog-state-copy">{{ catalogSearchText ? '试试简化关键词，或切换其他目录类别。' : '当前工单适用范围没有返回可浏览项目；可以切换类别查看。' }}</text>
          <AppButton v-if="catalogSearchText" class="quotation-content__empty-search-clear" variant="secondary" @tap="catalogSearchText = ''">清除搜索条件</AppButton>
        </view>
        <scroll-view v-else class="quotation-content__catalog-list" scroll-y data-testid="quotation-catalog-list">
            <view
              v-for="item in filteredCatalogItems"
            :key="item.id"
            class="quotation-content__catalog-item"
            :data-testid="`quotation-catalog-item-${item.kind}-${item.id}`"
          >
            <view class="quotation-content__catalog-item-main">
              <view class="quotation-content__catalog-thumbnail" :class="`quotation-content__catalog-thumbnail--${item.kind}`" aria-hidden="true">
                <text class="quotation-content__catalog-thumbnail-mark">{{ catalogKindMark(item.kind) }}</text>
                <text class="quotation-content__catalog-thumbnail-copy">{{ catalogTabLabel(item.kind) }}</text>
                <text class="quotation-content__catalog-thumbnail-caption">图片未提供</text>
              </view>
              <view class="quotation-content__catalog-item-copy">
                <view class="quotation-content__catalog-item-heading">
                  <text class="quotation-content__catalog-kind-pill">{{ composition.catalogKindLabels[item.kind] }}</text>
                </view>
                <text class="quotation-content__catalog-item-title">{{ item.name }}</text>
                <view v-if="catalogDetails(item).length" class="quotation-content__catalog-item-details">
                  <text v-for="detail in catalogDetails(item)" :key="detail" class="quotation-content__catalog-item-detail">{{ detail }}</text>
                </view>
                <text v-if="item.description || item.content" class="quotation-content__catalog-item-description">{{ item.description || item.content }}</text>
              </view>
            </view>
            <view class="quotation-content__catalog-item-footer">
              <text class="quotation-content__catalog-item-price-state">金额待核验</text>
              <AppButton
                v-if="item.kind === 'package'"
                variant="secondary"
                :data-testid="`quotation-package-detail-${item.id}`"
                @tap="openPackageConfiguration(item.id)"
              >{{ packageSelectionFor(item.id)?.configuration ? '编辑配置' : '选择并配置' }}</AppButton>
              <AppButton
                v-else-if="isDirectQuotationCatalogKind(item.kind)"
                variant="secondary"
                :disabled="!canSelectCatalogItem(item)"
                :data-testid="`quotation-catalog-add-${item.kind}-${item.id}`"
                @tap="addCatalogSelection(item.kind, item.id)"
              >加入本组</AppButton>
              <text v-else class="quotation-content__catalog-readonly">只读</text>
            </view>
          </view>
        </scroll-view>
        </view>

        <view class="quotation-content__catalog-footer" data-testid="quotation-catalog-footer">
          <view class="quotation-content__catalog-footer-copy">
            <text class="quotation-content__catalog-footer-title">当前组 · {{ groupSelectionCount(activeCatalogGroupId || '') }} 项已选</text>
            <text class="quotation-content__catalog-footer-note">选择后返回原维修部位；不会创建服务器报价</text>
          </view>
          <AppButton variant="secondary" data-testid="quotation-catalog-return" @tap="closeCatalog">返回工作台</AppButton>
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
                <text class="quotation-content__package-detail-note">配置仅保存在目标部位组的本机草稿中，尚未提交正式报价。</text>
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
            <text class="quotation-content__catalog-footer-note">确认后只更新当前维修部位组的本机草稿</text>
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
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import AppButton from '@shared/ui/AppButton.vue'
import AppCascadeSelector from '@shared/ui/AppCascadeSelector.vue'
import AppIcon from '@shared/ui/AppIcon.vue'
import AppLoadingState from '@shared/ui/AppLoadingState.vue'
import AppStatus from '@shared/ui/AppStatus.vue'
import { useActionWorkspaceStore } from '../action-workspace'
import { useQuotationCompositionStore } from './composition-store'
import { quotationAmountPresentation } from './amount-presentation'
import { isInitialQuotationWorkbenchEmpty } from './empty-workbench-state'
import { isDirectQuotationCatalogKind } from './model'
import { quotationCatalogKindLabels } from './catalog'
import { useQuotationCatalogBrowserStore } from './catalog-browser-store'
import type { QuotationLineKind } from './model'
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
}>()

const emit = defineEmits<{
  (event: 'retry'): void
  (event: 'back'): void
  (event: 'return-to-group', groupId: string): void
}>()

const composition = useQuotationCompositionStore()
const catalogBrowser = useQuotationCatalogBrowserStore()
const workspace = useActionWorkspaceStore()
const verifiedPricing = computed(() => {
  const result = workspace.quotationEngine.result
  return result && result.draftVersion === composition.draft?.draftVersion ? result.pricing : undefined
})
const isInitialEmptyWorkbench = computed(() => isInitialQuotationWorkbenchEmpty({
  contentState: props.state,
  editState: workspace.quotationEditState.state,
  draftState: composition.localState,
  groupCount: composition.groups.length,
  catalogOpen: catalogBrowser.isOpen,
}))
const amountPresentation = computed(() => quotationAmountPresentation({
  result: workspace.quotationEngine.result,
  draftVersion: composition.draft?.draftVersion,
  isLoading: workspace.quotationEngine.state === 'loading',
}))
const groupSubtotal = (groupId: string): number | undefined =>
  verifiedPricing.value?.fillOrder.groups.find((group) => group.groupId === groupId)?.subtotal

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
const activeCatalogGroupId = ref<string | null>(null)
const catalogSelectionError = ref('')
const packageMaterialChoicesByLayer = ref<Readonly<Record<string, QuotationPackageMaterialChoice>>>({})
const pendingPackageChoicesByTarget = ref<Readonly<Record<string, Readonly<Record<string, QuotationPackageMaterialChoice>>>>>({})
const groupContextExpandedById = ref<Readonly<Record<string, boolean>>>({})
const groupDetailsCollapsedById = ref<Readonly<Record<string, boolean>>>({})
const packageDetailsExpandedBySelectionId = ref<Readonly<Record<string, boolean>>>({})
const catalogSearchText = ref('')
const activeCatalogGroup = computed(() => composition.groups.find((group) => group.groupId === activeCatalogGroupId.value))
const activeCatalogGroupTitle = computed(() => {
  if (!activeCatalogGroup.value) return '未指定分组'
  const index = composition.groups.findIndex((group) => group.groupId === activeCatalogGroup.value?.groupId)
  const groupLabel = activeCatalogGroup.value.partDescription.trim() || repairPartPathLabel(activeCatalogGroup.value.repairParts)
  return groupLabel ? `维修部位组 ${index + 1} · ${groupLabel}` : `维修部位组 ${index + 1}`
})
const activeCatalogGroupSummary = computed(() => {
  const group = activeCatalogGroup.value
  if (!group) return '请返回工作台选择一个维修部位组。'
  const path = repairPartPathLabel(group.repairParts)
  const selectionCount = groupSelectionCount(group.groupId)
  return [path || '部位路径待选择', `${selectionCount} 项已在本组`].join(' · ')
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
  const query = catalogSearchText.value.trim().toLocaleLowerCase()
  if (!query) return catalogBrowser.visibleCatalogItems
  return catalogBrowser.visibleCatalogItems.filter((item) => [
    item.name,
    'code' in item ? item.code : undefined,
    item.specification,
    item.unit,
    item.description,
    item.content,
  ].some((value) => typeof value === 'string' && value.toLocaleLowerCase().includes(query)))
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
  activeCatalogGroupId.value = groupId
  catalogSelectionError.value = ''
  catalogSearchText.value = ''
  packageMaterialChoicesByLayer.value = {}
  catalogBrowser.open(kind)
}

function closeCatalog(): void {
  const returnGroupId = activeCatalogGroupId.value
  catalogBrowser.close()
  if (returnGroupId) emit('return-to-group', returnGroupId)
  activeCatalogGroupId.value = null
  catalogSelectionError.value = ''
  catalogSearchText.value = ''
  packageMaterialChoicesByLayer.value = {}
}


function selectCatalogKind(kind: QuotationLineKind): void {
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

function packageTargetKey(groupId: string, packageId: string): string {
  return `${groupId}\u0000${packageId}`
}

async function openExistingPackageConfiguration(groupId: string, packageId: string): Promise<void> {
  activeCatalogGroupId.value = groupId
  catalogSelectionError.value = ''
  catalogSearchText.value = ''
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

function areGroupDetailsCollapsed(groupId: string): boolean {
  return groupDetailsCollapsedById.value[groupId] ?? false
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

<style>
.quotation-content { margin-top: var(--app-space-md); }
.quotation-content__heading { display: flex; flex-direction: column; margin: 0 var(--app-space-xs) var(--app-space-md); }
.quotation-content__eyebrow { color: var(--app-color-primary); font-size: var(--app-font-meta); font-weight: 800; letter-spacing: .6px; }
.quotation-content__title { color: var(--app-color-text-primary); font-size: var(--app-font-section-title); font-weight: 800; margin-top: var(--app-space-xs); }
.quotation-content__description { color: var(--app-color-text-secondary); font-size: var(--app-font-body); line-height: 1.5; margin-top: var(--app-space-xs); }
.quotation-content__panel { padding: var(--app-card-padding); }
.quotation-content__workbench { padding-bottom: var(--app-space-md); }
.quotation-content__workbench-summary { align-items: center; border-bottom: 1rpx solid var(--app-color-divider); display: flex; flex-wrap: wrap; gap: var(--app-space-sm); justify-content: space-between; padding-bottom: var(--app-space-md); }
.quotation-content__workbench-summary-copy { flex: 1; min-width: 130px; }
.quotation-content__panel-title { color: var(--app-color-text-primary); display: block; font-size: var(--app-font-field-label); font-weight: 800; }
.quotation-content__line-count { color: var(--app-color-text-secondary); display: block; font-size: var(--app-font-meta); margin-top: var(--app-space-xs); }
.quotation-content__amount-summary { align-items: flex-end; display: flex; flex-direction: column; margin-left: auto; }
.quotation-content__amount-label { color: var(--app-color-text-secondary); font-size: var(--app-font-meta); }
.quotation-content__amount-value { color: var(--app-color-text-primary); font-size: var(--app-font-value); font-weight: 800; margin-top: 2rpx; }
.quotation-content__local-tag, .quotation-content__kind-tag { background: var(--app-color-primary-soft); border-radius: var(--app-radius-control); color: var(--app-color-primary); flex-shrink: 0; font-size: var(--app-font-meta); padding: var(--app-space-xs) var(--app-space-sm); }
.quotation-content__local-status { margin-top: var(--app-space-sm); }
.quotation-content__engine { background: var(--app-color-control-surface); border: 1rpx solid var(--app-color-border); border-radius: var(--app-radius-control); margin-top: var(--app-space-md); padding: var(--app-space-sm) var(--app-space-md); }
.quotation-content__engine-total { align-items: center; display: flex; justify-content: space-between; }
.quotation-content__engine-label, .quotation-content__engine-note { color: var(--app-color-text-secondary); display: block; font-size: var(--app-font-meta); line-height: 1.5; }
.quotation-content__engine-amount { color: var(--app-color-text-primary); font-size: var(--app-font-value); font-weight: 800; }
.quotation-content__engine-blocked { margin-top: var(--app-space-xs); }
.quotation-content__engine-issue { color: var(--app-color-text-secondary); display: block; font-size: var(--app-font-meta); line-height: 1.5; margin-top: var(--app-space-xs); }
.quotation-content__engine-note { margin-top: var(--app-space-xs); }
.quotation-content__submission { border-top: 1rpx solid var(--app-color-divider); display: flex; flex-direction: column; gap: var(--app-space-sm); margin-top: var(--app-space-md); padding-top: var(--app-space-md); }
.quotation-content__submitted-document { color: var(--app-color-primary); font-size: var(--app-font-body); }
.quotation-content__empty { align-items: center; display: flex; flex-direction: column; padding: 38rpx var(--app-space-sm) 16rpx; text-align: center; }
.quotation-content__empty-mark { align-items: center; background: var(--app-color-primary-soft); border-radius: 999rpx; color: var(--app-color-primary); display: flex; font-size: 46rpx; height: 80rpx; justify-content: center; width: 80rpx; }
.quotation-content__empty-title, .quotation-content__blocked-title { color: var(--app-color-text-primary); display: block; font-size: var(--app-font-value); font-weight: 800; margin-top: var(--app-space-md); }
.quotation-content__copy { color: var(--app-color-text-secondary); display: block; font-size: var(--app-font-body); line-height: 1.6; margin-top: var(--app-space-sm); }
.quotation-content__add-button { margin-top: var(--app-space-md); }
.quotation-content__add-button--outline { border-style: dashed; }
.quotation-content__add-group-button { margin-top: var(--app-space-md); }
.quotation-content__add-group-button--outline { border-style: dashed; }
.quotation-content__groups { display: flex; flex-direction: column; gap: var(--app-space-md); padding-top: var(--app-space-md); }
.quotation-content__group { border: 1rpx solid var(--app-color-border); padding: var(--app-card-padding); }
.quotation-content__group-heading { align-items: flex-start; border-bottom: 1rpx solid var(--app-color-divider); display: flex; gap: var(--app-space-sm); justify-content: space-between; padding-bottom: var(--app-space-sm); }
.quotation-content__group-title-copy { flex: 1; min-width: 0; }
.quotation-content__group-heading-actions { align-items: flex-end; display: flex; flex-direction: column; flex-shrink: 0; }
.quotation-content__group-eyebrow { color: var(--app-color-text-secondary); display: block; font-size: var(--app-font-meta); }
.quotation-content__group-title { color: var(--app-color-text-primary); display: block; font-size: var(--app-font-field-label); font-weight: 800; margin-top: var(--app-space-xs); overflow-wrap: anywhere; }
.quotation-content__group-location { color: var(--app-color-text-secondary); display: block; font-size: var(--app-font-meta); line-height: 1.45; margin-top: var(--app-space-xs); }
.quotation-content__group-count { color: var(--app-color-primary); font-size: var(--app-font-meta); font-weight: 800; }
.quotation-content__context-toggle { margin-top: var(--app-space-xs); min-height: 36px; padding-left: 0; padding-right: 0; }
.quotation-content__group-subtotal { color: var(--app-color-primary); display: block; font-size: var(--app-font-meta); font-weight: 700; margin-top: var(--app-space-xs); }
.quotation-content__group-context { border-bottom: 1rpx solid var(--app-color-divider); display: flex; flex-direction: column; gap: var(--app-space-sm); padding: var(--app-space-md) 0; }
.quotation-content__context-label { color: var(--app-color-text-secondary); display: block; font-size: var(--app-font-meta); font-weight: 700; }
.quotation-content__group-fields { display: grid; gap: var(--app-space-sm); grid-template-columns: 1fr; }
.quotation-content__context-field { display: flex; flex-direction: column; gap: var(--app-space-xs); min-width: 0; }
.quotation-content__context-input { background: var(--app-color-control-surface); border: 1rpx solid var(--app-color-border-control); border-radius: var(--app-radius-control); box-sizing: border-box; color: var(--app-color-text-primary); font-size: var(--app-font-body); min-height: 48px; padding: var(--app-space-sm); width: 100%; }
.quotation-content__context-input--multiline { min-height: 72px; }
.quotation-content__composition { border-top: 1rpx solid var(--app-color-divider); margin-top: var(--app-space-md); padding-top: var(--app-space-md); }
.quotation-content__composition-heading { align-items: center; display: flex; gap: var(--app-space-sm); justify-content: space-between; }
.quotation-content__composition-title { color: var(--app-color-text-primary); display: block; font-size: var(--app-font-body); font-weight: 800; }
.quotation-content__composition-meta { color: var(--app-color-text-secondary); display: block; font-size: var(--app-font-meta); margin-top: 2rpx; }
.quotation-content__details-toggle { flex-shrink: 0; min-height: 40px; }
.quotation-content__collapsed-summary { color: var(--app-color-text-secondary); display: block; font-size: var(--app-font-body); line-height: 1.5; margin-top: var(--app-space-sm); }
.quotation-content__selection-list { margin-top: var(--app-space-xs); }
.quotation-content__group-section { border-top: 1rpx solid var(--app-color-divider); margin-top: var(--app-space-sm); padding-top: var(--app-space-sm); }
.quotation-content__group-section-heading { align-items: center; display: flex; gap: var(--app-space-sm); justify-content: space-between; }
.quotation-content__group-section-copy { align-items: baseline; display: flex; flex-wrap: wrap; gap: 2rpx var(--app-space-xs); min-width: 0; }
.quotation-content__group-section-title { color: var(--app-color-text-primary); font-size: var(--app-font-body); font-weight: 800; }
.quotation-content__group-section-count { color: var(--app-color-text-muted); font-size: var(--app-font-meta); }
.quotation-content__browse-catalog { margin-top: var(--app-space-md); min-height: 48px; }
.quotation-content__selection { background: var(--app-color-surface); border: 1rpx solid var(--app-color-border); border-radius: var(--app-radius-control); margin-top: var(--app-space-sm); padding: var(--app-space-sm) var(--app-space-md); }
.quotation-content__selection--package { border-color: var(--app-color-primary-border); }
.quotation-content__selection-unit { background: var(--app-color-control-surface); border-radius: 999px; color: var(--app-color-text-secondary); flex-shrink: 0; font-size: var(--app-font-meta); padding: 4rpx var(--app-space-sm); }
.quotation-content__package-summary { background: var(--app-color-control-surface); border: 1rpx solid var(--app-color-border); border-radius: var(--app-radius-control); display: flex; flex-direction: column; gap: var(--app-space-xs); margin-top: var(--app-space-sm); padding: var(--app-space-sm); }
.quotation-content__package-summary-heading { align-items: center; display: flex; gap: var(--app-space-xs); justify-content: space-between; }
.quotation-content__package-edit { flex-shrink: 0; min-height: 40px; }
.quotation-content__package-summary-title { color: var(--app-color-text-primary); display: block; font-size: var(--app-font-body); font-weight: 800; }
.quotation-content__package-summary-note { color: var(--app-color-text-secondary); display: block; font-size: var(--app-font-meta); line-height: 1.4; margin-top: 2rpx; }
.quotation-content__package-summary-row { color: var(--app-color-text-secondary); display: block; font-size: var(--app-font-meta); line-height: 1.4; }
.quotation-content__composition-empty { background: var(--app-color-control-surface); border-radius: var(--app-radius-control); margin-top: var(--app-space-sm); padding: var(--app-space-md); }
.quotation-content__composition-empty-title { color: var(--app-color-text-primary); display: block; font-size: var(--app-font-body); font-weight: 700; }
.quotation-content__composition-empty-copy { color: var(--app-color-text-secondary); display: block; font-size: var(--app-font-meta); line-height: 1.5; margin-top: var(--app-space-xs); }
.quotation-content__empty-section { color: var(--app-color-text-muted); display: block; font-size: var(--app-font-meta); padding: var(--app-space-sm) 0; }
.quotation-content__lines { display: flex; flex-direction: column; gap: var(--app-space-sm); padding-top: var(--app-space-md); }
.quotation-content__line { padding: var(--app-space-md); }
.quotation-content__line-heading { align-items: flex-start; display: flex; gap: var(--app-space-sm); justify-content: space-between; }
.quotation-content__line-title-wrap { align-items: flex-start; display: flex; flex: 1; gap: var(--app-space-sm); min-width: 0; }
.quotation-content__line-index { color: var(--app-color-text-secondary); flex-shrink: 0; font-size: var(--app-font-meta); font-weight: 800; padding-top: 3rpx; }
.quotation-content__line-title { color: var(--app-color-text-primary); flex: 1; font-size: var(--app-font-body); font-weight: 700; line-height: 1.4; min-width: 0; overflow-wrap: anywhere; }
.quotation-content__line-controls { align-items: center; display: grid; gap: var(--app-space-xs) var(--app-space-sm); grid-template-columns: auto minmax(100rpx, 1fr) auto; margin-top: var(--app-space-sm); }
.quotation-content__quantity-label { color: var(--app-color-text-secondary); font-size: var(--app-font-meta); }
.quotation-content__quantity-wrap { align-items: center; background: var(--app-color-surface); border: 1rpx solid var(--app-color-border-control); border-radius: var(--app-radius-control); box-sizing: border-box; display: flex; min-height: 44px; min-width: 0; padding: 0 var(--app-space-sm); }
.quotation-content__quantity-wrap--error { border-color: var(--app-color-danger); }
.quotation-content__quantity { background: transparent; border: 0; box-sizing: border-box; color: var(--app-color-text-primary); flex: 1; font-size: var(--app-font-body); min-width: 0; outline: none; padding: var(--app-space-sm) 0; }
.quotation-content__quantity-error { color: var(--app-color-danger); font-size: var(--app-font-meta); grid-column: 2 / 4; line-height: 1.4; }
.quotation-content__unit { color: var(--app-color-text-secondary); flex-shrink: 0; font-size: var(--app-font-meta); padding-left: var(--app-space-xs); }
.quotation-content__remove-button { grid-column: 3; min-height: 40px; }
.quotation-content__blocked { padding-top: var(--app-space-md); }
.quotation-content__blocked-title { margin-top: 0; }
.quotation-content__secondary-action, .quotation-content__retry { margin-top: var(--app-space-md); }
.quotation-content__catalog-page { background: var(--app-color-page); box-sizing: border-box; display: flex; flex-direction: column; height: 100vh; inset: 0; overflow: hidden; padding: var(--app-space-sm) var(--app-page-gutter) calc(var(--app-space-sm) + env(safe-area-inset-bottom)); position: fixed; width: 100%; z-index: 1000; }
.quotation-content__catalog-topbar { align-items: center; display: grid; gap: var(--app-space-xs); grid-template-columns: minmax(68px, 1fr) 2fr minmax(68px, 1fr); min-height: 48px; }
.quotation-content__catalog-back { justify-self: start; min-height: 44px; padding-left: 0; padding-right: 0; }
.quotation-content__catalog-topbar-title { min-width: 0; text-align: center; }
.quotation-content__catalog-title { color: var(--app-color-text-primary); display: block; font-size: var(--app-font-field-label); font-weight: 800; }
.quotation-content__catalog-step { color: var(--app-color-text-secondary); display: block; font-size: var(--app-font-meta); margin-top: 2rpx; }
.quotation-content__catalog-topbar-spacer { display: block; }
.quotation-content__catalog-target { background: var(--app-color-surface); border: 1rpx solid var(--app-color-border); border-radius: var(--app-radius-control); margin-top: var(--app-space-sm); padding: var(--app-space-sm) var(--app-space-md); }
.quotation-content__catalog-target-label { color: var(--app-color-text-secondary); display: block; font-size: var(--app-font-meta); }
.quotation-content__catalog-target-title { color: var(--app-color-text-primary); display: block; font-size: var(--app-font-body); font-weight: 800; margin-top: 2rpx; }
.quotation-content__catalog-target-meta { color: var(--app-color-text-secondary); display: block; font-size: var(--app-font-meta); margin-top: 2rpx; }
.quotation-content__catalog-toolbar { background: var(--app-color-page); padding-top: var(--app-space-sm); }
.quotation-content__category-grid { display: grid; gap: var(--app-space-xs); grid-template-columns: repeat(4, minmax(0, 1fr)); }
.quotation-content__category { min-height: 44px; padding-left: 2rpx; padding-right: 2rpx; }
.quotation-content__search-wrap { align-items: center; background: var(--app-color-control-surface); border: 1rpx solid var(--app-color-border-control); border-radius: var(--app-radius-control); box-sizing: border-box; display: flex; margin-top: var(--app-space-sm); min-height: 44px; padding: 0 var(--app-space-sm); }
.quotation-content__search-mark { color: var(--app-color-text-muted); font-size: 24px; line-height: 1; padding-right: var(--app-space-xs); }
.quotation-content__search-input { background: transparent; border: 0; box-sizing: border-box; color: var(--app-color-text-primary); flex: 1; font-size: var(--app-font-body); min-width: 0; outline: none; padding: var(--app-space-xs) 0; }
.quotation-content__search-clear { flex-shrink: 0; min-height: 36px; }
.quotation-content__catalog-browser { display: flex; flex: 1; flex-direction: column; min-height: 0; }
.quotation-content__catalog-state { margin-top: var(--app-space-md); }
.quotation-content__catalog-list, .quotation-content__package-detail { flex: 1; margin-top: var(--app-space-sm); min-height: 100rpx; }
.quotation-content__package-detail { box-sizing: border-box; padding-bottom: var(--app-space-md); }
.quotation-content__catalog-item { align-items: center; background: var(--app-color-surface); border: 1rpx solid var(--app-color-border); border-radius: var(--app-radius-card); box-sizing: border-box; display: flex; gap: var(--app-space-sm); margin-bottom: var(--app-space-sm); min-height: 112px; padding: var(--app-space-sm); width: 100%; }
.quotation-content__catalog-thumbnail { align-items: center; background: var(--app-color-primary-soft); border: 1rpx solid var(--app-color-primary-border); border-radius: var(--app-radius-control); box-sizing: border-box; display: flex; flex: 0 0 72px; flex-direction: column; height: 84px; justify-content: center; overflow: hidden; position: relative; }
.quotation-content__catalog-thumbnail--procedure { background: var(--app-color-control-surface); border-color: var(--app-color-border); }
.quotation-content__catalog-thumbnail--material { background: var(--app-color-success-soft); border-color: var(--app-color-success-soft); }
.quotation-content__catalog-thumbnail--measure { background: var(--app-color-control-surface); border-color: var(--app-color-border); }
.quotation-content__catalog-thumbnail::before { border: 1rpx solid rgba(40, 120, 242, .18); border-radius: 50%; content: ''; height: 56px; position: absolute; right: -18px; top: -20px; width: 56px; }
.quotation-content__catalog-thumbnail--procedure::before, .quotation-content__catalog-thumbnail--measure::before { border-color: rgba(77, 96, 126, .14); }
.quotation-content__catalog-thumbnail--material::before { border-color: rgba(24, 174, 101, .18); }
.quotation-content__catalog-thumbnail-mark { color: var(--app-color-primary); font-size: var(--app-font-major-title); font-weight: 800; line-height: 1; position: relative; }
.quotation-content__catalog-thumbnail--procedure .quotation-content__catalog-thumbnail-mark, .quotation-content__catalog-thumbnail--measure .quotation-content__catalog-thumbnail-mark { color: var(--app-color-text-body); }
.quotation-content__catalog-thumbnail--material .quotation-content__catalog-thumbnail-mark { color: var(--app-color-success); }
.quotation-content__catalog-thumbnail-copy { color: var(--app-color-text-secondary); font-size: var(--app-font-meta); margin-top: var(--app-space-xs); position: relative; }
.quotation-content__catalog-item-copy { display: flex; flex: 1; flex-direction: column; min-width: 0; }
.quotation-content__catalog-item-heading { align-items: flex-start; display: flex; flex-wrap: wrap; gap: var(--app-space-xs); justify-content: space-between; }
.quotation-content__catalog-item-title { color: var(--app-color-text-primary); flex: 1; font-size: var(--app-font-body); font-weight: 800; line-height: 1.35; min-width: 88px; overflow-wrap: anywhere; }
.quotation-content__catalog-kind-pill { background: var(--app-color-control-surface); border-radius: 999px; color: var(--app-color-text-secondary); flex-shrink: 0; font-size: 10px; padding: 2rpx var(--app-space-xs); }
.quotation-content__catalog-item-details { display: flex; flex-wrap: wrap; gap: var(--app-space-xs); margin-top: var(--app-space-xs); }
.quotation-content__catalog-item-detail { background: var(--app-color-control-surface); border-radius: 999px; color: var(--app-color-text-secondary); font-size: var(--app-font-meta); line-height: 1.4; padding: 4rpx var(--app-space-xs); }
.quotation-content__catalog-item-description { color: var(--app-color-text-secondary); display: block; font-size: var(--app-font-meta); line-height: 1.4; margin-top: var(--app-space-xs); }
.quotation-content__catalog-item-price-state { color: var(--app-color-text-muted); display: block; font-size: var(--app-font-meta); margin-top: var(--app-space-xs); }
.quotation-content__catalog-item .app-button { flex-shrink: 0; max-width: 88px; min-height: 44px; padding-left: var(--app-space-xs); padding-right: var(--app-space-xs); }
.quotation-content__catalog-readonly { color: var(--app-color-text-muted); flex-shrink: 0; font-size: var(--app-font-meta); margin-left: var(--app-space-sm); }
.quotation-content__catalog-state-card { align-items: center; background: var(--app-color-surface); border: 1rpx solid var(--app-color-border); border-radius: var(--app-radius-card); display: flex; flex-direction: column; margin: auto 0; padding: var(--app-space-xl) var(--app-card-padding); text-align: center; }
.quotation-content__catalog-state-mark { align-items: center; background: var(--app-color-primary-soft); border-radius: 999px; color: var(--app-color-primary); display: flex; font-size: var(--app-font-body); font-weight: 800; height: 48px; justify-content: center; width: 48px; }
.quotation-content__catalog-state-mark--warning { background: var(--app-color-warning-soft); color: var(--app-color-warning); }
.quotation-content__catalog-state-title { color: var(--app-color-text-primary); display: block; font-size: var(--app-font-field-label); font-weight: 800; margin-top: var(--app-space-md); }
.quotation-content__catalog-state-copy { color: var(--app-color-text-secondary); display: block; font-size: var(--app-font-body); line-height: 1.55; margin-top: var(--app-space-xs); }
.quotation-content__empty-search-clear { margin-top: var(--app-space-md); }
.quotation-content__catalog-footer { align-items: center; background: var(--app-color-surface); border-top: 1rpx solid var(--app-color-border); display: flex; flex-wrap: wrap; gap: var(--app-space-sm); justify-content: space-between; margin: var(--app-space-sm) calc(-1 * var(--app-page-gutter)) 0; padding: var(--app-space-sm) var(--app-page-gutter); }
.quotation-content__catalog-footer-copy { flex: 1; min-width: 135px; }
.quotation-content__catalog-footer-title { color: var(--app-color-text-primary); display: block; font-size: var(--app-font-meta); font-weight: 800; }
.quotation-content__catalog-footer-note { color: var(--app-color-text-secondary); display: block; font-size: 10px; line-height: 1.35; margin-top: 2rpx; }
.quotation-content__package-detail-content { padding: var(--app-space-sm) 0 var(--app-space-lg); }
.quotation-content__package-hero { align-items: center; background: var(--app-color-surface); border: 1rpx solid var(--app-color-border); border-radius: var(--app-radius-card); display: flex; gap: var(--app-space-md); padding: var(--app-space-md); }
.quotation-content__package-hero-thumbnail { align-items: center; background: var(--app-color-primary-soft); border-radius: var(--app-radius-control); box-sizing: border-box; display: flex; flex: 0 0 86px; flex-direction: column; height: 88px; justify-content: center; }
.quotation-content__package-hero-thumbnail-label { color: var(--app-color-primary); font-size: var(--app-font-body); font-weight: 800; }
.quotation-content__package-hero-placeholder { color: var(--app-color-text-muted); font-size: 10px; margin-top: 4rpx; }
.quotation-content__package-hero-copy { flex: 1; min-width: 0; }
.quotation-content__package-detail-title { color: var(--app-color-text-primary); display: block; font-size: var(--app-font-field-label); font-weight: 800; line-height: 1.35; overflow-wrap: anywhere; }
.quotation-content__package-meta { color: var(--app-color-text-secondary); display: block; font-size: var(--app-font-meta); margin-top: var(--app-space-xs); }
.quotation-content__package-detail-note { color: var(--app-color-text-secondary); display: block; font-size: var(--app-font-meta); line-height: 1.4; margin-top: var(--app-space-xs); }
.quotation-content__package-selection-summary { background: var(--app-color-primary-soft); border: 1rpx solid var(--app-color-primary-border); border-radius: var(--app-radius-control); display: flex; flex-wrap: wrap; gap: var(--app-space-xs) var(--app-space-md); justify-content: space-between; margin-top: var(--app-space-md); padding: var(--app-space-sm) var(--app-space-md); }
.quotation-content__package-selection-label { color: var(--app-color-text-secondary); display: block; font-size: var(--app-font-meta); }
.quotation-content__package-selection-value { color: var(--app-color-primary); display: block; font-size: var(--app-font-body); font-weight: 800; margin-top: 2rpx; }
.quotation-content__package-selection-target { align-self: center; color: var(--app-color-text-primary); font-size: var(--app-font-meta); font-weight: 700; }
.quotation-content__detail-section { border-top: 1rpx solid var(--app-color-divider); margin-top: var(--app-space-md); padding-top: var(--app-space-md); }
.quotation-content__detail-heading-row { align-items: baseline; display: flex; flex-wrap: wrap; gap: var(--app-space-xs) var(--app-space-sm); justify-content: space-between; }
.quotation-content__detail-heading { color: var(--app-color-text-primary); display: block; font-size: var(--app-font-field-label); font-weight: 800; }
.quotation-content__detail-section-note { color: var(--app-color-text-muted); font-size: var(--app-font-meta); }
.quotation-content__included-row { align-items: center; background: var(--app-color-control-surface); border-radius: var(--app-radius-control); display: flex; gap: var(--app-space-sm); margin-top: var(--app-space-xs); padding: var(--app-space-sm); }
.quotation-content__included-mark { align-items: center; background: var(--app-color-primary-soft); border-radius: 999px; color: var(--app-color-primary); display: flex; flex: 0 0 28px; font-size: var(--app-font-meta); font-weight: 800; height: 28px; justify-content: center; }
.quotation-content__included-mark--measure { background: var(--app-color-control-surface); color: var(--app-color-text-secondary); }
.quotation-content__detail-row { color: var(--app-color-text-secondary); display: block; flex: 1; font-size: var(--app-font-body); line-height: 1.5; }
.quotation-content__layer-group { background: var(--app-color-control-surface); border: 1rpx solid var(--app-color-border); border-radius: var(--app-radius-card); margin-top: var(--app-space-sm); padding: var(--app-space-sm); }
.quotation-content__layer-heading-row { align-items: center; display: flex; justify-content: space-between; }
.quotation-content__layer-heading { color: var(--app-color-text-primary); display: block; font-size: var(--app-font-body); font-weight: 800; }
.quotation-content__layer-help { color: var(--app-color-text-secondary); display: block; font-size: var(--app-font-meta); margin-top: 2rpx; }
.quotation-content__layer-selected, .quotation-content__layer-required { border-radius: 999px; color: var(--app-color-text-secondary); font-size: var(--app-font-meta); padding: 4rpx var(--app-space-xs); }
.quotation-content__layer-selected { background: var(--app-color-success-soft); color: var(--app-color-success); }
.quotation-content__layer-required { background: var(--app-color-surface); }
.quotation-content__material-choice { background: var(--app-color-surface); display: block; margin-top: var(--app-space-xs); min-height: 52px; text-align: left; width: 100%; }
.quotation-content__material-choice-content { align-items: center; display: flex; justify-content: space-between; width: 100%; }
.quotation-content__material-choice-copy { align-items: flex-start; display: flex; flex: 1; flex-direction: column; min-width: 0; }
.quotation-content__material-choice-name { color: var(--app-color-text-primary); font-size: var(--app-font-body); font-weight: 700; line-height: 1.35; }
.quotation-content__material-choice-meta { color: var(--app-color-text-secondary); font-size: var(--app-font-meta); margin-top: 2rpx; }
.quotation-content__material-choice-check { color: var(--app-color-primary); flex-shrink: 0; font-size: var(--app-font-value); font-weight: 800; margin-left: var(--app-space-sm); }
.quotation-content__package-config-status { margin-top: var(--app-space-md); }
.quotation-content__catalog-footer .quotation-content__package-config-commit { flex: 0 0 auto; max-width: 220px; min-height: 48px; }

@media (max-width: 360px) {
  .quotation-content__catalog-item { align-items: flex-start; flex-wrap: wrap; }
  .quotation-content__catalog-thumbnail { flex-basis: 58px; height: 68px; }
  .quotation-content__catalog-item-copy { flex: 1; min-height: 64px; }
  .quotation-content__catalog-item .app-button { margin-left: 66px; max-width: none; width: calc(100% - 66px); }
  .quotation-content__catalog-footer .quotation-content__package-config-commit { flex-basis: 100%; max-width: none; }
}

/* G4-F visual master v1: quote-first hierarchy, truthful data, and compact controls. */
.quotation-content { margin-top: 12rpx; }
.quotation-content__heading { margin: 0 4rpx 20rpx; }
.quotation-content__eyebrow { color: var(--app-color-primary); font-size: 20rpx; font-weight: 800; letter-spacing: .3px; }
.quotation-content__title { font-size: 38rpx; letter-spacing: -.3px; line-height: 1.2; margin-top: 6rpx; }
.quotation-content__description { font-size: 24rpx; line-height: 1.45; margin-top: 8rpx; }
.quotation-content__panel { padding: 22rpx; }
.quotation-content__workbench { padding-bottom: 20rpx; }
.quotation-content__workbench-summary { align-items: flex-start; border: 0; border-radius: 18rpx; gap: 12rpx; padding: 0 0 18rpx; }
.quotation-content__workbench-summary-copy { min-width: 0; }
.quotation-content__panel-title { font-size: 28rpx; line-height: 1.3; }
.quotation-content__line-count { font-size: 22rpx; margin-top: 6rpx; }
.quotation-content__amount-summary { align-items: flex-end; background: var(--app-color-control-surface); border-radius: 16rpx; margin-left: 0; min-height: 62rpx; padding: 10rpx 14rpx; }
.quotation-content__amount-label { font-size: 20rpx; }
.quotation-content__amount-value { color: var(--app-color-primary); font-size: 24rpx; margin-top: 4rpx; }
.quotation-content__local-tag { align-self: flex-start; border-radius: 999rpx; font-size: 20rpx; padding: 8rpx 14rpx; }
.quotation-content__engine { border-radius: 16rpx; margin-top: 14rpx; padding: 14rpx 16rpx; }
.quotation-content__engine-label, .quotation-content__engine-note, .quotation-content__engine-issue { font-size: 21rpx; line-height: 1.5; }
.quotation-content__engine-amount { font-size: 26rpx; }
.quotation-content__submission { margin-top: 14rpx; padding-top: 14rpx; }
.quotation-content__groups { gap: 18rpx; padding-top: 18rpx; }
.quotation-content__group { border-radius: 24rpx; box-shadow: 0 8rpx 24rpx rgba(32, 55, 90, .045); padding: 20rpx; }
.quotation-content__group-heading { align-items: center; border-bottom-color: var(--app-color-border); gap: 12rpx; padding-bottom: 16rpx; }
.quotation-content__group-index { align-items: center; background: var(--app-color-primary-soft); border: 1rpx solid var(--app-color-primary-border); border-radius: 14rpx; color: var(--app-color-primary); display: flex; flex: 0 0 48rpx; font-size: 22rpx; font-weight: 800; height: 48rpx; justify-content: center; }
.quotation-content__group-eyebrow { color: var(--app-color-primary); font-size: 20rpx; font-weight: 700; }
.quotation-content__group-title { font-size: 28rpx; line-height: 1.3; margin-top: 4rpx; }
.quotation-content__group-location { font-size: 21rpx; line-height: 1.45; margin-top: 6rpx; }
.quotation-content__group-heading-actions { align-items: flex-end; }
.quotation-content__group-count { background: var(--app-color-control-surface); border-radius: 999rpx; font-size: 20rpx; padding: 6rpx 10rpx; white-space: nowrap; }
.quotation-content__context-toggle { margin-top: 4rpx; min-height: 40px; }
.quotation-content__group-context { background: var(--app-color-control-surface); border: 1rpx solid var(--app-color-border); border-radius: 18rpx; margin-top: 14rpx; padding: 16rpx; }
.quotation-content__context-label { font-size: 21rpx; }
.quotation-content__context-input { min-height: 48px; }
.quotation-content__composition { border-top: 0; margin-top: 14rpx; padding-top: 0; }
.quotation-content__composition-heading { align-items: center; background: #f6f8fb; border-radius: 16rpx; padding: 14rpx 16rpx; }
.quotation-content__composition-title { font-size: 25rpx; }
.quotation-content__composition-meta { font-size: 20rpx; line-height: 1.4; margin-top: 4rpx; }
.quotation-content__details-toggle { min-height: 44px; }
.quotation-content__collapsed-summary { font-size: 23rpx; line-height: 1.5; margin-top: 12rpx; }
.quotation-content__selection-list { margin-top: 10rpx; }
.quotation-content__group-section { border: 0; margin-top: 10rpx; padding-top: 0; }
.quotation-content__group-section-heading { margin-bottom: 6rpx; padding: 0 4rpx; }
.quotation-content__group-section-title { font-size: 22rpx; }
.quotation-content__group-section-count { font-size: 20rpx; }
.quotation-content__selection { border-color: var(--app-color-border); border-radius: 18rpx; margin-top: 8rpx; padding: 16rpx; }
.quotation-content__selection--package { background: #fbfdff; border-color: var(--app-color-primary-border); }
.quotation-content__line-heading { align-items: center; gap: 12rpx; justify-content: flex-start; }
.quotation-content__line-kind-mark { align-items: center; background: var(--app-color-primary-soft); border-radius: 14rpx; color: var(--app-color-primary); display: flex; flex: 0 0 44rpx; font-size: 22rpx; font-weight: 800; height: 44rpx; justify-content: center; }
.quotation-content__line-kind-mark--procedure, .quotation-content__line-kind-mark--measure { background: var(--app-color-control-surface); color: var(--app-color-text-body); }
.quotation-content__line-kind-mark--material { background: var(--app-color-success-soft); color: var(--app-color-success); }
.quotation-content__line-title-wrap { align-items: flex-start; flex-direction: column; gap: 4rpx; }
.quotation-content__line-kind { color: var(--app-color-text-secondary); display: block; font-size: 19rpx; font-weight: 700; line-height: 1.2; }
.quotation-content__line-title { font-size: 25rpx; line-height: 1.35; }
.quotation-content__selection-unit { background: var(--app-color-control-surface); font-size: 20rpx; padding: 7rpx 11rpx; }
.quotation-content__package-summary { border-radius: 14rpx; gap: 8rpx; margin-top: 14rpx; padding: 12rpx; }
.quotation-content__package-summary-title { font-size: 23rpx; }
.quotation-content__package-summary-note, .quotation-content__package-summary-row { font-size: 20rpx; line-height: 1.45; }
.quotation-content__package-summary-configured { align-items: center; display: flex; gap: 8rpx; justify-content: space-between; }
.quotation-content__package-summary-count { color: var(--app-color-text-body); flex: 1; font-size: 21rpx; line-height: 1.4; min-width: 0; }
.quotation-content__package-details-toggle { flex: 0 0 auto; min-height: 40px; }
.quotation-content__package-summary-rows { border-top: 1rpx solid var(--app-color-border); display: flex; flex-direction: column; gap: 6rpx; margin-top: 6rpx; padding-top: 8rpx; }
.quotation-content__line-controls { gap: 8rpx 12rpx; grid-template-columns: auto minmax(100rpx, 1fr) auto; margin-top: 14rpx; }
.quotation-content__quantity-label { font-size: 20rpx; font-weight: 700; }
.quotation-content__quantity-wrap { border-radius: 12rpx; min-height: 46px; }
.quotation-content__quantity { font-size: 24rpx; }
.quotation-content__unit { font-size: 20rpx; }
.quotation-content__remove-button { min-height: 44px; }
.quotation-content__browse-catalog { border-radius: 16rpx; margin-top: 14rpx; min-height: 50px; }
.quotation-content__composition-empty { border: 1rpx dashed var(--app-color-border-control); border-radius: 16rpx; margin-top: 12rpx; padding: 18rpx; }
.quotation-content__composition-empty-title { font-size: 23rpx; }
.quotation-content__composition-empty-copy { font-size: 21rpx; line-height: 1.5; }
.quotation-content__add-group-button--outline { border-radius: 16rpx; border-style: solid; margin-top: 2rpx; }

.quotation-content__catalog-page { padding: 12rpx var(--app-page-gutter) calc(12rpx + env(safe-area-inset-bottom)); }
.quotation-content__catalog-topbar { min-height: 52px; }
.quotation-content__catalog-title { font-size: 28rpx; }
.quotation-content__catalog-step { font-size: 20rpx; margin-top: 4rpx; }
.quotation-content__catalog-target { border-color: var(--app-color-border-soft); border-radius: 18rpx; margin-top: 8rpx; padding: 14rpx 16rpx; }
.quotation-content__catalog-target-label { font-size: 20rpx; }
.quotation-content__catalog-target-title { font-size: 25rpx; line-height: 1.35; margin-top: 4rpx; }
.quotation-content__catalog-target-meta { font-size: 20rpx; line-height: 1.4; margin-top: 4rpx; }
.quotation-content__catalog-toolbar { padding-top: 14rpx; }
.quotation-content__category-grid { gap: 8rpx; }
.quotation-content__category { border-radius: 14rpx; font-size: 22rpx; min-height: 46px; }
.quotation-content__search-wrap { border-radius: 15rpx; margin-top: 12rpx; min-height: 48px; }
.quotation-content__catalog-list, .quotation-content__package-detail { margin-top: 14rpx; }
.quotation-content__catalog-item { align-items: stretch; border-color: var(--app-color-border-soft); border-radius: 22rpx; box-shadow: 0 6rpx 20rpx rgba(32, 55, 90, .04); display: flex; flex-direction: column; gap: 14rpx; margin-bottom: 14rpx; min-height: 0; padding: 16rpx; }
.quotation-content__catalog-item-main { align-items: flex-start; display: flex; gap: 14rpx; min-width: 0; }
.quotation-content__catalog-thumbnail { border-radius: 18rpx; flex: 0 0 82px; height: 88px; }
.quotation-content__catalog-thumbnail--package { background: #eaf2ff; }
.quotation-content__catalog-thumbnail--procedure { background: #f1f4f8; }
.quotation-content__catalog-thumbnail--material { background: #eaf7f0; }
.quotation-content__catalog-thumbnail--measure { background: #f1f4f8; }
.quotation-content__catalog-thumbnail-mark { font-size: 34rpx; }
.quotation-content__catalog-thumbnail-copy { font-size: 19rpx; margin-top: 4rpx; }
.quotation-content__catalog-thumbnail-caption { bottom: 5rpx; color: var(--app-color-text-muted); font-size: 15rpx; position: absolute; }
.quotation-content__catalog-item-copy { gap: 4rpx; padding-top: 2rpx; }
.quotation-content__catalog-item-heading { align-items: center; justify-content: flex-start; }
.quotation-content__catalog-kind-pill { background: var(--app-color-primary-soft); color: var(--app-color-primary); font-size: 19rpx; font-weight: 700; padding: 5rpx 10rpx; }
.quotation-content__catalog-item-title { display: block; flex: 0 1 auto; font-size: 26rpx; line-height: 1.35; min-width: 0; }
.quotation-content__catalog-item-details { gap: 6rpx; margin-top: 4rpx; }
.quotation-content__catalog-item-detail { background: transparent; border: 1rpx solid var(--app-color-border); border-radius: 999rpx; font-size: 19rpx; line-height: 1.35; padding: 5rpx 9rpx; }
.quotation-content__catalog-item-description { font-size: 20rpx; line-height: 1.45; margin-top: 4rpx; }
.quotation-content__catalog-item-footer { align-items: center; border-top: 1rpx solid var(--app-color-divider); display: flex; gap: 10rpx; justify-content: space-between; padding-top: 12rpx; }
.quotation-content__catalog-item-price-state { background: var(--app-color-control-surface); border-radius: 999rpx; color: var(--app-color-text-secondary); flex: 1; font-size: 20rpx; line-height: 1.35; margin-top: 0; padding: 8rpx 12rpx; }
.quotation-content__catalog-item .app-button { flex: 0 0 auto; max-width: none; min-height: 44px; min-width: 106px; padding-left: 12rpx; padding-right: 12rpx; }
.quotation-content__catalog-readonly { margin-left: 0; }
.quotation-content__catalog-state-card { border-radius: 22rpx; margin-top: 20rpx; padding: 30rpx 22rpx; }
.quotation-content__catalog-state-title { font-size: 26rpx; }
.quotation-content__catalog-state-copy { font-size: 23rpx; line-height: 1.5; }

.quotation-content__initial-empty { display: flex; flex-direction: column; gap: 18rpx; }
.quotation-content__initial-empty-heading { display: flex; flex-direction: column; gap: 8rpx; }
.quotation-content__initial-empty-title { color: var(--app-color-text-primary); display: block; font-size: 30rpx; font-weight: 800; line-height: 1.3; }
.quotation-content__initial-empty-description { color: var(--app-color-text-secondary); display: block; font-size: 23rpx; line-height: 1.5; }
.quotation-content__initial-empty-surface { align-items: center; background: var(--app-color-primary-soft); border: 1rpx solid var(--app-color-border-soft); border-radius: var(--app-radius-large); display: flex; flex-direction: column; padding: 34rpx 22rpx 24rpx; text-align: center; }
.quotation-content__initial-empty-mark { align-items: center; background: var(--app-color-surface); border: 1rpx solid var(--app-color-border); border-radius: 24rpx; display: flex; height: 76px; justify-content: center; width: 76px; }
.quotation-content__initial-empty-surface .quotation-content__empty-title { font-size: 27rpx; margin-top: 20rpx; }
.quotation-content__initial-empty-copy { color: var(--app-color-text-body); display: block; font-size: 22rpx; line-height: 1.55; margin-top: 8rpx; max-width: 520rpx; }
.quotation-content__initial-empty-action { border-radius: 16rpx; margin-top: 22rpx; max-width: 280px; min-height: 54px; width: 100%; }
.quotation-content__initial-empty-note { color: var(--app-color-text-secondary); display: block; font-size: 19rpx; line-height: 1.5; margin-top: 18rpx; }
.quotation-content__catalog-footer { border-radius: 20rpx 20rpx 0 0; gap: 10rpx; margin-top: 10rpx; padding: 14rpx var(--app-page-gutter) 12rpx; }
.quotation-content__catalog-footer-copy { min-width: 0; }
.quotation-content__catalog-footer-title { font-size: 22rpx; line-height: 1.35; }
.quotation-content__catalog-footer-note { font-size: 19rpx; line-height: 1.4; margin-top: 4rpx; }
.quotation-content__catalog-footer > .app-button { flex: 0 0 auto; min-height: 44px; }

.quotation-content__package-detail-content { padding: 10rpx 0 20rpx; }
.quotation-content__package-hero { align-items: flex-start; border-color: var(--app-color-border-soft); border-radius: 22rpx; gap: 14rpx; padding: 16rpx; }
.quotation-content__package-hero-thumbnail { border-radius: 18rpx; flex: 0 0 82px; height: 88px; justify-content: center; }
.quotation-content__package-hero-thumbnail-label { font-size: 27rpx; }
.quotation-content__package-hero-placeholder { font-size: 18rpx; }
.quotation-content__package-detail-title { font-size: 27rpx; line-height: 1.35; }
.quotation-content__package-meta, .quotation-content__package-detail-note { font-size: 20rpx; line-height: 1.45; }
.quotation-content__package-selection-summary { align-items: center; border-radius: 18rpx; margin-top: 14rpx; padding: 14rpx 16rpx; }
.quotation-content__package-selection-label { font-size: 20rpx; }
.quotation-content__package-selection-value { font-size: 24rpx; line-height: 1.35; }
.quotation-content__package-selection-side { align-items: flex-end; display: flex; flex-direction: column; gap: 5rpx; min-width: 0; }
.quotation-content__package-selection-target { font-size: 20rpx; max-width: 150px; overflow-wrap: anywhere; text-align: right; }
.quotation-content__package-selection-price { color: var(--app-color-text-secondary); font-size: 19rpx; }
.quotation-content__detail-section { margin-top: 18rpx; padding-top: 16rpx; }
.quotation-content__detail-heading { font-size: 25rpx; }
.quotation-content__detail-section-note { font-size: 19rpx; }
.quotation-content__included-row { border: 1rpx solid var(--app-color-border); border-radius: 14rpx; margin-top: 8rpx; min-height: 48px; padding: 10rpx 12rpx; }
.quotation-content__detail-row { font-size: 22rpx; line-height: 1.45; }
.quotation-content__layer-group { background: var(--app-color-surface); border-radius: 18rpx; margin-top: 12rpx; padding: 14rpx; }
.quotation-content__layer-heading { font-size: 23rpx; }
.quotation-content__layer-help { font-size: 20rpx; line-height: 1.4; }
.quotation-content__layer-selected, .quotation-content__layer-required { font-size: 19rpx; padding: 7rpx 10rpx; }
.quotation-content__material-choice { border-radius: 15rpx; margin-top: 8rpx; min-height: 56px; padding: 10rpx 12rpx; }
.quotation-content__material-choice.app-button--pressed { background: var(--app-color-primary-soft); border-color: var(--app-color-primary); }
.quotation-content__material-choice-name { font-size: 22rpx; line-height: 1.35; text-align: left; }
.quotation-content__material-choice-meta { font-size: 19rpx; line-height: 1.4; margin-top: 4rpx; text-align: left; }
.quotation-content__material-choice-check { align-items: center; background: var(--app-color-primary); border-radius: 999rpx; color: #fff; display: flex; font-size: 20rpx; height: 36rpx; justify-content: center; width: 36rpx; }
.quotation-content__catalog-footer .quotation-content__package-config-commit { border-radius: 16rpx; max-width: 230px; min-height: 48px; }

@media (max-width: 360px) {
  .quotation-content__panel { padding: 16rpx; }
  .quotation-content__group { padding: 16rpx; }
  .quotation-content__catalog-item { align-items: stretch; flex-direction: column; flex-wrap: nowrap; padding: 12rpx; }
  .quotation-content__catalog-item-main { gap: 10rpx; }
  .quotation-content__catalog-thumbnail { flex: 0 0 60px; height: 72px; }
  .quotation-content__catalog-thumbnail-mark { font-size: 30rpx; }
  .quotation-content__catalog-thumbnail-copy { font-size: 17rpx; }
  .quotation-content__catalog-item-title { font-size: 24rpx; }
  .quotation-content__catalog-item .app-button { margin-left: 0; min-width: 96px; width: auto; }
  .quotation-content__package-selection-target { max-width: 110px; }
  .quotation-content__catalog-footer .quotation-content__package-config-commit { flex-basis: auto; max-width: none; }
}
</style>
