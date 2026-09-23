<template>
  <view class="quotation-content" data-testid="quotation-action-content">
    <view class="quotation-content__heading">
      <text class="quotation-content__eyebrow">报价工作区</text>
      <text class="quotation-content__title">报价方案</text>
      <text class="quotation-content__description">分组草稿保存在本机；工序、材料和机措可直接加入，套餐需按详情配置后加入当前维修部位组。</text>
    </view>

    <view v-if="state === 'loading'" class="quotation-content__panel app-surface" data-testid="quotation-state-loading">
      <AppLoadingState variant="inline" label="正在准备报价内容" />
    </view>

    <view v-else-if="state === 'ready'" class="quotation-content__panel app-surface" data-testid="quotation-state-ready">
      <view class="quotation-content__panel-header">
        <view>
          <text class="quotation-content__panel-title">服务方案 / 报价明细</text>
          <text class="quotation-content__line-count">{{ composition.selectionCount }} 项 · {{ composition.groups.length }} 个部位组</text>
        </view>
        <text class="quotation-content__local-tag">仅本机草稿</text>
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

      <view class="quotation-content__engine" data-testid="quotation-engine-readiness">
        <AppLoadingState
          v-if="workspace.quotationEngine.state === 'loading'"
          variant="inline"
          label="正在核对目录、报价规则与本地金额"
        />
        <template v-else-if="workspace.quotationEngine.result">
          <view v-if="workspace.quotationEngine.result.pricing" class="quotation-content__engine-total" data-testid="quotation-local-gross-total">
            <text class="quotation-content__engine-label">R1 顶层金额预览 · 未提交</text>
            <text class="quotation-content__engine-amount">¥{{ workspace.quotationEngine.result.pricing.calcTotalPrice.totalPrice.toFixed(2) }}</text>
          </view>
          <text v-if="workspace.quotationEngine.result.pricing" class="quotation-content__engine-note" data-testid="quotation-rounding-note">明细分组金额按 R1 填单规则独立舍入，与顶层金额可能存在分差。</text>
          <AppStatus
            v-if="workspace.quotationEngine.result.state === 'ready'"
            message="报价校验通过；已在本机生成 type=1 结构预览，未创建或提交订单。"
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
        <text v-else class="quotation-content__engine-note" data-testid="quotation-engine-local-only">填写完整分组后，系统会重新核对当前目录数据。</text>
      </view>

      <view class="quotation-content__submission" data-testid="quotation-order-submit-boundary">
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
        <view v-if="composition.groups.length === 0" class="quotation-content__empty" data-testid="quotation-draft-empty">
          <view class="quotation-content__empty-mark" aria-hidden="true">＋</view>
          <text class="quotation-content__empty-title">还没有维修部位组</text>
          <text class="quotation-content__copy">先建立部位上下文，再在每个分组中整理服务方案、工序、材料或机措。当前内容仅保存在本机。</text>
          <AppButton
            class="quotation-content__add-group-button"
            data-testid="quotation-add-group"
            block
            :disabled="!canEdit"
            @tap="composition.createGroup()"
          >添加维修部位组</AppButton>
        </view>

        <view v-else class="quotation-content__groups" data-testid="quotation-draft-groups">
          <view
            v-for="(group, groupIndex) in composition.groups"
            :key="group.groupId"
            class="quotation-content__group app-surface app-surface--compact"
            :data-testid="`quotation-repair-group-${group.groupId}`"
          >
            <view class="quotation-content__group-heading">
              <view>
                <text class="quotation-content__group-eyebrow">维修部位组 {{ String(groupIndex + 1).padStart(2, '0') }}</text>
                <text class="quotation-content__group-title">{{ group.partDescription || '待填写部位描述' }}</text>
                <text v-if="groupSubtotal(group.groupId) !== undefined" class="quotation-content__group-subtotal" :data-testid="`quotation-group-subtotal-${group.groupId}`">组小计 ¥{{ groupSubtotal(group.groupId)?.toFixed(2) }}</text>
              </view>
              <text class="quotation-content__local-tag">本机草稿</text>
            </view>
            <view class="quotation-content__group-context" :data-testid="`quotation-group-context-${group.groupId}`">
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

            <view
              v-for="kind in catalogKinds"
              :key="kind"
              class="quotation-content__group-section"
              :data-testid="`quotation-group-section-${group.groupId}-${kind}`"
            >
              <view class="quotation-content__group-section-heading">
                <text class="quotation-content__panel-title">{{ composition.catalogKindLabels[kind] }}</text>
                <AppButton
                  class="quotation-content__browse-catalog"
                  variant="secondary"
                  :data-testid="`quotation-browse-${group.groupId}-${kind}`"
                  @tap="openCatalog(group.groupId, kind)"
                >浏览目录</AppButton>
              </view>
              <view
                v-for="selection in composition.selectionsFor(group.groupId, kind)"
                :key="selection.selectionId"
                class="quotation-content__selection"
                data-testid="quotation-composition-selection"
              >
                <view class="quotation-content__line-heading">
                  <view class="quotation-content__line-title-wrap">
                    <text class="quotation-content__line-title">{{ selection.label }}</text>
                  </view>
                  <text class="quotation-content__kind-tag">{{ composition.catalogKindLabels[selection.kind] }}</text>
                </view>
                <view
                  v-if="selection.kind === 'package'"
                  class="quotation-content__package-summary"
                  :data-testid="`quotation-configured-package-${selection.selectionId}`"
                >
                  <template v-if="selection.configuration">
                    <text class="quotation-content__package-summary-title">套餐组成已配置 · {{ selection.configuration.materials.length }} 个材料层级</text>
                    <text v-for="component in selection.configuration.procedures" :key="`procedure-${component.providerComponentId || ''}-${component.providerReferenceId || ''}`" class="quotation-content__package-summary-row">工序 · {{ component.label }}</text>
                    <text v-for="component in selection.configuration.materials" :key="`material-${typeof component.layer}-${String(component.layer)}-${component.providerComponentId || ''}-${component.providerReferenceId || ''}`" class="quotation-content__package-summary-row">材料 · 层级 {{ String(component.layer) }} · {{ component.label }}</text>
                    <text v-for="component in selection.configuration.measures" :key="`measure-${component.providerComponentId || ''}-${component.providerReferenceId || ''}`" class="quotation-content__package-summary-row">机措 · {{ component.label }}</text>
                  </template>
                  <text v-else class="quotation-content__package-summary-row">套餐尚未完成配置；已保留原有本机套餐记录。</text>
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
              <text v-if="composition.selectionsFor(group.groupId, kind).length === 0" class="quotation-content__empty-section">暂未添加</text>
            </view>
          </view>
          <AppButton
            class="quotation-content__add-group-button quotation-content__add-group-button--outline"
            data-testid="quotation-add-group"
            variant="secondary"
            block
            :disabled="!canEdit"
            @tap="composition.createGroup()"
          >＋ 添加维修部位组</AppButton>
        </view>
      </view>

      <view v-if="composition.localState === 'save_failed'" class="quotation-content__retry">
        <AppButton variant="secondary" block @tap="composition.flushDraft">重试保存本地草稿</AppButton>
      </view>
    </view>

    <view v-else-if="state === 'blocked'" class="quotation-content__panel app-surface" data-testid="quotation-state-blocked">
      <AppStatus
        message="报价单业务状态暂不可用；不会用目录数据替代已有报价状态。"
        tone="warning"
        quiet
      />
      <AppButton class="quotation-content__secondary-action" variant="secondary" block @tap="$emit('back')">返回工单详情</AppButton>
    </view>

    <view v-else-if="state === 'failed_retryable'" class="quotation-content__panel app-surface" data-testid="quotation-state-retryable">
      <AppStatus message="暂时无法准备报价内容，请检查网络后重试。" tone="warning" quiet />
      <AppButton class="quotation-content__secondary-action" variant="secondary" block @tap="$emit('retry')">重新加载</AppButton>
    </view>

    <view v-else class="quotation-content__panel app-surface" data-testid="quotation-state-terminal">
      <AppStatus message="报价内容暂不可用，请返回工单详情后再试。" tone="warning" quiet />
      <AppButton class="quotation-content__secondary-action" variant="secondary" block @tap="$emit('back')">返回工单详情</AppButton>
    </view>

    <view
      v-if="state === 'ready' && catalogBrowser.isOpen"
      class="quotation-content__catalog-backdrop"
      data-testid="quotation-catalog-sheet"
      @tap.self="closeCatalog"
    >
      <view class="quotation-content__catalog-sheet" role="dialog" aria-modal="true" aria-label="报价目录浏览与选择">
        <view class="quotation-content__catalog-handle" aria-hidden="true" />
        <view class="quotation-content__catalog-heading">
          <view>
            <text class="quotation-content__catalog-title">报价目录浏览</text>
            <text class="quotation-content__catalog-subtitle">目标：{{ activeCatalogGroupTitle }} · 工序、材料、机措可直接加入；套餐需完成层级配置后写入本机草稿</text>
          </view>
          <AppButton class="quotation-content__catalog-close" variant="text" aria-label="关闭目录" data-testid="quotation-catalog-close" @tap="closeCatalog">关闭</AppButton>
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

        <view v-if="!catalogBrowser.selectedPackageId" class="quotation-content__catalog-browser" data-testid="quotation-catalog-browser">
        <view class="quotation-content__category-grid" data-testid="quotation-catalog-categories">
          <AppButton
            v-for="kind in catalogKinds"
            :key="kind"
            class="quotation-content__category"
            variant="secondary"
            :pressed="catalogBrowser.selectedKind === kind"
            :data-testid="`quotation-catalog-kind-${kind}`"
            @tap="selectCatalogKind(kind)"
          >{{ composition.catalogKindLabels[kind] }}</AppButton>
        </view>
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
          class="quotation-content__catalog-state"
          data-testid="quotation-catalog-list-error"
        >
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
        <AppStatus
          v-else-if="catalogBrowser.catalogStatesByKind[catalogBrowser.selectedKind] === 'succeeded' && catalogBrowser.visibleCatalogItems.length === 0"
          class="quotation-content__catalog-state"
          message="当前适用范围暂无目录项目。"
          tone="neutral"
          quiet
        />
        <scroll-view v-else class="quotation-content__catalog-list" scroll-y data-testid="quotation-catalog-list">
          <view
            v-for="item in catalogBrowser.visibleCatalogItems"
            :key="item.id"
            class="quotation-content__catalog-item"
            :data-testid="`quotation-catalog-item-${item.kind}-${item.id}`"
          >
            <view class="quotation-content__catalog-item-copy">
              <text class="quotation-content__catalog-item-title">{{ item.name }}</text>
              <text class="quotation-content__catalog-item-meta">{{ catalogMetadata(item) }}</text>
            </view>
            <AppButton
              v-if="item.kind === 'package'"
              variant="text"
              :data-testid="`quotation-package-detail-${item.id}`"
              @tap="openPackageConfiguration(item.id)"
            >{{ packageSelectionFor(item.id)?.configuration ? '重新配置' : '配置套餐' }}</AppButton>
            <AppButton
              v-else-if="isDirectQuotationCatalogKind(item.kind)"
              variant="secondary"
              :disabled="!canSelectCatalogItem(item)"
              :data-testid="`quotation-catalog-add-${item.kind}-${item.id}`"
              @tap="addCatalogSelection(item.kind, item.id)"
            >加入当前组</AppButton>
            <text v-else class="quotation-content__catalog-readonly">只读</text>
          </view>
        </scroll-view>
        </view>

        <scroll-view v-else class="quotation-content__package-detail" scroll-y data-testid="quotation-package-detail">
          <AppButton variant="text" data-testid="quotation-package-detail-back" @tap="backFromPackageConfiguration">返回目录</AppButton>
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
            <text class="quotation-content__package-detail-title">{{ catalogBrowser.packageDetail.package.name }}</text>
            <text class="quotation-content__package-detail-note">配置后只会保存在目标维修部位组的本机草稿中。</text>
            <view class="quotation-content__detail-section" data-testid="quotation-package-procedures">
              <text class="quotation-content__detail-heading">工序</text>
              <text v-if="catalogBrowser.packageDetail.procedures.length === 0" class="quotation-content__empty-section">暂无工序</text>
              <text v-for="(row, index) in catalogBrowser.packageDetail.procedures" :key="row.id || row.referenceId || index" class="quotation-content__detail-row">
                {{ row.item?.name || '工序引用暂不可解析' }}<template v-if="row.unit"> · {{ row.unit }}</template>
              </text>
            </view>
            <view class="quotation-content__detail-section" data-testid="quotation-package-materials">
              <text class="quotation-content__detail-heading">材料 · 按已提供层级</text>
              <view v-for="layer in catalogBrowser.packageMaterialLayers" :key="layer.key" class="quotation-content__layer-group" :data-testid="`quotation-material-layer-${layer.key}`">
                <text class="quotation-content__layer-heading">{{ layer.label }}</text>
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
                >{{ row.item?.name || '材料引用暂不可解析' }}<template v-if="row.unit || row.item?.unit"> · {{ row.unit || row.item?.unit }}</template>{{ isPackageMaterialSelected(row) ? ' · 已选' : '' }}</AppButton>
              </view>
              <text v-if="catalogBrowser.packageDetail.materials.length === 0" class="quotation-content__empty-section">暂无材料</text>
            </view>
            <view class="quotation-content__detail-section" data-testid="quotation-package-measures">
              <text class="quotation-content__detail-heading">机措</text>
              <text v-if="catalogBrowser.packageDetail.measures.length === 0" class="quotation-content__empty-section">暂无机措</text>
              <text v-for="(row, index) in catalogBrowser.packageDetail.measures" :key="row.id || row.referenceId || index" class="quotation-content__detail-row">
                {{ row.item?.name || '机措引用暂不可解析' }}<template v-if="row.unit"> · {{ row.unit }}</template>
              </text>
            </view>
            <AppStatus
              v-if="packageConfigurationValidation.state !== 'succeeded'"
              class="quotation-content__package-config-status"
              :message="packageConfigurationValidation.error?.message || '请完成套餐材料层级选择。'"
              tone="warning"
              quiet
            />
            <AppButton
              class="quotation-content__package-config-commit"
              block
              :disabled="packageConfigurationValidation.state !== 'succeeded'"
              data-testid="quotation-package-configure-commit"
              @tap="commitPackageConfiguration"
            >{{ existingPackageSelection?.configuration ? '更新当前组套餐' : '加入当前组' }}</AppButton>
          </view>
        </scroll-view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import AppButton from '@shared/ui/AppButton.vue'
