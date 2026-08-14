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

export type PricedLine = {
  itemId: string
  itemName: string
  qty: number
  unit: string
  catalogId: string | null
  catalogName: string | null
  matched: boolean
  offers: {
    chainId: MarketChainId
    chainName: string
    storeName: string
    distanceKm: number
    unitPrice: number
    lineTotal: number
    indexTime?: string
  }[]
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
  /** Bu markette yoksa başka yerdeki en ucuz alternatif */
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
  /** Sadece bu planda bulunan ürünlerin toplamı */
  total: number
  storeCount: number
  availableCount: number
  missingCount: number
  lines: PlanLine[]
  missingItems: MissingPlanItem[]
  /** Geriye dönük kısa isim listesi */
  missingNames: string[]
}

export type BudgetResult = {
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
