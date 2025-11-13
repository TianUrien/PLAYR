import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

// Get environment variables – prefer process.env to align with shared config, fall back to Vite env entries
const supabaseUrl =
  (typeof process !== 'undefined' && process.env ? process.env.SUPABASE_URL : undefined) ??
  (import.meta.env ? (import.meta.env as Record<string, string | undefined>).SUPABASE_URL : undefined) ??
  (import.meta.env ? (import.meta.env as Record<string, string | undefined>).VITE_SUPABASE_URL : undefined)

const supabaseAnonKey =
  (typeof process !== 'undefined' && process.env ? process.env.SUPABASE_ANON_KEY : undefined) ??
  (import.meta.env ? (import.meta.env as Record<string, string | undefined>).SUPABASE_ANON_KEY : undefined) ??
  (import.meta.env ? (import.meta.env as Record<string, string | undefined>).VITE_SUPABASE_ANON_KEY : undefined)

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables – check .env.local')
}

// Create Supabase client with typed database
// Use implicit auth flow so email links work across devices/browsers
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    flowType: 'implicit', // Implicit avoids local-only PKCE storage so email links work cross-device
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true, // Automatically detect and exchange tokens from URL
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    storageKey: 'playr-auth', // Custom storage key to avoid conflicts
  }
})

export const SUPABASE_URL = supabaseUrl
export const SUPABASE_ANON_KEY = supabaseAnonKey

// Export types
export type Profile = Database['public']['Tables']['profiles']['Row']
export type ProfileInsert = Database['public']['Tables']['profiles']['Insert']
export type ProfileUpdate = Database['public']['Tables']['profiles']['Update']

export type Vacancy = Database['public']['Tables']['vacancies']['Row']
export type VacancyInsert = Database['public']['Tables']['vacancies']['Insert']
export type VacancyUpdate = Database['public']['Tables']['vacancies']['Update']

export type VacancyApplication = Database['public']['Tables']['vacancy_applications']['Row']
export type VacancyApplicationInsert = Database['public']['Tables']['vacancy_applications']['Insert']
export type VacancyApplicationUpdate = Database['public']['Tables']['vacancy_applications']['Update']

export type GalleryPhoto = Database['public']['Tables']['gallery_photos']['Row']
export type GalleryPhotoInsert = Database['public']['Tables']['gallery_photos']['Insert']
export type GalleryPhotoUpdate = Database['public']['Tables']['gallery_photos']['Update']

export type ClubMedia = Database['public']['Tables']['club_media']['Row']
export type ClubMediaInsert = Database['public']['Tables']['club_media']['Insert']
export type ClubMediaUpdate = Database['public']['Tables']['club_media']['Update']

export type PlayingHistory = Database['public']['Tables']['playing_history']['Row']
export type PlayingHistoryInsert = Database['public']['Tables']['playing_history']['Insert']
export type PlayingHistoryUpdate = Database['public']['Tables']['playing_history']['Update']

export type Message = Database['public']['Tables']['messages']['Row']
export type MessageInsert = Database['public']['Tables']['messages']['Insert']
export type MessageUpdate = Database['public']['Tables']['messages']['Update']

export type Conversation = Database['public']['Tables']['conversations']['Row']
export type ConversationInsert = Database['public']['Tables']['conversations']['Insert']
export type ConversationUpdate = Database['public']['Tables']['conversations']['Update']

// Complex joined types
export type VacancyApplicationWithPlayer = VacancyApplication & {
  player: Pick<
    Profile,
    'id' | 'full_name' | 'avatar_url' | 'position' | 'secondary_position' | 'base_location' | 'nationality' | 'username'
  >
}

export type { Json } from './database.types'
