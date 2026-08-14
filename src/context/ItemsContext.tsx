import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { addDays, todayISO } from '../lib/date'
import { renewDueItems } from '../lib/itemsLogic'
import { localStore } from '../lib/localStore'
import { isCloudEnabled, supabase } from '../lib/supabase'
import type { FilterId, ItemDraft, StockItem } from '../types'
import { useAuth } from './AuthContext'
import { useFamily } from './FamilyContext'

type DbItem = {
  id: string
  family_id: string
  name: string
  needed_qty: number
  current_qty: number
  unit: string
  due_date: string
  renewal_days: number | null
  purchased: boolean
  purchased_place_id: string | null
  purchased_place_label: string | null
  notes: string
  created_by: string
  created_at: string
  updated_at: string
}

function toStockItem(row: DbItem): StockItem {
  return {
    id: row.id,
    familyId: row.family_id,
    name: row.name,
    neededQty: Number(row.needed_qty),
    currentQty: Number(row.current_qty),
    unit: row.unit,
    dueDate: row.due_date,
    renewalDays: row.renewal_days,
    purchased: row.purchased,
    purchasedPlaceId: row.purchased_place_id ?? null,
    purchasedPlaceLabel: row.purchased_place_label ?? null,
    notes: row.notes ?? '',
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toDbItem(item: StockItem): DbItem {
  return {
    id: item.id,
    family_id: item.familyId,
    name: item.name,
    needed_qty: item.neededQty,
    current_qty: item.currentQty,
    unit: item.unit,
    due_date: item.dueDate,
    renewal_days: item.renewalDays,
    purchased: item.purchased,
    purchased_place_id: item.purchasedPlaceId,
    purchased_place_label: item.purchasedPlaceLabel,
    notes: item.notes,
    created_by: item.createdBy,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  }
}

type ItemsContextValue = {
  items: StockItem[]
  filtered: StockItem[]
  filter: FilterId
  setFilter: (f: FilterId) => void
  query: string
  setQuery: (q: string) => void
  stats: { pending: number; done: number; overdue: number }
  loading: boolean
  syncError: string | null
  addItem: (draft: ItemDraft) => Promise<void>
  updateItem: (id: string, draft: ItemDraft) => Promise<void>
  removeItem: (id: string) => Promise<void>
  togglePurchased: (
    id: string,
    place?: { placeId: string; placeLabel: string } | null,
  ) => Promise<void>
}

const ItemsContext = createContext<ItemsContextValue | null>(null)

export function ItemsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { family } = useFamily()
  const [items, setItems] = useState<StockItem[]>([])
  const [loading, setLoading] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterId>('all')
  const [query, setQuery] = useState('')

  const load = useCallback(async () => {
    if (!family || !user) {
      setItems([])
      return
    }
    setLoading(true)
    try {
      if (isCloudEnabled && supabase) {
        const { data, error } = await supabase
          .from('items')
          .select('*')
          .eq('family_id', family.id)
          .order('due_date', { ascending: true })
        if (error) throw error
        const mapped = (data as DbItem[]).map(toStockItem)
        const renewed = renewDueItems(mapped)
        setItems(renewed)
        for (const item of renewed) {
          const original = mapped.find((m) => m.id === item.id)
          if (original && original.purchased !== item.purchased) {
            await supabase.from('items').upsert(toDbItem(item))
          }
        }
        setSyncError(null)
      } else {
        const local = await localStore.getItems(family.id)
        const renewed = renewDueItems(local)
        setItems(renewed)
        for (const item of renewed) {
          const original = local.find((m) => m.id === item.id)
          if (original && original.purchased !== item.purchased) {
            await localStore.upsertItem(item)
          }
        }
        setSyncError(null)
      }
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Liste yüklenemedi')
    } finally {
      setLoading(false)
    }
  }, [family, user])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!isCloudEnabled || !supabase || !family) return
    const channel = supabase
      .channel(`items-${family.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'items', filter: `family_id=eq.${family.id}` },
        () => {
          void load()
        },
      )
      .subscribe()
    return () => {
      void channel.unsubscribe()
    }
  }, [family, load])

  const persist = useCallback(
    async (item: StockItem) => {
      try {
        if (isCloudEnabled && supabase) {
          const { error } = await supabase.from('items').upsert(toDbItem(item))
          if (error) throw error
        } else {
          await localStore.upsertItem(item)
        }
        setSyncError(null)
      } catch (err) {
        setSyncError(err instanceof Error ? err.message : 'Kayıt hatası')
      }
    },
    [],
  )

  const addItem = useCallback(
    async (draft: ItemDraft) => {
      if (!family || !user) return
      const now = new Date().toISOString()
      const item: StockItem = {
        id: crypto.randomUUID(),
        familyId: family.id,
        name: draft.name.trim(),
        neededQty: draft.neededQty,
        currentQty: draft.currentQty,
        unit: draft.unit.trim() || 'adet',
        dueDate: draft.dueDate,
        renewalDays: draft.renewalDays,
        purchased: false,
        purchasedPlaceId: null,
        purchasedPlaceLabel: null,
        notes: draft.notes.trim(),
        createdBy: user.id,
        createdAt: now,
        updatedAt: now,
      }
      setItems((prev) => [item, ...prev])
      await persist(item)
    },
    [family, user, persist],
  )

  const updateItem = useCallback(
    async (id: string, draft: ItemDraft) => {
      let next: StockItem | null = null
      setItems((prev) =>
        prev.map((item) => {
          if (item.id !== id) return item
          next = {
            ...item,
            name: draft.name.trim(),
            neededQty: draft.neededQty,
            currentQty: draft.currentQty,
            unit: draft.unit.trim() || 'adet',
            dueDate: draft.dueDate,
            renewalDays: draft.renewalDays,
            notes: draft.notes.trim(),
            updatedAt: new Date().toISOString(),
          }
          return next
        }),
      )
      if (next) await persist(next)
    },
    [persist],
  )

  const removeItem = useCallback(async (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id))
    try {
      if (isCloudEnabled && supabase) {
        const { error } = await supabase.from('items').delete().eq('id', id)
        if (error) throw error
      } else {
        await localStore.deleteItem(id)
      }
      setSyncError(null)
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Silme hatası')
    }
  }, [])

  const togglePurchased = useCallback(
    async (id: string, place?: { placeId: string; placeLabel: string } | null) => {
      let next: StockItem | null = null
      setItems((prev) =>
        prev.map((item) => {
          if (item.id !== id) return item
          const now = new Date().toISOString()
          if (!item.purchased) {
            const nextDue =
              item.renewalDays && item.renewalDays > 0
                ? addDays(todayISO(), item.renewalDays)
                : item.dueDate
            next = {
              ...item,
              purchased: true,
              currentQty: item.currentQty + item.neededQty,
              dueDate: nextDue,
              purchasedPlaceId: place?.placeId ?? null,
              purchasedPlaceLabel: place?.placeLabel ?? null,
              updatedAt: now,
            }
            return next
          }
          next = {
            ...item,
            purchased: false,
            purchasedPlaceId: null,
            purchasedPlaceLabel: null,
            updatedAt: now,
          }
          return next
        }),
      )
      if (next) await persist(next)
    },
    [persist],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr')
    return items
      .filter((item) => {
        if (q && !item.name.toLocaleLowerCase('tr').includes(q)) return false
        if (filter === 'pending') return !item.purchased
        if (filter === 'done') return item.purchased
        if (filter === 'overdue') return !item.purchased && item.dueDate < todayISO()
        return true
      })
      .sort((a, b) => {
        if (a.purchased !== b.purchased) return a.purchased ? 1 : -1
        return a.dueDate.localeCompare(b.dueDate) || a.name.localeCompare(b.name, 'tr')
      })
  }, [items, filter, query])

  const stats = useMemo(() => {
    const pending = items.filter((i) => !i.purchased).length
    const done = items.filter((i) => i.purchased).length
    const overdue = items.filter((i) => !i.purchased && i.dueDate < todayISO()).length
    return { pending, done, overdue }
  }, [items])

  const value = useMemo(
    () => ({
      items,
      filtered,
      filter,
      setFilter,
      query,
      setQuery,
      stats,
      loading,
      syncError,
      addItem,
      updateItem,
      removeItem,
      togglePurchased,
    }),
    [
      items,
      filtered,
      filter,
      query,
      stats,
      loading,
      syncError,
      addItem,
      updateItem,
      removeItem,
      togglePurchased,
    ],
  )

  return <ItemsContext.Provider value={value}>{children}</ItemsContext.Provider>
}

export function useItems() {
  const ctx = useContext(ItemsContext)
  if (!ctx) throw new Error('useItems ItemsProvider içinde kullanılmalı')
  return ctx
}