import AppCascadeSelector from '@shared/ui/AppCascadeSelector.vue'
import AppLoadingState from '@shared/ui/AppLoadingState.vue'
import AppStatus from '@shared/ui/AppStatus.vue'
import { useActionWorkspaceStore } from '../action-workspace'
import { useQuotationCompositionStore } from './composition-store'
import { isDirectQuotationCatalogKind } from './model'
import { quotationCatalogKindLabels } from './catalog'
import { useQuotationCatalogBrowserStore } from './catalog-browser-store'
import type { QuotationLineKind } from './model'
import type { QuotationCatalogItemRead, QuotationPackageMaterialRead } from '@shared/ports'
import {
  quotationPackageLayerKey,
  quotationPackageMaterialChoiceFor,
  quotationPackageMaterialChoiceToken,
  quotationPackageMaterialMatchesChoice,
  type QuotationPackageMaterialChoice,
} from './package-configuration'

defineProps<{
  readonly state: 'loading' | 'ready' | 'blocked' | 'failed_retryable' | 'failed_terminal'
}>()

defineEmits<{
  (event: 'retry'): void
  (event: 'back'): void
}>()

const composition = useQuotationCompositionStore()
const catalogBrowser = useQuotationCatalogBrowserStore()
const workspace = useActionWorkspaceStore()
const groupSubtotal = (groupId: string): number | undefined =>
  workspace.quotationEngine.result?.pricing?.fillOrder.groups.find((group) => group.groupId === groupId)?.subtotal

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
const activeCatalogGroup = computed(() => composition.groups.find((group) => group.groupId === activeCatalogGroupId.value))
const activeCatalogGroupTitle = computed(() => {
  if (!activeCatalogGroup.value) return '未指定分组'
  const index = composition.groups.findIndex((group) => group.groupId === activeCatalogGroup.value?.groupId)
  const groupLabel = activeCatalogGroup.value.partDescription.trim()
  return groupLabel ? `维修部位组 ${index + 1} · ${groupLabel}` : `维修部位组 ${index + 1}`
})
const currentPackageId = computed(() => catalogBrowser.selectedPackageId)
const existingPackageSelection = computed(() => activeCatalogGroup.value?.projPackages.find(
  (selection) => selection.catalogId === currentPackageId.value,
))
const packageMaterialChoices = computed(() => Object.values(packageMaterialChoicesByLayer.value))
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
  catalogBrowser.open(kind)
}

