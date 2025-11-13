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
          created_at: string
          id: string
          photo_url: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          photo_url: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          photo_url?: string
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
      playing_history: {
        Row: {
          achievements: string[]
          club_name: string
          created_at: string
          display_order: number
          division_league: string
          id: string
          position_role: string
          updated_at: string
          user_id: string
          years: string
        }
        Insert: {
          achievements?: string[]
          club_name: string
          created_at?: string
          display_order?: number
          division_league: string
          id?: string
          position_role: string
          updated_at?: string
          user_id: string
          years: string
        }
        Update: {
          achievements?: string[]
          club_name?: string
          created_at?: string
          display_order?: number
          division_league?: string
          id?: string
          position_role?: string
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
      user_unread_counts: {
        Row: {
          unread_count: number | null
          user_id: string | null
        }
        Relationships: []
      }
      user_unread_counts_secure: {
        Row: {
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
      recover_zombie_accounts: {
        Args: never
        Returns: {
          action_taken: string
          user_id: string
        }[]
      }
      release_profile_lock: { Args: { profile_id: string }; Returns: boolean }
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
      opportunity_type: ["player", "coach"],
      vacancy_gender: ["Men", "Women"],
      vacancy_position: ["goalkeeper", "defender", "midfielder", "forward"],
      vacancy_priority: ["low", "medium", "high"],
      vacancy_status: ["draft", "open", "closed"],
    },
  },
} as const
