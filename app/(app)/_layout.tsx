import { Redirect, Tabs } from 'expo-router'
import { Platform, StyleSheet } from 'react-native'
import { TabBarIcon } from '../../src/components/TabBarIcon'
import { BudgetCacheProvider } from '../../src/context/BudgetCacheContext'
import { ItemsProvider } from '../../src/context/ItemsContext'
import { SavingsProvider } from '../../src/context/SavingsContext'
import { useAuth } from '../../src/context/AuthContext'
import { useFamily } from '../../src/context/FamilyContext'
import { colors } from '../../src/theme/colors'

export default function AppLayout() {
  const { user } = useAuth()
  const { family, loading } = useFamily()

  if (!user) return <Redirect href="/(auth)/login" />
  if (!loading && !family) return <Redirect href="/onboarding-family" />

  return (
    <ItemsProvider>
      <BudgetCacheProvider>
        <SavingsProvider>
          <Tabs
            screenOptions={{
              headerShown: false,
              tabBarActiveTintColor: colors.brand,
              tabBarInactiveTintColor: colors.inkMuted,
              tabBarShowLabel: false,
              tabBarStyle: styles.tabBar,
              tabBarItemStyle: styles.tabItem,
            }}
          >
            <Tabs.Screen
              name="index"
              options={{
                title: 'Liste',
                tabBarIcon: ({ focused }) => (
                  <TabBarIcon glyph="list" focused={focused} label="Liste" />
                ),
              }}
            />
            <Tabs.Screen
              name="budget"
              options={{
                title: 'Bütçe',
                tabBarIcon: ({ focused }) => (
                  <TabBarIcon glyph="budget" focused={focused} label="Bütçe" />
                ),
              }}
            />
            <Tabs.Screen
              name="reports"
              options={{
                title: 'Bilanço',
                tabBarIcon: ({ focused }) => (
                  <TabBarIcon glyph="reports" focused={focused} label="Bilanço" />
                ),
              }}
            />
            <Tabs.Screen
              name="family"
              options={{
                title: 'Aile',
                tabBarIcon: ({ focused }) => (
                  <TabBarIcon glyph="family" focused={focused} label="Aile" />
                ),
              }}
            />
            <Tabs.Screen
              name="profile"
              options={{
                title: 'Profil',
                tabBarIcon: ({ focused }) => (
                  <TabBarIcon glyph="profile" focused={focused} label="Profil" />
                ),
              }}
            />
          </Tabs>
        </SavingsProvider>
      </BudgetCacheProvider>
    </ItemsProvider>
  )
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.bgElevated,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    height: Platform.OS === 'ios' ? 84 : 72,
    paddingTop: 6,
    paddingBottom: Platform.OS === 'ios' ? 22 : 10,
    elevation: 8,
    shadowColor: '#0F3D2E',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: -2 },
  },
  tabItem: {
    paddingVertical: 2,
  },
})
