import type { GeocodeHit } from '../types/location'

type PhotonProps = {
  name?: string
  street?: string
  housenumber?: string
  district?: string
  locality?: string
  city?: string
  state?: string
  county?: string
  postcode?: string
  country?: string
  countrycode?: string
  osm_id?: number
  osm_type?: string
  type?: string
}

type PhotonFeature = {
  geometry?: { coordinates?: [number, number] }
  properties?: PhotonProps
}

type PhotonResponse = {
  features?: PhotonFeature[]
}

type NominatimItem = {
  place_id?: number
  lat?: string
  lon?: string
  display_name?: string
  name?: string
  boundingbox?: [string, string, string, string]
  address?: {
    road?: string
    pedestrian?: string
    neighbourhood?: string
    suburb?: string
    city_district?: string
    district?: string
    town?: string
    city?: string
    municipality?: string
    county?: string
    province?: string
    state?: string
    postcode?: string
  }
}

export type StructuredAddress = {
  province: string
  district: string
  neighborhood: string
  street: string
  buildingNo: string
  apartment?: string
}

/** İlçe kutusu: minLon, minLat, maxLon, maxLat */
export type DistrictArea = {
  lat: number
  lng: number
  bbox: [number, number, number, number]
  label: string
}

const TR_BIAS = { lat: 39.0, lon: 35.0 }
const NOMINATIM_UA = 'EvStok/1.0 (https://github.com/Alperenng07/ev-stok; household list app)'

const districtAreaCache = new Map<string, DistrictArea | null>()

function normalizeTr(text: string): string {
  return text
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function labelFromPhoton(p: PhotonProps): { name: string; label: string } {
  const streetLine = [p.housenumber, p.street || p.name].filter(Boolean).join(' ').trim()
  const name = streetLine || p.locality || p.district || p.city || 'Konum'
  const parts = [
    streetLine || null,
    p.locality,
    p.district,
    p.city,
    p.state,
    p.postcode,
  ].filter(Boolean) as string[]
  const uniq = parts.filter((v, i, arr) => arr.indexOf(v) === i)
  return { name, label: uniq.join(', ') || name }
}

function fromPhoton(features: PhotonFeature[] | undefined): GeocodeHit[] {
  const seen = new Set<string>()
  return (features ?? [])
    .map((f, i) => {
      const coords = f.geometry?.coordinates
      const props = f.properties
      if (!coords || !props) return null
      const [lng, lat] = coords
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
      if (props.countrycode && props.countrycode.toUpperCase() !== 'TR') return null
      const { name, label } = labelFromPhoton(props)
      const id = `${props.osm_type ?? 'p'}-${props.osm_id ?? i}-${lat.toFixed(5)},${lng.toFixed(5)}`
      if (seen.has(id)) return null
      seen.add(id)
      return { id, name, label, lat, lng } satisfies GeocodeHit
    })
    .filter((h): h is GeocodeHit => h != null)
}

function fromNominatim(items: NominatimItem[]): GeocodeHit[] {
  const seen = new Set<string>()
  return items
    .map((item, i) => {
      const lat = Number(item.lat)
      const lng = Number(item.lon)
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
      const addr = item.address
      const street =
        addr?.road ||
        addr?.pedestrian ||
        item.name ||
        item.display_name?.split(',')[0]?.trim() ||
        'Konum'
      const districtName =
        addr?.city_district ||
        addr?.district ||
        addr?.town ||
        addr?.municipality ||
        addr?.county ||
        addr?.city
      const parts = [
        street,
        addr?.neighbourhood || addr?.suburb,
        districtName,
        addr?.province || addr?.state,
        addr?.postcode,
      ].filter(Boolean) as string[]
      const label =
        parts.filter((v, idx, arr) => arr.indexOf(v) === idx).join(', ') ||
        item.display_name ||
        street
      const id = `n-${item.place_id ?? i}-${lat.toFixed(5)},${lng.toFixed(5)}`
      if (seen.has(id)) return null
      seen.add(id)
      return { id, name: street, label, lat, lng }
    })
    .filter((h): h is GeocodeHit => h != null)
}

function pointInBbox(
  lat: number,
  lng: number,
  bbox: [number, number, number, number],
  pad = 0.015,
): boolean {
  const [minLon, minLat, maxLon, maxLat] = bbox
  return (
    lng >= minLon - pad &&
    lng <= maxLon + pad &&
    lat >= minLat - pad &&
    lat <= maxLat + pad
  )
}

/** Sonuç seçilen il / ilçe ile uyuşuyor mu? */
export function hitMatchesRegion(
  hit: GeocodeHit,
  province: string,
  district?: string,
): boolean {
  const hay = normalizeTr(`${hit.name} ${hit.label}`)
  const p = normalizeTr(province)
  if (p && !hay.includes(p)) return false
  if (district?.trim()) {
    const d = normalizeTr(district)
    if (d && !hay.includes(d)) return false
  }
  return true
}

/**
 * Sıkı filtre: yanlış ilçeye (Moda/Kadıköy vb.) asla düşme.
 * - İlçe adı etikette olmalı VEYA nokta ilçe kutusunun içinde olmalı
 * - İlçe kutusu varsa dışındaki noktalar elenir
 */
function filterStrict(
  hits: GeocodeHit[],
  province: string,
  district: string,
  area?: DistrictArea | null,
): GeocodeHit[] {
  return hits.filter((h) => {
    if (area && !pointInBbox(h.lat, h.lng, area.bbox)) return false
    if (hitMatchesRegion(h, province, district)) return true
    // Etikette ilçe yok ama koordinat seçilen ilçe kutusundaysa kabul
    if (area && pointInBbox(h.lat, h.lng, area.bbox, 0.005)) {
      return hitMatchesRegion(h, province)
    }
    return false
  })
}

async function nominatimFetch(url: string): Promise<NominatimItem[]> {
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': NOMINATIM_UA,
    },
  })
  if (!res.ok) return []
  const data = (await res.json()) as NominatimItem[]
  return Array.isArray(data) ? data : []
}

