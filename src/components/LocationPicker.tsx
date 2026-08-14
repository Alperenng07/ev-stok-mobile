import { useCallback, useMemo, useState } from 'react'
import {
  Linking,
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
} from '../lib/geocode'
import { googleMapsOpenUrl, resolveMapsLinkToPlace } from '../lib/googleMapsLink'
import {
  LocationError,
  openAppLocationSettings,
  resolveLiveLocation,
} from '../lib/location'
import { locationPrefsStore } from '../lib/locationPrefsStore'
import { colors } from '../theme/colors'
import type { LocationPreference, ShoppingLocation } from '../types/location'
import { Button } from './ui'

type Props = {
  prefs: LocationPreference
  onChange: (prefs: LocationPreference) => void
}

type AddMode = 'google' | 'map' | 'gps'

export function LocationPicker({ prefs, onChange }: Props) {
  const [adding, setAdding] = useState(false)
  const [addMode, setAddMode] = useState<AddMode>('google')
  const [name, setName] = useState('Ev')
  const [mapsLink, setMapsLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [showPermissionHelp, setShowPermissionHelp] = useState(false)
  const [mapPin, setMapPin] = useState(DEFAULT_MAP_CENTER)
  const [mapLabel, setMapLabel] = useState('Haritadan seçilen nokta')
  const [mapKey, setMapKey] = useState(0)

  const mapHtml = useMemo(() => buildMapPickerHtml(mapPin.lat, mapPin.lng), [mapKey])

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
    void persist({ places, savedId, mode: savedId ? 'saved' : 'live' })
  }

  function addPlace(place: Omit<ShoppingLocation, 'id' | 'createdAt'>) {
    if (!isValidTurkeyCoord(place.lat, place.lng)) {
      setErr('Seçilen nokta Türkiye dışında.')
      return
    }
    const next: ShoppingLocation = {
      ...place,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    }
    void persist({ mode: 'saved', savedId: next.id, places: [...prefs.places, next] })
    setAdding(false)
    setMapsLink('')
    setMsg(`“${next.name}” kaydedildi ve seçildi.`)
    setErr(null)
    setShowPermissionHelp(false)
  }

  async function saveFromGoogleLink() {
    setBusy(true)
    setErr(null)
    try {
      const place = await resolveMapsLinkToPlace(mapsLink)
      addPlace({
        name: name.trim() || 'Ev',
        lat: place.lat,
        lng: place.lng,
        label: place.label,
      })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Link okunamadı')
    } finally {
      setBusy(false)
    }
  }

  async function saveCurrent() {
    setBusy(true)
    setErr(null)
    setShowPermissionHelp(false)
    try {
      const loc = await resolveLiveLocation()
      addPlace({
        name: name.trim() || 'Ev',
        lat: loc.lat,
        lng: loc.lng,
        label: loc.label,
      })
    } catch (e) {
      if (e instanceof LocationError && e.code === 'permission') {
        setShowPermissionHelp(true)
      }
      setErr(e instanceof Error ? e.message : 'Konum alınamadı')
    } finally {
      setBusy(false)
    }
  }

  function saveMapPin() {
    addPlace({
      name: name.trim() || 'Harita konumu',
      lat: mapPin.lat,
      lng: mapPin.lng,
      label: mapLabel,
    })
  }

  const onMapMessage = useCallback((raw: string) => {
    try {
      const data = JSON.parse(raw) as { type?: string; lat?: number; lng?: number }
      if (data.type !== 'pick') return
      if (!Number.isFinite(data.lat) || !Number.isFinite(data.lng)) return
      setMapPin({ lat: data.lat!, lng: data.lng! })
      setMapLabel(`${data.lat!.toFixed(5)}, ${data.lng!.toFixed(5)}`)
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
            setShowPermissionHelp(false)
          }}
        >
          <Text style={styles.addLink}>{adding ? 'Kapat' : '+ Konum ekle'}</Text>
        </Pressable>
      </View>
      <Text style={styles.hint}>
        En güvenlisi: Google Maps’te pin koy → Paylaş → linki yapıştır.
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
        <Text style={styles.selectedMuted}>Hesaplama anlık GPS ile yapılır.</Text>
      )}

      {msg ? <Text style={styles.ok}>{msg}</Text> : null}
      {err ? <Text style={styles.error}>{err}</Text> : null}

      {showPermissionHelp ? (
        <View style={styles.permBox}>
          <Text style={styles.hitName}>Konum izni gerekli</Text>
          <Text style={styles.hint}>
            1) Ayarlar’ı aç{'\n'}
            2) Bu uygulamaya Konum izni ver{'\n'}
            3) Geri dönüp tekrar dene
          </Text>
          <Button
            label="Uygulama ayarlarını aç"
            variant="secondary"
            onPress={() => void openAppLocationSettings()}
          />
          <Button
            label="İzin verdim, tekrar dene"
            onPress={() => void saveCurrent()}
            loading={busy}
          />
        </View>
      ) : null}

      {adding ? (
        <View style={styles.addBox}>
          <Text style={styles.fieldLabel}>Konum adı</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Ev, İş…"
            placeholderTextColor={colors.inkMuted}
            style={styles.input}
          />

          <View style={styles.chips}>
            {([
              ['google', 'Google Maps'],
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

          {addMode === 'google' ? (
            <>
              <Text style={styles.hint}>
                Maps’te pin koy → Paylaş → bağlantıyı kopyala → yapıştır. Kısa link olursa uygulamada
                açıp uzun adresi kopyala.
              </Text>
              <Button
                label="Google Maps’te pin koy"
                variant="secondary"
                onPress={() => void Linking.openURL(googleMapsOpenUrl())}
              />
              <Text style={styles.fieldLabel}>Google Maps linki</Text>
              <TextInput
                value={mapsLink}
                onChangeText={setMapsLink}
                placeholder="https://www.google.com/maps/…/@41.01,28.97…"
                placeholderTextColor={colors.inkMuted}
                style={[styles.input, styles.textarea]}
                multiline
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Button
                label={busy ? 'Okunuyor…' : 'Linkten kaydet'}
                onPress={() => void saveFromGoogleLink()}
                loading={busy}
                disabled={!mapsLink.trim()}
              />
            </>
          ) : null}

          {addMode === 'map' ? (
            <>
              <Text style={styles.hint}>
                OpenStreetMap haritası (ücretsiz). Google pin için Google Maps sekmesi.
              </Text>
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
  chipActive: { borderColor: colors.brand, backgroundColor: '#EAF2EE' },
  chipText: { fontWeight: '700', color: colors.ink, fontSize: 13 },
  chipTextActive: { color: colors.brand },
  selected: {
    marginTop: 10,
    color: colors.brand,
    fontWeight: '600',
    fontSize: 13,
    lineHeight: 18,
  },
  selectedMuted: { marginTop: 10, color: colors.inkMuted, fontSize: 13 },
  ok: { marginTop: 8, color: colors.ok, fontWeight: '600' },
  error: { marginTop: 8, color: colors.danger, fontWeight: '600' },
  permBox: {
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.warn,
    backgroundColor: colors.warnSoft,
    gap: 8,
  },
  addBox: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 12,
    backgroundColor: colors.bgElevated,
    gap: 8,
  },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: colors.inkMuted },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.ink,
    backgroundColor: colors.bg,
  },
  textarea: { minHeight: 78, textAlignVertical: 'top' },
  mapWrap: {
    height: 260,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  map: { flex: 1, backgroundColor: '#e8ece5' },
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
