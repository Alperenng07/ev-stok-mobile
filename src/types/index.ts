export type StockItem = {
  id: string
  familyId: string
  name: string
  neededQty: number
  currentQty: number
  unit: string
  dueDate: string
  renewalDays: number | null
  purchased: boolean
  notes: string
  createdBy: string
  createdAt: string
  updatedAt: string
}

export type ItemDraft = {
  name: string
  neededQty: number
  currentQty: number
  unit: string
  dueDate: string
  renewalDays: number | null
  notes: string
}

export type FilterId = 'all' | 'pending' | 'done' | 'overdue'

export type Profile = {
  id: string
  email: string
  displayName: string
  createdAt: string
}

export type Family = {
  id: string
  name: string
  inviteCode: string
  createdBy: string
  createdAt: string
}

export type FamilyMember = {
  id: string
  familyId: string
  userId: string
  role: 'owner' | 'member'
  displayName: string
  email: string
  joinedAt: string
}

export type SessionUser = {
  id: string
  email: string
  displayName: string
}
