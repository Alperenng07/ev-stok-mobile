import * as Location from 'expo-location'
import { Linking, Platform } from 'react-native'
import type { LocationPreference } from '../types/location'
import { isValidTurkeyCoord } from './geocode'

export type UserLocation = {
  lat: number
  lng: number
  label: string
  accuracyM: number | null
}

export type LocationErrorCode =
  | 'permission'
  | 'unavailable'
  | 'timeout'
  | 'unsupported'
  | 'other'

export class LocationError extends Error {
  code: LocationErrorCode

  constructor(message: string, code: LocationErrorCode = 'other') {
    super(message)
    this.name = 'LocationError'
    this.code = code
  }
}

export async function resolveLiveLocation(): Promise<UserLocation> {
  const services = await Location.hasServicesEnabledAsync()
  if (!services) {
    throw new LocationError('Konum servisleri kapalı. Lütfen cihaz konumunu aç.', 'unavailable')
  }

  const { status } = await Location.requestForegroundPermissionsAsync()
  if (status !== 'granted') {
    throw new LocationError(
      'Konum izni kapalı. Ayarlardan bu uygulamaya konum izni ver.',
      'permission',
    )
  }

  const pos = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
  })

  const lat = pos.coords.latitude
  const lng = pos.coords.longitude
  if (!isValidTurkeyCoord(lat, lng)) {
    throw new LocationError(
      'Konum Türkiye dışında görünüyor. Kayıtlı Google Maps konumu seç.',
      'other',
    )
  }
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
    /* optional */
  }

  return { lat, lng, label, accuracyM }
}

export async function resolveBudgetLocation(
  prefs: LocationPreference,
): Promise<UserLocation> {
  if (prefs.mode === 'saved' && prefs.savedId) {
    const place = prefs.places.find((p) => p.id === prefs.savedId)
    if (!place) {
      throw new LocationError('Kayıtlı konum bulunamadı.')
    }
    if (!isValidTurkeyCoord(place.lat, place.lng)) {
      throw new LocationError('Kayıtlı konum geçersiz. Google Maps linkiyle yeniden ekle.')
    }
    return {
      lat: place.lat,
      lng: place.lng,
      label: `${place.name} · ${place.label}`,
      accuracyM: null,
    }
  }
  return resolveLiveLocation()
}

/** Uygulama / sistem konum ayarlarını aç. */
export async function openAppLocationSettings(): Promise<void> {
  try {
    await Linking.openSettings()
  } catch {
    if (Platform.OS === 'android') {
      await Linking.openURL('app-settings:')
    }
  }
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
