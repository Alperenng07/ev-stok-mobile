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

const TR_BIAS = { lat: 39.0, lng: 35.0 }
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

function pointInBbox(
  lat: number,
  lng: number,
  bbox: [number, number, number, number],
  pad = 0.02,
): boolean {
  const [minLon, minLat, maxLon, maxLat] = bbox
  return (
    lng >= minLon - pad &&
    lng <= maxLon + pad &&
    lat >= minLat - pad &&
    lat <= maxLat + pad
  )
}

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

function filterStrict(
  hits: GeocodeHit[],
  province: string,
  district: string,
  area?: DistrictArea | null,
): GeocodeHit[] {
  return hits.filter((h) => {
    if (area && !pointInBbox(h.lat, h.lng, area.bbox)) return false
    if (hitMatchesRegion(h, province, district)) return true
    if (area && pointInBbox(h.lat, h.lng, area.bbox, 0.008) && hitMatchesRegion(h, province)) {
      return true
    }
    return false
  })
}

async function searchPhotonFree(
  query: string,
  bias?: { lat: number; lng: number },
  bbox?: [number, number, number, number],
): Promise<GeocodeHit[]> {
  const lat = bias?.lat ?? TR_BIAS.lat
  const lon = bias?.lng ?? TR_BIAS.lng
  let url =
    `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}` +
    `&limit=8&lat=${lat}&lon=${lon}`
  if (bbox) {
    const [minLon, minLat, maxLon, maxLat] = bbox
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

  const res = await fetch(`https://photon.komoot.io/structured?${params}`)
  if (!res.ok) throw new Error('Adres araması başarısız')
  const data = (await res.json()) as PhotonResponse
  return fromPhoton(data.features)
}

function composeAddressQuery(parts: StructuredAddress): string {
  return [
    parts.street.trim() || null,
    parts.neighborhood.trim() ? `${parts.neighborhood.trim()} Mahallesi` : null,
    parts.district.trim(),
    parts.province.trim(),
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

/** İlçe merkezi + bounding box — yalnızca Photon (Nominatim tarayıcıda 403). */
export async function resolveDistrictArea(
  province: string,
  district: string,
  provinceBias?: { lat: number; lng: number },
): Promise<DistrictArea | null> {
  const key = `${normalizeTr(province)}|${normalizeTr(district)}`
  if (districtAreaCache.has(key)) return districtAreaCache.get(key) ?? null

  try {
    const hits = await searchPhotonFree(`${district}, ${province}`, provinceBias ?? TR_BIAS)
    const matched =
      hits.filter((h) => hitMatchesRegion(h, province, district))[0] ??
      hits.find((h) => normalizeTr(h.label).includes(normalizeTr(district))) ??
      hits[0]
    if (!matched || !isValidTurkeyCoord(matched.lat, matched.lng)) {
      districtAreaCache.set(key, null)
      return null
    }
    const d = 0.045
    const area: DistrictArea = {
      lat: matched.lat,
      lng: matched.lng,
      bbox: [matched.lng - d, matched.lat - d, matched.lng + d, matched.lat + d],
      label: matched.label,
    }
    districtAreaCache.set(key, area)
    return area
  } catch {
    districtAreaCache.set(key, null)
    return null
  }
}

export async function resolveDistrictBias(
  province: string,
  district: string,
): Promise<{ lat: number; lng: number } | null> {
  const area = await resolveDistrictArea(province, district)
  return area ? { lat: area.lat, lng: area.lng } : null
}

export async function searchStreetSuggestions(
  streetQuery: string,
  context: Pick<StructuredAddress, 'province' | 'district' | 'neighborhood'>,
  bias?: { lat: number; lng: number },
): Promise<GeocodeHit[]> {
  const street = streetQuery.trim()
  if (street.length < 2) return []
  if (!context.province.trim() || !context.district.trim()) return []

  const area = await resolveDistrictArea(context.province, context.district, bias)
  const results: GeocodeHit[] = []
  const push = (list: GeocodeHit[]) => {
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

  try {
    push(
      await searchPhotonStructured({
        province: context.province,
        district: context.district,
        neighborhood: context.neighborhood,
        street,
        buildingNo: '',
      }),
    )
  } catch {
    /* continue */
  }

  try {
    push(await searchPhotonFree(free, area ?? bias, area?.bbox))
  } catch {
    /* continue */
  }

  return results.slice(0, 8)
}

export async function searchStructuredAddress(
  parts: StructuredAddress,
  bias?: { lat: number; lng: number },
): Promise<GeocodeHit[]> {
  if (!parts.province.trim() || !parts.district.trim()) {
    throw new Error('İl ve ilçe zorunlu.')
  }

  const area = await resolveDistrictArea(parts.province, parts.district, bias)
  const results: GeocodeHit[] = []
  const push = (list: GeocodeHit[]) => {
    for (const hit of filterStrict(list, parts.province, parts.district, area)) {
      if (!results.some((r) => r.id === hit.id)) results.push(hit)
    }
  }

  const freeQuery = composeAddressQuery(parts)

  if (parts.street.trim()) {
    try {
      push(await searchPhotonStructured(parts))
    } catch {
      /* continue */
    }
    try {
      push(await searchPhotonStructured({ ...parts, neighborhood: '' }))
    } catch {
      /* continue */
    }
  }

  try {
    push(await searchPhotonFree(freeQuery, area ?? bias, area?.bbox))
  } catch {
    /* continue */
  }

  // Mahalle seviyesi (sokak yoksa)
  if (results.length === 0 && parts.neighborhood.trim()) {
    try {
      push(
        await searchPhotonFree(
          `${parts.neighborhood} Mahallesi, ${parts.district}, ${parts.province}`,
          area ?? bias,
          area?.bbox,
        ),
      )
    } catch {
      /* continue */
    }
  }

  if (results.length === 0 && area) {
    results.push({
      id: `district-${normalizeTr(parts.district)}-${area.lat.toFixed(4)}`,
      name: parts.neighborhood || parts.district,
      label: `${parts.neighborhood || parts.district}, ${parts.district}, ${parts.province}`,
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
    return await searchPhotonFree(q)
  } catch {
    return []
  }
}

export async function reverseGeocode(lat: number, lng: number): Promise<GeocodeHit | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
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
