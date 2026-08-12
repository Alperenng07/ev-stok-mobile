import * as Clipboard from 'expo-clipboard'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Banner, Screen, Subtitle, Title } from '../../src/components/ui'
import { useAuth } from '../../src/context/AuthContext'
import { useFamily } from '../../src/context/FamilyContext'
import { colors } from '../../src/theme/colors'

export default function FamilyScreen() {
  const { cloudEnabled } = useAuth()
  const { family, members } = useFamily()

  async function copyCode() {
    if (!family) return
    await Clipboard.setStringAsync(family.inviteCode)
    Alert.alert('Kopyalandı', 'Davet kodu panoya alındı. Aile üyesine gönder.')
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Screen style={styles.screen}>
        <Title>Aile</Title>
        <Subtitle>
          Davet kodunu paylaşarak yeni üye ekle. Üyeler aynı stok listesini görür.
        </Subtitle>

        {!cloudEnabled ? (
          <Banner text="Yerel modda davet kodu yalnızca bu cihazdaki hesaplar arasında çalışır. Mağaza sürümü için yeni (ayrı) Supabase bağlayın." />
        ) : null}

        {family ? (
          <View style={styles.card}>
            <Text style={styles.label}>Aile adı</Text>
            <Text style={styles.value}>{family.name}</Text>
            <Text style={[styles.label, { marginTop: 14 }]}>Davet kodu</Text>
            <Pressable onPress={copyCode} style={styles.codeBox}>
              <Text style={styles.code}>{family.inviteCode}</Text>
              <Text style={styles.copyHint}>Kopyala</Text>
            </Pressable>
            <Text style={styles.hint}>
              Yeni üye uygulamayı indirip kayıt olur, ardından bu kodla aileye katılır.
            </Text>
          </View>
        ) : null}

        <Text style={styles.section}>Üyeler ({members.length})</Text>
        {members.map((m) => (
          <View key={m.id} style={styles.member}>
            <View>
              <Text style={styles.memberName}>{m.displayName}</Text>
              <Text style={styles.memberEmail}>{m.email}</Text>
            </View>
            <Text style={styles.role}>{m.role === 'owner' ? 'Kurucu' : 'Üye'}</Text>
          </View>
        ))}
      </Screen>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  screen: { paddingTop: 8 },
  card: {
    marginTop: 18,
    backgroundColor: colors.bgElevated,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.inkMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  value: {
    marginTop: 4,
    fontSize: 20,
    fontWeight: '700',
    color: colors.ink,
  },
  codeBox: {
    marginTop: 8,
    borderRadius: 12,
    backgroundColor: '#EAF2EE',
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  code: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 3,
    color: colors.brand,
  },
  copyHint: {
    color: colors.brandSoft,
    fontWeight: '700',
  },
  hint: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkMuted,
  },
  section: {
    marginTop: 22,
    marginBottom: 10,
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
  },
  member: {
    backgroundColor: colors.bgElevated,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  memberName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
  },
  memberEmail: {
    marginTop: 2,
    color: colors.inkMuted,
    fontSize: 13,
  },
  role: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.brandSoft,
  },
})
