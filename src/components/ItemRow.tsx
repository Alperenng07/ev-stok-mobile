import { Pressable, StyleSheet, Text, View } from 'react-native'
import { daysUntil, formatShortTR, isOverdue } from '../lib/date'
import { colors } from '../theme/colors'
import type { StockItem } from '../types'

type Props = {
  item: StockItem
  onToggle: () => void
  onEdit: () => void
}

export function ItemRow({ item, onToggle, onEdit }: Props) {
  const overdue = isOverdue(item.dueDate, item.purchased)
  const until = daysUntil(item.dueDate)
  let dueLabel = formatShortTR(item.dueDate)
  if (!item.purchased) {
    if (until === 0) dueLabel = 'Bugün'
    else if (until === 1) dueLabel = 'Yarın'
    else if (until < 0) dueLabel = `${Math.abs(until)} gün gecikti`
  }

  return (
    <View
      style={[
        styles.card,
        item.purchased && styles.cardDone,
        overdue && styles.cardOverdue,
      ]}
    >
      <Pressable
        onPress={onToggle}
        style={[styles.dotBtn, item.purchased ? styles.dotDone : styles.dotPending]}
        accessibilityLabel={item.purchased ? 'Alınmadı olarak işaretle' : 'Alındı olarak işaretle'}
      >
        <View style={[styles.dot, item.purchased && styles.dotFilled]} />
      </Pressable>

      <Pressable onPress={onEdit} style={styles.body}>
        <View style={styles.top}>
          <Text style={[styles.name, item.purchased && styles.nameDone]} numberOfLines={1}>
            {item.name}
          </Text>
          <View style={[styles.chip, overdue && styles.chipWarn]}>
            <Text style={[styles.chipText, overdue && styles.chipTextWarn]}>{dueLabel}</Text>
          </View>
        </View>
        <Text style={styles.meta}>
          Alınacak {item.neededQty} {item.unit} · Mevcut {item.currentQty} {item.unit}
          {item.renewalDays ? ` · Her ${item.renewalDays} gün` : ''}
        </Text>
        {item.notes ? <Text style={styles.notes}>{item.notes}</Text> : null}
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: colors.bgElevated,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 10,
  },
  cardDone: {
    opacity: 0.72,
  },
  cardOverdue: {
    borderColor: '#F5C2C0',
  },
  dotBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  dotPending: {
    borderWidth: 2,
    borderColor: colors.brandSoft,
  },
  dotDone: {
    backgroundColor: colors.okSoft,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'transparent',
  },
  dotFilled: {
    backgroundColor: colors.ok,
  },
  body: {
    flex: 1,
    gap: 4,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  name: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: colors.ink,
  },
  nameDone: {
    textDecorationLine: 'line-through',
    color: colors.inkMuted,
  },
  chip: {
    backgroundColor: '#EAF2EE',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  chipWarn: {
    backgroundColor: colors.warnSoft,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.brand,
  },
  chipTextWarn: {
    color: colors.warn,
  },
  meta: {
    fontSize: 13,
    color: colors.inkMuted,
  },
  notes: {
    marginTop: 2,
    fontSize: 13,
    color: colors.inkMuted,
  },
})
