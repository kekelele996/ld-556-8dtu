import { defineStore } from 'pinia'
import { ref } from 'vue'
import { defaultLegacyPlans } from '@/constants/default-templates'
import type { LegacyPlan, LegacyReceipt, LegacyStatus } from '@/types/legacy'
import { readLegacyPlans, writeLegacyPlans } from '@/db/legacy-db'

/** 旧记录（无 version/receipts 字段）补齐字段，状态保持原样 */
function normalize(plan: LegacyPlan): LegacyPlan {
  return {
    ...plan,
    version: plan.version ?? 1,
    receipts: Array.isArray(plan.receipts) ? plan.receipts : [],
    updatedAt: plan.updatedAt ?? plan.createdAt
  }
}

/** 当前版本已确认的回执（历史版本的回执视为作废，仅留档） */
export function currentReceipts(plan: LegacyPlan): LegacyReceipt[] {
  return plan.receipts.filter((receipt) => receipt.version === plan.version)
}

export function isReceiptPending(plan: LegacyPlan): boolean {
  if (plan.status !== 'finalized') return false
  return currentReceipts(plan).length < plan.beneficiaries.length
}

export const useLegacyStore = defineStore('legacy', () => {
  const plans = ref<LegacyPlan[]>([])
  const loading = ref(false)

  async function hydrate() {
    loading.value = true
    try {
      const stored = await readLegacyPlans()
      plans.value = stored.length ? stored.map(normalize) : defaultLegacyPlans
      if (!stored.length) await persist()
    } finally {
      loading.value = false
    }
  }

  async function persist() {
    await writeLegacyPlans(plans.value)
  }

  async function createPlan(input: Omit<LegacyPlan, 'id' | 'status' | 'version' | 'receipts' | 'createdAt' | 'updatedAt'>) {
    const now = new Date().toISOString()
    const plan: LegacyPlan = {
      ...input,
      id: crypto.randomUUID(),
      status: 'draft',
      version: 1,
      receipts: [],
      createdAt: now,
      updatedAt: now
    }
    plans.value = [plan, ...plans.value]
    await persist()
    return plan
  }

  /**
   * 修改规划内容。
   * 已定稿（待回执）或已交接的规划，内容/受益人变更后版本号加一、
   * 旧回执作废、状态回到待回执；草稿与已归档规划仅更新内容。
   */
  async function updatePlan(id: string, patch: Partial<Pick<LegacyPlan, 'content' | 'beneficiaries' | 'type' | 'memberId'>>) {
    plans.value = plans.value.map((plan) => {
      if (plan.id !== id) return plan
      const contentChanged = patch.content !== undefined && patch.content !== plan.content
      const beneficiariesChanged = patch.beneficiaries !== undefined && patch.beneficiaries.join('|') !== plan.beneficiaries.join('|')
      const receiptsInvalidated = (plan.status === 'finalized' || plan.status === 'handed_over') && (contentChanged || beneficiariesChanged)
      return {
        ...plan,
        ...patch,
        updatedAt: new Date().toISOString(),
        version: receiptsInvalidated ? plan.version + 1 : plan.version,
        status: receiptsInvalidated ? 'finalized' : plan.status
      }
    })
    await persist()
  }

  /** 草稿定稿：进入待回执，等待每位受益人确认 */
  async function finalizePlan(id: string) {
    plans.value = plans.value.map((plan) => (plan.id === id && plan.status === 'draft' ? { ...plan, status: 'finalized', updatedAt: new Date().toISOString() } : plan))
    await persist()
  }

  /**
   * 受益人确认收到当前版本。
   * 同一受益人对同一版本重复确认不会多记；全部确认后自动进入已交接。
   */
  async function confirmReceipt(id: string, beneficiaryId: string) {
    const plan = plans.value.find((item) => item.id === id)
    if (!plan || plan.status !== 'finalized' || !plan.beneficiaries.includes(beneficiaryId)) return
    if (currentReceipts(plan).some((receipt) => receipt.beneficiaryId === beneficiaryId)) return

    const receipt: LegacyReceipt = { beneficiaryId, version: plan.version, confirmedAt: new Date().toISOString() }
    const receipts = [...plan.receipts, receipt]
    const allConfirmed = currentReceipts({ ...plan, receipts }).length >= plan.beneficiaries.length
    const status: LegacyStatus = allConfirmed ? 'handed_over' : 'finalized'
    plans.value = plans.value.map((item) => (item.id === id ? { ...item, receipts, status, updatedAt: new Date().toISOString() } : item))
    await persist()
  }

  async function changeStatus(id: string, status: LegacyStatus) {
    plans.value = plans.value.map((plan) => (plan.id === id ? { ...plan, status, updatedAt: new Date().toISOString() } : plan))
    await persist()
  }

  function byMember(memberId: string) {
    return plans.value.filter((plan) => plan.memberId === memberId || plan.beneficiaries.includes(memberId))
  }

  /** 成员本人订立的规划 */
  function ownedBy(memberId: string) {
    return plans.value.filter((plan) => plan.memberId === memberId)
  }

  /** 指定受益人为该成员、且仍在等待其本人回执的规划 */
  function pendingFor(beneficiaryId: string) {
    return plans.value.filter((plan) => plan.status === 'finalized' && plan.beneficiaries.includes(beneficiaryId) && !currentReceipts(plan).some((receipt) => receipt.beneficiaryId === beneficiaryId))
  }

  /** 全部待办：仍有受益人未确认的已定稿规划 */
  function pendingReceipts() {
    return plans.value.filter((plan) => isReceiptPending(plan))
  }

  return {
    plans,
    loading,
    hydrate,
    persist,
    createPlan,
    updatePlan,
    finalizePlan,
    confirmReceipt,
    changeStatus,
    byMember,
    ownedBy,
    pendingFor,
    pendingReceipts
  }
})
