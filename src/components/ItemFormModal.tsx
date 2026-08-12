import { useEffect, useState } from 'react'
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { todayISO } from '../lib/date'
import { colors } from '../theme/colors'
import type { ItemDraft, StockItem } from '../types'
import { Button } from './ui'

const UNITS = ['adet', 'paket', 'lt', 'kg', 'kutu', 'şişe']

type Props = {
  open: boolean
  initial?: StockItem | null
  onClose: () => void
  onSubmit: (draft: ItemDraft) => void
  onDelete?: () => void
}

function toDraft(item?: StockItem | null): ItemDraft {
  if (item) {
    return {
      name: item.name,
      neededQty: item.neededQty,
      currentQty: item.currentQty,
      unit: item.unit,
      dueDate: item.dueDate,
      renewalDays: item.renewalDays,
      notes: item.notes,
    }
  }
  return {
    name: '',
    neededQty: 1,
    currentQty: 0,
    unit: 'adet',
    dueDate: todayISO(),
    renewalDays: 14,
    notes: '',
  }
}

export function ItemFormModal({ open, initial, onClose, onSubmit, onDelete }: Props) {
  const [draft, setDraft] = useState<ItemDraft>(() => toDraft(initial))

  useEffect(() => {
    if (open) setDraft(toDraft(initial))
  }, [open, initial])

  function save() {
    if (!draft.name.trim()) return
    onSubmit({
      ...draft,
      neededQty: Math.max(0, Number(draft.neededQty) || 0),
      currentQty: Math.max(0, Number(draft.currentQty) || 0),
      renewalDays:
        draft.renewalDays === null || draft.renewalDays === 0
          ? null
          : Math.max(1, Number(draft.renewalDays) || 1),
    })
    onClose()
  }

  return (
    <Modal visible={open} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.head}>
            <Text style={styles.title}>{initial ? 'Ürünü düzenle' : 'Yeni ürün'}</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={styles.close}>Kapat</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
            <Text style={styles.label}>Ürün adı</Text>
            <TextInput
              style={styles.input}
              value={draft.name}
              onChangeText={(name) => setDraft((d) => ({ ...d, name }))}
              placeholder="Örn. Süt"
              placeholderTextColor={colors.inkMuted}
            />

            <View style={styles.row}>
              <View style={styles.col}>
                <Text style={styles.label}>Alınacak</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="decimal-pad"
                  value={String(draft.neededQty)}
                  onChangeText={(v) => setDraft((d) => ({ ...d, neededQty: Number(v) || 0 }))}
                />
              </View>
              <View style={styles.col}>
                <Text style={styles.label}>Mevcut</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="decimal-pad"
                  value={String(draft.currentQty)}
                  onChangeText={(v) => setDraft((d) => ({ ...d, currentQty: Number(v) || 0 }))}
                />
              </View>
            </View>

            <Text style={styles.label}>Birim</Text>
            <View style={styles.units}>
              {UNITS.map((u) => (
                <Pressable
                  key={u}
                  onPress={() => setDraft((d) => ({ ...d, unit: u }))}
                  style={[styles.unit, draft.unit === u && styles.unitActive]}
                >
                  <Text style={[styles.unitText, draft.unit === u && styles.unitTextActive]}>{u}</Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.row}>
              <View style={styles.col}>
                <Text style={styles.label}>Son tarih (YYYY-MM-DD)</Text>
                <TextInput
                  style={styles.input}
                  value={draft.dueDate}
                  onChangeText={(dueDate) => setDraft((d) => ({ ...d, dueDate }))}
                  placeholder={todayISO()}
                  placeholderTextColor={colors.inkMuted}
                />
              </View>
              <View style={styles.col}>
                <Text style={styles.label}>Yenileme (gün)</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="number-pad"
                  value={draft.renewalDays == null ? '' : String(draft.renewalDays)}
                  onChangeText={(v) =>
                    setDraft((d) => ({
                      ...d,
                      renewalDays: v === '' ? null : Number(v) || 0,
                    }))
                  }
                  placeholder="Yok"
                  placeholderTextColor={colors.inkMuted}
                />
              </View>
            </View>

            <Text style={styles.label}>Not</Text>
            <TextInput
              style={[styles.input, styles.notes]}
              value={draft.notes}
              onChangeText={(notes) => setDraft((d) => ({ ...d, notes }))}
              placeholder="İsteğe bağlı"
              placeholderTextColor={colors.inkMuted}
              multiline
            />

            <View style={styles.actions}>
              {initial && onDelete ? (
                <Button
                  label="Sil"
                  variant="danger"
                  onPress={() => {
                    onDelete()
                    onClose()
                  }}
                />
              ) : (
                <View />
              )}
              <Button label="Kaydet" onPress={save} />
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.overlay,
  },
  sheet: {
    maxHeight: '92%',
    backgroundColor: colors.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 24,
  },
  handle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginTop: 10,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.brand,
  },
  close: {
    color: colors.inkMuted,
    fontWeight: '600',
  },
  form: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  label: {
    marginTop: 10,
    marginBottom: 6,
    fontSize: 13,
    fontWeight: '600',
    color: colors.inkMuted,
  },
  input: {
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.ink,
  },
  notes: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  col: {
    flex: 1,
  },
  units: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  unit: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.bgElevated,
  },
  unitActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  unitText: {
    color: colors.ink,
    fontWeight: '600',
  },
  unitTextActive: {
    color: '#fff',
  },
  actions: {
    marginTop: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
})
