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

type OpenMeteoResult = {
  id?: number
  name?: string
  latitude?: number
  longitude?: number
  admin1?: string
  admin2?: string
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

async function searchPhotonFree(query: string, bias?: { lat: number; lng: number }): Promise<GeocodeHit[]> {
  const lat = bias?.lat ?? TR_BIAS.lat
  const lon = bias?.lng ?? TR_BIAS.lon
  const url =
    `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}` +
    `&lang=tr&limit=8&lat=${lat}&lon=${lon}`
  const res = await fetch(url)
  if (!res.ok) throw new Error('Adres araması başarısız')
  const data = (await res.json()) as PhotonResponse
  return fromPhoton(data.features)
}

async function searchPhotonStructured(parts: StructuredAddress): Promise<GeocodeHit[]> {
  const params = new URLSearchParams()
  params.set('countrycode', 'TR')
  params.set('limit', '8')
  params.set('lang', 'tr')
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

async function searchOpenMeteo(query: string): Promise<GeocodeHit[]> {
  const url =
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}` +
    `&count=6&language=tr&countryCode=TR`
  const res = await fetch(url)
  if (!res.ok) return []
  const data = (await res.json()) as { results?: OpenMeteoResult[] }
  return (data.results ?? [])
    .filter((r) => r.name && Number.isFinite(r.latitude) && Number.isFinite(r.longitude))
    .map((r) => {
      const parts = [r.name, r.admin2, r.admin1].filter(Boolean) as string[]
      const label = parts.filter((v, i, arr) => arr.indexOf(v) === i).join(', ')
      return {
        id: String(r.id ?? `${r.latitude},${r.longitude}`),
        name: r.name!,
        label,
        lat: Number(r.latitude),
        lng: Number(r.longitude),
      }
    })
}

function composeAddressQuery(parts: StructuredAddress): string {
  return [
    parts.street.trim() && parts.buildingNo.trim()
      ? `${parts.street.trim()} No:${parts.buildingNo.trim()}`
      : parts.street.trim(),
    parts.neighborhood.trim(),
    parts.district.trim(),
    parts.province.trim(),
  ]
    .filter(Boolean)
    .join(' ')
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

/** Sokak önerileri: il/ilçe/mahalle bağlamında Photon araması. */
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

  try {
    pushUnique(
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

  const free = [street, context.neighborhood, context.district, context.province]
    .filter(Boolean)
    .join(' ')
  try {
    pushUnique(await searchPhotonFree(free, bias))
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

  try {
    pushUnique(await searchPhotonStructured(parts))
  } catch {
    /* continue */
  }

  if (results.length === 0 && parts.street.trim()) {
    try {
      // Mahalle bazen city/district karışıyor; sokak + ilçe + il ile tekrar dene
      pushUnique(
        await searchPhotonStructured({
          ...parts,
          neighborhood: '',
        }),
      )
    } catch {
      /* continue */
    }
  }

  const freeQuery = composeAddressQuery(parts)
  if (results.length < 3 && freeQuery.length >= 3) {
    try {
      pushUnique(await searchPhotonFree(freeQuery, bias))
    } catch {
      /* continue */
    }
  }

  if (results.length === 0 && freeQuery.length >= 3) {
    pushUnique(await searchOpenMeteo(freeQuery))
  }

  // En azından ilçe merkezi
  if (results.length === 0) {
    pushUnique(await searchOpenMeteo(`${parts.district.trim()}, ${parts.province.trim()}`))
  }

  return results
}

/** Serbest metin araması (yedek). */
export async function searchPlaces(query: string): Promise<GeocodeHit[]> {
  const q = query.trim()
  if (q.length < 3) return []
  try {
    const photon = await searchPhotonFree(q)
    if (photon.length > 0) return photon
  } catch {
    /* fall through */
  }
  return searchOpenMeteo(q)
}

export async function reverseGeocode(lat: number, lng: number): Promise<GeocodeHit | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  const url =
    `https://photon.komoot.io/reverse?lat=${encodeURIComponent(String(lat))}` +
    `&lon=${encodeURIComponent(String(lng))}&lang=tr&limit=1`
  const res = await fetch(url)
  if (!res.ok) return null
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
