import { haversineKm } from './location'
import { normalizeChainId } from './chains'
import {
  minAcceptScore,
  scoreProductTitle,
  searchKeywordsFor,
} from './productMatch'

const SEARCH_URL = 'https://api.marketfiyati.org.tr/api/v2/search'
const NEAREST_URL = 'https://api.marketfiyati.org.tr/api/v2/nearest'

export type MarketDepotOffer = {
  depotId: string
  depotName: string
  price: number
  unitPriceValue: number | null
  marketAdi: string
  chainId: string
  latitude: number
  longitude: number
  indexTime: string | null
  distanceKm: number
}

export type MarketProduct = {
  id: string
  title: string
  brand: string | null
  volume: string | null
  depots: MarketDepotOffer[]
  matchScore?: number
}

export type NearestDepot = {
  id: string
  sellerName: string
  marketName: string
  lat: number
  lng: number
  distanceKm: number
}

type ApiDepot = {
  depotId?: string
  depotName?: string
  price?: number
  unitPriceValue?: number | null
  marketAdi?: string
  longitude?: number
  latitude?: number
  indexTime?: string | null
}

type ApiProduct = {
  id?: string
  title?: string
  brand?: string | null
  refinedVolumeOrWeight?: string | null
  productDepotInfoList?: ApiDepot[]
}

type ApiSearchResponse = {
  numberOfFound?: number
  content?: ApiProduct[]
}

type ApiNearestItem = {
  id?: string
  sellerName?: string
  marketName?: string
  distance?: number
  location?: { lat?: number; lon?: number }
}

function mapProduct(
  raw: ApiProduct,
  userLat: number,
  userLng: number,
  allowedDepotIds?: Set<string>,
  maxDistanceKm?: number,
): MarketProduct | null {
  if (!raw.id || !raw.title) return null
  const depots = (raw.productDepotInfoList ?? [])
    .map((d) => {
      if (d.price == null || !d.depotName || !d.marketAdi) return null
      const depotId = d.depotId ?? `${d.marketAdi}-${d.depotName}`
      if (allowedDepotIds && allowedDepotIds.size > 0 && !allowedDepotIds.has(depotId)) {
        return null
      }
      const lat = Number(d.latitude)
      const lng = Number(d.longitude)
      const distanceKm =
        Number.isFinite(lat) && Number.isFinite(lng)
          ? Math.round(haversineKm(userLat, userLng, lat, lng) * 10) / 10
          : 99
      if (maxDistanceKm != null && distanceKm > maxDistanceKm + 0.5) return null
      return {
        depotId,
        depotName: d.depotName,
        price: Number(d.price),
        unitPriceValue: d.unitPriceValue == null ? null : Number(d.unitPriceValue),
        marketAdi: d.marketAdi,
        chainId: normalizeChainId(d.marketAdi),
        latitude: lat,
        longitude: lng,
        indexTime: d.indexTime ?? null,
        distanceKm,
      } satisfies MarketDepotOffer
    })
    .filter((d): d is MarketDepotOffer => d != null && Number.isFinite(d.price))
    .sort((a, b) => a.price - b.price || a.distanceKm - b.distanceKm)

  if (depots.length === 0) return null
  return {
    id: raw.id,
    title: raw.title,
    brand: raw.brand ?? null,
    volume: raw.refinedVolumeOrWeight ?? null,
    depots,
  }
}

/**
 * marketfiyati.org.tr resmi akışı: önce yakındaki marketleri al.
 * /search'e depots verilmezse API İstanbul varsayılanına düşüyor.
 */
export async function fetchNearestDepots(options: {
  latitude: number
  longitude: number
  distanceKm?: number
}): Promise<NearestDepot[]> {
  const distanceKm = options.distanceKm ?? 8
  const res = await fetch(NEAREST_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      latitude: options.latitude,
      longitude: options.longitude,
      distance: distanceKm,
    }),
  })
  if (!res.ok) {
    throw new Error(`Yakın market listesi alınamadı: ${res.status}`)
  }
  const data = (await res.json()) as ApiNearestItem[]
  if (!Array.isArray(data)) return []

  return data
    .map((item) => {
      if (!item.id) return null
      const lat = Number(item.location?.lat)
      const lng = Number(item.location?.lon)
      const distanceKmFromApi =
        item.distance != null && Number.isFinite(item.distance)
          ? Math.round((Number(item.distance) / 1000) * 10) / 10
          : Number.isFinite(lat) && Number.isFinite(lng)
            ? Math.round(
                haversineKm(options.latitude, options.longitude, lat, lng) * 10,
              ) / 10
            : 99
      return {
        id: item.id,
        sellerName: item.sellerName ?? item.id,
        marketName: item.marketName ?? '',
        lat,
        lng,
        distanceKm: distanceKmFromApi,
      } satisfies NearestDepot
    })
    .filter((d): d is NearestDepot => d != null)
    .sort((a, b) => a.distanceKm - b.distanceKm)
}

