import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { WebView } from 'react-native-webview'
import {
  buildMapPickerHtml,
  DEFAULT_MAP_CENTER,
  isValidTurkeyCoord,
  reverseGeocode,
  searchPlaces,
} from '../lib/geocode'
import { resolveLiveLocation } from '../lib/location'
import { locationPrefsStore } from '../lib/locationPrefsStore'
import { colors } from '../theme/colors'
import type { GeocodeHit, LocationPreference, ShoppingLocation } from '../types/location'
import { Button } from './ui'

type Props = {
  prefs: LocationPreference
  onChange: (prefs: LocationPreference) => void
}

type AddMode = 'address' | 'map' | 'gps'

export function LocationPicker({ prefs, onChange }: Props) {
  const [adding, setAdding] = useState(false)
  const [addMode, setAddMode] = useState<AddMode>('address')
  const [name, setName] = useState('Ev')
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<GeocodeHit[]>([])
  const [searching, setSearching] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [mapPin, setMapPin] = useState(DEFAULT_MAP_CENTER)
  const [mapLabel, setMapLabel] = useState('Haritadan seçilen nokta')
  const [mapKey, setMapKey] = useState(0)

  const mapHtml = useMemo(
    () => buildMapPickerHtml(mapPin.lat, mapPin.lng),
    // Yeniden kurulum yalnızca mapKey ile (GPS merkezleme)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mapKey],
  )

  useEffect(() => {
    if (!adding || addMode !== 'map') return
    let cancelled = false
    const t = setTimeout(() => {
      void reverseGeocode(mapPin.lat, mapPin.lng).then((hit) => {
        if (!cancelled && hit) setMapLabel(hit.label)
      })
    }, 280)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [adding, addMode, mapPin.lat, mapPin.lng])

  async function persist(next: LocationPreference) {
    await locationPrefsStore.save(next)
    onChange(next)
  }

  function selectLive() {
    void persist({ ...prefs, mode: 'live', savedId: null })
  }

  function selectSaved(id: string) {
    void persist({ ...prefs, mode: 'saved', savedId: id })
  }

  function removePlace(id: string) {
    const places = prefs.places.filter((p) => p.id !== id)
    const savedId = prefs.savedId === id ? null : prefs.savedId
    void persist({
      places,
      savedId,
      mode: savedId ? 'saved' : 'live',
    })
  }

  function addPlace(place: Omit<ShoppingLocation, 'id' | 'createdAt'>) {
    if (!isValidTurkeyCoord(place.lat, place.lng)) {
      setErr('Seçilen nokta Türkiye dışında. Haritadan veya adresle yeniden dene.')
      return
    }
    const next: ShoppingLocation = {
      ...place,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    }
    const places = [...prefs.places, next]
    void persist({ mode: 'saved', savedId: next.id, places })
    setAdding(false)
    setQuery('')
    setHits([])
    setMsg(`“${next.name}” kaydedildi ve seçildi.`)
    setErr(null)
  }

  async function runAddressSearch() {
    const q = query.trim()
    if (q.length < 3) {
      setErr('En az 3 karakterlik açık adres yaz (mahalle, cadde, semt…).')
      return
    }
    setSearching(true)
    setErr(null)
    try {
      const found = await searchPlaces(q)
      setHits(found)
      if (found.length === 0) setErr('Adres bulunamadı. Daha açık yaz veya haritadan seç.')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Adres araması başarısız')
      setHits([])
    } finally {
      setSearching(false)
    }
  }

  async function saveCurrent() {
    const trimmed = name.trim()
    if (trimmed.length < 1) {
      setErr('Konuma bir ad ver (ör. Ev, İş).')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      const loc = await resolveLiveLocation()
      addPlace({
        name: trimmed,
        lat: loc.lat,
        lng: loc.lng,
        label: loc.label,
      })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Konum alınamadı')
    } finally {
      setBusy(false)
    }
  }

  function saveHit(hit: GeocodeHit) {
    addPlace({
      name: name.trim() || hit.name,
      lat: hit.lat,
      lng: hit.lng,
      label: hit.label,
    })
  }

  function saveMapPin() {
    addPlace({
      name: name.trim() || 'Harita konumu',
      lat: mapPin.lat,
      lng: mapPin.lng,
      label: mapLabel,
    })
  }

  async function centerMapOnGps() {
    setBusy(true)
    setErr(null)
    try {
      const loc = await resolveLiveLocation()
      setMapPin({ lat: loc.lat, lng: loc.lng })
      setMapLabel(loc.label)
      setMapKey((k) => k + 1)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Konum alınamadı')
    } finally {
      setBusy(false)
    }
  }

  const onMapMessage = useCallback((raw: string) => {
    try {
      const data = JSON.parse(raw) as { type?: string; lat?: number; lng?: number }
      if (data.type !== 'pick') return
      if (!Number.isFinite(data.lat) || !Number.isFinite(data.lng)) return
      setMapPin({ lat: data.lat!, lng: data.lng! })
    } catch {
      /* ignore */
    }
  }, [])

  const selected = prefs.places.find((p) => p.id === prefs.savedId)

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.label}>Alışveriş konumu</Text>
        <Pressable
          onPress={() => {
            setAdding((v) => !v)
            setErr(null)
            setMsg(null)
          }}
        >
          <Text style={styles.addLink}>{adding ? 'Kapat' : '+ Konum ekle'}</Text>
        </Pressable>
      </View>
      <Text style={styles.hint}>
        İşteyken eve göre hesapla: açık adres yaz veya haritadan pin koy, sonra “Ev” seç.
      </Text>

      <View style={styles.chips}>
        <Pressable
          onPress={selectLive}
          style={[styles.chip, prefs.mode === 'live' && styles.chipActive]}
        >
          <Text style={[styles.chipText, prefs.mode === 'live' && styles.chipTextActive]}>
            Anlık konum
          </Text>
        </Pressable>
        {prefs.places.map((p) => {
          const active = prefs.mode === 'saved' && prefs.savedId === p.id
          return (
            <Pressable
              key={p.id}
              onPress={() => selectSaved(p.id)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{p.name}</Text>
            </Pressable>
          )
        })}
      </View>

      {prefs.mode === 'saved' && selected ? (
        <Text style={styles.selected}>
          {selected.name}: {selected.label}
          {'\n'}
          {selected.lat.toFixed(5)}, {selected.lng.toFixed(5)}
        </Text>
      ) : (
        <Text style={styles.selectedMuted}>Hesaplama cihazının anlık GPS konumuna göre yapılır.</Text>
      )}

      {msg ? <Text style={styles.ok}>{msg}</Text> : null}
      {err ? <Text style={styles.error}>{err}</Text> : null}

      {adding ? (
        <View style={styles.addBox}>
          <Text style={styles.fieldLabel}>Konum adı</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Ev, İş, Anne evi…"
            placeholderTextColor={colors.inkMuted}
            style={styles.input}
          />

          <View style={styles.chips}>
            {([
              ['address', 'Açık adres'],
              ['map', 'Harita'],
              ['gps', 'Anlık GPS'],
            ] as const).map(([id, label]) => (
              <Pressable
                key={id}
                onPress={() => setAddMode(id)}
                style={[styles.chip, addMode === id && styles.chipActive]}
              >
                <Text style={[styles.chipText, addMode === id && styles.chipTextActive]}>
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>

          {addMode === 'address' ? (
            <>
              <Text style={styles.fieldLabel}>Açık adres</Text>
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Caferağa Mah. Moda Cad. No:12 Kadıköy İstanbul"
                placeholderTextColor={colors.inkMuted}
                style={[styles.input, styles.textarea]}
                multiline
              />
              <Button
                label={searching ? 'Aranıyor…' : 'Adresi bul'}
                variant="secondary"
                onPress={() => void runAddressSearch()}
                loading={searching}
              />
              {hits.map((h) => (
                <Pressable key={h.id} onPress={() => saveHit(h)} style={styles.hit}>
                  <Text style={styles.hitName}>{h.name}</Text>
                  <Text style={styles.hitLabel}>{h.label}</Text>
                  <Text style={styles.hitLabel}>
                    {h.lat.toFixed(5)}, {h.lng.toFixed(5)}
                  </Text>
                </Pressable>
              ))}
            </>
          ) : null}

          {addMode === 'map' ? (
            <>
              <View style={styles.mapWrap}>
                <WebView
                  key={mapKey}
                  originWhitelist={['*']}
                  source={{ html: mapHtml }}
                  style={styles.map}
                  onMessage={(e) => onMapMessage(e.nativeEvent.data)}
                  javaScriptEnabled
                  domStorageEnabled
                  setSupportMultipleWindows={false}
                />
              </View>
              <Text style={styles.selected}>{mapLabel}</Text>
              <Button
                label={busy ? 'Konum alınıyor…' : 'Haritayı anlık konuma getir'}
                variant="secondary"
                onPress={() => void centerMapOnGps()}
                loading={busy}
              />
              <Button label="Bu pin’i kaydet" onPress={saveMapPin} />
            </>
          ) : null}

          {addMode === 'gps' ? (
            <Button
              label={busy ? 'Konum alınıyor…' : 'Şu anki konumumu kaydet'}
              variant="secondary"
              onPress={() => void saveCurrent()}
              loading={busy}
            />
          ) : null}

          {prefs.places.map((p) => (
            <View key={p.id} style={styles.manageRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.hitName}>{p.name}</Text>
                <Text style={styles.hitLabel}>{p.label}</Text>
              </View>
              <Pressable onPress={() => removePlace(p.id)}>
                <Text style={styles.delete}>Sil</Text>
              </Pressable>
            </View>
          ))}

          {searching ? <ActivityIndicator color={colors.brand} /> : null}
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { marginTop: 14, marginBottom: 8 },
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.inkMuted,
  },
  addLink: { color: colors.brand, fontWeight: '800' },
  hint: {
    marginTop: 4,
    marginBottom: 10,
    color: colors.inkMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElevated,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipActive: {
    borderColor: colors.brand,
    backgroundColor: '#EAF2EE',
  },
  chipText: { fontWeight: '700', color: colors.ink, fontSize: 13 },
  chipTextActive: { color: colors.brand },
  selected: {
    marginTop: 10,
    color: colors.brand,
    fontWeight: '600',
    fontSize: 13,
    lineHeight: 18,
  },
  selectedMuted: {
    marginTop: 10,
    color: colors.inkMuted,
    fontSize: 13,
  },
  ok: { marginTop: 8, color: colors.ok, fontWeight: '600' },
  error: { marginTop: 8, color: colors.danger, fontWeight: '600' },
  addBox: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 12,
    backgroundColor: colors.bgElevated,
    gap: 8,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.inkMuted,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.ink,
    backgroundColor: colors.bg,
  },
  textarea: {
    minHeight: 78,
    textAlignVertical: 'top',
  },
  mapWrap: {
    height: 260,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  map: { flex: 1, backgroundColor: '#e8ece5' },
  hit: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  hitName: { fontWeight: '700', color: colors.ink },
  hitLabel: { marginTop: 2, color: colors.inkMuted, fontSize: 12 },
  manageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  delete: { color: colors.danger, fontWeight: '800' },
})
