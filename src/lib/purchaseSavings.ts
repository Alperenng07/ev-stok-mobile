import type { PricedLine } from '../types/budget'

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export type PurchaseSavingsResult = {
  paidUnitPrice: number
  qty: number
  savedAmount: number
  missedAmount: number
  minUnitPrice: number
  maxUnitPrice: number
  catalogName: string | null
}

/** Alınan market teklifine göre yapılan / kaçırılan tasarruf. */
export function computePurchaseSavings(
  line: PricedLine,
  placeId: string,
): PurchaseSavingsResult | null {
  if (placeId === 'other' || !line.matched || line.offers.length === 0) return null

  const paid = line.offers.find((o) => o.chainId === placeId)
  if (!paid) return null

  const prices = line.offers.map((o) => o.unitPrice)
  const minUnitPrice = Math.min(...prices)
  const maxUnitPrice = Math.max(...prices)
  const qty = Math.max(line.qty, 1)

  return {
    paidUnitPrice: paid.unitPrice,
    qty,
    savedAmount: round2(Math.max(0, (maxUnitPrice - paid.unitPrice) * qty)),
    missedAmount: round2(Math.max(0, (paid.unitPrice - minUnitPrice) * qty)),
    minUnitPrice,
    maxUnitPrice,
    catalogName: line.catalogName,
  }
}
