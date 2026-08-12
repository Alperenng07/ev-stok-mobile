import { Redirect } from 'expo-router'
import { ActivityIndicator, View } from 'react-native'
import { useAuth } from '../src/context/AuthContext'
import { useFamily } from '../src/context/FamilyContext'
import { colors } from '../src/theme/colors'

export default function Index() {
  const { user, loading: authLoading } = useAuth()
  const { family, loading: familyLoading } = useFamily()

  if (authLoading || (user && familyLoading)) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.brand} size="large" />
      </View>
    )
  }

  if (!user) return <Redirect href="/(auth)/login" />
  if (!family) return <Redirect href="/onboarding-family" />
  return <Redirect href="/(app)" />
}
