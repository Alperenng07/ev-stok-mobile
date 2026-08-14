import type { GeocodeHit } from '../types/location'

type PhotonProps = {
  name?: string
  street?: string
  housenumber?: string
  district?: string
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

const TR_BIAS = { lat: 39.0, lon: 35.0 }
const TR_BBOX = '25.6,35.8,44.9,42.2'

function labelFromPhoton(p: PhotonProps): { name: string; label: string } {
  const streetLine = [p.housenumber, p.street].filter(Boolean).join(' ').trim()
  const name = streetLine || p.name || p.district || p.city || 'Konum'
  const parts = [
    streetLine && p.name && p.name !== streetLine ? p.name : null,
    streetLine || null,
    !streetLine ? p.name : null,
    p.district,
    p.city || p.county,
    p.state,
    p.postcode,
  ].filter(Boolean) as string[]
  const uniq = parts.filter((v, i, arr) => arr.indexOf(v) === i)
  return { name, label: uniq.join(', ') || name }
}

function fromPhoton(features: PhotonFeature[] | undefined): GeocodeHit[] {
  return (features ?? [])
    .map((f, i) => {
      const coords = f.geometry?.coordinates
      const props = f.properties
      if (!coords || !props) return null
      const [lng, lat] = coords
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
      if (props.countrycode && props.countrycode.toUpperCase() !== 'TR') return null
      const { name, label } = labelFromPhoton(props)
      return {
        id: `${props.osm_type ?? 'p'}-${props.osm_id ?? i}-${lat.toFixed(5)},${lng.toFixed(5)}`,
        name,
        label,
        lat,
        lng,
      } satisfies GeocodeHit
    })
    .filter((h): h is GeocodeHit => h != null)
}

async function searchPhoton(query: string): Promise<GeocodeHit[]> {
  const url =
    `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}` +
    `&lang=tr&limit=8&lat=${TR_BIAS.lat}&lon=${TR_BIAS.lon}&bbox=${TR_BBOX}`
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

export async function searchPlaces(query: string): Promise<GeocodeHit[]> {
  const q = query.trim()
  if (q.length < 3) return []

  try {
    const photon = await searchPhoton(q)
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

export function buildMapPickerHtml(lat: number, lng: number, zoom = 15): string {
  const safeLat = Number.isFinite(lat) ? lat : DEFAULT_MAP_CENTER.lat
  const safeLng = Number.isFinite(lng) ? lng : DEFAULT_MAP_CENTER.lng
  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    html, body, #map { height: 100%; margin: 0; background: #e8ece5; }
    .hint {
      position: absolute; z-index: 1000; left: 10px; right: 10px; top: 10px;
      background: rgba(255,252,247,0.95); border-radius: 10px; padding: 8px 10px;
      font: 600 12px/1.35 system-ui, sans-serif; color: #1e2a22;
      box-shadow: 0 4px 14px rgba(0,0,0,0.12);
    }
  </style>
</head>
<body>
  <div class="hint">Haritaya dokun veya iğneyi sürükle</div>
  <div id="map"></div>
  <script>
    const start = { lat: ${safeLat}, lng: ${safeLng} };
    const map = L.map('map', { zoomControl: true }).setView([start.lat, start.lng], ${zoom});
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);
    const marker = L.marker([start.lat, start.lng], { draggable: true }).addTo(map);
    function emit(ll) {
      const payload = JSON.stringify({ type: 'pick', lat: ll.lat, lng: ll.lng });
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(payload);
      else window.parent.postMessage(payload, '*');
    }
    map.on('click', function (e) {
      marker.setLatLng(e.latlng);
      emit(e.latlng);
    });
    marker.on('dragend', function () { emit(marker.getLatLng()); });
    setTimeout(function () { map.invalidateSize(); emit(marker.getLatLng()); }, 200);
  </script>
</body>
</html>`
}
