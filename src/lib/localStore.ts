import AsyncStorage from '@react-native-async-storage/async-storage'
import type { Family, FamilyMember, Profile, SessionUser, StockItem } from '../types'

const KEYS = {
  session: 'evstok.session',
  profiles: 'evstok.profiles',
  families: 'evstok.families',
  members: 'evstok.members',
  items: 'evstok.items',
  passwords: 'evstok.passwords',
} as const

async function readJson<T>(key: string, fallback: T): Promise<T> {
  const raw = await AsyncStorage.getItem(key)
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

async function writeJson<T>(key: string, value: T): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value))
}

export const localStore = {
  async getSession(): Promise<SessionUser | null> {
    return readJson<SessionUser | null>(KEYS.session, null)
  },
  async setSession(user: SessionUser | null): Promise<void> {
    if (!user) {
      await AsyncStorage.removeItem(KEYS.session)
      return
    }
    await writeJson(KEYS.session, user)
  },
  async getProfiles(): Promise<Profile[]> {
    return readJson(KEYS.profiles, [])
  },
  async saveProfile(profile: Profile): Promise<void> {
    const list = await this.getProfiles()
    const next = list.filter((p) => p.id !== profile.id)
    next.push(profile)
    await writeJson(KEYS.profiles, next)
  },
  async findProfileByEmail(email: string): Promise<Profile | null> {
    const list = await this.getProfiles()
    return list.find((p) => p.email.toLowerCase() === email.toLowerCase()) ?? null
  },
  async setPassword(email: string, password: string): Promise<void> {
    const map = await readJson<Record<string, string>>(KEYS.passwords, {})
    map[email.toLowerCase()] = password
    await writeJson(KEYS.passwords, map)
  },
  async checkPassword(email: string, password: string): Promise<boolean> {
    const map = await readJson<Record<string, string>>(KEYS.passwords, {})
    return map[email.toLowerCase()] === password
  },
  async getFamilies(): Promise<Family[]> {
    return readJson(KEYS.families, [])
  },
  async saveFamily(family: Family): Promise<void> {
    const list = await this.getFamilies()
    const next = list.filter((f) => f.id !== family.id)
    next.push(family)
    await writeJson(KEYS.families, next)
  },
  async findFamilyByInvite(code: string): Promise<Family | null> {
    const list = await this.getFamilies()
    return list.find((f) => f.inviteCode === code.toUpperCase()) ?? null
  },
  async getMembers(): Promise<FamilyMember[]> {
    return readJson(KEYS.members, [])
  },
  async saveMember(member: FamilyMember): Promise<void> {
    const list = await this.getMembers()
    const next = list.filter((m) => !(m.familyId === member.familyId && m.userId === member.userId))
    next.push(member)
    await writeJson(KEYS.members, next)
  },
  async membersOf(familyId: string): Promise<FamilyMember[]> {
    const list = await this.getMembers()
    return list.filter((m) => m.familyId === familyId)
  },
  async familyForUser(userId: string): Promise<Family | null> {
    const members = await this.getMembers()
    const mine = members.find((m) => m.userId === userId)
    if (!mine) return null
    const families = await this.getFamilies()
    return families.find((f) => f.id === mine.familyId) ?? null
  },
  async getItems(familyId: string): Promise<StockItem[]> {
    const all = await readJson<StockItem[]>(KEYS.items, [])
    return all.filter((i) => i.familyId === familyId)
  },
  async upsertItem(item: StockItem): Promise<void> {
    const all = await readJson<StockItem[]>(KEYS.items, [])
    const next = all.filter((i) => i.id !== item.id)
    next.push(item)
    await writeJson(KEYS.items, next)
  },
  async deleteItem(id: string): Promise<void> {
    const all = await readJson<StockItem[]>(KEYS.items, [])
    await writeJson(
      KEYS.items,
      all.filter((i) => i.id !== id),
    )
  },
}
