import { Redirect, router } from 'expo-router'
import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Banner, Button, Field, Screen, Subtitle, Title } from '../src/components/ui'
import { useAuth } from '../src/context/AuthContext'
import { useFamily } from '../src/context/FamilyContext'
import { colors } from '../src/theme/colors'

export default function OnboardingFamilyScreen() {
  const { user } = useAuth()
  const { family, createFamily, joinFamily } = useFamily()
  const [mode, setMode] = useState<'create' | 'join'>('create')
  const [familyName, setFamilyName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  if (!user) return <Redirect href="/(auth)/login" />
  if (family) return <Redirect href="/(app)" />

  async function onSubmit() {
    setLoading(true)
    setError(null)
    try {
      if (mode === 'create') await createFamily(familyName)
      else await joinFamily(inviteCode)
      router.replace('/(app)')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'İşlem başarısız')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Screen style={styles.screen}>
      <Text style={styles.brand}>Ev Stok</Text>
      <Title>Ailene katıl</Title>
      <Subtitle>
        Ortak stok listesi için bir aile kur veya mevcut aileye davet koduyla katıl.
      </Subtitle>

      <View style={styles.tabs}>
        <Button
          label="Aile kur"
          variant={mode === 'create' ? 'primary' : 'secondary'}
          onPress={() => setMode('create')}
        />
        <Button
          label="Koda katıl"
          variant={mode === 'join' ? 'primary' : 'secondary'}
          onPress={() => setMode('join')}
        />
      </View>

      {error ? <Banner text={error} tone="err" /> : null}

      {mode === 'create' ? (
        <Field
          label="Aile adı"
          value={familyName}
          onChangeText={setFamilyName}
          placeholder="Örn. Yılmaz Ailesi"
        />
      ) : (
        <Field
          label="Davet kodu"
          autoCapitalize="characters"
          value={inviteCode}
          onChangeText={setInviteCode}
          placeholder="ABC123"
        />
      )}

      <Button
        label={mode === 'create' ? 'Aileyi oluştur' : 'Aileye katıl'}
        onPress={onSubmit}
        loading={loading}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  screen: { justifyContent: 'center', paddingBottom: 28 },
  brand: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.brandSoft,
    marginBottom: 8,
  },
  tabs: {
    marginTop: 22,
    marginBottom: 8,
    flexDirection: 'row',
    gap: 10,
  },
})
