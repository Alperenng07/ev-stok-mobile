import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { localStore } from '../lib/localStore'
import { isCloudEnabled, supabase } from '../lib/supabase'
import type { SessionUser } from '../types'

type AuthContextValue = {
  user: SessionUser | null
  loading: boolean
  cloudEnabled: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, displayName: string) => Promise<void>
  signOut: () => Promise<void>
  updateProfile: (input: { displayName: string; email: string }) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function boot() {
      try {
        if (isCloudEnabled && supabase) {
          const { data } = await supabase.auth.getSession()
          const session = data.session
          if (session?.user && !cancelled) {
            const metaName = session.user.user_metadata?.display_name as string | undefined
            setUser({
              id: session.user.id,
              email: session.user.email ?? '',
              displayName: metaName || session.user.email?.split('@')[0] || 'Kullanıcı',
            })
          }
        } else {
          const local = await localStore.getSession()
          if (!cancelled) setUser(local)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void boot()

    if (!isCloudEnabled || !supabase) return () => {
      cancelled = true
    }

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        setUser(null)
        return
      }
      const metaName = session.user.user_metadata?.display_name as string | undefined
      setUser({
        id: session.user.id,
        email: session.user.email ?? '',
        displayName: metaName || session.user.email?.split('@')[0] || 'Kullanıcı',
      })
    })

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    const normalized = email.trim().toLowerCase()
    if (isCloudEnabled && supabase) {
      const { error } = await supabase.auth.signInWithPassword({
        email: normalized,
        password,
      })
      if (error) throw error
      return
    }

    const ok = await localStore.checkPassword(normalized, password)
    if (!ok) throw new Error('E-posta veya şifre hatalı')
    const profile = await localStore.findProfileByEmail(normalized)
    if (!profile) throw new Error('Hesap bulunamadı')
    const session = {
      id: profile.id,
      email: profile.email,
      displayName: profile.displayName,
    }
    await localStore.setSession(session)
    setUser(session)
  }, [])

  const signUp = useCallback(async (email: string, password: string, displayName: string) => {
    const normalized = email.trim().toLowerCase()
    const name = displayName.trim() || normalized.split('@')[0]
    if (password.length < 6) throw new Error('Şifre en az 6 karakter olmalı')

    if (isCloudEnabled && supabase) {
      const { error } = await supabase.auth.signUp({
        email: normalized,
        password,
        options: { data: { display_name: name } },
      })
      if (error) throw error
      return
    }

    const existing = await localStore.findProfileByEmail(normalized)
    if (existing) throw new Error('Bu e-posta zaten kayıtlı')
    const profile = {
      id: crypto.randomUUID(),
      email: normalized,
      displayName: name,
      createdAt: new Date().toISOString(),
    }
    await localStore.saveProfile(profile)
    await localStore.setPassword(normalized, password)
    const session = {
      id: profile.id,
      email: profile.email,
      displayName: profile.displayName,
    }
    await localStore.setSession(session)
    setUser(session)
  }, [])

  const signOut = useCallback(async () => {
    if (isCloudEnabled && supabase) {
      await supabase.auth.signOut()
    }
    await localStore.setSession(null)
    setUser(null)
  }, [])

  const updateProfile = useCallback(
    async (input: { displayName: string; email: string }) => {
      if (!user) throw new Error('Oturum gerekli')
      const displayName = input.displayName.trim()
      const email = input.email.trim().toLowerCase()
      if (!displayName) throw new Error('Ad gerekli')
      if (!email.includes('@')) throw new Error('Geçerli bir e-posta gir')

      if (isCloudEnabled && supabase) {
        const { error } = await supabase.auth.updateUser({
          email,
          data: { display_name: displayName },
        })
        if (error) throw error
        await supabase
          .from('profiles')
          .update({ email, display_name: displayName })
          .eq('id', user.id)
        const next = { ...user, email, displayName }
        setUser(next)
        return
      }

      if (email !== user.email.toLowerCase()) {
        const taken = await localStore.findProfileByEmail(email)
        if (taken && taken.id !== user.id) throw new Error('Bu e-posta kullanımda')
        await localStore.changePasswordEmailKey(user.email, email)
      }

      const profile = {
        id: user.id,
        email,
        displayName,
        createdAt: new Date().toISOString(),
      }
      const existing = (await localStore.getProfiles()).find((p) => p.id === user.id)
      await localStore.saveProfile({
        ...profile,
        createdAt: existing?.createdAt ?? profile.createdAt,
      })
      await localStore.updateMembersForUser(user.id, { displayName, email })
      const next = { id: user.id, email, displayName }
      await localStore.setSession(next)
      setUser(next)
    },
    [user],
  )

  const value = useMemo(
    () => ({
      user,
      loading,
      cloudEnabled: isCloudEnabled,
      signIn,
      signUp,
      signOut,
      updateProfile,
    }),
    [user, loading, signIn, signUp, signOut, updateProfile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth AuthProvider içinde kullanılmalı')
  return ctx
}
