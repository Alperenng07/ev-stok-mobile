import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors } from '../theme/colors'

const GLYPHS: Record<string, { on: string; off: string }> = {
  list: { on: '☰', off: '☰' },
  budget: { on: '◈', off: '◇' },
  reports: { on: '▮', off: '▯' },
  family: { on: '◉', off: '◎' },
  profile: { on: '●', off: '○' },
}

export function TabBarIcon({
  glyph,
  focused,
  label,
}: {
  glyph: keyof typeof GLYPHS
  focused: boolean
  label: string
}) {
  const g = GLYPHS[glyph]
  return (
    <View style={[styles.wrap, focused && styles.wrapActive]}>
      <View style={[styles.iconBubble, focused && styles.iconBubbleActive]}>
        <Text style={[styles.glyph, focused && styles.glyphActive]}>
          {focused ? g.on : g.off}
        </Text>
      </View>
      <Text style={[styles.label, focused && styles.labelActive]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  )
}

export function PeriodChips({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (v: string) => void
  options: { id: string; label: string }[]
}) {
  return (
    <View style={styles.chips}>
      {options.map((opt) => {
        const active = value === opt.id
        return (
          <Pressable
            key={opt.id}
            onPress={() => onChange(opt.id)}
            style={[styles.chip, active && styles.chipActive]}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 58,
    paddingHorizontal: 2,
  },
  wrapActive: {
    transform: [{ translateY: -2 }],
  },
  iconBubble: {
    width: 34,
    height: 28,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  iconBubbleActive: {
    backgroundColor: '#E8F2EC',
  },
  glyph: {
    fontSize: 16,
    color: colors.inkMuted,
    fontWeight: '700',
  },
  glyphActive: {
    color: colors.brand,
  },
  label: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: '600',
    color: colors.inkMuted,
  },
  labelActive: {
    color: colors.brand,
    fontWeight: '800',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElevated,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.ink,
  },
  chipTextActive: {
    color: '#fff',
  },
})
