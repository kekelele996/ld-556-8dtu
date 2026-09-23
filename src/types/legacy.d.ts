import type { LegacyStatus, LegacyType } from '@/constants/enums'

export type { LegacyStatus }

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
  version: number
  receipts: LegacyReceipt[]
  createdAt: string
}