async function searchNominatim(
  query: string,
  area?: DistrictArea | null,
): Promise<GeocodeHit[]> {
  const q = query.trim()
  if (q.length < 3) return []
  const params = new URLSearchParams({
    format: 'jsonv2',
    addressdetails: '1',
    limit: '8',
    countrycodes: 'tr',
    q,
  })
  if (area) {
    const [minLon, minLat, maxLon, maxLat] = area.bbox
    // Nominatim viewbox: left, top, right, bottom
    params.set('viewbox', `${minLon},${maxLat},${maxLon},${minLat}`)
    params.set('bounded', '1')
  }
  return fromNominatim(await nominatimFetch(`https://nominatim.openstreetmap.org/search?${params}`))
}

async function searchPhotonFree(
  query: string,
  area?: DistrictArea | null,
  bias?: { lat: number; lng: number },
): Promise<GeocodeHit[]> {
  const lat = area?.lat ?? bias?.lat ?? TR_BIAS.lat
  const lon = area?.lng ?? bias?.lng ?? TR_BIAS.lon
  let url =
    `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}` +
    `&limit=8&lat=${lat}&lon=${lon}`
  if (area) {
    const [minLon, minLat, maxLon, maxLat] = area.bbox
    url += `&bbox=${minLon},${minLat},${maxLon},${maxLat}`
  }
  const res = await fetch(url)
  if (!res.ok) throw new Error('Adres araması başarısız')
  const data = (await res.json()) as PhotonResponse
  return fromPhoton(data.features)
}

async function searchPhotonStructured(parts: StructuredAddress): Promise<GeocodeHit[]> {
  const params = new URLSearchParams()
  params.set('countrycode', 'TR')
  params.set('limit', '8')
  if (parts.province.trim()) params.set('state', parts.province.trim())
  if (parts.district.trim()) params.set('city', parts.district.trim())
  if (parts.neighborhood.trim()) params.set('district', parts.neighborhood.trim())
  if (parts.street.trim()) params.set('street', parts.street.trim())
  if (parts.buildingNo.trim()) params.set('housenumber', parts.buildingNo.trim())

  const url = `https://photon.komoot.io/structured?${params.toString()}`
  const res = await fetch(url)
  if (!res.ok) throw new Error('Adres araması başarısız')
  const data = (await res.json()) as PhotonResponse
  return fromPhoton(data.features)
}

