import { useEffect, useMemo, useState } from 'react'
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { formatTry } from '../lib/budgetPlanner'
import { purchasePlaceOptionsFromOffers, type PurchasePlaceOption } from '../lib/chains'
import { colors } from '../theme/colors'
import { Button } from './ui'

export type PurchasePlaceResult = {
  placeId: string
  placeLabel: string
}

type Props = {
  open: boolean
  itemName: string
  /** Bu ürün için son bütçe hesabındaki teklifler; yoksa yalnızca Diğer */
  offers?: { chainId: string; unitPrice: number }[] | null
  onClose: () => void
  onConfirm: (place: PurchasePlaceResult) => void
}

export function PurchasePlaceModal({ open, itemName, offers, onClose, onConfirm }: Props) {
  const options = useMemo(() => purchasePlaceOptionsFromOffers(offers), [offers])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const pricedCount = options.filter((o) => o.id !== 'other').length

  useEffect(() => {
    if (open) setSelectedId(null)
  }, [open])

  function confirm() {
    if (!selectedId) return
    const opt = options.find((o) => o.id === selectedId)
    if (!opt) return
    onConfirm({ placeId: opt.id, placeLabel: opt.label })
  }

  const canSave = selectedId != null

  return (
    <Modal visible={open} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>Nereden aldın?</Text>
          <Text style={styles.sub}>
            <Text style={styles.itemName}>{itemName}</Text> ürününü hangi marketten aldın?
          </Text>
          <Text style={styles.hint}>
            {pricedCount > 0
              ? 'Yalnızca bu ürün için fiyatı bulunan marketler listeleniyor.'
              : 'Bu ürün için hesaplanmış market fiyatı yok. Diğer’i seçebilir veya önce Hesapla.'}
          </Text>

          <View style={styles.grid}>
            {options.map((opt: PurchasePlaceOption) => {
              const active = selectedId === opt.id
              return (
                <Pressable
                  key={opt.id}
                  onPress={() => setSelectedId(opt.id)}
                  style={[styles.option, active && styles.optionActive]}
                >
                  <View style={[styles.dot, { backgroundColor: opt.color }]} />
                  <View>
                    <Text style={[styles.optionText, active && styles.optionTextActive]}>
                      {opt.label}
                    </Text>
                    {opt.unitPrice != null ? (
                      <Text style={styles.price}>{formatTry(opt.unitPrice)}</Text>
                    ) : null}
                  </View>
                </Pressable>
              )
            })}
          </View>

          <View style={styles.actions}>
            <Button label="Vazgeç" variant="secondary" onPress={onClose} />
            <Button label="Alındı kaydet" onPress={confirm} disabled={!canSave} />
          </View>
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
    backgroundColor: colors.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 28,
    paddingTop: 10,
  },
  handle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.brand,
  },
  sub: {
    marginTop: 6,
    marginBottom: 6,
    color: colors.inkMuted,
    lineHeight: 20,
  },
  hint: {
    marginBottom: 14,
    color: colors.inkMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  itemName: {
    color: colors.ink,
    fontWeight: '700',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElevated,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  optionActive: {
    borderColor: colors.brand,
    backgroundColor: '#EAF2EE',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  optionText: {
    fontWeight: '700',
    color: colors.ink,
    fontSize: 14,
  },
  optionTextActive: {
    color: colors.brand,
  },
  price: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '700',
    color: colors.brandSoft,
  },
  actions: {
    marginTop: 18,
    flexDirection: 'row',
    gap: 10,
  },
})
