import type { StockItem } from '../types'
import type {
  BudgetPlan,
  BudgetResult,
  MarketChainId,
  MissingPlanItem,
  NearbyStore,
  PlanLine,
  PricedLine,
} from '../types/budget'
import { chainById } from './chains'
import {
  cheapestPerChain,
  pickBestProduct,
  searchProductsForItem,
  type MarketDepotOffer,
} from './marketFiyati'

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function formatTry(n: number): string {
  return `${n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`
}

function offerFromDepot(
  depot: MarketDepotOffer,
  qty: number,
): PricedLine['offers'][number] {
  const chain = chainById(depot.chainId)
  return {
    chainId: depot.chainId,
    chainName: chain.name,
    storeName: depot.depotName,
    distanceKm: depot.distanceKm,
    unitPrice: depot.price,
    lineTotal: round2(depot.price * qty),
    indexTime: depot.indexTime ?? undefined,
  }
}

function collectStores(lines: PricedLine[]): NearbyStore[] {
  const map = new Map<string, NearbyStore>()
  for (const line of lines) {
    for (const offer of line.offers) {
      const id = `${offer.chainId}:${offer.storeName}`
      const prev = map.get(id)
      if (!prev || offer.distanceKm < prev.distanceKm) {
        map.set(id, {
          id,
          chainId: offer.chainId,
          name: `${offer.chainName} · ${offer.storeName}`,
          distanceKm: offer.distanceKm,
          lat: 0,
          lng: 0,
        })
      }
    }
  }
  return [...map.values()].sort((a, b) => a.distanceKm - b.distanceKm)
}

function bestAlternative(line: PricedLine): MissingPlanItem['alternative'] {
  const offer = line.offers[0]
  if (!offer) return null
  return {
    chainId: offer.chainId,
    chainName: offer.chainName,
    storeName: offer.storeName,
    unitPrice: offer.unitPrice,
    lineTotal: offer.lineTotal,
    catalogName: line.catalogName,
  }
}

function buildPlan(options: {
  id: string
  title: string
  subtitle: string
  kind: BudgetPlan['kind']
  chainId?: MarketChainId
  allLines: PricedLine[]
  /** Bu planda alınacak teklifler */
  picks: { line: PricedLine; offer: PricedLine['offers'][number] }[]
}): BudgetPlan {
  const pickIds = new Set(options.picks.map((p) => p.line.itemId))

  const planLines: PlanLine[] = options.picks.map(({ line, offer }) => ({
    itemId: line.itemId,
    itemName: line.itemName,
    catalogName: line.catalogName,
    qty: line.qty,
    unit: line.unit,
    chainId: offer.chainId,
    chainName: offer.chainName,
    storeName: offer.storeName,
    unitPrice: offer.unitPrice,
    lineTotal: offer.lineTotal,
    distanceKm: offer.distanceKm,
    status: 'available',
  }))

  const missingItems: MissingPlanItem[] = options.allLines
    .filter((line) => !pickIds.has(line.itemId))
    .map((line) => ({
      itemId: line.itemId,
      itemName: line.itemName,
      catalogName: line.catalogName,
      qty: line.qty,
      unit: line.unit,
      reason: line.matched && line.offers.length > 0 ? 'not_in_chain' : 'no_match',
      alternative: bestAlternative(line),
    }))

  const total = round2(planLines.reduce((sum, l) => sum + l.lineTotal, 0))
  const storeCount = new Set(planLines.map((l) => `${l.chainId}:${l.storeName}`)).size

  return {
    id: options.id,
    title: options.title,
    subtitle: options.subtitle,
    kind: options.kind,
    chainId: options.chainId,
    total,
    storeCount,
    availableCount: planLines.length,
    missingCount: missingItems.length,
    lines: planLines,
    missingItems,
    missingNames: missingItems.map((m) => m.itemName),
  }
}

