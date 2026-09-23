import type { LegacyType } from '@/constants/enums'

export type LegacyStatus = 'draft' | 'finalized' | 'handed_over' | 'archived'

/** 受益人对某一版本规划的收到回执 */
export interface LegacyReceipt {
  beneficiaryId: string
  version: number
  confirmedAt: string
}

export interface LegacyPlan {
  id: string
  memberId: string
  type: LegacyType
  content: string
  beneficiaries: string[]
  status: LegacyStatus
  /** 内容或受益人每变更一次，版本号加一，旧回执作废 */
  version: number
  /** 当前及历史版本的收到回执 */
  receipts: LegacyReceipt[]
  createdAt: string
  updatedAt: string
}