export async function searchMarketPrices(options: {
  keywords: string
  latitude: number
  longitude: number
  distanceKm?: number
  size?: number
  /** Zorunlu: yoksa API yanlış şehire (İstanbul) düşer */
  depotIds: string[]
}): Promise<MarketProduct[]> {
  const keywords = options.keywords.trim()
  if (!keywords) return []
  if (!options.depotIds.length) return []

  const distanceKm = options.distanceKm ?? 8
  const allowed = new Set(options.depotIds)

  const res = await fetch(SEARCH_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      keywords,
      latitude: options.latitude,
      longitude: options.longitude,
      distance: distanceKm,
      size: options.size ?? 20,
      depots: options.depotIds,
    }),
  })

  if (!res.ok) {
    throw new Error(`Market Fiyatı API hata: ${res.status}`)
  }

  const data = (await res.json()) as ApiSearchResponse
  return (data.content ?? [])
    .map((p) => mapProduct(p, options.latitude, options.longitude, allowed, distanceKm + 2))
    .filter((p): p is MarketProduct => p != null)
}

/** Birden fazla anahtar kelimeyle ara, sonuçları birleştir. */
export async function searchProductsForItem(options: {
  itemName: string
  latitude: number
  longitude: number
  distanceKm?: number
  depotIds: string[]
}): Promise<MarketProduct[]> {
  if (!options.depotIds.length) return []
  const keywords = searchKeywordsFor(options.itemName)
  const byId = new Map<string, MarketProduct>()

  for (const kw of keywords) {
    const batch = await searchMarketPrices({
      keywords: kw,
      latitude: options.latitude,
      longitude: options.longitude,
      distanceKm: options.distanceKm,
      depotIds: options.depotIds,
      size: 20,
    })
    for (const p of batch) {
      if (!byId.has(p.id)) byId.set(p.id, p)
    }
    const good = [...byId.values()].filter(
      (p) => scoreProductTitle(options.itemName, p.title) >= minAcceptScore(options.itemName),
    )
    if (good.length >= 3) break
  }

  return [...byId.values()]
}

export function rankProducts(
  query: string,
  products: MarketProduct[],
  minScoreOverride?: number,
): MarketProduct[] {
  const minScore = minScoreOverride ?? minAcceptScore(query)
  return products
    .map((product) => {
      const score = scoreProductTitle(query, product.title)
      const cheapest = product.depots[0]?.price ?? Number.POSITIVE_INFINITY
      const marketBonus = Math.min(product.depots.length, 4)
      return { product: { ...product, matchScore: score }, score: score + marketBonus, cheapest }
    })
    .filter((r) => r.score >= minScore)
    .sort((a, b) => {
      if (Math.abs(a.score - b.score) > 12) return b.score - a.score
      return a.cheapest - b.cheapest || b.score - a.score
    })
    .map((r) => r.product)
}

export function pickBestProduct(query: string, products: MarketProduct[]): MarketProduct | null {
  return rankProducts(query, products)[0] ?? null
}

export function rankProductsForPicker(query: string, products: MarketProduct[]): MarketProduct[] {
  const strict = rankProducts(query, products)
  const wide = rankProducts(query, products, 35)
  const byId = new Map<string, MarketProduct>()
  for (const p of [...strict, ...wide]) {
    if (!byId.has(p.id)) byId.set(p.id, p)
  }
  return [...byId.values()]
    .sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0))
    .slice(0, 10)
}

export function cheapestPerChain(product: MarketProduct): MarketDepotOffer[] {
  const map = new Map<string, MarketDepotOffer>()
  for (const depot of product.depots) {
    const prev = map.get(depot.chainId)
    if (
      !prev ||
      depot.price < prev.price ||
      (depot.price === prev.price && depot.distanceKm < prev.distanceKm)
    ) {
      map.set(depot.chainId, depot)
    }
  }
  return [...map.values()].sort((a, b) => a.price - b.price || a.distanceKm - b.distanceKm)
}

export { scoreProductTitle }
