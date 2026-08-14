import { useEffect, useMemo, useState } from 'react'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import {
  formatAddressLabel,
  hitMatchesRegion,
  isValidTurkeyCoord,
  resolveDistrictBias,
  searchStreetSuggestions,
  searchStructuredAddress,
  type StructuredAddress,
} from '../lib/geocode'
import {
  LocationError,
  openAppLocationSettings,
  resolveLiveLocation,
} from '../lib/location'
import { locationPrefsStore } from '../lib/locationPrefsStore'
import {
  filterByName,
  listDistricts,
  listNeighborhoods,
  listProvinces,
  type AdminPlace,
} from '../lib/turkiyeApi'
import { colors } from '../theme/colors'
import type { GeocodeHit, LocationPreference, ShoppingLocation } from '../types/location'
import { Button } from './ui'

type Props = {
  prefs: LocationPreference
  onChange: (prefs: LocationPreference) => void
  /** Kaydet/seç sonrası — güncel prefs ile bütçe hesabı */
  onUseLocation?: (prefs: LocationPreference) => void
}

type AddMode = 'address' | 'gps'

export function LocationPicker({ prefs, onChange, onUseLocation }: Props) {
  const [adding, setAdding] = useState(false)
  const [addMode, setAddMode] = useState<AddMode>('gps')
  const [name, setName] = useState('Ev')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [showPermissionHelp, setShowPermissionHelp] = useState(false)

  const [provinces, setProvinces] = useState<AdminPlace[]>([])
  const [districts, setDistricts] = useState<AdminPlace[]>([])
  const [neighborhoods, setNeighborhoods] = useState<AdminPlace[]>([])
  const [listsBusy, setListsBusy] = useState(false)

  const [provinceId, setProvinceId] = useState<number | null>(null)
  const [districtId, setDistrictId] = useState<number | null>(null)
  const [neighborhoodId, setNeighborhoodId] = useState<number | null>(null)
  const [neighborhoodQuery, setNeighborhoodQuery] = useState('')
  const [street, setStreet] = useState('')

  const [streetHits, setStreetHits] = useState<GeocodeHit[]>([])
  const [resolveHits, setResolveHits] = useState<GeocodeHit[]>([])
  const [provinceOpen, setProvinceOpen] = useState(false)
  const [districtOpen, setDistrictOpen] = useState(false)

  const province = provinces.find((p) => p.id === provinceId) ?? null
  const district = districts.find((d) => d.id === districtId) ?? null
  const neighborhood = neighborhoods.find((n) => n.id === neighborhoodId) ?? null

  const filteredNeighborhoods = useMemo(
    () => filterByName(neighborhoods, neighborhoodQuery, 50),
    [neighborhoods, neighborhoodQuery],
  )

  const bias = useMemo(() => {
    if (province?.latitude != null && province?.longitude != null) {
      return { lat: province.latitude, lng: province.longitude }
    }
    return undefined
  }, [province])

  const [districtBias, setDistrictBias] = useState<{ lat: number; lng: number } | undefined>()

  useEffect(() => {
    if (!province || !district) {
      setDistrictBias(undefined)
      return
    }
    let cancelled = false
    void resolveDistrictBias(province.name, district.name).then((b) => {
      if (!cancelled) setDistrictBias(b ?? undefined)
    })
    return () => {
      cancelled = true
    }
  }, [province, district])

  const searchBias = districtBias ?? bias

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const list = await listProvinces()
        if (!cancelled) setProvinces(list)
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'İller yüklenemedi')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (provinceId == null) {
      setDistricts([])
      return
    }
    let cancelled = false
    setListsBusy(true)
    void (async () => {
      try {
        const list = await listDistricts(provinceId)
        if (!cancelled) setDistricts(list)
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'İlçeler yüklenemedi')
      } finally {
        if (!cancelled) setListsBusy(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [provinceId])

  useEffect(() => {
    if (districtId == null) {
      setNeighborhoods([])
      return
    }
    let cancelled = false
    setListsBusy(true)
    void (async () => {
      try {
        const list = await listNeighborhoods(districtId)
        if (!cancelled) setNeighborhoods(list)
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Mahalleler yüklenemedi')
      } finally {
        if (!cancelled) setListsBusy(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [districtId])

  useEffect(() => {
    if (!province || !district || street.trim().length < 2) {
      setStreetHits([])
      return
    }
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const hits = await searchStreetSuggestions(
            street,
            {
              province: province.name,
              district: district.name,
              neighborhood: neighborhood?.name ?? neighborhoodQuery,
            },
            searchBias,
          )
          setStreetHits(hits)
        } catch {
          setStreetHits([])
        }
      })()
    }, 350)
    return () => clearTimeout(timer)
  }, [street, province, district, neighborhood, neighborhoodQuery, searchBias])

  async function persist(next: LocationPreference) {
    await locationPrefsStore.save(next)
    onChange(next)
  }

  function selectLive() {
    const next = { ...prefs, mode: 'live' as const, savedId: null }
    void persist(next)
    onUseLocation?.(next)
  }

  function selectSaved(id: string) {
    const next = { ...prefs, mode: 'saved' as const, savedId: id }
    void persist(next)
    onUseLocation?.(next)
  }

  function removePlace(id: string) {
    const places = prefs.places.filter((p) => p.id !== id)
    const savedId = prefs.savedId === id ? null : prefs.savedId
    void persist({ places, savedId, mode: savedId ? 'saved' : 'live' })
  }

  function resetAddressForm() {
    setProvinceId(null)
    setDistrictId(null)
    setNeighborhoodId(null)
    setNeighborhoodQuery('')
    setStreet('')
    setStreetHits([])
    setResolveHits([])
    setProvinceOpen(false)
    setDistrictOpen(false)
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
    const nextPrefs: LocationPreference = {
      mode: 'saved',
      savedId: next.id,
      places: [...prefs.places, next],
    }
    void persist(nextPrefs)
    setAdding(false)
    resetAddressForm()
    setMsg(`“${next.name}” kaydedildi ve seçildi. Bu konumla fiyat aranabilir.`)
    setErr(null)
    setShowPermissionHelp(false)
    onUseLocation?.(nextPrefs)
  }

  function currentParts(streetOverride?: string): StructuredAddress | null {
    if (!province || !district) return null
    const mahalle = neighborhood?.name || neighborhoodQuery.trim()
    if (!mahalle) return null
    return {
      province: province.name,
      district: district.name,
      neighborhood: mahalle,
      street: (streetOverride ?? street).trim(),
      buildingNo: '',
    }
  }

  async function findAndSave(hit?: GeocodeHit) {
    const parts = currentParts(hit?.name)
    if (!parts) {
      setErr('İl, ilçe ve mahalle seç/yaz. Sokak isteğe bağlı.')
      return
    }
    setBusy(true)
    setErr(null)
    setShowPermissionHelp(false)
    try {
      if (hit) {
        if (!hitMatchesRegion(hit, parts.province, parts.district)) {
          setErr(
            `Bu sonuç seçilen ilçeyle uyuşmuyor (${parts.district}). Listeden doğru olanı seç.`,
          )
          return
        }
        addPlace({
          name: name.trim() || 'Ev',
          lat: hit.lat,
          lng: hit.lng,
          label: `${formatAddressLabel(parts)} · ${hit.label}`,
        })
        return
      }
      const hits = await searchStructuredAddress(parts, searchBias)
      if (hits.length === 0) {
        setErr('Bu adres bulunamadı. Mahalle adını kontrol et veya anlık GPS ile kaydet.')
        setResolveHits([])
        return
      }
      setResolveHits(hits)
      setMsg(
        hits.length === 1
          ? 'Bulunan konumu kontrol edip seç — sonra Ev ile fiyat aranır.'
          : 'Doğru sonucu seç (ilçene bak). Seçince Ev kaydolur.',
      )
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Adres bulunamadı')
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

  const selected = prefs.places.find((p) => p.id === prefs.savedId)
  const canResolve = Boolean(province && district && (neighborhood || neighborhoodQuery.trim()))

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
            setResolveHits([])
          }}
        >
          <Text style={styles.addLink}>{adding ? 'Kapat' : '+ Ev / konum ekle'}</Text>
        </Pressable>
      </View>
      <Text style={styles.hint}>
        En kolayı: anlık GPS ile “Ev” kaydet. Adresle ekliyorsan il / ilçe / mahalle yeter (sokak
        isteğe bağlı). “Ev” seçiliyken hesaplama o adrese göre yapılır.
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
        <View style={styles.selectedBox}>
          <Text style={styles.selected}>
            Arama konumu: {selected.name} — {selected.label}
            {'\n'}
            {selected.lat.toFixed(5)}, {selected.lng.toFixed(5)}
          </Text>
          {onUseLocation ? (
            <Button
              label={`Bu konumla (${selected.name}) fiyatları hesapla`}
              onPress={() =>
                onUseLocation({
                  ...prefs,
                  mode: 'saved',
                  savedId: selected.id,
                })
              }
            />
          ) : null}
        </View>
      ) : (
        <View style={styles.selectedBox}>
          <Text style={styles.selectedMuted}>Arama anlık GPS ile yapılır.</Text>
          {onUseLocation ? (
            <Button
              label="Anlık konumla fiyatları hesapla"
              variant="secondary"
              onPress={() => onUseLocation({ ...prefs, mode: 'live', savedId: null })}
            />
          ) : null}
        </View>
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
            {(
              [
                ['gps', 'Anlık GPS (önerilen)'],
                ['address', 'Adres seç'],
              ] as const
            ).map(([id, label]) => (
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

          {addMode === 'gps' ? (
            <>
              <Text style={styles.hint}>
                Telefondaysan en doğru yol bu: GPS ile aldığın konumu “Ev” diye kaydet, sonra o
                chip’le fiyat ara.
              </Text>
              <Button
                label={busy ? 'Konum alınıyor…' : 'Anlık konumumu Ev olarak kaydet'}
                onPress={() => void saveCurrent()}
                loading={busy}
              />
            </>
          ) : null}

          {addMode === 'address' ? (
            <>
              <Text style={styles.fieldLabel}>İl</Text>
              <Pressable
                style={styles.input}
                onPress={() => {
                  setProvinceOpen((v) => !v)
                  setDistrictOpen(false)
                }}
              >
                <Text style={province ? styles.valueText : styles.placeholder}>
                  {province?.name ?? 'İl seç…'}
                </Text>
              </Pressable>
              {provinceOpen ? (
                <ScrollView style={styles.listBox} nestedScrollEnabled>
                  {provinces.map((p) => (
                    <Pressable
                      key={p.id}
                      style={styles.listItem}
                      onPress={() => {
                        setProvinceId(p.id)
                        setDistrictId(null)
                        setNeighborhoodId(null)
                        setNeighborhoodQuery('')
                        setProvinceOpen(false)
                        setStreetHits([])
                        setResolveHits([])
                      }}
                    >
                      <Text style={styles.hitName}>{p.name}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              ) : null}

              <Text style={styles.fieldLabel}>İlçe</Text>
              <Pressable
                style={[styles.input, provinceId == null && styles.inputDisabled]}
                disabled={provinceId == null}
                onPress={() => {
                  if (provinceId == null) return
                  setDistrictOpen((v) => !v)
                  setProvinceOpen(false)
                }}
              >
                <Text style={district ? styles.valueText : styles.placeholder}>
                  {district?.name ?? (provinceId == null ? 'Önce il seç' : 'İlçe seç…')}
                </Text>
              </Pressable>
              {districtOpen ? (
                <ScrollView style={styles.listBox} nestedScrollEnabled>
                  {districts.map((d) => (
                    <Pressable
                      key={d.id}
                      style={styles.listItem}
                      onPress={() => {
                        setDistrictId(d.id)
                        setNeighborhoodId(null)
                        setNeighborhoodQuery('')
                        setDistrictOpen(false)
                        setStreetHits([])
                        setResolveHits([])
                      }}
                    >
                      <Text style={styles.hitName}>{d.name}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              ) : null}

              <Text style={styles.fieldLabel}>Mahalle</Text>
              <TextInput
                value={neighborhoodQuery}
                editable={districtId != null}
                onChangeText={(t) => {
                  setNeighborhoodQuery(t)
                  setNeighborhoodId(null)
                  setResolveHits([])
                }}
                placeholder={districtId == null ? 'Önce ilçe seç' : 'Örn. Akçeşme'}
                placeholderTextColor={colors.inkMuted}
                style={styles.input}
              />
              {districtId != null && filteredNeighborhoods.length > 0 ? (
                <ScrollView style={styles.listBox} nestedScrollEnabled>
                  {filteredNeighborhoods.map((n) => (
                    <Pressable
                      key={n.id}
                      style={[styles.listItem, neighborhoodId === n.id && styles.listItemActive]}
                      onPress={() => {
                        setNeighborhoodId(n.id)
                        setNeighborhoodQuery(n.name)
                        setResolveHits([])
                      }}
                    >
                      <Text style={styles.hitName}>{n.name}</Text>
                      <Text style={styles.hitLabel}>Mahalle</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              ) : null}

              <Text style={styles.fieldLabel}>Sokak / Cadde (isteğe bağlı)</Text>
              <TextInput
                value={street}
                editable={Boolean(province && district)}
                onChangeText={(t) => {
                  setStreet(t)
                  setResolveHits([])
                }}
                placeholder="Boş bırakabilirsin"
                placeholderTextColor={colors.inkMuted}
                style={styles.input}
              />
              {streetHits.map((hit) => (
                <Pressable
                  key={hit.id}
                  style={styles.listItem}
                  onPress={() => {
                    setStreet(hit.name)
                    setStreetHits([])
                    void findAndSave(hit)
                  }}
                >
                  <Text style={styles.hitName}>{hit.name}</Text>
                  <Text style={styles.hitLabel}>
                    {hit.label}
                    {'\n'}
                    {hit.lat.toFixed(5)}, {hit.lng.toFixed(5)}
                  </Text>
                </Pressable>
              ))}

              {resolveHits.map((hit) => (
                <Pressable
                  key={hit.id}
                  style={styles.listItem}
                  onPress={() => void findAndSave(hit)}
                >
                  <Text style={styles.hitName}>{hit.name}</Text>
                  <Text style={styles.hitLabel}>
                    {hit.label}
                    {'\n'}
                    {hit.lat.toFixed(5)}, {hit.lng.toFixed(5)} — dokununca Ev kaydet
                  </Text>
                </Pressable>
              ))}

              <Button
                label={busy ? 'Bulunuyor…' : 'Adresi bul ve Ev kaydet'}
                onPress={() => void findAndSave()}
                loading={busy}
                disabled={!canResolve}
              />
              {listsBusy ? <Text style={styles.hint}>Listeler yükleniyor…</Text> : null}
            </>
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
  selectedBox: { marginTop: 10, gap: 8 },
  selected: {
    color: colors.brand,
    fontWeight: '600',
    fontSize: 13,
    lineHeight: 18,
  },
  selectedMuted: { color: colors.inkMuted, fontSize: 13 },
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
  inputDisabled: { opacity: 0.55 },
  valueText: { color: colors.ink, fontWeight: '600' },
  placeholder: { color: colors.inkMuted },
  listBox: {
    maxHeight: 180,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.bg,
  },
  listItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  listItemActive: { backgroundColor: '#EAF2EE' },
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
