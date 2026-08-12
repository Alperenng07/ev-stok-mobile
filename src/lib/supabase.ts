import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = process.env.EXPO_PUBLIC_SUPABASE_URL
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

/** Sadece bu mobil projenin kendi (yeni) Supabase projesi. Eski ev-stok ile paylaşılmaz. */
export const isCloudEnabled = Boolean(
  url &&
    key &&
    !url.includes('YOUR_NEW_PROJECT') &&
    !key.includes('YOUR_NEW_ANON_KEY'),
)

export const supabase: SupabaseClient | null = isCloudEnabled
  ? createClient(url!, key!, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null
