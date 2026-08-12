import { Link, Redirect, router } from 'expo-router'
import { useState } from 'react'
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native'
import { Banner, Button, Field, Screen, Subtitle, Title } from '../../src/components/ui'
import { useAuth } from '../../src/context/AuthContext'
import { colors } from '../../src/theme/colors'

export default function LoginScreen() {
  const { user, cloudEnabled, signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  if (user) return <Redirect href="/" />

  async function onSubmit() {
    setLoading(true)
    setError(null)
    try {
      await signIn(email, password)
      router.replace('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Giriş başarısız')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.wrap}
      >
        <View style={styles.hero}>
          <Text style={styles.brand}>Ev Stok</Text>
          <Title>Giriş yap</Title>
          <Subtitle>Aile listenize erişmek için hesabınızla giriş yapın.</Subtitle>
        </View>

        {!cloudEnabled ? (
          <Banner text="Yerel mod: yeni (ayrı) Supabase bağlanana kadar veriler bu cihazda tutulur." />
        ) : null}
        {error ? <Banner text={error} tone="err" /> : null}

        <Field
          label="E-posta"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          placeholder="ornek@mail.com"
        />
        <Field
          label="Şifre"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
        />

        <Button label="Giriş yap" onPress={onSubmit} loading={loading} />

        <View style={styles.footer}>
          <Text style={styles.footerText}>Hesabın yok mu?</Text>
          <Link href="/(auth)/register" style={styles.link}>
            Kayıt ol
          </Link>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', paddingBottom: 24 },
  hero: { marginBottom: 22 },
  brand: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.brandSoft,
    marginBottom: 8,
  },
  footer: {
    marginTop: 18,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
  },
  footerText: { color: colors.inkMuted },
  link: { color: colors.brand, fontWeight: '700' },
})
