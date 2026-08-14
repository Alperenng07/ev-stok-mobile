import type { MarketChain, MarketChainId } from '../types/budget'

export const KNOWN_CHAINS: MarketChain[] = [
  { id: 'bim', name: 'BİM', color: '#E30613' },
  { id: 'sok', name: 'Şok', color: '#FFCC00' },
  { id: 'a101', name: 'A101', color: '#00A651' },
  { id: 'migros', name: 'Migros', color: '#FF6600' },
  { id: 'carrefour', name: 'CarrefourSA', color: '#004E9A' },
  { id: 'tarim_kredi', name: 'Tarım Kredi', color: '#2E7D32' },
  { id: 'file', name: 'File', color: '#6A1B9A' },
]

const KNOWN: Record<string, MarketChain> = Object.fromEntries(
  KNOWN_CHAINS.map((c) => [c.id, c]),
)

export function normalizeChainId(raw: string): MarketChainId {
  const key = raw.trim().toLocaleLowerCase('tr').replace(/\s+/g, '_')
  if (key.includes('bim')) return 'bim'
  if (key.includes('sok') || key.includes('şok')) return 'sok'
  if (key.includes('a101')) return 'a101'
  if (key.includes('migros')) return 'migros'
  if (key.includes('carrefour')) return 'carrefour'
  if (key.includes('tarim') || key.includes('tarım')) return 'tarim_kredi'
  if (key.includes('file')) return 'file'
  if (key === 'other' || key === 'diger' || key === 'diğer') return 'other'
  return key || 'other'
}

export function chainById(id: MarketChainId): MarketChain {
  if (id === 'other' || id === 'diger') {
    return { id: 'other', name: 'Diğer', color: '#5B6B63' }
  }
  return (
    KNOWN[id] ?? {
      id,
      name: id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      color: '#0F3D2E',
    }
  )
}

export function formatChainName(raw: string): string {
  return chainById(normalizeChainId(raw)).name
}

export type PurchasePlaceOption = {
  id: string
  label: string
  color: string
  unitPrice?: number
}

/**
 * “Nereden aldın?” seçenekleri.
 * `availableChainIds` verilirse yalnızca fiyatı olan marketler + Diğer.
 * Verilmezse / boşsa yalnızca Diğer (fiyatsız market seçilemez).
 */
export function purchasePlaceOptions(
  availableChainIds?: Iterable<string> | null,
): PurchasePlaceOption[] {
  const other: PurchasePlaceOption = { id: 'other', label: 'Diğer', color: '#5B6B63' }
  if (!availableChainIds) return [other]

  const ids = [...new Set([...availableChainIds].map((id) => normalizeChainId(id)))].filter(
    (id) => id && id !== 'other',
  )
  if (ids.length === 0) return [other]

  const knownOrder = new Map(KNOWN_CHAINS.map((c, i) => [c.id, i]))
  ids.sort((a, b) => (knownOrder.get(a) ?? 99) - (knownOrder.get(b) ?? 99))

  return [
    ...ids.map((id) => {
      const chain = chainById(id)
      return { id: chain.id, label: chain.name, color: chain.color }
    }),
    other,
  ]
}

/** Tekliflerden en ucuz birim fiyatı olan zincirleri seçenek listesine çevirir. */
export function purchasePlaceOptionsFromOffers(
  offers: { chainId: string; unitPrice: number }[] | null | undefined,
): PurchasePlaceOption[] {
  if (!offers || offers.length === 0) return purchasePlaceOptions([])

  const best = new Map<string, number>()
  for (const o of offers) {
    const id = normalizeChainId(o.chainId)
    if (!id || id === 'other') continue
    const prev = best.get(id)
    if (prev == null || o.unitPrice < prev) best.set(id, o.unitPrice)
  }

  return purchasePlaceOptions(best.keys()).map((opt) =>
    opt.id === 'other' ? opt : { ...opt, unitPrice: best.get(opt.id) },
  )
}
