// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

interface DeleteAccountResponse {
  success: boolean
  error?: string
  deletedData?: {
    profiles: number
    messages: number
    conversations: number
    applications: number
    playerMedia: number
    clubMedia: number
    playingHistory: number
    vacancies: number
    storageFiles: number
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get JWT from Authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('Missing authorization header')
    }

    const token = authHeader.replace('Bearer ', '')

    // Create Supabase client with user's JWT
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    // Verify the JWT and get user
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      throw new Error('Invalid or expired token')
    }

    console.log(`[DELETE ACCOUNT] Starting deletion for user: ${user.id}`)

    // Track what we delete for response
    const deletedData = {
      profiles: 0,
      messages: 0,
      conversations: 0,
      applications: 0,
      playerMedia: 0,
      clubMedia: 0,
      playingHistory: 0,
      vacancies: 0,
      storageFiles: 0,
    }

    // ========================================
    // STEP 1: Delete Storage Files
    // ========================================
    console.log('[DELETE ACCOUNT] Step 1: Deleting storage files...')
    
    try {
      // Delete avatar from avatars bucket
      const { data: avatarFiles } = await supabase.storage
        .from('avatars')
        .list(user.id)

      if (avatarFiles && avatarFiles.length > 0) {
        const avatarPaths = avatarFiles.map(file => `${user.id}/${file.name}`)
        await supabase.storage.from('avatars').remove(avatarPaths)
        deletedData.storageFiles += avatarFiles.length
        console.log(`[DELETE ACCOUNT] Deleted ${avatarFiles.length} avatar files`)
      }

      // Delete player media from player-media bucket
      const { data: playerMediaFiles } = await supabase.storage
        .from('player-media')
        .list(user.id)

      if (playerMediaFiles && playerMediaFiles.length > 0) {
        const playerMediaPaths = playerMediaFiles.map(file => `${user.id}/${file.name}`)
        await supabase.storage.from('player-media').remove(playerMediaPaths)
        deletedData.storageFiles += playerMediaFiles.length
        console.log(`[DELETE ACCOUNT] Deleted ${playerMediaFiles.length} player media files`)
      }

      // Delete club media from club-media bucket
      const { data: clubMediaFiles } = await supabase.storage
        .from('club-media')
        .list(user.id)

      if (clubMediaFiles && clubMediaFiles.length > 0) {
        const clubMediaPaths = clubMediaFiles.map(file => `${user.id}/${file.name}`)
        await supabase.storage.from('club-media').remove(clubMediaPaths)
        deletedData.storageFiles += clubMediaFiles.length
        console.log(`[DELETE ACCOUNT] Deleted ${clubMediaFiles.length} club media files`)
      }
    } catch (storageError) {
      console.error('[DELETE ACCOUNT] Storage deletion error:', storageError)
      // Continue with database deletion even if storage fails
    }

    // ========================================
    // STEP 2: Delete Database Records
    // ========================================
    console.log('[DELETE ACCOUNT] Step 2: Deleting database records...')

    // Delete vacancy applications (where user is applicant)
    const { error: applicationsError, count: applicationsCount } = await supabase
      .from('vacancy_applications')
      .delete({ count: 'exact' })
      .eq('applicant_id', user.id)

    if (applicationsError) {
      console.error('[DELETE ACCOUNT] Error deleting applications:', applicationsError)
    } else {
      deletedData.applications = applicationsCount || 0
      console.log(`[DELETE ACCOUNT] Deleted ${applicationsCount} applications`)
    }

    // Delete vacancies (if user is a club)
    const { error: vacanciesError, count: vacanciesCount } = await supabase
      .from('vacancies')
      .delete({ count: 'exact' })
      .eq('club_id', user.id)

    if (vacanciesError) {
      console.error('[DELETE ACCOUNT] Error deleting vacancies:', vacanciesError)
    } else {
      deletedData.vacancies = vacanciesCount || 0
      console.log(`[DELETE ACCOUNT] Deleted ${vacanciesCount} vacancies`)
    }

    // Delete playing history
    const { error: historyError, count: historyCount } = await supabase
      .from('playing_history')
      .delete({ count: 'exact' })
      .eq('player_id', user.id)

    if (historyError) {
      console.error('[DELETE ACCOUNT] Error deleting playing history:', historyError)
    } else {
      deletedData.playingHistory = historyCount || 0
      console.log(`[DELETE ACCOUNT] Deleted ${historyCount} playing history records`)
    }

    // Delete player media records
    const { error: playerMediaError, count: playerMediaCount } = await supabase
      .from('player_media')
      .delete({ count: 'exact' })
      .eq('player_id', user.id)

    if (playerMediaError) {
      console.error('[DELETE ACCOUNT] Error deleting player media:', playerMediaError)
    } else {
      deletedData.playerMedia = playerMediaCount || 0
      console.log(`[DELETE ACCOUNT] Deleted ${playerMediaCount} player media records`)
    }

    // Delete club media records
    const { error: clubMediaError, count: clubMediaCount } = await supabase
      .from('club_media')
      .delete({ count: 'exact' })
      .eq('club_id', user.id)

    if (clubMediaError) {
      console.error('[DELETE ACCOUNT] Error deleting club media:', clubMediaError)
    } else {
      deletedData.clubMedia = clubMediaCount || 0
      console.log(`[DELETE ACCOUNT] Deleted ${clubMediaCount} club media records`)
    }

    // Delete messages where user is sender
    const { error: messagesError, count: messagesCount } = await supabase
      .from('messages')
      .delete({ count: 'exact' })
      .eq('sender_id', user.id)

    if (messagesError) {
      console.error('[DELETE ACCOUNT] Error deleting messages:', messagesError)
    } else {
      deletedData.messages = messagesCount || 0
      console.log(`[DELETE ACCOUNT] Deleted ${messagesCount} messages`)
    }

    // Delete conversations where user is a participant
    const { error: conversationsError, count: conversationsCount } = await supabase
      .from('conversations')
      .delete({ count: 'exact' })
      .or(`participant_one_id.eq.${user.id},participant_two_id.eq.${user.id}`)

    if (conversationsError) {
      console.error('[DELETE ACCOUNT] Error deleting conversations:', conversationsError)
    } else {
      deletedData.conversations = conversationsCount || 0
      console.log(`[DELETE ACCOUNT] Deleted ${conversationsCount} conversations`)
    }

    // Delete profile
    const { error: profileError, count: profileCount } = await supabase
      .from('profiles')
      .delete({ count: 'exact' })
      .eq('id', user.id)

    if (profileError) {
      console.error('[DELETE ACCOUNT] Error deleting profile:', profileError)
      throw new Error('Failed to delete profile')
    } else {
      deletedData.profiles = profileCount || 0
      console.log(`[DELETE ACCOUNT] Deleted profile`)
    }

    // ========================================
    // STEP 3: Delete Auth User
    // ========================================
    console.log('[DELETE ACCOUNT] Step 3: Deleting auth user...')
    
    const { error: deleteUserError } = await supabase.auth.admin.deleteUser(user.id)

    if (deleteUserError) {
      console.error('[DELETE ACCOUNT] Error deleting auth user:', deleteUserError)
      throw new Error('Failed to delete auth user')
    }

    console.log(`[DELETE ACCOUNT] Successfully deleted account for user: ${user.id}`)
    console.log(`[DELETE ACCOUNT] Summary:`, deletedData)

    const response: DeleteAccountResponse = {
      success: true,
      deletedData,
    }

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: any) {
    console.error('[DELETE ACCOUNT] Error:', error)
    
    const response: DeleteAccountResponse = {
      success: false,
      error: error.message || 'An unexpected error occurred',
    }

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
