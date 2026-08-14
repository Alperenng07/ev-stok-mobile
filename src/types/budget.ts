export type MarketChainId = string

export type MarketChain = {
  id: MarketChainId
  name: string
  color: string
}

export type NearbyStore = {
  id: string
  chainId: MarketChainId
  name: string
  distanceKm: number
  lat: number
  lng: number
}

export type PricedOffer = {
  chainId: MarketChainId
  chainName: string
  storeName: string
  distanceKm: number
  unitPrice: number
  lineTotal: number
  indexTime?: string
}

/** Aynı liste kalemi için seçilebilir marketfiyati ürün adayları. */
export type ProductCandidate = {
  catalogId: string
  catalogName: string
  matchScore: number
  cheapestPrice: number
  offers: PricedOffer[]
}

export type PricedLine = {
  itemId: string
  itemName: string
  qty: number
  unit: string
  catalogId: string | null
  catalogName: string | null
  matched: boolean
  offers: PricedOffer[]
  /** Kullanıcının seçebileceği alternatif ürünler (seçili olan dahil). */
  candidates: ProductCandidate[]
}

export type PlanLine = {
  itemId: string
  itemName: string
  catalogName: string | null
  qty: number
  unit: string
  chainId: MarketChainId
  chainName: string
  storeName: string
  unitPrice: number
  lineTotal: number
  distanceKm: number
  status: 'available'
}

export type MissingPlanItem = {
  itemId: string
  itemName: string
  catalogName: string | null
  qty: number
  unit: string
  reason: 'not_in_chain' | 'no_match'
  alternative: {
    chainId: MarketChainId
    chainName: string
    storeName: string
    unitPrice: number
    lineTotal: number
    catalogName: string | null
  } | null
}

export type BudgetPlan = {
  id: string
  title: string
  subtitle: string
  kind: 'mixed' | 'single'
  chainId?: MarketChainId
  total: number
  storeCount: number
  availableCount: number
  missingCount: number
  lines: PlanLine[]
  missingItems: MissingPlanItem[]
  missingNames: string[]
}

export type BudgetResult = {
  /** Hangi alışveriş konumuna ait (Ev/İş/anlık). Değişince eski sonuç kullanılmaz. */
  locationKey: string
  locationLabel: string
  location: { lat: number; lng: number }
  stores: NearbyStore[]
  lines: PricedLine[]
  plans: BudgetPlan[]
  bestTotal: number
  worstSingleTotal: number
  potentialSaving: number
  disclaimer: string
  source: 'marketfiyati'
}
