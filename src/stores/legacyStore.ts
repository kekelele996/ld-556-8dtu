import { defineStore } from 'pinia'
import { ref } from 'vue'
import { defaultLegacyPlans } from '@/constants/default-templates'
import { LegacyStatus } from '@/constants/enums'
import type { LegacyPlan, LegacyStatus as LegacyStatusType } from '@/types/legacy'
import { readLegacyPlans, writeLegacyPlans } from '@/db/legacy-db'

function normalizePlan(plan: LegacyPlan): LegacyPlan {
  return { ...plan, version: plan.version ?? 1, receipts: plan.receipts ?? [] }
}

export const useLegacyStore = defineStore('legacy', () => {
  const plans = ref<LegacyPlan[]>([])
  const loading = ref(false)

  async function hydrate() {
    loading.value = true
    try {
      const stored = await readLegacyPlans()
      plans.value = stored.length ? stored.map(normalizePlan) : defaultLegacyPlans
      if (!stored.length) await persist()
    } finally {
      loading.value = false
    }
  }

  async function persist() {
    await writeLegacyPlans(plans.value)
  }

  async function savePlan(plan: LegacyPlan) {
    const existing = plans.value.find((item) => item.id === plan.id)
    let next = normalizePlan(plan)
    if (existing && existing.content !== next.content) {
      // 内容修改后版本号递增，旧版本回执随之作废；已交接的规划退回已定稿重新等待确认
      next = {
        ...next,
        version: existing.version + 1,
        status: existing.status === LegacyStatus.DELIVERED ? LegacyStatus.FINALIZED : next.status
      }
    }
    plans.value = existing ? plans.value.map((item) => (item.id === plan.id ? next : item)) : [next, ...plans.value]
    await persist()
  }

  async function changeStatus(id: string, status: LegacyStatusType) {
    plans.value = plans.value.map((plan) => (plan.id === id ? { ...plan, status } : plan))
    await persist()
  }

  function currentReceipts(plan: LegacyPlan) {
    return plan.receipts.filter((receipt) => receipt.version === plan.version && plan.beneficiaries.includes(receipt.beneficiaryId))
  }

  function pendingBeneficiaries(plan: LegacyPlan) {
    return plan.beneficiaries.filter((id) => !plan.receipts.some((receipt) => receipt.beneficiaryId === id && receipt.version === plan.version))
  }

  function hasConfirmed(plan: LegacyPlan, beneficiaryId: string) {
    return plan.receipts.some((receipt) => receipt.beneficiaryId === beneficiaryId && receipt.version === plan.version)
  }

  async function confirmReceipt(planId: string, beneficiaryId: string) {
    const plan = plans.value.find((item) => item.id === planId)
    if (!plan || plan.status !== LegacyStatus.FINALIZED) return
    if (!plan.beneficiaries.includes(beneficiaryId) || hasConfirmed(plan, beneficiaryId)) return
    const receipts = [...plan.receipts, { beneficiaryId, version: plan.version, confirmedAt: new Date().toISOString() }]
    const allConfirmed = plan.beneficiaries.length > 0 && plan.beneficiaries.every((id) => receipts.some((receipt) => receipt.beneficiaryId === id && receipt.version === plan.version))
    const status = allConfirmed ? LegacyStatus.DELIVERED : plan.status
    plans.value = plans.value.map((item) => (item.id === planId ? { ...plan, receipts, status } : item))
    await persist()
  }

  function byMember(memberId: string) {
    return plans.value.filter((plan) => plan.memberId === memberId || plan.beneficiaries.includes(memberId))
  }

  return { plans, loading, hydrate, persist, savePlan, changeStatus, confirmReceipt, currentReceipts, pendingBeneficiaries, hasConfirmed, byMember }
})