async function reverseNominatim(lat: number, lng: number): Promise<GeocodeHit | null> {
  const url =
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1` +
    `&lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lng))}`
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': NOMINATIM_UA },
  })
  if (!res.ok) return null
  const data = (await res.json()) as NominatimItem
  return fromNominatim([data])[0] ?? null
}

function composeAddressQuery(parts: StructuredAddress): string {
  return [
    parts.street.trim() && parts.buildingNo.trim()
      ? `${parts.street.trim()} No:${parts.buildingNo.trim()}`
      : parts.street.trim(),
    parts.neighborhood.trim() ? `${parts.neighborhood.trim()} Mahallesi` : '',
    parts.district.trim(),
    parts.province.trim(),
    'Türkiye',
  ]
    .filter(Boolean)
    .join(', ')
}

export function formatAddressLabel(parts: StructuredAddress): string {
  const streetLine = [
    parts.street.trim(),
    parts.buildingNo.trim() ? `No:${parts.buildingNo.trim()}` : '',
    parts.apartment?.trim() ? `D:${parts.apartment.trim()}` : '',
  ]
    .filter(Boolean)
    .join(' ')
  return [streetLine, parts.neighborhood.trim(), parts.district.trim(), parts.province.trim()]
    .filter(Boolean)
    .join(', ')
}

/** İlçe merkezi + bounding box (yanlış ilçeye kaçmayı engeller). */
export async function resolveDistrictArea(
  province: string,
  district: string,
): Promise<DistrictArea | null> {
  const key = `${normalizeTr(province)}|${normalizeTr(district)}`
  if (districtAreaCache.has(key)) return districtAreaCache.get(key) ?? null

  const q = `${district}, ${province}, Türkiye`
  const params = new URLSearchParams({
    format: 'jsonv2',
    addressdetails: '1',
    limit: '5',
    countrycodes: 'tr',
    q,
  })
  const items = await nominatimFetch(`https://nominatim.openstreetmap.org/search?${params}`)
  const preferred =
    items.find((it) => {
      const hay = normalizeTr(it.display_name ?? '')
      return hay.includes(normalizeTr(district)) && hay.includes(normalizeTr(province))
    }) ?? items[0]

  if (!preferred) {
    districtAreaCache.set(key, null)
    return null
  }

  const lat = Number(preferred.lat)
  const lng = Number(preferred.lon)
  if (!isValidTurkeyCoord(lat, lng)) {
    districtAreaCache.set(key, null)
    return null
  }

  let bbox: [number, number, number, number]
  if (preferred.boundingbox?.length === 4) {
    const minLat = Number(preferred.boundingbox[0])
    const maxLat = Number(preferred.boundingbox[1])
    const minLon = Number(preferred.boundingbox[2])
    const maxLon = Number(preferred.boundingbox[3])
    bbox = [minLon, minLat, maxLon, maxLat]
  } else {
    // ~4km kutu
    const d = 0.04
    bbox = [lng - d, lat - d, lng + d, lat + d]
  }

  const area: DistrictArea = {
    lat,
    lng,
    bbox,
    label: preferred.display_name ?? `${district}, ${province}`,
  }
  districtAreaCache.set(key, area)
  return area
}

export async function resolveDistrictBias(
  province: string,
  district: string,
): Promise<{ lat: number; lng: number } | null> {
  const area = await resolveDistrictArea(province, district)
  return area ? { lat: area.lat, lng: area.lng } : null
}

/** Sokak önerileri — yalnızca seçilen ilçe kutusunda. */
export async function searchStreetSuggestions(
  streetQuery: string,
  context: Pick<StructuredAddress, 'province' | 'district' | 'neighborhood'>,
  bias?: { lat: number; lng: number },
): Promise<GeocodeHit[]> {
  const street = streetQuery.trim()
  if (street.length < 2) return []
  if (!context.province.trim() || !context.district.trim()) return []

  const area = await resolveDistrictArea(context.province, context.district)
  const results: GeocodeHit[] = []
  const pushUnique = (list: GeocodeHit[]) => {
    for (const hit of filterStrict(list, context.province, context.district, area)) {
      if (!results.some((r) => r.id === hit.id)) results.push(hit)
    }
  }

  const free = [
    street,
    context.neighborhood ? `${context.neighborhood} Mahallesi` : '',
    context.district,
    context.province,
  ]
    .filter(Boolean)
    .join(', ')

  // Önce ilçeye kilitli Nominatim
  try {
    pushUnique(await searchNominatim(free, area))
  } catch {
    /* continue */
  }

  try {
    pushUnique(await searchPhotonStructured({
      province: context.province,
      district: context.district,
      neighborhood: context.neighborhood,
      street,
      buildingNo: '',
    }))
  } catch {
    /* continue */
  }

  try {
    pushUnique(await searchPhotonFree(free, area, bias))
  } catch {
    /* continue */
  }

  return results.slice(0, 8)
}

