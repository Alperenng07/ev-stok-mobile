import { useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LocationPicker } from '../../src/components/LocationPicker'
import { Banner, Button, Screen, Subtitle, Title } from '../../src/components/ui'
import { useBudgetCache } from '../../src/context/BudgetCacheContext'
import { useItems } from '../../src/context/ItemsContext'
import { applyCatalogChoice, buildLiveBudgetPlans, formatTry } from '../../src/lib/budgetPlanner'
import { chainById } from '../../src/lib/chains'
import { budgetLocationKey, resolveBudgetLocation } from '../../src/lib/location'
import { locationPrefsStore } from '../../src/lib/locationPrefsStore'
import { colors } from '../../src/theme/colors'
import type { BudgetPlan, BudgetResult } from '../../src/types/budget'
import type { LocationPreference } from '../../src/types/location'

export default function BudgetScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{ autostart?: string }>()
  const { items } = useItems()
  const { result: cached, setResult: setCache, hasCacheFor, calculatedAt } = useBudgetCache()
  const pending = useMemo(() => items.filter((i) => !i.purchased), [items])

  const [locPrefs, setLocPrefs] = useState<LocationPreference>({
    mode: 'live',
    savedId: null,
    places: [],
  })
  const [prefsReady, setPrefsReady] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<BudgetResult | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [pickItemId, setPickItemId] = useState<string | null>(null)
  const autoStarted = useRef(false)
  const lastLocKey = useRef<string | null>(null)

  useEffect(() => {
    void locationPrefsStore.load().then((prefs) => {
      setLocPrefs(prefs)
      setPrefsReady(true)
    })
  }, [])

  const locationKey = budgetLocationKey(locPrefs)
  const hasCache = hasCacheFor(locationKey)
  const activeResult = result?.locationKey === locationKey ? result : null

  const selected: BudgetPlan | null =
    activeResult?.plans.find((p) => p.id === selectedId) ?? activeResult?.plans[0] ?? null

  const runPlanner = useCallback(async (prefsOverride?: LocationPreference) => {
    const activePrefs = prefsOverride ?? locPrefs
    const key = budgetLocationKey(activePrefs)
    lastLocKey.current = key

    setResult(null)
    setCache(null)
    setSelectedId(null)
    setPickItemId(null)

    if (pending.length === 0) {
      setError('Alınacak ürün yok. Önce listeye ürün ekle.')
      return
    }
    setLoading(true)
    setError(null)
    setStatus(
      activePrefs.mode === 'saved' ? 'Kayıtlı konum yükleniyor…' : 'Anlık konum alınıyor…',
    )
    try {
      const loc = await resolveBudgetLocation(activePrefs)
      setStatus(
        `Konum: ${loc.label} — marketfiyati.org.tr’den ${pending.length} ürün için canlı fiyat çekiliyor…`,
      )
      const next = await buildLiveBudgetPlans({
        pendingItems: pending,
        latitude: loc.lat,
        longitude: loc.lng,
        locationLabel: loc.label,
        locationKey: key,
        distanceKm: 8,
      })
      setResult(next)
      setCache(next)
      setSelectedId(next.plans[0]?.id ?? null)
      setStatus(null)
      if (next.plans.length === 0) {
        setError('Yakındaki marketlerde bu ürünler için fiyat bulunamadı.')
      }
    } catch (err) {
      setResult(null)
      setCache(null)
      setError(err instanceof Error ? err.message : 'Plan oluşturulamadı')
      setStatus(null)
    } finally {
      setLoading(false)
    }
  }, [pending, setCache, locPrefs])

  useEffect(() => {
    if (
      prefsReady &&
      params.autostart === '1' &&
      !autoStarted.current &&
      !loading
    ) {
      autoStarted.current = true
      lastLocKey.current = locationKey
      void runPlanner()
      router.setParams({ autostart: undefined })
    }
  }, [params.autostart, loading, runPlanner, router, prefsReady, locationKey])

  useEffect(() => {
    if (cached && !result && cached.locationKey === locationKey) {
      setResult(cached)
      setSelectedId(cached.plans[0]?.id ?? null)
    }
  }, [cached, result, locationKey])

  useEffect(() => {
    if (!prefsReady) return
    if (lastLocKey.current === null) {
      lastLocKey.current = locationKey
      return
    }
    if (lastLocKey.current === locationKey) return
    lastLocKey.current = locationKey
    setResult(null)
    setCache(null)
    setSelectedId(null)
    setPickItemId(null)
    setError(null)
    setStatus(null)
  }, [prefsReady, locationKey, setCache])

  function chooseCatalog(itemId: string, catalogId: string) {
    if (!activeResult) return
    const next = applyCatalogChoice(activeResult, itemId, catalogId)
    setResult(next)
    setCache(next)
    setSelectedId((prev) => next.plans.find((p) => p.id === prev)?.id ?? next.plans[0]?.id ?? null)
    setPickItemId(null)
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Screen style={styles.screen}>
        <Title>Bütçe planı</Title>
        <Subtitle>
          Bir kez hesapla; sonra listeden ürünü “Alındı” yapıp market seçince tasarruf bilançoya
          anında yazılır.
        </Subtitle>

        <LocationPicker
          prefs={locPrefs}
          onChange={setLocPrefs}
          onUseLocation={(nextPrefs) => {
            lastLocKey.current = budgetLocationKey(nextPrefs)
            setLocPrefs(nextPrefs)
            void runPlanner(nextPrefs)
          }}
        />

        <View style={styles.row}>
          <Text style={styles.meta}>{pending.length} alınacak ürün</Text>
          <Button
            label={loading ? 'Hesaplanıyor…' : hasCache ? 'Tekrar hesapla' : 'Canlı planları hesapla'}
            onPress={() => void runPlanner()}
            loading={loading}
          />
        </View>

        {hasCache && calculatedAt ? (
          <Banner
            text={`Son hesap hazır (${new Date(calculatedAt).toLocaleTimeString('tr-TR')}). Listeye dönüp alındı + market seçebilirsin.`}
            tone="ok"
          />
        ) : (
          <Banner text="Önce buradan hesapla. Hesap yokken alınan ürünler bilançoya fiyat yansıtmaz." />
        )}

        {status ? <Banner text={status} tone="ok" /> : null}
        {error ? <Banner text={error} tone="err" /> : null}

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.brand} size="large" />
          </View>
        ) : null}

        {activeResult ? (
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <Banner
              text={`Konum: ${activeResult.locationLabel} (${activeResult.location.lat.toFixed(4)}, ${activeResult.location.lng.toFixed(4)})`}
              tone="ok"
            />
            <Banner text={activeResult.disclaimer} />

            <Text style={styles.section}>Ürün eşleşmeleri</Text>
            <Text style={styles.matchHint}>
              Yanlışsa “Başka ürün seç” ile Nutella / Yumoş vb. yerine doğru ürünü seç.
            </Text>
            {activeResult.lines.map((line) => {
              const candidates = line.candidates ?? []
              const open = pickItemId === line.itemId
              const alts = candidates.filter((c) => c.catalogId !== line.catalogId)
              return (
                <View key={`match-${line.itemId}`} style={styles.matchCard}>
                  <View style={styles.matchHead}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.lineName}>{line.itemName}</Text>
                      <Text style={styles.lineMatch}>
                        {line.matched && line.catalogName
                          ? `Eşleşen: ${line.catalogName}`
                          : 'Eşleşme yok'}
                        {line.offers[0]
                          ? ` · en ucuz ${formatTry(line.offers[0].unitPrice)}`
                          : ''}
                      </Text>
                    </View>
                    {alts.length > 0 || (!line.matched && candidates.length > 0) ? (
                      <Pressable onPress={() => setPickItemId(open ? null : line.itemId)}>
                        <Text style={styles.matchLink}>
                          {open ? 'Kapat' : line.matched ? 'Başka ürün seç' : 'Ürün seç'}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                  {open
                    ? candidates.map((cand) => {
                        const active = cand.catalogId === line.catalogId
                        return (
                          <Pressable
                            key={cand.catalogId}
                            onPress={() => chooseCatalog(line.itemId, cand.catalogId)}
                            style={[styles.matchAlt, active && styles.matchAltActive]}
                          >
                            <View style={{ flex: 1 }}>
                              <Text style={styles.lineName}>{cand.catalogName}</Text>
                              <Text style={styles.lineStore}>
                                en ucuz {formatTry(cand.cheapestPrice)} · skor{' '}
                                {Math.round(cand.matchScore)}
                              </Text>
                            </View>
                            <Text style={styles.matchPick}>{active ? 'Seçili' : 'Seç'}</Text>
                          </Pressable>
                        )
                      })
                    : null}
                </View>
              )
            })}

            {activeResult.potentialSaving > 0 ? (
              <View style={styles.savingCard}>
                <Text style={styles.savingLabel}>Potansiyel tasarruf</Text>
                <Text style={styles.savingValue}>
                  {formatTry(activeResult.potentialSaving)} kar edebilirsin
                </Text>
                <Text style={styles.savingHint}>
                  En pahalı tek-zincire göre ({formatTry(activeResult.worstSingleTotal)}) en ucuz plan (
                  {formatTry(activeResult.bestTotal)}).
                </Text>
              </View>
            ) : null}

            <Text style={styles.section}>Önerilen planlar</Text>
            {activeResult.plans.map((plan) => {
              const active = selected?.id === plan.id
              const chainColor = plan.chainId ? chainById(plan.chainId).color : colors.brand
              return (
                <Pressable
                  key={plan.id}
                  onPress={() => setSelectedId(plan.id)}
                  style={[styles.planCard, active && styles.planCardActive]}
                >
                  <View style={styles.planTop}>
                    <View style={[styles.dot, { backgroundColor: chainColor }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.planTitle}>{plan.title}</Text>
                      <Text style={styles.planSub}>{plan.subtitle}</Text>
                    </View>
                    <Text style={styles.planTotal}>{formatTry(plan.total)}</Text>
                  </View>
                  <Text style={styles.planMeta}>
                    {plan.availableCount} var
                    {plan.missingCount ? ` · ${plan.missingCount} yok` : ' · hepsi tamam'}
                  </Text>
                </Pressable>
              )
            })}

            {selected ? (
              <>
                <Text style={styles.section}>Bu planda var ({selected.availableCount})</Text>
                {selected.lines.map((line) => (
                  <View key={`${selected.id}-ok-${line.itemId}`} style={styles.line}>
                    <View style={styles.badgeOk}>
                      <Text style={styles.badgeOkText}>Var</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.lineName}>
                        {line.itemName} × {line.qty} {line.unit}
                      </Text>
                      {line.catalogName ? (
                        <Text style={styles.lineMatch}>Eşleşen: {line.catalogName}</Text>
                      ) : null}
                      <Text style={styles.lineStore}>
                        {line.chainName} · {line.storeName} · {formatTry(line.unitPrice)}
                      </Text>
                    </View>
                    <Text style={styles.lineTotal}>{formatTry(line.lineTotal)}</Text>
                  </View>
                ))}

                {selected.missingCount > 0 ? (
                  <>
                    <Text style={styles.section}>Bu planda yok ({selected.missingCount})</Text>
                    {selected.missingItems.map((miss) => (
                      <View key={`${selected.id}-miss-${miss.itemId}`} style={styles.lineMissing}>
                        <View style={styles.badgeNo}>
                          <Text style={styles.badgeNoText}>Yok</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.lineName}>{miss.itemName}</Text>
                          {miss.alternative ? (
                            <Text style={styles.lineStore}>
                              Alternatif: {miss.alternative.chainName} ·{' '}
                              {formatTry(miss.alternative.unitPrice)}
                            </Text>
                          ) : (
                            <Text style={styles.lineStore}>Fiyat/eşleşme yok</Text>
                          )}
                        </View>
                      </View>
                    ))}
                  </>
                ) : null}

                <View style={styles.totalBox}>
                  <Text style={styles.totalLabel}>Plan toplamı</Text>
                  <Text style={styles.totalValue}>{formatTry(selected.total)}</Text>
                </View>

                <Button
                  label="Listeye dön · alındı işaretle"
                  variant="secondary"
                  onPress={() => router.push('/(app)')}
                />
              </>
            ) : null}
          </ScrollView>
        ) : null}
      </Screen>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  screen: { paddingTop: 8, paddingBottom: 0 },
  row: { marginTop: 16, marginBottom: 8, gap: 10 },
  meta: { color: colors.inkMuted, fontWeight: '600' },
  center: { marginTop: 40, alignItems: 'center' },
  content: { paddingBottom: 40, gap: 4 },
  savingCard: {
    backgroundColor: colors.okSoft,
    borderRadius: 16,
    padding: 16,
    marginBottom: 8,
  },
  savingLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.ok,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  savingValue: {
    marginTop: 4,
    fontSize: 22,
    fontWeight: '800',
    color: colors.ok,
  },
  savingHint: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkMuted,
  },
  section: {
    marginTop: 18,
    marginBottom: 8,
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
  },
  matchHint: {
    marginTop: -4,
    marginBottom: 8,
    color: colors.inkMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  matchCard: {
    backgroundColor: colors.bgElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 8,
    gap: 8,
  },
  matchHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  matchLink: { color: colors.brand, fontWeight: '800', fontSize: 13 },
  matchAlt: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 10,
    backgroundColor: colors.bg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  matchAltActive: { borderColor: colors.brand, backgroundColor: '#EAF2EE' },
  matchPick: { color: colors.brand, fontWeight: '800', fontSize: 12 },
  planCard: {
    backgroundColor: colors.bgElevated,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 8,
  },
  planCardActive: {
    borderColor: colors.brand,
    backgroundColor: '#EAF2EE',
  },
  planTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  planTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  planSub: { marginTop: 2, fontSize: 12, color: colors.inkMuted },
  planTotal: { fontSize: 15, fontWeight: '800', color: colors.brand },
  planMeta: { marginTop: 8, fontSize: 12, color: colors.inkMuted },
  line: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: colors.bgElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 8,
  },
  lineMissing: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: colors.warnSoft,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F5D0A9',
    padding: 12,
    marginBottom: 8,
  },
  badgeOk: {
    backgroundColor: colors.okSoft,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 2,
  },
  badgeOkText: { color: colors.ok, fontWeight: '800', fontSize: 11 },
  badgeNo: {
    backgroundColor: colors.dangerSoft,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 2,
  },
  badgeNoText: { color: colors.danger, fontWeight: '800', fontSize: 11 },
  lineName: { fontSize: 15, fontWeight: '700', color: colors.ink },
  lineMatch: { marginTop: 2, fontSize: 11, color: colors.brandSoft },
  lineStore: { marginTop: 2, fontSize: 12, color: colors.inkMuted, lineHeight: 17 },
  lineTotal: { fontSize: 14, fontWeight: '800', color: colors.brand },
  totalBox: {
    marginTop: 8,
    marginBottom: 12,
    backgroundColor: colors.brand,
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: { color: '#D7E8DF', fontWeight: '700' },
  totalValue: { color: '#fff', fontSize: 20, fontWeight: '800' },
})
