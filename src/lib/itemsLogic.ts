import type { StockItem } from '../types'
import { todayISO } from './date'

export function renewDueItems(items: StockItem[]): StockItem[] {
  const today = todayISO()
  let changed = false
  const next = items.map((item) => {
    if (item.purchased && item.renewalDays && item.renewalDays > 0 && item.dueDate <= today) {
      changed = true
      return {
        ...item,
        purchased: false,
        purchasedPlaceId: null,
        purchasedPlaceLabel: null,
        updatedAt: new Date().toISOString(),
      }
    }
    return item
  })
  return changed ? next : items
}

export function makeInviteCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return code
}
