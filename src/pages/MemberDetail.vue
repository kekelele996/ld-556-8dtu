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
      <h2>遗产规划 · 本人名下</h2>
      <n-empty v-if="!ownedPlans.length" description="暂无本人名下的遗产规划" />
      <n-list v-else>
        <n-list-item v-for="plan in ownedPlans" :key="plan.id">
          <div class="plan-row">
            <n-tag :type="statusTagType[plan.status]">{{ legacyStatusLabels[plan.status] }}</n-tag>
            <span>{{ legacyTypeLabels[plan.type] }} · v{{ plan.version }} · {{ plan.content }}</span>
          </div>
          <p v-if="plan.status !== LegacyStatus.DRAFT" class="receipt-hint">
            回执进度 {{ legacy.currentReceipts(plan).length }}/{{ plan.beneficiaries.length }}
            <template v-if="legacy.pendingBeneficiaries(plan).length">，待确认：{{ pendingNames(plan) }}</template>
            <template v-else>，全部受益人已确认</template>
          </p>
        </n-list-item>
      </n-list>
    </section>
    <section class="panel">
      <h2>遗产规划 · 待我回执</h2>
      <n-empty v-if="!beneficiaryPlans.length" description="暂无作为受益人的遗产规划" />
      <n-list v-else>
        <n-list-item v-for="plan in beneficiaryPlans" :key="plan.id">
          <div class="plan-row">
            <n-tag :type="statusTagType[plan.status]">{{ legacyStatusLabels[plan.status] }}</n-tag>
            <span>{{ legacyTypeLabels[plan.type] }} · v{{ plan.version }} · {{ plan.content }}</span>
          </div>
          <div class="plan-row">
            <n-button v-if="awaitingMe(plan)" type="primary" size="small" @click="legacy.confirmReceipt(plan.id, member.id)">确认收到</n-button>
            <span v-else-if="legacy.hasConfirmed(plan, member.id)" class="receipt-hint">已确认收到（{{ confirmedAt(plan) }}）</span>
            <span v-else class="receipt-hint">{{ plan.status === LegacyStatus.DRAFT ? '规划尚未定稿，无需回执' : '当前状态无需回执' }}</span>
          </div>
        </n-list-item>
      </n-list>
    </section>
  </section>
  <EmptyState v-else title="成员不存在" description="请回到家谱树选择一个有效成员。" />
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import MemberAvatar from '@/components/common/MemberAvatar.vue'
import TimelineView from '@/components/common/TimelineView.vue'
import MediaGallery from '@/components/common/MediaGallery.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { useFamily } from '@/hooks/useFamily'
import { useStory } from '@/hooks/useStory'
import { usePhoto } from '@/hooks/usePhoto'
import { useLegacyStore } from '@/stores/legacyStore'
import { LegacyStatus, genderLabels, legacyStatusLabels, legacyTypeLabels } from '@/constants/enums'
import type { LegacyPlan } from '@/types/legacy'
import { lifeYears } from '@/utils/member-status'

const route = useRoute()
const { hydrate, getById, relations } = useFamily()
const story = useStory()
const photo = usePhoto()
const legacy = useLegacyStore()
const member = computed(() => getById(String(route.params.id)))
const storyItems = computed(() => story.byMember(String(route.params.id)).map((item) => ({ id: item.id, title: item.title, description: item.content, date: item.date })))
const galleryItems = computed(() => photo.byMember(String(route.params.id)).map((item) => ({ id: item.id, url: item.restoredUrl || item.imageUrl, caption: item.caption, year: item.year, meta: item.location })))
const ownedPlans = computed(() => legacy.plans.filter((plan) => plan.memberId === String(route.params.id)))
const beneficiaryPlans = computed(() => legacy.plans.filter((plan) => plan.beneficiaries.includes(String(route.params.id))))

const statusTagType: Record<LegacyStatus, 'default' | 'info' | 'success' | 'warning'> = {
  [LegacyStatus.DRAFT]: 'default',
  [LegacyStatus.FINALIZED]: 'info',
  [LegacyStatus.DELIVERED]: 'success',
  [LegacyStatus.ARCHIVED]: 'warning'
}

function awaitingMe(plan: LegacyPlan) {
  return plan.status === LegacyStatus.FINALIZED && !legacy.hasConfirmed(plan, String(route.params.id))
}

function pendingNames(plan: LegacyPlan) {
  return legacy.pendingBeneficiaries(plan).map((id) => getById(id)?.name || '未知').join('、')
}

function confirmedAt(plan: LegacyPlan) {
  const receipt = plan.receipts.find((item) => item.beneficiaryId === String(route.params.id) && item.version === plan.version)
  return receipt ? receipt.confirmedAt.slice(0, 10) : ''
}

onMounted(async () => {
  await Promise.all([hydrate(), story.hydrate(), photo.hydrate(), legacy.hydrate()])
})
</script>