/** İl / ilçe / mahalle / sokak — sonuçlar seçilen ilçe dışına çıkamaz. */
export async function searchStructuredAddress(
  parts: StructuredAddress,
  bias?: { lat: number; lng: number },
): Promise<GeocodeHit[]> {
  if (!parts.province.trim() || !parts.district.trim()) {
    throw new Error('İl ve ilçe zorunlu.')
  }

  const area = await resolveDistrictArea(parts.province, parts.district)
  const results: GeocodeHit[] = []
  const pushUnique = (list: GeocodeHit[]) => {
    for (const hit of filterStrict(list, parts.province, parts.district, area)) {
      if (!results.some((r) => r.id === hit.id)) results.push(hit)
    }
  }

  const freeQuery = composeAddressQuery(parts)

  try {
    pushUnique(await searchNominatim(freeQuery, area))
  } catch {
    /* continue */
  }

  // Sokak + mahalle + ilçe (kısa sorgu, yine bounded)
  try {
    const shortQ = [parts.street, parts.neighborhood, parts.district, parts.province]
      .filter(Boolean)
      .join(', ')
    pushUnique(await searchNominatim(shortQ, area))
  } catch {
    /* continue */
  }

  try {
    pushUnique(await searchPhotonStructured(parts))
  } catch {
    /* continue */
  }

  if (results.length < 3 && parts.street.trim()) {
    try {
      pushUnique(await searchPhotonStructured({ ...parts, neighborhood: '' }))
    } catch {
      /* continue */
    }
  }

  if (results.length < 3) {
    try {
      pushUnique(await searchPhotonFree(freeQuery, area, bias))
    } catch {
      /* continue */
    }
  }

  // Son çare: seçilen ilçe merkezi (asla başka ilçe değil)
  if (results.length === 0 && area) {
    results.push({
      id: `district-${normalizeTr(parts.district)}-${area.lat.toFixed(4)}`,
      name: parts.district,
      label: `${parts.neighborhood || parts.district}, ${parts.district}, ${parts.province} (ilçe merkezi ≈)`,
      lat: area.lat,
      lng: area.lng,
    })
  }

  return results
}

export async function searchPlaces(query: string): Promise<GeocodeHit[]> {
  const q = query.trim()
  if (q.length < 3) return []
  try {
    const nominatim = await searchNominatim(q)
    if (nominatim.length > 0) return nominatim
  } catch {
    /* fall through */
  }
  try {
    return await searchPhotonFree(q)
  } catch {
    return []
  }
}

export async function reverseGeocode(lat: number, lng: number): Promise<GeocodeHit | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  try {
    const nom = await reverseNominatim(lat, lng)
    if (nom) return nom
  } catch {
    /* fall through */
  }
  const url =
    `https://photon.komoot.io/reverse?lat=${encodeURIComponent(String(lat))}` +
    `&lon=${encodeURIComponent(String(lng))}&limit=1`
  const res = await fetch(url)
  if (!res.ok) {
    return {
      id: `${lat.toFixed(5)},${lng.toFixed(5)}`,
      name: 'Seçilen nokta',
      label: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
      lat,
      lng,
    }
  }
  const data = (await res.json()) as PhotonResponse
  return fromPhoton(data.features)[0] ?? {
    id: `${lat.toFixed(5)},${lng.toFixed(5)}`,
    name: 'Seçilen nokta',
    label: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
    lat,
    lng,
  }
}

export function isValidTurkeyCoord(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= 35.5 &&
    lat <= 42.5 &&
    lng >= 25.5 &&
    lng <= 45.0
  )
}

export const DEFAULT_MAP_CENTER = { lat: 41.0082, lng: 28.9784 }
