import { router } from 'expo-router'
import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Banner, Button, Field, Screen, Subtitle, Title } from '../../src/components/ui'
import { useAuth } from '../../src/context/AuthContext'
import { useFamily } from '../../src/context/FamilyContext'
import { colors } from '../../src/theme/colors'

export default function ProfileScreen() {
  const { user, cloudEnabled, signOut, updateProfile } = useAuth()
  const { family, refresh } = useFamily()

  const [displayName, setDisplayName] = useState(user?.displayName ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setDisplayName(user?.displayName ?? '')
    setEmail(user?.email ?? '')
  }, [user?.displayName, user?.email])

  async function onSave() {
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      await updateProfile({ displayName, email })
      await refresh()
      setMessage('Profil güncellendi.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Güncellenemedi')
    } finally {
      setSaving(false)
    }
  }

  async function onSignOut() {
    await signOut()
    router.replace('/(auth)/login')
  }

  const dirty =
    displayName.trim() !== (user?.displayName ?? '') ||
    email.trim().toLowerCase() !== (user?.email ?? '').toLowerCase()

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Screen style={styles.screen}>
        <Title>Profil</Title>
        <Subtitle>Adını ve e-posta adresini düzenleyebilirsin.</Subtitle>

        <View style={styles.card}>
          <Field
            label="Ad"
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Adın"
          />
          <Field
            label="E-posta"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            placeholder="ornek@mail.com"
          />
          <Text style={styles.label}>Aile</Text>
          <Text style={styles.value}>{family?.name ?? '—'}</Text>

          {message ? <Banner text={message} tone="ok" /> : null}
          {error ? <Banner text={error} tone="err" /> : null}

          <Button
            label={saving ? 'Kaydediliyor…' : 'Değişiklikleri kaydet'}
            onPress={onSave}
            loading={saving}
            disabled={!dirty}
          />
        </View>

        {cloudEnabled ? (
          <Banner
            text="Bulut açık: e-posta değişince doğrulama maili gelebilir."
            tone="ok"
          />
        ) : (
          <Banner text="Yerel mod: bilgiler bu cihazda saklanır." />
        )}

        <View style={styles.meta}>
          <Text style={styles.metaText}>Paket: com.evstok.mobile</Text>
          <Text style={styles.metaText}>Sürüm: 1.0.0</Text>
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
    marginBottom: 4,
  },
  value: {
    marginBottom: 14,
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
