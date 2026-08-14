import AsyncStorage from '@react-native-async-storage/async-storage'
import type { SavingsEntry } from '../types/savings'

const KEY = 'evstok.savings'

function normalizeEntry(raw: Partial<SavingsEntry> & { id?: string }): SavingsEntry | null {
  if (!raw.id) return null
  return {
    id: raw.id,
    createdAt: raw.createdAt ?? new Date().toISOString(),
    familyId: raw.familyId ?? '',
    userId: raw.userId ?? '',
    itemId: raw.itemId ?? '',
    itemName: raw.itemName ?? raw.planTitle ?? 'Ürün',
    placeId: raw.placeId ?? 'other',
    placeLabel: raw.placeLabel ?? '—',
    paidUnitPrice: raw.paidUnitPrice ?? 0,
    qty: raw.qty ?? raw.itemCount ?? 1,
    savedAmount: raw.savedAmount ?? raw.amount ?? 0,
    missedAmount: raw.missedAmount ?? 0,
    minUnitPrice: raw.minUnitPrice ?? 0,
    maxUnitPrice: raw.maxUnitPrice ?? 0,
    catalogName: raw.catalogName ?? null,
    locationLabel: raw.locationLabel ?? '',
    planTitle: raw.planTitle,
    comparedAgainst: raw.comparedAgainst,
    note: raw.note,
    itemCount: raw.itemCount,
    amount: raw.amount,
  }
}

export const savingsStore = {
  async list(): Promise<SavingsEntry[]> {
    const raw = await AsyncStorage.getItem(KEY)
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw) as Partial<SavingsEntry>[]
      if (!Array.isArray(parsed)) return []
      return parsed.map(normalizeEntry).filter((e): e is SavingsEntry => e != null)
    } catch {
      return []
    }
  },

  async saveAll(entries: SavingsEntry[]): Promise<void> {
    await AsyncStorage.setItem(KEY, JSON.stringify(entries))
  },

  async add(entry: SavingsEntry): Promise<void> {
    const list = await this.list()
    list.unshift(entry)
    await this.saveAll(list)
  },

  async remove(id: string): Promise<void> {
    const list = await this.list()
    await this.saveAll(list.filter((e) => e.id !== id))
  },
}
