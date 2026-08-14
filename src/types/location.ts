export type ShoppingLocation = {
  id: string
  name: string
  lat: number
  lng: number
  label: string
  createdAt: string
}

export type LocationMode = 'live' | 'saved'

export type LocationPreference = {
  mode: LocationMode
  savedId: string | null
  places: ShoppingLocation[]
}

export type GeocodeHit = {
  id: string
  name: string
  label: string
  lat: number
  lng: number
}
