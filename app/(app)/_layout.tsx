import { Redirect, Tabs } from 'expo-router'
import { Text } from 'react-native'
import { ItemsProvider } from '../../src/context/ItemsContext'
import { useAuth } from '../../src/context/AuthContext'
import { useFamily } from '../../src/context/FamilyContext'
import { colors } from '../../src/theme/colors'

function TabLabel({ label, focused }: { label: string; focused: boolean }) {
  return (
    <Text style={{ fontSize: 12, fontWeight: '700', color: focused ? colors.brand : colors.inkMuted }}>
      {label}
    </Text>
  )
}

export default function AppLayout() {
  const { user } = useAuth()
  const { family, loading } = useFamily()

  if (!user) return <Redirect href="/(auth)/login" />
  if (!loading && !family) return <Redirect href="/onboarding-family" />

  return (
    <ItemsProvider>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.brand,
          tabBarInactiveTintColor: colors.inkMuted,
          tabBarStyle: {
            backgroundColor: colors.bgElevated,
            borderTopColor: colors.border,
            height: 64,
            paddingBottom: 8,
            paddingTop: 8,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Liste',
            tabBarLabel: ({ focused }) => <TabLabel label="Liste" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="family"
          options={{
            title: 'Aile',
            tabBarLabel: ({ focused }) => <TabLabel label="Aile" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profil',
            tabBarLabel: ({ focused }) => <TabLabel label="Profil" focused={focused} />,
          }}
        />
      </Tabs>
    </ItemsProvider>
  )
}
