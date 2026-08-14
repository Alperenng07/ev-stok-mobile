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
import { chainById, normalizeChainId } from './chains'
import {
  cheapestPerChain,
  fetchNearestDepots,
  rankProducts,
  rankProductsForPicker,
  searchProductsForItem,
  type MarketDepotOffer,
  type NearestDepot,
} from './marketFiyati'
import { haversineKm } from './location'

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
  base: Pick<
    BudgetResult,
    'locationKey' | 'locationLabel' | 'resolvedAddress' | 'location' | 'disclaimer' | 'source'
  > & { stores?: NearbyStore[] },
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

  const storesFromOffers = collectStores(lines)
  const stores =
    base.stores && base.stores.length > 0
      ? mergeStores(base.stores, storesFromOffers)
      : storesFromOffers

  return {
    locationKey: base.locationKey,
    locationLabel: base.locationLabel,
    resolvedAddress: base.resolvedAddress,
    location: base.location,
    stores,
    lines,
    plans,
    bestTotal,
    worstSingleTotal,
    potentialSaving,
    source: base.source,
    disclaimer: base.disclaimer,
  }
}

function mergeStores(primary: NearbyStore[], extra: NearbyStore[]): NearbyStore[] {
  const map = new Map<string, NearbyStore>()
  for (const s of [...primary, ...extra]) {
    const prev = map.get(s.id)
    if (!prev || s.distanceKm < prev.distanceKm) map.set(s.id, s)
  }
  return [...map.values()].sort((a, b) => a.distanceKm - b.distanceKm)
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
  locationKey: string
  resolvedAddress?: string
  distanceKm?: number
}): Promise<BudgetResult> {
  const { pendingItems, latitude, longitude, locationLabel, locationKey } = options
  const resolvedAddress =
    options.resolvedAddress ?? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`

  // Mesafe verilmezse 1→3→5→10 km genişler (resmi site gibi).
  const nearest = await fetchNearestDepots({
    latitude,
    longitude,
    distanceKm: options.distanceKm,
  })
  const depotIds = nearest.map((d) => d.id)
  const nearestStores = nearestToStores(nearest)

  if (depotIds.length === 0) {
    return rebuildBudgetFromLines(
      {
        locationKey,
        locationLabel,
        resolvedAddress,
        location: { lat: latitude, lng: longitude },
        stores: [],
        source: 'marketfiyati',
        disclaimer:
          'Bu konum civarında marketfiyati.org.tr’de kayıtlı market bulunamadı. Kayıtlı Ev/İş pinini silip GPS ile yeniden ekle.',
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

  const closest = nearest[0]
  if (
    closest &&
    Number.isFinite(closest.lat) &&
    Number.isFinite(closest.lng) &&
    haversineKm(latitude, longitude, closest.lat, closest.lng) > 35
  ) {
    throw new Error(
      `Yakın market listesi konumla uyuşmuyor (ör. ${closest.sellerName}). Kayıtlı konumu silip GPS ile yeniden kaydet.`,
    )
  }

  const sampleNames = nearest
    .slice(0, 4)
    .map((d) => d.sellerName)
    .join(' · ')
  const searchDistanceKm = Math.max(
    3,
    Math.ceil(nearest[nearest.length - 1]?.distanceKm ?? 3) + 1,
  )

  const lines: PricedLine[] = []

  for (const item of pendingItems) {
    const qty = Math.max(item.neededQty || 1, 1)
    try {
      const products = await searchProductsForItem({
        itemName: item.name,
        latitude,
        longitude,
        distanceKm: searchDistanceKm,
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
      locationKey,
      locationLabel: `${locationLabel} · ${depotIds.length} yakın market`,
      resolvedAddress: `${resolvedAddress} · örn. ${sampleNames}`,
      location: { lat: latitude, lng: longitude },
      stores: nearestStores,
      source: 'marketfiyati',
      disclaimer:
        'Fiyatlar yalnızca bu konuma yakın marketlerden (marketfiyati.org.tr /nearest → depots). Şube adında başka şehir görürsen konumu GPS ile yeniden kaydet.',
    },
    lines,
  )
}

function nearestToStores(nearest: NearestDepot[]): NearbyStore[] {
  return nearest.map((d) => ({
    id: d.id,
    chainId: normalizeChainId(d.marketName || d.id),
    name: d.sellerName,
    distanceKm: d.distanceKm,
    lat: d.lat,
    lng: d.lng,
  }))
}
