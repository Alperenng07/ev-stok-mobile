import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { AuthProvider } from '../src/context/AuthContext'
import { FamilyProvider } from '../src/context/FamilyContext'
import { colors } from '../src/theme/colors'

export default function RootLayout() {
  return (
    <AuthProvider>
      <FamilyProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg },
          }}
        />
      </FamilyProvider>
    </AuthProvider>
  )
}
