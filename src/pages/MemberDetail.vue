<template>
  <section v-if="member" class="detail-page">
    <div class="profile-hero">
      <MemberAvatar :member="member" size="lg" :deceased="Boolean(member.deathDate)" />
      <div>
        <p>成员档案</p>
        <h1>{{ member.name }}</h1>
        <span>{{ genderLabels[member.gender] }} · {{ lifeYears(member) }} · {{ member.birthPlace || '籍贯未知' }}</span>
      </div>
    </div>
    <n-grid :cols="2" :x-gap="18" :y-gap="18" responsive="screen">
      <n-gi>
        <section class="panel"><h2>个人简介</h2><p>{{ member.bio }}</p></section>
        <section class="panel"><h2>关联成员</h2><p>父母：{{ relations(member.id).parent?.name || '未记录' }}</p><p>配偶：{{ relations(member.id).spouses.map((item) => item.name).join('、') || '未记录' }}</p><p>子女：{{ relations(member.id).children.map((item) => item.name).join('、') || '未记录' }}</p></section>
      </n-gi>
      <n-gi>
        <section class="panel"><h2>家族故事</h2><TimelineView :items="storyItems" /></section>
      </n-gi>
    </n-grid>
    <section class="panel"><h2>老照片</h2><MediaGallery :items="galleryItems" /></section>

    <section class="panel">
      <h2>遗产规划 · 本人订立</h2>
      <n-list v-if="ownedPlans.length" bordered>
        <n-list-item v-for="plan in ownedPlans" :key="plan.id">
          <div class="plan-block">
            <div class="plan-line">
              <n-tag size="small" :bordered="false">{{ legacyTypeLabels[plan.type] }}</n-tag>
              <n-tag size="small" :bordered="false" :type="legacyStatusTagTypes[plan.status]">{{ legacyStatusLabels[plan.status] }}</n-tag>
              <span class="plan-version">第 {{ plan.version }} 版</span>
              <n-space size="small">
                <n-button v-if="plan.status === 'draft'" size="tiny" type="primary" @click="legacy.finalizePlan(plan.id)">定稿</n-button>
                <n-button size="tiny" @click="openEditor(plan)">{{ plan.status === 'archived' ? '查看' : '编辑' }}</n-button>
              </n-space>
            </div>
            <p class="plan-content">{{ plan.content }}</p>
            <LegacyReceiptPanel v-if="plan.status === 'finalized' || plan.status === 'handed_over'" :plan="plan" :viewer-id="memberId" />
          </div>
        </n-list-item>
      </n-list>
      <n-empty v-else description="该成员还没有订立遗产规划。" />
    </section>

    <section class="panel">
      <h2>遗产规划 · 本人受益</h2>
      <n-list v-if="beneficiaryPlans.length" bordered>
        <n-list-item v-for="plan in beneficiaryPlans" :key="plan.id">
          <div class="plan-block">
            <div class="plan-line">
              <n-tag size="small" :bordered="false">{{ legacyTypeLabels[plan.type] }}</n-tag>
              <span class="plan-owner">{{ getById(plan.memberId)?.name || '未知成员' }} 订立</span>
              <n-tag size="small" :bordered="false" :type="myReceipt(plan) ? 'success' : 'warning'">{{ myReceipt(plan) ? '本人已确认' : '待本人确认' }}</n-tag>
            </div>
            <p class="plan-content">{{ plan.content }}</p>
            <LegacyReceiptPanel :plan="plan" :viewer-id="memberId" @confirm="() => legacy.confirmReceipt(plan.id, memberId)" />
          </div>
        </n-list-item>
      </n-list>
      <n-empty v-else description="没有指定该成员为受益人的遗产规划。" />
    </section>

    <LegacyPlanEditor v-model:show="editorVisible" :plan="editingPlan" :readonly="editorReadonly" @save="saveEdits" />
  </section>
  <EmptyState v-else title="成员不存在" description="请回到家谱树选择一个有效成员。" />
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { NButton, NEmpty, NList, NListItem, NSpace, NTag } from 'naive-ui'
import MemberAvatar from '@/components/common/MemberAvatar.vue'
import TimelineView from '@/components/common/TimelineView.vue'
import MediaGallery from '@/components/common/MediaGallery.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import LegacyReceiptPanel from '@/components/legacy/LegacyReceiptPanel.vue'
import LegacyPlanEditor from '@/components/legacy/LegacyPlanEditor.vue'
import { useFamily } from '@/hooks/useFamily'
import { useStory } from '@/hooks/useStory'
import { usePhoto } from '@/hooks/usePhoto'
import { useLegacyStore, currentReceipts } from '@/stores/legacyStore'
import { genderLabels, legacyStatusLabels, legacyStatusTagTypes, legacyTypeLabels } from '@/constants/enums'
import type { LegacyPlan, LegacyReceipt } from '@/types/legacy'
import { lifeYears } from '@/utils/member-status'

const route = useRoute()
const { hydrate, getById, relations } = useFamily()
const story = useStory()
const photo = usePhoto()
const legacy = useLegacyStore()
const member = computed(() => getById(String(route.params.id)))
const memberId = computed(() => String(route.params.id))
const storyItems = computed(() => story.byMember(String(route.params.id)).map((item) => ({ id: item.id, title: item.title, description: item.content, date: item.date })))
const galleryItems = computed(() => photo.byMember(String(route.params.id)).map((item) => ({ id: item.id, url: item.restoredUrl || item.imageUrl, caption: item.caption, year: item.year, meta: item.location })))
const ownedPlans = computed(() => legacy.ownedBy(memberId.value))
const beneficiaryPlans = computed(() =>
  legacy.plans.filter(
    (plan) =>
      plan.beneficiaries.includes(memberId.value) &&
      plan.memberId !== memberId.value &&
      (plan.status === 'finalized' || plan.status === 'handed_over')
  )
)

const editorVisible = ref(false)
const editingPlan = ref<LegacyPlan | null>(null)
const editorReadonly = computed(() => editingPlan.value?.status === 'archived')

function myReceipt(plan: LegacyPlan): LegacyReceipt | undefined {
  return currentReceipts(plan).find((receipt) => receipt.beneficiaryId === memberId.value)
}

function openEditor(plan: LegacyPlan) {
  editingPlan.value = plan
  editorVisible.value = true
}

async function saveEdits(patch: { type: LegacyPlan['type']; memberId: string; beneficiaries: string[]; content: string }) {
  if (!editingPlan.value) return
  await legacy.updatePlan(editingPlan.value.id, patch)
}

onMounted(async () => {
  await Promise.all([hydrate(), story.hydrate(), photo.hydrate(), legacy.hydrate()])
})
</script>

<style scoped>
.plan-block {
  width: 100%;
  display: grid;
  gap: 8px;
}
.plan-line {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.plan-version,
.plan-owner {
  font-size: 13px;
  color: #7a6a4f;
}
.plan-content {
  margin: 0;
  font-size: 14px;
  color: #4d4536;
}
</style>
