import type { StockItem } from '../types'
import type {
  BudgetPlan,
  BudgetResult,
  MarketChainId,
  MissingPlanItem,
  NearbyStore,
  PlanLine,
  PricedLine,
  ProductCandidate,
} from '../types/budget'
import { chainById } from './chains'
import {
  cheapestPerChain,
  fetchNearestDepots,
  rankProducts,
  rankProductsForPicker,
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

function candidatesFromRanked(
  ranked: ReturnType<typeof rankProducts>,
  qty: number,
  limit = 8,
): ProductCandidate[] {
  return ranked.slice(0, limit).map((product) => {
    const offers = cheapestPerChain(product).map((d) => offerFromDepot(d, qty))
    return {
      catalogId: product.id,
      catalogName: product.title,
      matchScore: product.matchScore ?? 0,
      cheapestPrice: offers[0]?.unitPrice ?? product.depots[0]?.price ?? 0,
      offers,
    }
  })
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

/** Mevcut satırlardan planları yeniden kur (ürün seçimi değişince). */
export function rebuildBudgetFromLines(
  base: Pick<BudgetResult, 'locationLabel' | 'location' | 'disclaimer' | 'source'>,
  lines: PricedLine[],
): BudgetResult {
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
    locationLabel: base.locationLabel,
    location: base.location,
    stores: collectStores(lines),
    lines,
    plans,
    bestTotal,
    worstSingleTotal,
    potentialSaving,
    source: base.source,
    disclaimer: base.disclaimer,
  }
}

/** Kullanıcı farklı marketfiyati ürününü seçince satırı ve planları günceller. */
export function applyCatalogChoice(
  result: BudgetResult,
  itemId: string,
  catalogId: string,
): BudgetResult {
  const lines = result.lines.map((line) => {
    if (line.itemId !== itemId) return line
    const cand = (line.candidates ?? []).find((c) => c.catalogId === catalogId)
    if (!cand) return line
    return {
      ...line,
      catalogId: cand.catalogId,
      catalogName: cand.catalogName,
      matched: cand.offers.length > 0,
      offers: cand.offers,
      candidates: line.candidates ?? [],
    }
  })
  return rebuildBudgetFromLines(result, lines)
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
  const distanceKm = options.distanceKm ?? 8

  const nearest = await fetchNearestDepots({ latitude, longitude, distanceKm })
  const depotIds = nearest.map((d) => d.id)
  if (depotIds.length === 0) {
    return rebuildBudgetFromLines(
      {
        locationLabel,
        location: { lat: latitude, lng: longitude },
        source: 'marketfiyati',
        disclaimer:
          'Bu konum civarında marketfiyati.org.tr’de kayıtlı market bulunamadı. Mesafeyi genişletmek için tekrar dene veya kayıtlı adresi kontrol et.',
      },
      pendingItems.map((item) => ({
        itemId: item.id,
        itemName: item.name,
        qty: Math.max(item.neededQty || 1, 1),
        unit: item.unit,
        catalogId: null,
        catalogName: null,
        matched: false,
        offers: [],
        candidates: [],
      })),
    )
  }

  const lines: PricedLine[] = []

  for (const item of pendingItems) {
    const qty = Math.max(item.neededQty || 1, 1)
    try {
      const products = await searchProductsForItem({
        itemName: item.name,
        latitude,
        longitude,
        distanceKm,
        depotIds,
      })
      const bestPick = rankProducts(item.name, products)[0] ?? null
      const ranked = rankProductsForPicker(item.name, products)
      const ordered = bestPick
        ? [bestPick, ...ranked.filter((p) => p.id !== bestPick.id)]
        : ranked
      const candidates = candidatesFromRanked(ordered, qty)

      if (!bestPick) {
        lines.push({
          itemId: item.id,
          itemName: item.name,
          qty,
          unit: item.unit,
          catalogId: null,
          catalogName: null,
          matched: false,
          offers: [],
          candidates,
        })
        continue
      }

      const best =
        candidates.find((c) => c.catalogId === bestPick.id) ?? candidates[0]

      lines.push({
        itemId: item.id,
        itemName: item.name,
        qty,
        unit: item.unit,
        catalogId: best.catalogId,
        catalogName: best.catalogName,
        matched: true,
        offers: best.offers,
        candidates,
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
        candidates: [],
      })
    }
  }

  return rebuildBudgetFromLines(
    {
      locationLabel: `${locationLabel} · ${depotIds.length} yakın market`,
      location: { lat: latitude, lng: longitude },
      source: 'marketfiyati',
      disclaimer:
        'Fiyatlar seçilen konuma göre yakındaki marketlerden (marketfiyati.org.tr) alınır. Yanlış ürün eşleşirse “Başka ürün seç”.',
    },
    lines,
  )
}
