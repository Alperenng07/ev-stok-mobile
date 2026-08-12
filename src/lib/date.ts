export function todayISO(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseISO(iso: string): Date {
  return new Date(`${iso}T12:00:00`)
}

export function formatShortTR(iso: string): string {
  return parseISO(iso).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'short',
  })
}

export function isOverdue(iso: string, purchased: boolean): boolean {
  return !purchased && iso < todayISO()
}

export function daysUntil(iso: string): number {
  const a = parseISO(todayISO()).getTime()
  const b = parseISO(iso).getTime()
  return Math.round((b - a) / (1000 * 60 * 60 * 24))
}
