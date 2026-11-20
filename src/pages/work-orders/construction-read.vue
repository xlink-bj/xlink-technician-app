<template>
 <view class="construction-page">
  <ConstructionSopWorkspace v-if="sopPort" :port="sopPort" @focused="sopFocused = $event" />
  <ConstructionReadPanel v-if="authorized && !sopFocused" :logs="logs" :state="state" :customer="detail.detail?.customerName || ''" :number="detail.detail?.displayNumber" @retry="load" />
  <view v-if="!authorized" class="construction-blocked"><text>请从当前账号可见工单的施工日志入口重新进入。</text></view>
 </view>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { onLoad, onUnload } from '@dcloudio/uni-app';
import { useSessionStore } from '@shared/state';
import { useWorkOrderDetailStore } from '@features/work-orders/detail';
import { useWorkOrderListStore } from '@features/work-orders/list';
import ConstructionReadPanel from '@features/work-orders/downstream/ConstructionReadPanel.vue';
import ConstructionSopWorkspace from '@features/work-orders/downstream/ConstructionSopWorkspace.vue';
import { constructionSopMockFor } from '@app/dev-construction-sop';
import { constructionReadRequest, parseConstructionLogs, type ConstructionLog } from '@shared/construction-read-contract';
import { constructionMockEnabled, constructionMockReadPort, constructionMockParts } from '@app/dev-construction-read';
import { sessionAuthorizationFingerprint } from '@shared/session-authorization';
const session = useSessionStore(), detail = useWorkOrderDetailStore(), list = useWorkOrderListStore();
const id = ref(''), identity = ref(''), logs = ref<ConstructionLog[]>([]), state = ref<'idle' | 'loading' | 'ready' | 'failed'>('idle');
const currentIdentity = computed(() => { const s = session.session; return sessionAuthorizationFingerprint(s ? { sessionRef: s.sessionRef, userId: s.user.id, roleId: s.currentRole?.id, roleVersion: s.roleVersion } : null); });
const authorized = computed(() => !!session.session && !!identity.value && identity.value === currentIdentity.value && constructionMockEnabled(id.value) && detail.loadState === 'succeeded' && String(detail.detail?.id) === id.value && list.items.some(item => String(item.id) === id.value));
const sopFocused = ref(false);
const sopPageActive = ref(true);
const sopPort = computed(() => {
    const host = id.value;
    return constructionSopMockFor(host, () => session.session,
        () => sopPageActive.value && authorized.value && id.value === host);
});
watch(sopPort, port => { if (!port) sopFocused.value = false; }, { flush: 'sync' });
onUnload(() => { sopPageActive.value = false; });
let generation = 0;
watch(authorized, valid => { if (!valid) {
    generation++;
    logs.value = [];
    state.value = 'idle';
} });
async function load() {
    if (!authorized.value || state.value === 'loading')
        return;
    const ticket = ++generation;
    state.value = 'loading';
    logs.value = [];
    try {
        const result = await constructionMockReadPort.execute(constructionReadRequest(id.value));
        if (ticket !== generation || !authorized.value)
            return;
        logs.value = parseConstructionLogs(result, id.value, constructionMockParts);
        state.value = 'ready';
    }
    catch {
        if (ticket === generation && authorized.value)
            state.value = 'failed';
    }
}
onLoad(options => { id.value = typeof options?.id === 'string' ? options.id : ''; identity.value = currentIdentity.value || ''; void load(); });
</script>
<style scoped lang="scss">
@import '@brand-ui/construction-page.scss';
</style>
