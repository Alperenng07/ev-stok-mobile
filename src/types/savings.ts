export type SavingsPeriod = 'day' | 'week' | 'month' | 'year' | 'all'

/** Tek ürün alındığında otomatik oluşan bilanço kaydı */
export type SavingsEntry = {
  id: string
  createdAt: string
  familyId: string
  userId: string
  itemId: string
  itemName: string
  placeId: string
  placeLabel: string
  /** Ödenen birim fiyat */
  paidUnitPrice: number
  qty: number
  /** En pahalıya göre yapılan tasarruf (max - paid) * qty */
  savedAmount: number
  /** En ucuza göre kaçırılan tasarruf (paid - min) * qty */
  missedAmount: number
  minUnitPrice: number
  maxUnitPrice: number
  catalogName: string | null
  locationLabel: string
  /** Eski manuel kayıtlar için geriye dönük alanlar */
  planTitle?: string
  comparedAgainst?: string
  note?: string
  itemCount?: number
  amount?: number
}
