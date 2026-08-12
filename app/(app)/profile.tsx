import { router } from 'expo-router'
import { StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Banner, Button, Screen, Subtitle, Title } from '../../src/components/ui'
import { useAuth } from '../../src/context/AuthContext'
import { useFamily } from '../../src/context/FamilyContext'
import { colors } from '../../src/theme/colors'

export default function ProfileScreen() {
  const { user, cloudEnabled, signOut } = useAuth()
  const { family } = useFamily()

  async function onSignOut() {
    await signOut()
    router.replace('/(auth)/login')
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Screen style={styles.screen}>
        <Title>Profil</Title>
        <Subtitle>Hesap ve mağaza sürümü bilgileri.</Subtitle>

        <View style={styles.card}>
          <Text style={styles.label}>Ad</Text>
          <Text style={styles.value}>{user?.displayName}</Text>
          <Text style={[styles.label, { marginTop: 12 }]}>E-posta</Text>
          <Text style={styles.value}>{user?.email}</Text>
          <Text style={[styles.label, { marginTop: 12 }]}>Aile</Text>
          <Text style={styles.value}>{family?.name ?? '—'}</Text>
        </View>

        {cloudEnabled ? (
          <Banner text="Bulut açık: bu mobil projenin kendi Supabase bağlantısı kullanılıyor." tone="ok" />
        ) : (
          <Banner text="Yerel moddasın. Play Store / App Store için .env.example değerlerini yeni Supabase ile doldur." />
        )}

        <View style={styles.meta}>
          <Text style={styles.metaText}>Paket: com.evstok.mobile</Text>
          <Text style={styles.metaText}>Sürüm: 1.0.0</Text>
          <Text style={styles.metaText}>EAS: eas.json hazır (preview + production)</Text>
        </View>

        <Button label="Çıkış yap" variant="danger" onPress={onSignOut} />
      </Screen>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  screen: { paddingTop: 8 },
  card: {
    marginTop: 18,
    marginBottom: 14,
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
    fontSize: 17,
    fontWeight: '700',
    color: colors.ink,
  },
  meta: {
    marginBottom: 18,
    gap: 4,
  },
  metaText: {
    color: colors.inkMuted,
    fontSize: 13,
  },
})