function closeCatalog(): void {
  catalogBrowser.close()
  activeCatalogGroupId.value = null
  catalogSelectionError.value = ''
  packageMaterialChoicesByLayer.value = {}
}


function selectCatalogKind(kind: QuotationLineKind): void {
  catalogSelectionError.value = ''
  catalogBrowser.selectKind(kind)
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

async function openPackageConfiguration(packageId: string): Promise<void> {
  packageMaterialChoicesByLayer.value = {}
  catalogSelectionError.value = ''
  await catalogBrowser.openPackageDetail(packageId)
  if (catalogBrowser.packageDetailState !== 'succeeded' || !activeCatalogGroup.value) return
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
  packageMaterialChoicesByLayer.value = {}
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

function choosePackageMaterial(row: QuotationPackageMaterialRead): void {
  const choice = quotationPackageMaterialChoiceFor(row)
  if (!choice || !canChoosePackageMaterial(row, [row])) return
  packageMaterialChoicesByLayer.value = {
    ...packageMaterialChoicesByLayer.value,
    [quotationPackageLayerKey(choice.layer)]: choice,
  }
}

function commitPackageConfiguration(): void {
  const packageId = currentPackageId.value
  const groupId = activeCatalogGroupId.value
  if (!packageId || !groupId) return
  const result = workspace.configureQuotationPackageSelection(groupId, packageId, packageMaterialChoices.value)
  if (result.state === 'succeeded') {
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

function catalogMetadata(item: QuotationCatalogItemRead): string {
  const parts: string[] = []
  if ((item.kind === 'package' || item.kind === 'material') && item.code) parts.push(`编码：${item.code}`)
  if (item.specification) parts.push(`规格：${item.specification}`)
  if (item.unit) parts.push(`单位：${item.unit}`)
  return parts.length ? parts.join(' · ') : kindLabels[item.kind]
}
</script>

<style>
.quotation-content { margin-top: var(--app-space-md); }
.quotation-content__heading { display: flex; flex-direction: column; margin: 0 var(--app-space-xs) var(--app-space-md); }
.quotation-content__eyebrow { color: var(--app-color-text-secondary); font-size: var(--app-font-meta); }
.quotation-content__title { color: var(--app-color-text-primary); font-size: var(--app-font-section-title); font-weight: 800; margin-top: var(--app-space-xs); }
.quotation-content__description { color: var(--app-color-text-secondary); font-size: var(--app-font-body); line-height: 1.5; margin-top: var(--app-space-xs); }
.quotation-content__panel { padding: var(--app-card-padding); }
.quotation-content__panel-header { align-items: flex-start; border-bottom: 1rpx solid var(--app-color-divider); display: flex; justify-content: space-between; padding-bottom: var(--app-space-md); }
.quotation-content__panel-title { color: var(--app-color-text-primary); display: block; font-size: var(--app-font-field-label); font-weight: 800; }
.quotation-content__line-count { color: var(--app-color-text-secondary); display: block; font-size: var(--app-font-meta); margin-top: var(--app-space-xs); }
.quotation-content__local-tag, .quotation-content__kind-tag { background: var(--app-color-primary-soft); border-radius: var(--app-radius-control); color: var(--app-color-primary); flex-shrink: 0; font-size: var(--app-font-meta); padding: var(--app-space-xs) var(--app-space-sm); }
.quotation-content__local-status { margin-top: var(--app-space-sm); }
.quotation-content__engine { background: var(--app-color-primary-soft); border: 1rpx solid var(--app-color-primary-border); border-radius: var(--app-radius-control); margin-top: var(--app-space-md); padding: var(--app-space-md); }
.quotation-content__engine-total { align-items: center; display: flex; justify-content: space-between; }
.quotation-content__engine-label, .quotation-content__engine-note { color: var(--app-color-text-secondary); display: block; font-size: var(--app-font-meta); line-height: 1.5; }
.quotation-content__engine-amount { color: var(--app-color-text-primary); font-size: var(--app-font-value); font-weight: 800; }
.quotation-content__engine-blocked { margin-top: var(--app-space-xs); }
.quotation-content__engine-issue { color: var(--app-color-text-secondary); display: block; font-size: var(--app-font-meta); line-height: 1.5; margin-top: var(--app-space-xs); }
.quotation-content__engine-note { margin-top: var(--app-space-xs); }
.quotation-content__submission { border-top: 1rpx solid var(--app-color-divider); display: flex; flex-direction: column; gap: var(--app-space-sm); margin-top: var(--app-space-md); padding-top: var(--app-space-md); }
.quotation-content__submitted-document { color: var(--app-color-primary); font-size: var(--app-font-body); }
.quotation-content__empty { align-items: center; display: flex; flex-direction: column; padding: 48rpx var(--app-space-sm) 16rpx; text-align: center; }
.quotation-content__empty-mark { align-items: center; background: var(--app-color-primary-soft); border-radius: 999rpx; color: var(--app-color-primary); display: flex; font-size: 46rpx; height: 80rpx; justify-content: center; width: 80rpx; }
.quotation-content__empty-title, .quotation-content__blocked-title { color: var(--app-color-text-primary); display: block; font-size: var(--app-font-value); font-weight: 800; margin-top: var(--app-space-md); }
.quotation-content__copy { color: var(--app-color-text-secondary); display: block; font-size: var(--app-font-body); line-height: 1.6; margin-top: var(--app-space-sm); }
.quotation-content__add-button { margin-top: var(--app-space-md); }
.quotation-content__add-button--outline { border-style: dashed; }
.quotation-content__add-group-button { margin-top: var(--app-space-md); }
.quotation-content__add-group-button--outline { border-style: dashed; }
.quotation-content__groups { display: flex; flex-direction: column; gap: var(--app-space-md); padding-top: var(--app-space-md); }
.quotation-content__group { padding: var(--app-card-padding); }
.quotation-content__group-heading, .quotation-content__group-section-heading { align-items: center; display: flex; justify-content: space-between; }
.quotation-content__group-heading { align-items: flex-start; border-bottom: 1rpx solid var(--app-color-divider); padding-bottom: var(--app-space-sm); }
.quotation-content__group-eyebrow { color: var(--app-color-text-secondary); display: block; font-size: var(--app-font-meta); }
.quotation-content__group-title { color: var(--app-color-text-primary); display: block; font-size: var(--app-font-field-label); font-weight: 800; margin-top: var(--app-space-xs); }
.quotation-content__group-subtotal { color: var(--app-color-primary); display: block; font-size: var(--app-font-meta); font-weight: 700; margin-top: var(--app-space-xs); }
.quotation-content__group-context { display: flex; flex-direction: column; gap: var(--app-space-sm); padding: var(--app-space-md) 0; }
.quotation-content__context-label { color: var(--app-color-text-secondary); display: block; font-size: var(--app-font-meta); font-weight: 700; }
.quotation-content__group-fields { display: grid; gap: var(--app-space-sm); grid-template-columns: 1fr; }
.quotation-content__context-field { display: flex; flex-direction: column; gap: var(--app-space-xs); min-width: 0; }
.quotation-content__context-input { background: var(--app-color-control-surface); border: 1rpx solid var(--app-color-border-control); border-radius: var(--app-radius-control); box-sizing: border-box; color: var(--app-color-text-primary); font-size: var(--app-font-body); min-height: 76rpx; padding: var(--app-space-sm); width: 100%; }
.quotation-content__context-input--multiline { min-height: 112rpx; }
.quotation-content__group-section { border-top: 1rpx solid var(--app-color-divider); padding-top: var(--app-space-md); }
.quotation-content__group-section + .quotation-content__group-section { margin-top: var(--app-space-sm); }
.quotation-content__browse-catalog { min-height: 40px; }
.quotation-content__selection { border-top: 1rpx solid var(--app-color-divider); margin-top: var(--app-space-sm); padding-top: var(--app-space-sm); }
.quotation-content__empty-section { color: var(--app-color-text-muted); display: block; font-size: var(--app-font-meta); padding: var(--app-space-sm) 0; }
.quotation-content__lines { display: flex; flex-direction: column; gap: var(--app-space-sm); padding-top: var(--app-space-md); }
.quotation-content__line { padding: var(--app-space-md); }
.quotation-content__line-heading { align-items: flex-start; display: flex; gap: var(--app-space-sm); justify-content: space-between; }
.quotation-content__line-title-wrap { align-items: flex-start; display: flex; flex: 1; gap: var(--app-space-sm); min-width: 0; }
.quotation-content__line-index { color: var(--app-color-text-secondary); flex-shrink: 0; font-size: var(--app-font-meta); font-weight: 800; padding-top: 3rpx; }
.quotation-content__line-title { color: var(--app-color-text-primary); flex: 1; font-size: var(--app-font-field-label); font-weight: 700; line-height: 1.4; min-width: 0; overflow-wrap: anywhere; }
.quotation-content__line-controls { align-items: center; display: grid; gap: var(--app-space-xs) var(--app-space-sm); grid-template-columns: auto minmax(100rpx, 1fr) auto; margin-top: var(--app-space-md); }
.quotation-content__quantity-label { color: var(--app-color-text-secondary); font-size: var(--app-font-meta); }
.quotation-content__quantity-wrap { align-items: center; background: var(--app-color-control-surface); border: 1rpx solid var(--app-color-border-control); border-radius: var(--app-radius-control); box-sizing: border-box; display: flex; min-height: 76rpx; min-width: 0; padding: 0 var(--app-space-sm); }
.quotation-content__quantity-wrap--error { border-color: var(--app-color-danger); }
.quotation-content__quantity { background: transparent; border: 0; box-sizing: border-box; color: var(--app-color-text-primary); flex: 1; font-size: var(--app-font-body); min-width: 0; outline: none; padding: var(--app-space-sm) 0; }
.quotation-content__quantity-error { color: var(--app-color-danger); font-size: var(--app-font-meta); grid-column: 2 / 4; line-height: 1.4; }
.quotation-content__unit { color: var(--app-color-text-secondary); flex-shrink: 0; font-size: var(--app-font-meta); padding-left: var(--app-space-xs); }
.quotation-content__remove-button { grid-column: 3; min-height: 44px; }
.quotation-content__blocked { padding-top: var(--app-space-md); }
.quotation-content__blocked-title { margin-top: 0; }
.quotation-content__secondary-action, .quotation-content__retry { margin-top: var(--app-space-md); }
.quotation-content__catalog-backdrop { align-items: flex-end; background: rgba(20, 32, 52, .42); display: flex; inset: 0; justify-content: center; position: fixed; z-index: 1000; }
.quotation-content__catalog-sheet { background: var(--app-color-page); border-radius: var(--app-radius-card) var(--app-radius-card) 0 0; box-sizing: border-box; display: flex; flex-direction: column; max-height: 82vh; max-width: 640px; padding: var(--app-space-sm) var(--app-page-gutter) var(--app-space-md); padding-bottom: calc(var(--app-space-md) + constant(safe-area-inset-bottom)); padding-bottom: calc(var(--app-space-md) + env(safe-area-inset-bottom)); width: 100%; }
.quotation-content__catalog-handle { align-self: center; background: var(--app-color-border); border-radius: 99px; height: 8rpx; margin: 0 auto var(--app-space-md); width: 72rpx; }
.quotation-content__catalog-heading { align-items: flex-start; display: flex; justify-content: space-between; }
.quotation-content__catalog-title { color: var(--app-color-text-primary); display: block; font-size: var(--app-font-section-title); font-weight: 800; }
.quotation-content__catalog-subtitle { color: var(--app-color-text-secondary); display: block; font-size: var(--app-font-meta); margin-top: var(--app-space-xs); }
.quotation-content__catalog-close { min-height: 44px; }
.quotation-content__category-grid { display: grid; gap: var(--app-space-xs); grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: var(--app-space-md); }
.quotation-content__category { min-height: 48px; padding-left: 4rpx; padding-right: 4rpx; }
.quotation-content__catalog-browser { display: flex; flex: 1; flex-direction: column; min-height: 0; }
.quotation-content__catalog-state { margin-top: var(--app-space-md); }
.quotation-content__catalog-list, .quotation-content__package-detail { flex: 1; margin-top: var(--app-space-sm); min-height: 100rpx; }
.quotation-content__package-detail { box-sizing: border-box; }
.quotation-content__catalog-item { align-items: center; background: var(--app-color-surface); border: 1rpx solid var(--app-color-border); border-radius: var(--app-radius-control); box-sizing: border-box; display: flex; justify-content: space-between; margin-bottom: var(--app-space-sm); min-height: 92rpx; padding: var(--app-space-sm) var(--app-space-md); width: 100%; }
.quotation-content__catalog-item-copy { display: flex; flex: 1; flex-direction: column; min-width: 0; }
.quotation-content__catalog-item-title { font-size: var(--app-font-body); font-weight: 700; overflow-wrap: anywhere; }
.quotation-content__catalog-item-meta { color: var(--app-color-text-secondary); font-size: var(--app-font-meta); margin-top: var(--app-space-xs); }
.quotation-content__catalog-readonly { color: var(--app-color-text-muted); flex-shrink: 0; font-size: var(--app-font-meta); margin-left: var(--app-space-sm); }
.quotation-content__package-detail-content { padding: var(--app-space-sm) 0 var(--app-space-lg); }
.quotation-content__package-detail-title { color: var(--app-color-text-primary); display: block; font-size: var(--app-font-value); font-weight: 800; margin-top: var(--app-space-sm); }
.quotation-content__package-detail-note { color: var(--app-color-text-secondary); display: block; font-size: var(--app-font-meta); margin-top: var(--app-space-xs); }
.quotation-content__package-summary { background: var(--app-color-control-surface); border-radius: var(--app-radius-control); display: flex; flex-direction: column; gap: var(--app-space-xs); margin-top: var(--app-space-sm); padding: var(--app-space-sm); }
.quotation-content__package-summary-title { color: var(--app-color-text-primary); font-size: var(--app-font-meta); font-weight: 700; }
.quotation-content__package-summary-row { color: var(--app-color-text-secondary); display: block; font-size: var(--app-font-meta); line-height: 1.4; }
.quotation-content__material-choice { display: block; margin-top: var(--app-space-xs); text-align: left; width: 100%; }
.quotation-content__package-config-status { margin-top: var(--app-space-md); }
.quotation-content__package-config-commit { margin-top: var(--app-space-md); }
.quotation-content__detail-section { border-top: 1rpx solid var(--app-color-divider); margin-top: var(--app-space-md); padding-top: var(--app-space-md); }
.quotation-content__detail-heading { color: var(--app-color-text-primary); display: block; font-size: var(--app-font-field-label); font-weight: 800; }
.quotation-content__detail-row { color: var(--app-color-text-secondary); display: block; font-size: var(--app-font-body); line-height: 1.5; margin-top: var(--app-space-sm); }
.quotation-content__layer-group { background: var(--app-color-surface); border-radius: var(--app-radius-control); margin-top: var(--app-space-sm); padding: var(--app-space-sm); }
.quotation-content__layer-heading { color: var(--app-color-primary); display: block; font-size: var(--app-font-meta); font-weight: 800; }
</style>
