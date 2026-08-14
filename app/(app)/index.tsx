import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ItemFormModal } from '../../src/components/ItemFormModal'
import { ItemRow } from '../../src/components/ItemRow'
import { PurchasePlaceModal } from '../../src/components/PurchasePlaceModal'
import { Banner, Button } from '../../src/components/ui'
import { useBudgetCache } from '../../src/context/BudgetCacheContext'
import { useFamily } from '../../src/context/FamilyContext'
import { useItems } from '../../src/context/ItemsContext'
import { useSavings } from '../../src/context/SavingsContext'
import { formatTry } from '../../src/lib/budgetPlanner'
import { budgetLocationKey } from '../../src/lib/location'
import { locationPrefsStore } from '../../src/lib/locationPrefsStore'
import { computePurchaseSavings } from '../../src/lib/purchaseSavings'
import { colors } from '../../src/theme/colors'
import type { FilterId, StockItem } from '../../src/types'

const FILTERS: { id: FilterId; label: string }[] = [
  { id: 'all', label: 'Tümü' },
  { id: 'pending', label: 'Alınacak' },
  { id: 'done', label: 'Alındı' },
  { id: 'overdue', label: 'Geciken' },
]

export default function ListScreen() {
  const router = useRouter()
  const { family } = useFamily()
  const { hasCacheFor, getLineForItemAt, result: budgetResult } = useBudgetCache()
  const { addPurchaseSavings } = useSavings()
  const [locationKey, setLocationKey] = useState('live')
  const hasCache = hasCacheFor(locationKey)
  const getLineForItem = (itemId: string) => getLineForItemAt(itemId, locationKey)

  useFocusEffect(
    useCallback(() => {
      void locationPrefsStore.load().then((prefs) => {
        setLocationKey(budgetLocationKey(prefs))
      })
    }, []),
  )
  const {
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
  } = useItems()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<StockItem | null>(null)
  const [placeItem, setPlaceItem] = useState<StockItem | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  function openCreate() {
    setEditing(null)
    setFormOpen(true)
  }

  function goCalculate() {
    router.push({ pathname: '/(app)/budget', params: { autostart: '1' } })
  }

  function onToggle(item: StockItem) {
    if (item.purchased) {
      void togglePurchased(item.id)
      return
    }
    setPlaceItem(item)
  }

  async function onPlaceConfirm(place: { placeId: string; placeLabel: string }) {
    if (!placeItem) return
    const item = placeItem
    setPlaceItem(null)

    await togglePurchased(item.id, place)

    if (place.placeId === 'other') {
      setFlash('Alındı · Diğer (bilanço için fiyat yok)')
      return
    }

    if (!hasCache) {
      setFlash('Alındı kaydedildi. Bilanço için önce Bütçe’de Hesapla.')
      return
    }

    const line = getLineForItem(item.id)
    if (!line) {
      setFlash('Alındı kaydedildi. Bu ürün son hesapta yoktu; tekrar Hesapla.')
      return
    }

    const calc = computePurchaseSavings(line, place.placeId)
    if (!calc) {
      setFlash(`Alındı · ${place.placeLabel} (bu markette fiyat yoktu)`)
      return
    }

    await addPurchaseSavings({
      itemId: item.id,
      itemName: item.name,
      placeId: place.placeId,
      placeLabel: place.placeLabel,
      paidUnitPrice: calc.paidUnitPrice,
      qty: calc.qty,
      savedAmount: calc.savedAmount,
      missedAmount: calc.missedAmount,
      minUnitPrice: calc.minUnitPrice,
      maxUnitPrice: calc.maxUnitPrice,
      catalogName: calc.catalogName,
      locationLabel: budgetResult?.locationLabel ?? '',
    })

    const parts: string[] = [`Alındı · ${place.placeLabel}`]
    if (calc.savedAmount > 0) parts.push(`+${formatTry(calc.savedAmount)} tasarruf`)
    if (calc.missedAmount > 0) parts.push(`${formatTry(calc.missedAmount)} kaçırılan`)
    setFlash(parts.join(' · '))
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.brand}>Ev Stok</Text>
          <Text style={styles.tagline}>{family?.name ?? 'Aile listesi'}</Text>
        </View>
        <Button
          label={hasCache ? 'Tekrar hesapla' : 'Hesapla'}
          onPress={goCalculate}
          variant={hasCache ? 'secondary' : 'primary'}
        />
      </View>

      {hasCache ? (
        <Banner text="Bütçe hazır. Alındı + market seçince tasarruf bilançoya düşer." tone="ok" />
      ) : (
        <Banner text="Önce Hesapla’ya bas. Sonra alındı marketi seçince bilanço dolar." />
      )}
      {flash ? <Banner text={flash} tone="ok" /> : null}
      {syncError ? <Banner text={syncError} tone="err" /> : null}

      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text style={styles.statN}>{stats.pending}</Text>
          <Text style={styles.statL}>alınacak</Text>
        </View>
        <View style={styles.stat}>
          <Text style={[styles.statN, { color: colors.ok }]}>{stats.done}</Text>
          <Text style={styles.statL}>alındı</Text>
        </View>
        <View style={styles.stat}>
          <Text style={[styles.statN, { color: colors.warn }]}>{stats.overdue}</Text>
          <Text style={styles.statL}>geciken</Text>
        </View>
      </View>

      <TextInput
        style={styles.search}
        placeholder="Ürün ara…"
        placeholderTextColor={colors.inkMuted}
        value={query}
        onChangeText={setQuery}
      />

      <View style={styles.filters}>
        {FILTERS.map((f) => (
          <Pressable
            key={f.id}
            onPress={() => setFilter(f.id)}
            style={[styles.filter, filter === f.id && styles.filterActive]}
          >
            <Text style={[styles.filterText, filter === f.id && styles.filterTextActive]}>
              {f.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              {loading ? 'Liste yükleniyor…' : 'Burada henüz ürün yok.'}
            </Text>
            {!loading ? <Button label="İlk ürünü ekle" onPress={openCreate} /> : null}
          </View>
        }
        renderItem={({ item }) => (
          <ItemRow
            item={item}
            onToggle={() => onToggle(item)}
            onEdit={() => {
              setEditing(item)
              setFormOpen(true)
            }}
          />
        )}
      />

      <Pressable style={styles.fab} onPress={openCreate}>
        <Text style={styles.fabPlus}>+</Text>
        <Text style={styles.fabLabel}>Ekle</Text>
      </Pressable>

      <ItemFormModal
        open={formOpen}
        initial={editing}
        onClose={() => setFormOpen(false)}
        onSubmit={(draft) => {
          if (editing) void updateItem(editing.id, draft)
          else void addItem(draft)
        }}
        onDelete={editing ? () => void removeItem(editing.id) : undefined}
      />

      <PurchasePlaceModal
        open={placeItem != null}
        itemName={placeItem?.name ?? ''}
        offers={placeItem ? getLineForItem(placeItem.id)?.offers ?? [] : null}
        onClose={() => setPlaceItem(null)}
        onConfirm={(place) => {
          void onPlaceConfirm(place)
        }}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 16 },
  header: {
    paddingTop: 8,
    paddingBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  brand: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.brand,
    letterSpacing: -0.5,
  },
  tagline: {
    marginTop: 2,
    color: colors.inkMuted,
    fontSize: 14,
  },
  stats: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  stat: {
    flex: 1,
    backgroundColor: colors.bgElevated,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
    alignItems: 'center',
  },
  statN: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.brand,
  },
  statL: {
    marginTop: 2,
    fontSize: 12,
    color: colors.inkMuted,
    fontWeight: '600',
  },
  search: {
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.ink,
    marginBottom: 10,
  },
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  filter: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElevated,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  filterActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  filterText: {
    fontWeight: '700',
    color: colors.ink,
    fontSize: 13,
  },
  filterTextActive: {
    color: '#fff',
  },
  list: {
    paddingBottom: 100,
    paddingTop: 4,
  },
  empty: {
    marginTop: 48,
    alignItems: 'center',
    gap: 14,
  },
  emptyText: {
    color: colors.inkMuted,
    fontSize: 15,
  },
  fab: {
    position: 'absolute',
    right: 18,
    bottom: 18,
    backgroundColor: colors.brand,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    elevation: 3,
  },
  fabPlus: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    marginTop: -2,
  },
  fabLabel: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
})
