import type { GeocodeHit } from '../types/location'

type OpenMeteoResult = {
  id?: number
  name?: string
  latitude?: number
  longitude?: number
  admin1?: string
  admin2?: string
  country?: string
}

type OpenMeteoResponse = {
  results?: OpenMeteoResult[]
}

/** Türkiye odaklı adres / semt araması (Open-Meteo). */
export async function searchPlaces(query: string): Promise<GeocodeHit[]> {
  const q = query.trim()
  if (q.length < 2) return []

  const url =
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}` +
    `&count=6&language=tr&countryCode=TR`

  const res = await fetch(url)
  if (!res.ok) throw new Error('Adres araması başarısız')
  const data = (await res.json()) as OpenMeteoResponse

  return (data.results ?? [])
    .filter(
      (r) =>
        r.name &&
        Number.isFinite(r.latitude) &&
        Number.isFinite(r.longitude),
    )
    .map((r) => {
      const parts = [r.name, r.admin2, r.admin1].filter(Boolean)
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
