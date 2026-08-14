import { useMemo } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { PeriodChips } from '../../src/components/TabBarIcon'
import { Banner, Screen, Subtitle, Title } from '../../src/components/ui'
import { useSavings } from '../../src/context/SavingsContext'
import { formatTry } from '../../src/lib/budgetPlanner'
import { entryMissed, entrySaved } from '../../src/lib/savingsStats'
import { colors } from '../../src/theme/colors'
import type { SavingsPeriod } from '../../src/types/savings'

const PERIODS: { id: SavingsPeriod; label: string }[] = [
  { id: 'day', label: 'Bugün' },
  { id: 'week', label: 'Hafta' },
  { id: 'month', label: 'Ay' },
  { id: 'year', label: 'Yıl' },
  { id: 'all', label: 'Tümü' },
]

function TrendBars({ data }: { data: { label: string; amount: number }[] }) {
  const max = Math.max(...data.map((d) => d.amount), 1)
  return (
    <View style={styles.trendWrap}>
      {data.map((d) => {
        const h = Math.max(8, Math.round((d.amount / max) * 96))
        return (
          <View key={d.label} style={styles.trendCol}>
            <Text style={styles.trendAmount}>{d.amount > 0 ? Math.round(d.amount) : ''}</Text>
            <View style={styles.trendTrack}>
              <View style={[styles.trendBar, { height: h }]} />
            </View>
            <Text style={styles.trendLabel}>{d.label}</Text>
          </View>
        )
      })}
    </View>
  )
}

