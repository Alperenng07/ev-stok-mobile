import * as Location from 'expo-location'

export type UserLocation = {
  lat: number
  lng: number
  label: string
  accuracyM: number | null
}

export class LocationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LocationError'
  }
}

/** Kullanıcının anlık GPS konumunu ister. İzin yoksa hata fırlatır (varsayılan şehir kullanılmaz). */
export async function resolveLiveLocation(): Promise<UserLocation> {
  const services = await Location.hasServicesEnabledAsync()
  if (!services) {
    throw new LocationError('Konum servisleri kapalı. Lütfen cihaz konumunu aç.')
  }

  const { status } = await Location.requestForegroundPermissionsAsync()
  if (status !== 'granted') {
    throw new LocationError('Konum izni gerekli. Ayarlardan izin verip tekrar dene.')
  }

  const pos = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
  })

  const lat = pos.coords.latitude
  const lng = pos.coords.longitude
  const accuracyM = pos.coords.accuracy ?? null

  let label = `${lat.toFixed(5)}, ${lng.toFixed(5)}`
  try {
    const places = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng })
    const p = places[0]
    if (p) {
      const parts = [p.district, p.subregion || p.city, p.region].filter(Boolean)
      label = parts.filter((v, i, arr) => arr.indexOf(v) === i).slice(0, 3).join(', ') || label
    }
  } catch {
    // reverse geocode opsiyonel
  }

  return { lat, lng, label, accuracyM }
}

export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const R = 6371
  const dLat = toRad(bLat - aLat)
  const dLng = toRad(bLng - aLng)
  const lat1 = toRad(aLat)
  const lat2 = toRad(bLat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}
