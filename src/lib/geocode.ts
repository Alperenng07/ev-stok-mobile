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
  address?: {
    road?: string
    pedestrian?: string
    neighbourhood?: string
    suburb?: string
    city_district?: string
    district?: string
    town?: string
    city?: string
    province?: string
    state?: string
    postcode?: string
  }
}

export type StructuredAddress = {
  /** İl */
  province: string
  /** İlçe */
  district: string
  /** Mahalle */
  neighborhood: string
  /** Sokak / cadde */
  street: string
  /** Kapı no */
  buildingNo: string
  /** Daire (etiket için; geocode’a etkisi yok) */
  apartment?: string
}

const TR_BIAS = { lat: 39.0, lon: 35.0 }
const NOMINATIM_UA = 'EvStok/1.0 (https://github.com/Alperenng07/ev-stok; household list app)'

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
      const parts = [
        street,
        addr?.neighbourhood || addr?.suburb,
        addr?.city_district || addr?.district || addr?.town || addr?.city,
        addr?.province || addr?.state,
        addr?.postcode,
      ].filter(Boolean) as string[]
      const label = parts.filter((v, idx, arr) => arr.indexOf(v) === idx).join(', ')
      const id = `n-${item.place_id ?? i}-${lat.toFixed(5)},${lng.toFixed(5)}`
      if (seen.has(id)) return null
      seen.add(id)
      return { id, name: street, label: label || item.display_name || street, lat, lng }
    })
    .filter((h): h is GeocodeHit => h != null)
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

function filterByRegion(
  hits: GeocodeHit[],
  province: string,
  district?: string,
): GeocodeHit[] {
  const matched = hits.filter((h) => hitMatchesRegion(h, province, district))
  return matched.length > 0 ? matched : hits.filter((h) => hitMatchesRegion(h, province))
}

async function searchPhotonFree(query: string, bias?: { lat: number; lng: number }): Promise<GeocodeHit[]> {
  const lat = bias?.lat ?? TR_BIAS.lat
  const lon = bias?.lng ?? TR_BIAS.lon
  // Photon lang=tr DESTEKLEMİYOR (400); lang gönderme.
  const url =
    `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}` +
    `&limit=8&lat=${lat}&lon=${lon}`
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

async function searchNominatim(query: string): Promise<GeocodeHit[]> {
  const q = query.trim()
  if (q.length < 3) return []
  const url =
    `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1` +
    `&limit=8&countrycodes=tr&q=${encodeURIComponent(q)}`
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': NOMINATIM_UA,
    },
  })
  if (!res.ok) return []
  const data = (await res.json()) as NominatimItem[]
  return fromNominatim(Array.isArray(data) ? data : [])
}

async function reverseNominatim(lat: number, lng: number): Promise<GeocodeHit | null> {
  const url =
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1` +
    `&lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lng))}`
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': NOMINATIM_UA,
    },
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

/** İlçe merkezi yaklaşık koordinatı (sokak araması bias için). */
export async function resolveDistrictBias(
  province: string,
  district: string,
): Promise<{ lat: number; lng: number } | null> {
  const hits = await searchNominatim(`${district}, ${province}, Türkiye`)
  const matched = filterByRegion(hits, province, district)
  const hit = matched[0] ?? hits[0]
  if (!hit || !isValidTurkeyCoord(hit.lat, hit.lng)) return null
  return { lat: hit.lat, lng: hit.lng }
}

/** Sokak önerileri: il/ilçe/mahalle bağlamında. */
export async function searchStreetSuggestions(
  streetQuery: string,
  context: Pick<StructuredAddress, 'province' | 'district' | 'neighborhood'>,
  bias?: { lat: number; lng: number },
): Promise<GeocodeHit[]> {
  const street = streetQuery.trim()
  if (street.length < 2) return []
  if (!context.province.trim() || !context.district.trim()) return []

  const results: GeocodeHit[] = []
  const pushUnique = (list: GeocodeHit[]) => {
    for (const hit of list) {
      if (!results.some((r) => r.id === hit.id)) results.push(hit)
    }
  }

  const areaBias = bias ?? (await resolveDistrictBias(context.province, context.district)) ?? undefined

  try {
    pushUnique(
      filterByRegion(
        await searchPhotonStructured({
          province: context.province,
          district: context.district,
          neighborhood: context.neighborhood,
          street,
          buildingNo: '',
        }),
        context.province,
        context.district,
      ),
    )
  } catch {
    /* continue */
  }

  const free = [
    street,
    context.neighborhood ? `${context.neighborhood} Mahallesi` : '',
    context.district,
    context.province,
    'Türkiye',
  ]
    .filter(Boolean)
    .join(', ')

  try {
    pushUnique(filterByRegion(await searchNominatim(free), context.province, context.district))
  } catch {
    /* continue */
  }

  try {
    pushUnique(
      filterByRegion(await searchPhotonFree(free, areaBias), context.province, context.district),
    )
  } catch {
    /* continue */
  }

  return results.slice(0, 8)
}

/** İl / ilçe / mahalle / sokak alanlarıyla konum bul. */
export async function searchStructuredAddress(
  parts: StructuredAddress,
  bias?: { lat: number; lng: number },
): Promise<GeocodeHit[]> {
  if (!parts.province.trim() || !parts.district.trim()) {
    throw new Error('İl ve ilçe zorunlu.')
  }

  const results: GeocodeHit[] = []
  const pushUnique = (list: GeocodeHit[]) => {
    for (const hit of list) {
      if (!results.some((r) => r.id === hit.id)) results.push(hit)
    }
  }

  const areaBias =
    bias ?? (await resolveDistrictBias(parts.province, parts.district)) ?? undefined
  const freeQuery = composeAddressQuery(parts)

  // 1) Nominatim — TR sokak adreslerinde en güvenilir ücretsiz kaynak
  try {
    pushUnique(filterByRegion(await searchNominatim(freeQuery), parts.province, parts.district))
  } catch {
    /* continue */
  }

  // 2) Photon structured (lang=tr YOK)
  try {
    pushUnique(filterByRegion(await searchPhotonStructured(parts), parts.province, parts.district))
  } catch {
    /* continue */
  }

  if (results.length < 3 && parts.street.trim()) {
    try {
      pushUnique(
        filterByRegion(
          await searchPhotonStructured({ ...parts, neighborhood: '' }),
          parts.province,
          parts.district,
        ),
      )
    } catch {
      /* continue */
    }
  }

  if (results.length < 3 && freeQuery.length >= 3) {
    try {
      pushUnique(
        filterByRegion(await searchPhotonFree(freeQuery, areaBias), parts.province, parts.district),
      )
    } catch {
      /* continue */
    }
  }

  // Son çare: ilçe merkezi (sokak bulunamazsa en azından doğru ilçe)
  if (results.length === 0 && areaBias) {
    results.push({
      id: `district-${parts.district}-${areaBias.lat.toFixed(4)}`,
      name: parts.district,
      label: `${parts.neighborhood || parts.district}, ${parts.district}, ${parts.province} (ilçe merkezi ≈)`,
      lat: areaBias.lat,
      lng: areaBias.lng,
    })
  }

  return results
}

/** Serbest metin araması (yedek). */
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
    const photon = await searchPhotonFree(q)
    if (photon.length > 0) return photon
  } catch {
    /* fall through */
  }
  return []
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
