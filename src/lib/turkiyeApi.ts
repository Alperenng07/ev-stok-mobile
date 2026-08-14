const BASE = 'https://api.turkiyeapi.dev/v2'

export type AdminPlace = {
  id: number
  name: string
  provinceId?: number
  districtId?: number
  latitude?: number
  longitude?: number
}

type ApiProvince = {
  id: number
  name: string
  coordinates?: { latitude?: number; longitude?: number }
}

type ListResponse<T> = {
  data: T[]
  meta: { total: number; limit: number; offset: number }
}

let provincesCache: AdminPlace[] | null = null
const districtsCache = new Map<number, AdminPlace[]>()
const neighborhoodsCache = new Map<number, AdminPlace[]>()

async function fetchAllPages<T>(
  path: string,
  query: Record<string, string | number>,
): Promise<T[]> {
  const out: T[] = []
  let offset = 0
  const limit = 1000

  for (;;) {
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(query)) params.set(k, String(v))
    params.set('limit', String(limit))
    params.set('offset', String(offset))
    params.set('sort', 'name')

    const res = await fetch(`${BASE}${path}?${params.toString()}`)
    if (!res.ok) throw new Error('Türkiye adres listesi alınamadı')
    const json = (await res.json()) as ListResponse<T>
    out.push(...(json.data ?? []))
    const total = json.meta?.total ?? out.length
    offset += limit
    if (out.length >= total || (json.data?.length ?? 0) === 0) break
  }

  return out
}

export async function listProvinces(): Promise<AdminPlace[]> {
  if (provincesCache) return provincesCache
  const rows = await fetchAllPages<ApiProvince>('/provinces', {
    fields: 'id,name,coordinates',
  })
  provincesCache = rows.map((r) => ({
    id: r.id,
    name: r.name,
    latitude: r.coordinates?.latitude,
    longitude: r.coordinates?.longitude,
  }))
  return provincesCache
}

export async function listDistricts(provinceId: number): Promise<AdminPlace[]> {
  const cached = districtsCache.get(provinceId)
  if (cached) return cached
  const rows = await fetchAllPages<AdminPlace>('/districts', {
    provinceId,
    fields: 'id,name,provinceId',
  })
  districtsCache.set(provinceId, rows)
  return rows
}

export async function listNeighborhoods(districtId: number): Promise<AdminPlace[]> {
  const cached = neighborhoodsCache.get(districtId)
  if (cached) return cached
  const rows = await fetchAllPages<AdminPlace>('/neighborhoods', {
    districtId,
    fields: 'id,name,provinceId,districtId',
  })
  neighborhoodsCache.set(districtId, rows)
  return rows
}

export function filterByName(list: AdminPlace[], query: string, limit = 40): AdminPlace[] {
  const q = query.trim().toLocaleLowerCase('tr-TR')
  if (!q) return list.slice(0, limit)
  return list
    .filter((item) => item.name.toLocaleLowerCase('tr-TR').includes(q))
    .slice(0, limit)
}
