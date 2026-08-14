import { isValidTurkeyCoord, reverseGeocode } from './geocode'
import type { GeocodeHit } from '../types/location'

export type ParsedMapsCoords = {
  lat: number
  lng: number
  source: 'google-maps-url' | 'latlng'
}

export function parseMapsLink(input: string): ParsedMapsCoords | null {
  const text = input.trim()
  if (!text) return null

  const bare = text.match(/^(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)$/)
  if (bare) {
    const lat = Number(bare[1])
    const lng = Number(bare[2])
    if (isValidTurkeyCoord(lat, lng)) return { lat, lng, source: 'latlng' }
  }

  const at = text.match(/@(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/)
  if (at) {
    const lat = Number(at[1])
    const lng = Number(at[2])
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng, source: 'google-maps-url' }
  }

  const bang = text.match(/!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/)
  if (bang) {
    return { lat: Number(bang[1]), lng: Number(bang[2]), source: 'google-maps-url' }
  }

  const q = text.match(
    /[?&#](?:q|query|ll|destination|center)=(-?\d{1,2}\.\d+)\s*,\s*\+?(-?\d{1,3}\.\d+)/i,
  )
  if (q) {
    return { lat: Number(q[1]), lng: Number(q[2]), source: 'google-maps-url' }
  }

  const searchPath = text.match(/\/maps\/search\/(-?\d{1,2}\.\d+)\s*,\s*\+?(-?\d{1,3}\.\d+)/)
  if (searchPath) {
    return {
      lat: Number(searchPath[1]),
      lng: Number(searchPath[2]),
      source: 'google-maps-url',
    }
  }

  const placeAt = text.match(/\/maps\/place\/[^/]+\/@(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/)
  if (placeAt) {
    return { lat: Number(placeAt[1]), lng: Number(placeAt[2]), source: 'google-maps-url' }
  }

  const encoded = text.match(
    /[?&](?:q|query|ll|destination)=(-?\d{1,2}\.\d+)%2C\+?(-?\d{1,3}\.\d+)/i,
  )
  if (encoded) {
    return { lat: Number(encoded[1]), lng: Number(encoded[2]), source: 'google-maps-url' }
  }

  return null
}

export function isLikelyShortMapsLink(input: string): boolean {
  return /maps\.app\.goo\.gl|goo\.gl\/maps|g\.page\//i.test(input)
}

export async function resolveMapsLinkToPlace(input: string): Promise<GeocodeHit> {
  if (isLikelyShortMapsLink(input)) {
    throw new Error(
      'Kısa link (maps.app.goo.gl) doğrudan okunamıyor. Linki tarayıcıda/uygulamada açıp adres çubuğundaki uzun URL’yi kopyala.',
    )
  }

  const parsed = parseMapsLink(input)
  if (!parsed) {
    throw new Error(
      'Google Maps konumunu çıkaramadım. Maps’te pin koy → Paylaş → uzun bağlantıyı yapıştır veya “41.01, 28.97” yaz.',
    )
  }
  if (!isValidTurkeyCoord(parsed.lat, parsed.lng)) {
    throw new Error('Bu nokta Türkiye dışında görünüyor.')
  }

  const reversed = await reverseGeocode(parsed.lat, parsed.lng)
  return (
    reversed ?? {
      id: `${parsed.lat.toFixed(5)},${parsed.lng.toFixed(5)}`,
      name: 'Google Maps konumu',
      label: `${parsed.lat.toFixed(5)}, ${parsed.lng.toFixed(5)}`,
      lat: parsed.lat,
      lng: parsed.lng,
    }
  )
}

export function googleMapsOpenUrl(query?: string): string {
  if (query && query.trim()) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query.trim())}`
  }
  return 'https://www.google.com/maps'
}
