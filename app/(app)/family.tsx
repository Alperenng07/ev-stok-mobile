import * as Clipboard from 'expo-clipboard'
import { router } from 'expo-router'
import { useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Banner, Button, Screen, Subtitle, Title } from '../../src/components/ui'
import { useAuth } from '../../src/context/AuthContext'
import { useFamily } from '../../src/context/FamilyContext'
import { colors } from '../../src/theme/colors'
import type { FamilyMember } from '../../src/types'

export default function FamilyScreen() {
  const { user, cloudEnabled } = useAuth()
  const { family, members, myRole, removeMember, leaveFamily } = useFamily()
  const [busyId, setBusyId] = useState<string | null>(null)

  async function copyCode() {
    if (!family) return
    await Clipboard.setStringAsync(family.inviteCode)
    Alert.alert('Kopyalandı', 'Davet kodu panoya alındı. Aile üyesine gönder.')
  }

  function confirmRemove(member: FamilyMember) {
    Alert.alert(
      'Üyeyi çıkar',
      `${member.displayName} aileden çıkarılsın mı?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Çıkar',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setBusyId(member.userId)
              try {
                await removeMember(member.userId)
              } catch (err) {
                Alert.alert('Hata', err instanceof Error ? err.message : 'Çıkarılamadı')
              } finally {
                setBusyId(null)
              }
            })()
          },
        },
      ],
    )
  }

  function confirmLeave() {
    Alert.alert('Aileden ayrıl', 'Bu aileden ayrılmak istediğine emin misin?', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Ayrıl',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setBusyId(user?.id ?? 'self')
            try {
              await leaveFamily()
              router.replace('/onboarding-family')
            } catch (err) {
              Alert.alert('Hata', err instanceof Error ? err.message : 'Ayrılamadı')
            } finally {
              setBusyId(null)
            }
          })()
        },
      },
    ])
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Screen style={styles.screen}>
        <Title>Aile</Title>
        <Subtitle>
          Davet kodunu paylaşarak üye ekle. Kurucu yanlış katılanları çıkarabilir; herkes aileden
          ayrılabilir.
        </Subtitle>

        {!cloudEnabled ? (
          <Banner text="Yerel modda davet kodu yalnızca bu cihazdaki hesaplar arasında çalışır." />
        ) : null}

        {family ? (
          <View style={styles.card}>
            <Text style={styles.label}>Aile adı</Text>
            <Text style={styles.value}>{family.name}</Text>
            <Text style={[styles.label, { marginTop: 14 }]}>Davet kodu</Text>
            <Pressable onPress={copyCode} style={styles.codeBox}>
              <Text style={styles.code}>{family.inviteCode}</Text>
              <Text style={styles.copyHint}>Kopyala</Text>
            </Pressable>
          </View>
        ) : null}

        <Text style={styles.section}>Üyeler ({members.length})</Text>
        {members.map((m) => {
          const isMe = m.userId === user?.id
          const canKick = myRole === 'owner' && !isMe && m.role !== 'owner'
          return (
            <View key={m.id} style={styles.member}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={styles.memberName}>
                  {m.displayName}
                  {isMe ? ' (sen)' : ''}
                </Text>
                <Text style={styles.memberEmail}>{m.email}</Text>
              </View>
              <View style={styles.memberRight}>
                <Text style={styles.role}>{m.role === 'owner' ? 'Kurucu' : 'Üye'}</Text>
                {canKick ? (
                  <Pressable
                    onPress={() => confirmRemove(m)}
                    disabled={busyId === m.userId}
                    style={styles.kickBtn}
                  >
                    <Text style={styles.kickText}>
                      {busyId === m.userId ? '…' : 'Çıkar'}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          )
        })}

        <View style={styles.leaveBlock}>
          <Button
            label="Aileden ayrıl"
            variant="danger"
            onPress={confirmLeave}
            loading={busyId === user?.id}
          />
        </View>
      </Screen>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  screen: { paddingTop: 8 },
  card: {
    marginTop: 18,
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
  },
  value: {
    marginTop: 4,
    fontSize: 20,
    fontWeight: '700',
    color: colors.ink,
  },
  codeBox: {
    marginTop: 8,
    borderRadius: 12,
    backgroundColor: '#EAF2EE',
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  code: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 3,
    color: colors.brand,
  },
  copyHint: {
    color: colors.brandSoft,
    fontWeight: '700',
  },
  section: {
    marginTop: 22,
    marginBottom: 10,
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
  },
  member: {
    backgroundColor: colors.bgElevated,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  memberName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
  },
  memberEmail: {
    marginTop: 2,
    color: colors.inkMuted,
    fontSize: 13,
  },
  memberRight: {
    alignItems: 'flex-end',
    gap: 8,
  },
  role: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.brandSoft,
  },
  kickBtn: {
    backgroundColor: colors.dangerSoft,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  kickText: {
    color: colors.danger,
    fontWeight: '800',
    fontSize: 12,
  },
  leaveBlock: {
    marginTop: 18,
    marginBottom: 24,
  },
})
