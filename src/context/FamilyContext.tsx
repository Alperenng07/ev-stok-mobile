import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { makeInviteCode } from '../lib/itemsLogic'
import { localStore } from '../lib/localStore'
import { isCloudEnabled, supabase } from '../lib/supabase'
import type { Family, FamilyMember } from '../types'
import { useAuth } from './AuthContext'

type FamilyContextValue = {
  family: Family | null
  members: FamilyMember[]
  loading: boolean
  myRole: 'owner' | 'member' | null
  refresh: () => Promise<void>
  createFamily: (name: string) => Promise<void>
  joinFamily: (inviteCode: string) => Promise<void>
  removeMember: (userId: string) => Promise<void>
  leaveFamily: () => Promise<void>
}

const FamilyContext = createContext<FamilyContextValue | null>(null)

export function FamilyProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [family, setFamily] = useState<Family | null>(null)
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!user) {
      setFamily(null)
      setMembers([])
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      if (isCloudEnabled && supabase) {
        const { data: membership, error: memErr } = await supabase
          .from('family_members')
          .select('family_id, role, joined_at, id')
          .eq('user_id', user.id)
          .maybeSingle()
        if (memErr) throw memErr

        if (!membership) {
          setFamily(null)
          setMembers([])
          return
        }

        const { data: fam, error: famErr } = await supabase
          .from('families')
          .select('*')
          .eq('id', membership.family_id)
          .single()
        if (famErr) throw famErr

        const { data: memberRows, error: listErr } = await supabase
          .from('family_members')
          .select('id, family_id, user_id, role, joined_at, profiles(email, display_name)')
          .eq('family_id', membership.family_id)
        if (listErr) throw listErr

        setFamily({
          id: fam.id,
          name: fam.name,
          inviteCode: fam.invite_code,
          createdBy: fam.created_by,
          createdAt: fam.created_at,
        })

        setMembers(
          (memberRows ?? []).map((row: {
            id: string
            family_id: string
            user_id: string
            role: string
            joined_at: string
            profiles:
              | { email: string; display_name: string }
              | { email: string; display_name: string }[]
              | null
          }) => {
            const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
            return {
              id: row.id,
              familyId: row.family_id,
              userId: row.user_id,
              role: row.role as 'owner' | 'member',
              displayName: profile?.display_name ?? 'Üye',
              email: profile?.email ?? '',
              joinedAt: row.joined_at,
            }
          }),
        )
        return
      }

      const localFamily = await localStore.familyForUser(user.id)
      setFamily(localFamily)
      if (localFamily) {
        setMembers(await localStore.membersOf(localFamily.id))
      } else {
        setMembers([])
      }
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const createFamily = useCallback(
    async (name: string) => {
      if (!user) throw new Error('Oturum gerekli')
      const trimmed = name.trim()
      if (!trimmed) throw new Error('Aile adı gerekli')
      const inviteCode = makeInviteCode()

      if (isCloudEnabled && supabase) {
        const { data: fam, error } = await supabase
          .from('families')
          .insert({
            name: trimmed,
            invite_code: inviteCode,
            created_by: user.id,
          })
          .select('*')
          .single()
        if (error) throw error

        const { error: memErr } = await supabase.from('family_members').insert({
          family_id: fam.id,
          user_id: user.id,
          role: 'owner',
        })
        if (memErr) throw memErr
        await refresh()
        return
      }

      const family: Family = {
        id: crypto.randomUUID(),
        name: trimmed,
        inviteCode,
        createdBy: user.id,
        createdAt: new Date().toISOString(),
      }
      await localStore.saveFamily(family)
      await localStore.saveMember({
        id: crypto.randomUUID(),
        familyId: family.id,
        userId: user.id,
        role: 'owner',
        displayName: user.displayName,
        email: user.email,
        joinedAt: new Date().toISOString(),
      })
      await refresh()
    },
    [user, refresh],
  )

  const joinFamily = useCallback(
    async (inviteCode: string) => {
      if (!user) throw new Error('Oturum gerekli')
      const code = inviteCode.trim().toUpperCase()
      if (code.length < 4) throw new Error('Geçersiz davet kodu')

      if (isCloudEnabled && supabase) {
        const { error } = await supabase.rpc('join_family_by_invite', { code })
        if (error) throw error
        await refresh()
        return
      }

      const existing = await localStore.familyForUser(user.id)
      if (existing) throw new Error('Zaten bir ailedesiniz')

      const fam = await localStore.findFamilyByInvite(code)
      if (!fam) throw new Error('Davet kodu bulunamadı (bu cihazda kayıtlı aile yok)')
      await localStore.saveMember({
        id: crypto.randomUUID(),
        familyId: fam.id,
        userId: user.id,
        role: 'member',
        displayName: user.displayName,
        email: user.email,
        joinedAt: new Date().toISOString(),
      })
      await refresh()
    },
    [user, refresh],
  )

  const myRole = useMemo(() => {
    if (!user) return null
    return members.find((m) => m.userId === user.id)?.role ?? null
  }, [members, user])

  const removeMember = useCallback(
    async (targetUserId: string) => {
      if (!user || !family) throw new Error('Aile bulunamadı')
      if (myRole !== 'owner') throw new Error('Sadece kurucu üye çıkarabilir')
      if (targetUserId === user.id) throw new Error('Kendini çıkarmak için Aileden ayrıl kullan')

      const target = members.find((m) => m.userId === targetUserId)
      if (!target) throw new Error('Üye bulunamadı')
      if (target.role === 'owner') throw new Error('Kurucu çıkarılamaz')

      if (isCloudEnabled && supabase) {
        const { error } = await supabase
          .from('family_members')
          .delete()
          .eq('family_id', family.id)
          .eq('user_id', targetUserId)
        if (error) throw error
        await refresh()
        return
      }

      await localStore.removeMember(family.id, targetUserId)
      await refresh()
    },
    [user, family, myRole, members, refresh],
  )

  const leaveFamily = useCallback(async () => {
    if (!user || !family) throw new Error('Aile bulunamadı')
    const me = members.find((m) => m.userId === user.id)
    if (!me) throw new Error('Üyelik bulunamadı')

    if (me.role === 'owner') {
      const otherMembers = members.filter((m) => m.userId !== user.id)
      if (otherMembers.length > 0) {
        throw new Error('Kurucu ayrılmadan önce diğer üyeleri çıkarmalı')
      }
    }

    if (isCloudEnabled && supabase) {
      const { error } = await supabase
        .from('family_members')
        .delete()
        .eq('family_id', family.id)
        .eq('user_id', user.id)
      if (error) throw error
      await refresh()
      return
    }

    await localStore.removeMember(family.id, user.id)
    await refresh()
  }, [user, family, members, refresh])

  const value = useMemo(
    () => ({
      family,
      members,
      loading,
      myRole,
      refresh,
      createFamily,
      joinFamily,
      removeMember,
      leaveFamily,
    }),
    [
      family,
      members,
      loading,
      myRole,
      refresh,
      createFamily,
      joinFamily,
      removeMember,
      leaveFamily,
    ],
  )

  return <FamilyContext.Provider value={value}>{children}</FamilyContext.Provider>
}

export function useFamily() {
  const ctx = useContext(FamilyContext)
  if (!ctx) throw new Error('useFamily FamilyProvider içinde kullanılmalı')
  return ctx
}