/** Anlık konum + marketfiyati.org.tr canlı fiyatlarıyla bütçe planları üretir. */
export async function buildLiveBudgetPlans(options: {
  pendingItems: StockItem[]
  latitude: number
  longitude: number
  locationLabel: string
  distanceKm?: number
}): Promise<BudgetResult> {
  const { pendingItems, latitude, longitude, locationLabel } = options
  const distanceKm = options.distanceKm ?? 5

  const lines: PricedLine[] = []

  for (const item of pendingItems) {
    const qty = Math.max(item.neededQty || 1, 1)
    try {
      const products = await searchProductsForItem({
        itemName: item.name,
        latitude,
        longitude,
        distanceKm,
      })
      const best = pickBestProduct(item.name, products)
      if (!best) {
        lines.push({
          itemId: item.id,
          itemName: item.name,
          qty,
          unit: item.unit,
          catalogId: null,
          catalogName: null,
          matched: false,
          offers: [],
        })
        continue
      }

      const perChain = cheapestPerChain(best)
      lines.push({
        itemId: item.id,
        itemName: item.name,
        qty,
        unit: item.unit,
        catalogId: best.id,
        catalogName: best.title,
        matched: true,
        offers: perChain.map((d) => offerFromDepot(d, qty)),
      })
    } catch {
      lines.push({
        itemId: item.id,
        itemName: item.name,
        qty,
        unit: item.unit,
        catalogId: null,
        catalogName: null,
        matched: false,
        offers: [],
      })
    }
  }

  const matched = lines.filter((l) => l.matched && l.offers.length > 0)

  const mixedPicks = matched
    .map((line) => ({ line, offer: line.offers[0] }))
    .filter((p) => p.offer)

  const mixed = buildPlan({
    id: 'mixed-cheapest',
    title: 'En ucuz karışık plan',
    subtitle: `${mixedPicks.length}/${lines.length} ürün · her biri en ucuz şubeden`,
    kind: 'mixed',
    allLines: lines,
    picks: mixedPicks,
  })

  const chainIds = [...new Set(matched.flatMap((l) => l.offers.map((o) => o.chainId)))]

  const singlePlans = chainIds
    .map((chainId) => {
      const chain = chainById(chainId)
      const picks = matched
        .map((line) => {
          const offer = line.offers.find((o) => o.chainId === chainId)
          return offer ? { line, offer } : null
        })
        .filter((p): p is { line: PricedLine; offer: PricedLine['offers'][number] } => p != null)

      if (picks.length === 0) return null

      return buildPlan({
        id: `single-${chainId}`,
        title: `Hepsi ${chain.name}`,
        subtitle: `${picks.length}/${lines.length} ürün bu zincirde var · ara toplam hesaplanır`,
        kind: 'single',
        chainId,
        allLines: lines,
        picks,
      })
    })
    .filter((p): p is BudgetPlan => p != null)
    .sort((a, b) => a.total - b.total || b.availableCount - a.availableCount)

  const plans = [mixed, ...singlePlans].filter((p) => p.lines.length > 0 || p.missingCount > 0)
  const comparable = plans.filter((p) => p.lines.length > 0)
  const bestTotal = comparable.length ? Math.min(...comparable.map((p) => p.total)) : 0
  const worstSingleTotal = singlePlans.length
    ? Math.max(...singlePlans.map((p) => p.total))
    : bestTotal
  const potentialSaving = round2(Math.max(0, worstSingleTotal - bestTotal))

  return {
    locationLabel,
    location: { lat: latitude, lng: longitude },
    stores: collectStores(lines),
    lines,
    plans,
    bestTotal,
    worstSingleTotal,
    potentialSaving,
    source: 'marketfiyati',
    disclaimer:
      'Canlı veriler marketfiyati.org.tr üzerinden alınır. Ürün adı sade eşleştirmeyle seçilir (ör. ekmek → normal ekmek); yanlış specialty ürünler elenir.',
  }
}
