export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      club_media: {
        Row: {
          alt_text: string | null
          caption: string | null
          club_id: string
          created_at: string
          file_name: string
          file_size: number
          file_url: string
          id: string
          is_featured: boolean
          order_index: number
          updated_at: string
        }
        Insert: {
          alt_text?: string | null
          caption?: string | null
          club_id: string
          created_at?: string
          file_name: string
          file_size: number
          file_url: string
          id?: string
          is_featured?: boolean
          order_index?: number
          updated_at?: string
        }
        Update: {
          alt_text?: string | null
          caption?: string | null
          club_id?: string
          created_at?: string
          file_name?: string
          file_size?: number
          file_url?: string
          id?: string
          is_featured?: boolean
          order_index?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_media_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          id: string
          last_message_at: string | null
          participant_one_id: string
          participant_two_id: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          id?: string
          last_message_at?: string | null
          participant_one_id: string
          participant_two_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          id?: string
          last_message_at?: string | null
          participant_one_id?: string
          participant_two_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "conversations_participant_one_id_fkey"
            columns: ["participant_one_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_participant_two_id_fkey"
            columns: ["participant_two_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gallery_photos: {
        Row: {
          alt_text: string | null
          caption: string | null
          created_at: string
          id: string
          file_name: string | null
          file_size: number | null
          order_index: number
          photo_url: string
          updated_at: string
          user_id: string
        }
        Insert: {
          alt_text?: string | null
          caption?: string | null
          created_at?: string
          id?: string
          file_name?: string | null
          file_size?: number | null
          order_index?: number
          photo_url: string
          updated_at?: string
          user_id: string
        }
        Update: {
          alt_text?: string | null
          caption?: string | null
          created_at?: string
          id?: string
          file_name?: string | null
          file_size?: number | null
          order_index?: number
          photo_url?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          id: string
          idempotency_key: string | null
          read_at: string | null
          sender_id: string
          sent_at: string
        }
        Insert: {
          content: string
          conversation_id: string
          id?: string
          idempotency_key?: string | null
          read_at?: string | null
          sender_id: string
          sent_at?: string
        }
        Update: {
          content?: string
          conversation_id?: string
          id?: string
          idempotency_key?: string | null
          read_at?: string | null
          sender_id?: string
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_inbox_state: {
        Row: {
          last_seen_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          last_seen_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          last_seen_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_inbox_state_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      playing_history: {
        Row: {
          badge_label: string | null
          club_name: string
          created_at: string
          description: string | null
          display_order: number
          division_league: string
          end_date: string | null
          entry_type: Database["public"]["Enums"]["journey_entry_type"]
          highlights: string[]
          id: string
          image_url: string | null
          location_city: string | null
          location_country: string | null
          position_role: string
          start_date: string | null
          updated_at: string
          user_id: string
          years: string
        }
        Insert: {
          badge_label?: string | null
          club_name: string
          created_at?: string
          description?: string | null
          display_order?: number
          division_league: string
          end_date?: string | null
          entry_type?: Database["public"]["Enums"]["journey_entry_type"]
          highlights?: string[]
          id?: string
          image_url?: string | null
          location_city?: string | null
          location_country?: string | null
          position_role: string
          start_date?: string | null
          updated_at?: string
          user_id: string
          years: string
        }
        Update: {
          badge_label?: string | null
          club_name?: string
          created_at?: string
          description?: string | null
          display_order?: number
          division_league?: string
          end_date?: string | null
          entry_type?: Database["public"]["Enums"]["journey_entry_type"]
          highlights?: string[]
          id?: string
          image_url?: string | null
          location_city?: string | null
          location_country?: string | null
          position_role?: string
          start_date?: string | null
          updated_at?: string
          user_id?: string
          years?: string
        }
        Relationships: [
          {
            foreignKeyName: "playing_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_comments: {
        Row: {
          author_profile_id: string
          content: string
          created_at: string
          id: string
          profile_id: string
          rating: Database["public"]["Enums"]["comment_rating"] | null
          status: Database["public"]["Enums"]["comment_status"]
          updated_at: string
        }
        Insert: {
          author_profile_id: string
          content: string
          created_at?: string
          id?: string
          profile_id: string
          rating?: Database["public"]["Enums"]["comment_rating"] | null
          status?: Database["public"]["Enums"]["comment_status"]
          updated_at?: string
        }
        Update: {
          author_profile_id?: string
          content?: string
          created_at?: string
          id?: string
          profile_id?: string
          rating?: Database["public"]["Enums"]["comment_rating"] | null
          status?: Database["public"]["Enums"]["comment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_comments_author_profile_id_fkey"
            columns: ["author_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_comments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_friendships: {
        Row: {
          accepted_at: string | null
          created_at: string
          id: string
          pair_key_lower: string | null
          pair_key_upper: string | null
          requester_id: string
          status: Database["public"]["Enums"]["friendship_status"]
          updated_at: string
          user_one: string
          user_two: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          id?: string
          pair_key_lower?: string | null
          pair_key_upper?: string | null
          requester_id: string
          status?: Database["public"]["Enums"]["friendship_status"]
          updated_at?: string
          user_one: string
          user_two: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          id?: string
          pair_key_lower?: string | null
          pair_key_upper?: string | null
          requester_id?: string
          status?: Database["public"]["Enums"]["friendship_status"]
          updated_at?: string
          user_one?: string
          user_two?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_friendships_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_friendships_user_one_fkey"
            columns: ["user_one"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_friendships_user_two_fkey"
            columns: ["user_two"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_notifications: {
        Row: {
          actor_profile_id: string | null
          cleared_at: string | null
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["profile_notification_kind"]
          payload: Json
          read_at: string | null
          recipient_profile_id: string
          source_entity_id: string | null
          updated_at: string
        }
        Insert: {
          actor_profile_id?: string | null
          cleared_at?: string | null
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["profile_notification_kind"]
          payload?: Json
          read_at?: string | null
          recipient_profile_id: string
          source_entity_id?: string | null
          updated_at?: string
        }
        Update: {
          actor_profile_id?: string | null
          cleared_at?: string | null
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["profile_notification_kind"]
          payload?: Json
          read_at?: string | null
          recipient_profile_id?: string
          source_entity_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_notifications_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_notifications_recipient_profile_id_fkey"
            columns: ["recipient_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          base_location: string | null
          bio: string | null
          club_bio: string | null
          club_history: string | null
          contact_email: string | null
          created_at: string
          current_club: string | null
          date_of_birth: string | null
          email: string
          full_name: string | null
          gender: string | null
          highlight_video_url: string | null
          id: string
          league_division: string | null
          nationality: string | null
          onboarding_completed: boolean
          passport_1: string | null
          passport_2: string | null
          position: string | null
          role: string
          secondary_position: string | null
          updated_at: string
          username: string | null
          version: number
          website: string | null
          year_founded: number | null
        }
        Insert: {
          avatar_url?: string | null
          base_location?: string | null
          bio?: string | null
          club_bio?: string | null
          club_history?: string | null
          contact_email?: string | null
          created_at?: string
          current_club?: string | null
          date_of_birth?: string | null
          email: string
          full_name?: string | null
          gender?: string | null
          highlight_video_url?: string | null
          id: string
          league_division?: string | null
          nationality?: string | null
          onboarding_completed?: boolean
          passport_1?: string | null
          passport_2?: string | null
          position?: string | null
          role: string
          secondary_position?: string | null
          updated_at?: string
          username?: string | null
          version?: number
          website?: string | null
          year_founded?: number | null
        }
        Update: {
          avatar_url?: string | null
          base_location?: string | null
          bio?: string | null
          club_bio?: string | null
          club_history?: string | null
          contact_email?: string | null
          created_at?: string
          current_club?: string | null
          date_of_birth?: string | null
          email?: string
          full_name?: string | null
          gender?: string | null
          highlight_video_url?: string | null
          id?: string
          league_division?: string | null
          nationality?: string | null
          onboarding_completed?: boolean
          passport_1?: string | null
          passport_2?: string | null
          position?: string | null
          role?: string
          secondary_position?: string | null
          updated_at?: string
          username?: string | null
          version?: number
          website?: string | null
          year_founded?: number | null
        }
        Relationships: []
      }
      user_unread_counters: {
        Row: {
          unread_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          unread_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          unread_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_unread_counters_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vacancies: {
        Row: {
          application_deadline: string | null
          benefits: string[]
          closed_at: string | null
          club_id: string
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          custom_benefits: string[]
          description: string | null
          duration_text: string | null
          gender: Database["public"]["Enums"]["vacancy_gender"] | null
          id: string
          location_city: string
          location_country: string
          opportunity_type: Database["public"]["Enums"]["opportunity_type"]
          position: Database["public"]["Enums"]["vacancy_position"] | null
          priority: Database["public"]["Enums"]["vacancy_priority"] | null
          published_at: string | null
          requirements: string[]
          start_date: string | null
          status: Database["public"]["Enums"]["vacancy_status"]
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          application_deadline?: string | null
          benefits?: string[]
          closed_at?: string | null
          club_id: string
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          custom_benefits?: string[]
          description?: string | null
          duration_text?: string | null
          gender?: Database["public"]["Enums"]["vacancy_gender"] | null
          id?: string
          location_city: string
          location_country: string
          opportunity_type?: Database["public"]["Enums"]["opportunity_type"]
          position?: Database["public"]["Enums"]["vacancy_position"] | null
          priority?: Database["public"]["Enums"]["vacancy_priority"] | null
          published_at?: string | null
          requirements?: string[]
          start_date?: string | null
          status?: Database["public"]["Enums"]["vacancy_status"]
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          application_deadline?: string | null
          benefits?: string[]
          closed_at?: string | null
          club_id?: string
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          custom_benefits?: string[]
          description?: string | null
          duration_text?: string | null
          gender?: Database["public"]["Enums"]["vacancy_gender"] | null
          id?: string
          location_city?: string
          location_country?: string
          opportunity_type?: Database["public"]["Enums"]["opportunity_type"]
          position?: Database["public"]["Enums"]["vacancy_position"] | null
          priority?: Database["public"]["Enums"]["vacancy_priority"] | null
          published_at?: string | null
          requirements?: string[]
          start_date?: string | null
          status?: Database["public"]["Enums"]["vacancy_status"]
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "vacancies_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vacancy_applications: {
        Row: {
          applied_at: string
          cover_letter: string | null
          id: string
          metadata: Json
          player_id: string
          status: Database["public"]["Enums"]["application_status"]
          updated_at: string
          vacancy_id: string
        }
        Insert: {
          applied_at?: string
          cover_letter?: string | null
          id?: string
          metadata?: Json
          player_id: string
          status?: Database["public"]["Enums"]["application_status"]
          updated_at?: string
          vacancy_id: string
        }
        Update: {
          applied_at?: string
          cover_letter?: string | null
          id?: string
          metadata?: Json
          player_id?: string
          status?: Database["public"]["Enums"]["application_status"]
          updated_at?: string
          vacancy_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vacancy_applications_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vacancy_applications_vacancy_id_fkey"
            columns: ["vacancy_id"]
            isOneToOne: false
            referencedRelation: "vacancies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      profile_friend_edges: {
        Row: {
          accepted_at: string | null
          created_at: string | null
          friend_id: string | null
          id: string | null
          pair_key_lower: string | null
          pair_key_upper: string | null
          profile_id: string | null
          requester_id: string | null
          status: Database["public"]["Enums"]["friendship_status"] | null
          updated_at: string | null
          user_one: string | null
          user_two: string | null
        }
        Relationships: []
      }
      user_unread_counts: {
        Row: {
          updated_at: string | null
          unread_count: number | null
          user_id: string | null
        }
        Relationships: []
      }
      user_unread_counts_secure: {
        Row: {
          updated_at: string | null
          unread_count: number | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      acquire_profile_lock: { Args: { profile_id: string }; Returns: boolean }
      cleanup_stale_locks: { Args: never; Returns: undefined }
      complete_user_profile: {
        Args: {
          p_base_location: string
          p_bio?: string
          p_club_bio?: string
          p_club_history?: string
          p_contact_email?: string
          p_current_club?: string
          p_date_of_birth?: string
          p_full_name: string
          p_gender?: string
          p_highlight_video_url?: string
          p_league_division?: string
          p_nationality: string
          p_passport_1?: string
          p_passport_2?: string
          p_position?: string
          p_role: string
          p_secondary_position?: string
          p_user_id: string
          p_website?: string
          p_year_founded?: number
        }
        Returns: {
          avatar_url: string | null
          base_location: string | null
          bio: string | null
          club_bio: string | null
          club_history: string | null
          contact_email: string | null
          created_at: string
          current_club: string | null
          date_of_birth: string | null
          email: string
          full_name: string | null
          gender: string | null
          highlight_video_url: string | null
          id: string
          league_division: string | null
          nationality: string | null
          onboarding_completed: boolean
          passport_1: string | null
          passport_2: string | null
          position: string | null
          role: string
          secondary_position: string | null
          updated_at: string
          username: string | null
          version: number
          website: string | null
          year_founded: number | null
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_profile_for_new_user: {
        Args: { user_email: string; user_id: string; user_role?: string }
        Returns: {
          avatar_url: string | null
          base_location: string | null
          bio: string | null
          club_bio: string | null
          club_history: string | null
          contact_email: string | null
          created_at: string
          current_club: string | null
          date_of_birth: string | null
          email: string
          full_name: string | null
          gender: string | null
          highlight_video_url: string | null
          id: string
          league_division: string | null
          nationality: string | null
          onboarding_completed: boolean
          passport_1: string | null
          passport_2: string | null
          position: string | null
          role: string
          secondary_position: string | null
          updated_at: string
          username: string | null
          version: number
          website: string | null
          year_founded: number | null
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      find_zombie_accounts: {
        Args: never
        Returns: {
          created_at: string
          email: string
          email_confirmed_at: string
          intended_role: string
          profile_complete: boolean
          profile_exists: boolean
          user_id: string
        }[]
      }
      get_opportunity_alerts: { Args: never; Returns: number }
      get_user_conversations: {
        Args: { p_limit?: number; p_user_id: string }
        Returns: {
          conversation_created_at: string
          conversation_id: string
          conversation_last_message_at: string
          conversation_updated_at: string
          last_message_content: string
          last_message_sender_id: string
          last_message_sent_at: string
          other_participant_avatar: string
          other_participant_id: string
          other_participant_name: string
          other_participant_role: string
          other_participant_username: string
          unread_count: number
        }[]
      }
      fetch_profile_notifications: {
        Args: { p_limit?: number | null; p_offset?: number | null }
        Returns: {
          id: string
          kind: Database["public"]["Enums"]["profile_notification_kind"]
          source_entity_id: string | null
          payload: Json
          created_at: string
          read_at: string | null
          cleared_at: string | null
          actor: {
            id: string | null
            full_name: string | null
            role: string | null
            username: string | null
            avatar_url: string | null
            base_location: string | null
          } | null
        }[]
      }
      fetch_club_vacancies_with_counts: {
        Args: {
          p_club_id: string
          p_include_closed?: boolean | null
          p_limit?: number | null
        }
        Returns: (Database["public"]["Tables"]["vacancies"]["Row"] & {
          applicant_count: number | null
        })[]
      }
      is_platform_admin: { Args: never; Returns: boolean }
      mark_opportunities_seen: {
        Args: { p_seen_at?: string }
        Returns: undefined
      }
      mark_conversation_messages_read: {
        Args: { p_conversation_id: string; p_before?: string | null }
        Returns: number
      }
      mark_profile_notifications_read: {
        Args: { p_notification_ids?: string[] | null }
        Returns: number
      }
      recover_zombie_accounts: {
        Args: never
        Returns: {
          action_taken: string
          user_id: string
        }[]
      }
      release_profile_lock: { Args: { profile_id: string }; Returns: boolean }
      clear_profile_notifications: {
        Args: {
          p_notification_ids?: string[] | null
          p_kind?: Database["public"]["Enums"]["profile_notification_kind"] | null
        }
        Returns: number
      }
      set_profile_comment_status: {
        Args: {
          p_comment_id: string
          p_status: Database["public"]["Enums"]["comment_status"]
        }
        Returns: {
          author_profile_id: string
          content: string
          created_at: string
          id: string
          profile_id: string
          rating: Database["public"]["Enums"]["comment_rating"] | null
          status: Database["public"]["Enums"]["comment_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profile_comments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      try_parse_years_component: {
        Args: { component: string; years: string }
        Returns: string
      }
      user_in_conversation: {
        Args: { p_conversation_id: string; p_user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      application_status:
        | "pending"
        | "reviewed"
        | "shortlisted"
        | "interview"
        | "accepted"
        | "rejected"
        | "withdrawn"
      comment_rating: "positive" | "neutral" | "negative"
      comment_status: "visible" | "hidden" | "reported" | "deleted"
      friendship_status:
        | "pending"
        | "accepted"
        | "rejected"
        | "cancelled"
        | "blocked"
      profile_notification_kind: "friend_request" | "profile_comment"
      journey_entry_type:
        | "club"
        | "national_team"
        | "achievement"
        | "tournament"
        | "milestone"
        | "academy"
        | "other"
      opportunity_type: "player" | "coach"
      vacancy_gender: "Men" | "Women"
      vacancy_position: "goalkeeper" | "defender" | "midfielder" | "forward"
      vacancy_priority: "low" | "medium" | "high"
      vacancy_status: "draft" | "open" | "closed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      application_status: [
        "pending",
        "reviewed",
        "shortlisted",
        "interview",
        "accepted",
        "rejected",
        "withdrawn",
      ],
      comment_rating: ["positive", "neutral", "negative"],
      comment_status: ["visible", "hidden", "reported", "deleted"],
      friendship_status: [
        "pending",
        "accepted",
        "rejected",
        "cancelled",
        "blocked",
      ],
      profile_notification_kind: ["friend_request", "profile_comment"],
      journey_entry_type: [
        "club",
        "national_team",
        "achievement",
        "tournament",
        "milestone",
        "academy",
        "other",
      ],
      opportunity_type: ["player", "coach"],
      vacancy_gender: ["Men", "Women"],
      vacancy_position: ["goalkeeper", "defender", "midfielder", "forward"],
      vacancy_priority: ["low", "medium", "high"],
      vacancy_status: ["draft", "open", "closed"],
    },
  },
} as const