export default function ReportsScreen() {
  const {
    loading,
    period,
    setPeriod,
    periodEntries,
    periodSavedTotal,
    periodMissedTotal,
    periodTitle,
    trend,
    removeSavings,
  } = useSavings()

  const net = useMemo(
    () => Math.round((periodSavedTotal - periodMissedTotal) * 100) / 100,
    [periodSavedTotal, periodMissedTotal],
  )

  function confirmRemove(id: string, name: string) {
    Alert.alert('Kaydı sil', `${name} bilanço kaydı silinsin mi?`, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: () => {
          void removeSavings(id)
        },
      },
    ])
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Screen style={styles.screen}>
        <Title>Bilanço</Title>
        <Subtitle>
          Liste’de alındı + market seçince: en pahalıya göre yapılan tasarruf ve en ucuza göre
          kaçırılan anında buraya düşer.
        </Subtitle>

        <View style={styles.periodBlock}>
          <PeriodChips
            value={period}
            onChange={(v) => setPeriod(v as SavingsPeriod)}
            options={PERIODS}
          />
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.brand} />
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <View style={styles.hero}>
              <Text style={styles.heroEyebrow}>{periodTitle}</Text>
              <View style={styles.heroRow}>
                <View style={styles.heroCol}>
                  <Text style={styles.heroMini}>Yapılan tasarruf</Text>
                  <Text style={styles.heroValue}>+{formatTry(periodSavedTotal)}</Text>
                </View>
                <View style={styles.heroCol}>
                  <Text style={styles.heroMini}>Kaçırılan</Text>
                  <Text style={[styles.heroValue, styles.heroMissed]}>
                    −{formatTry(periodMissedTotal)}
                  </Text>
                </View>
              </View>
              <Text style={styles.heroSub}>Net etki: {formatTry(net)}</Text>
            </View>

            <Text style={styles.section}>Trend (yapılan tasarruf)</Text>
            <View style={styles.card}>
              {trend.every((t) => t.amount === 0) ? (
                <Banner text="Kayıt yok. Hesapla → alındı → market seç." />
              ) : (
                <TrendBars data={trend} />
              )}
            </View>

            <Text style={styles.section}>Kayıtlar</Text>
            {periodEntries.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>Henüz bilanço yok</Text>
                <Text style={styles.emptyText}>
                  1) Liste’de Hesapla 2) Ürünü alındı yap 3) Market seç → anında burada.
                </Text>
              </View>
            ) : (
              periodEntries.map((entry) => {
                const saved = entrySaved(entry)
                const missed = entryMissed(entry)
                return (
                  <Pressable
                    key={entry.id}
                    style={styles.entry}
                    onLongPress={() => confirmRemove(entry.id, entry.itemName)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.entryTitle}>{entry.itemName}</Text>
                      <Text style={styles.entryMeta}>
                        {entry.placeLabel} · {new Date(entry.createdAt).toLocaleString('tr-TR')}
                      </Text>
                      <Text style={styles.entryMeta}>
                        Ödenen {formatTry(entry.paidUnitPrice)}
                        {entry.maxUnitPrice
                          ? ` · max ${formatTry(entry.maxUnitPrice)} · min ${formatTry(entry.minUnitPrice)}`
                          : ''}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      {saved > 0 ? (
                        <Text style={styles.entrySaved}>+{formatTry(saved)}</Text>
                      ) : null}
                      {missed > 0 ? (
                        <Text style={styles.entryMissed}>−{formatTry(missed)}</Text>
                      ) : null}
                      {saved <= 0 && missed <= 0 ? (
                        <Text style={styles.entryMeta}>—</Text>
                      ) : null}
                    </View>
                  </Pressable>
                )
              })
            )}
            {periodEntries.length > 0 ? (
              <Text style={styles.hint}>Silmek için kayda uzun bas.</Text>
            ) : null}
          </ScrollView>
        )}
      </Screen>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  screen: { paddingTop: 8, paddingBottom: 0 },
  periodBlock: { marginTop: 14, marginBottom: 8 },
  center: { marginTop: 40, alignItems: 'center' },
  content: { paddingBottom: 36 },
  hero: {
    backgroundColor: colors.brand,
    borderRadius: 20,
    padding: 20,
    marginTop: 8,
  },
  heroEyebrow: {
    color: '#A7C4B6',
    fontWeight: '700',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  heroRow: { flexDirection: 'row', gap: 12, marginTop: 10 },
  heroCol: { flex: 1 },
  heroMini: { color: '#A7C4B6', fontSize: 12, fontWeight: '600' },
  heroValue: {
    marginTop: 4,
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
  },
  heroMissed: { color: '#FEC84B' },
  heroSub: { color: '#D7E8DF', marginTop: 12, fontWeight: '600' },
  section: {
    marginTop: 20,
    marginBottom: 8,
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
  },
  card: {
    backgroundColor: colors.bgElevated,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  trendWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 6,
    minHeight: 140,
  },
  trendCol: { flex: 1, alignItems: 'center' },
  trendAmount: {
    fontSize: 10,
    color: colors.brandSoft,
    fontWeight: '700',
    marginBottom: 4,
    minHeight: 12,
  },
  trendTrack: {
    width: '100%',
    height: 100,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  trendBar: {
    width: '70%',
    borderRadius: 8,
    backgroundColor: colors.brandSoft,
    minHeight: 8,
  },
  trendLabel: {
    marginTop: 6,
    fontSize: 10,
    color: colors.inkMuted,
    fontWeight: '700',
  },
  emptyCard: {
    backgroundColor: colors.bgElevated,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
  },
  emptyTitle: { fontWeight: '800', color: colors.ink, fontSize: 16 },
  emptyText: { marginTop: 6, color: colors.inkMuted, lineHeight: 20 },
  entry: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: colors.bgElevated,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 8,
  },
  entryTitle: { fontWeight: '700', color: colors.ink, fontSize: 15 },
  entryMeta: { marginTop: 3, color: colors.inkMuted, fontSize: 12, lineHeight: 16 },
  entrySaved: { fontWeight: '800', color: colors.ok, fontSize: 14 },
  entryMissed: { marginTop: 2, fontWeight: '800', color: colors.warn, fontSize: 13 },
  hint: {
    marginTop: 4,
    marginBottom: 12,
    color: colors.inkMuted,
    fontSize: 12,
    textAlign: 'center',
  },
})
