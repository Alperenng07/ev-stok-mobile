import type { SavingsEntry, SavingsPeriod } from '../types/savings'

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function periodStart(period: SavingsPeriod, now = new Date()): Date | null {
  if (period === 'all') return null
  const today = startOfDay(now)
  if (period === 'day') return today
  if (period === 'week') {
    const day = today.getDay()
    const mondayOffset = day === 0 ? -6 : 1 - day
    const start = new Date(today)
    start.setDate(today.getDate() + mondayOffset)
    return start
  }
  if (period === 'month') return new Date(today.getFullYear(), today.getMonth(), 1)
  return new Date(today.getFullYear(), 0, 1)
}

export function filterByPeriod(entries: SavingsEntry[], period: SavingsPeriod): SavingsEntry[] {
  const start = periodStart(period)
  if (!start) return entries
  const t = start.getTime()
  return entries.filter((e) => new Date(e.createdAt).getTime() >= t)
}

export function entrySaved(e: SavingsEntry): number {
  return e.savedAmount ?? e.amount ?? 0
}

export function entryMissed(e: SavingsEntry): number {
  return e.missedAmount ?? 0
}

export function sumSaved(entries: SavingsEntry[]): number {
  return Math.round(entries.reduce((s, e) => s + entrySaved(e), 0) * 100) / 100
}

export function sumMissed(entries: SavingsEntry[]): number {
  return Math.round(entries.reduce((s, e) => s + entryMissed(e), 0) * 100) / 100
}

/** Trend için net = saved (kaçırılan ayrı gösterilir) */
export function sumAmount(entries: SavingsEntry[]): number {
  return sumSaved(entries)
}

export function periodLabel(period: SavingsPeriod): string {
  switch (period) {
    case 'day':
      return 'Bugün'
    case 'week':
      return 'Bu hafta'
    case 'month':
      return 'Bu ay'
    case 'year':
      return 'Bu yıl'
    default:
      return 'Tüm zamanlar'
  }
}

export function buildTrend(
  entries: SavingsEntry[],
  mode: 'week' | 'month' | 'year',
): { label: string; amount: number }[] {
  const now = new Date()
  if (mode === 'week') {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now)
      d.setDate(now.getDate() - (6 - i))
      const key = d.toISOString().slice(0, 10)
      const amount = sumSaved(entries.filter((e) => e.createdAt.slice(0, 10) === key))
      return {
        label: d.toLocaleDateString('tr-TR', { weekday: 'short' }),
        amount,
      }
    })
  }
  if (mode === 'month') {
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
      const amount = sumSaved(
        entries.filter((e) => {
          const ed = new Date(e.createdAt)
          return ed.getFullYear() === d.getFullYear() && ed.getMonth() === d.getMonth()
        }),
      )
      return {
        label: d.toLocaleDateString('tr-TR', { month: 'short' }),
        amount,
      }
    })
  }
  return Array.from({ length: 4 }, (_, i) => {
    const year = now.getFullYear() - (3 - i)
    const amount = sumSaved(entries.filter((e) => new Date(e.createdAt).getFullYear() === year))
    return { label: String(year), amount }
  })
}
