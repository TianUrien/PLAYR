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
    PostgrestVersion: "14.1"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      admin_audit_logs: {
        Row: {
          action: string
          admin_id: string
          created_at: string
          id: string
          ip_address: unknown
          metadata: Json | null
          new_data: Json | null
          old_data: Json | null
          target_id: string
          target_type: string
          user_agent: string | null
        }
        Insert: {
          action: string
          admin_id: string
          created_at?: string
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          new_data?: Json | null
          old_data?: Json | null
          target_id: string
          target_type: string
          user_agent?: string | null
        }
        Update: {
          action?: string
          admin_id?: string
          created_at?: string
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          new_data?: Json | null
          old_data?: Json | null
          target_id?: string
          target_type?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      archived_messages: {
        Row: {
          archived_at: string
          content: string
          conversation_id: string
          id: string
          idempotency_key: string | null
          read_at: string | null
          sender_id: string
          sent_at: string
        }
        Insert: {
          archived_at?: string
          content: string
          conversation_id: string
          id: string
          idempotency_key?: string | null
          read_at?: string | null
          sender_id: string
          sent_at: string
        }
        Update: {
          archived_at?: string
          content?: string
          conversation_id?: string
          id?: string
          idempotency_key?: string | null
          read_at?: string | null
          sender_id?: string
          sent_at?: string
        }
        Relationships: []
      }
      career_history: {
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
            foreignKeyName: "career_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "career_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_pending_country_review"
            referencedColumns: ["id"]
          },
        ]
      }
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
          {
            foreignKeyName: "club_media_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "profiles_pending_country_review"
            referencedColumns: ["id"]
          },
        ]
      }
      community_answers: {
        Row: {
          author_id: string
          body: string
          created_at: string
          deleted_at: string | null
          id: string
          is_test_content: boolean
          question_id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_test_content?: boolean
          question_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_test_content?: boolean
          question_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_answers_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_answers_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles_pending_country_review"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "community_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      community_questions: {
        Row: {
          answer_count: number
          author_id: string
          body: string | null
          category: Database["public"]["Enums"]["question_category"]
          created_at: string
          deleted_at: string | null
          id: string
          is_test_content: boolean
          title: string
          updated_at: string
        }
        Insert: {
          answer_count?: number
          author_id: string
          body?: string | null
          category?: Database["public"]["Enums"]["question_category"]
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_test_content?: boolean
          title: string
          updated_at?: string
        }
        Update: {
          answer_count?: number
          author_id?: string
          body?: string | null
          category?: Database["public"]["Enums"]["question_category"]
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_test_content?: boolean
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_questions_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_questions_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles_pending_country_review"
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
            foreignKeyName: "conversations_participant_one_id_fkey"
            columns: ["participant_one_id"]
            isOneToOne: false
            referencedRelation: "profiles_pending_country_review"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_participant_two_id_fkey"
            columns: ["participant_two_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_participant_two_id_fkey"
            columns: ["participant_two_id"]
            isOneToOne: false
            referencedRelation: "profiles_pending_country_review"
            referencedColumns: ["id"]
          },
        ]
      }
      countries: {
        Row: {
          code: string
          code_alpha3: string
          common_name: string | null
          created_at: string
          flag_emoji: string | null
          id: number
          name: string
          nationality_name: string
          region: string | null
        }
        Insert: {
          code: string
          code_alpha3: string
          common_name?: string | null
          created_at?: string
          flag_emoji?: string | null
          id?: number
          name: string
          nationality_name: string
          region?: string | null
        }
        Update: {
          code?: string
          code_alpha3?: string
          common_name?: string | null
          created_at?: string
          flag_emoji?: string | null
          id?: number
          name?: string
          nationality_name?: string
          region?: string | null
        }
        Relationships: []
      }
      country_text_aliases: {
        Row: {
          alias_text: string
          confidence: string
          country_id: number
          created_at: string
          id: number
        }
        Insert: {
          alias_text: string
          confidence?: string
          country_id: number
          created_at?: string
          id?: number
        }
        Update: {
          alias_text?: string
          confidence?: string
          country_id?: number
          created_at?: string
          id?: number
        }
        Relationships: [
          {
            foreignKeyName: "country_text_aliases_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "country_text_aliases_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "world_countries_with_directory"
            referencedColumns: ["country_id"]
          },
        ]
      }
      error_logs: {
        Row: {
          correlation_id: string | null
          created_at: string
          error_code: string | null
          error_message: string
          error_type: string
          function_name: string | null
          id: string
          metadata: Json | null
          request_body: Json | null
          request_method: string | null
          request_path: string | null
          severity: string
          source: string
          stack_trace: string | null
          user_id: string | null
        }
        Insert: {
          correlation_id?: string | null
          created_at?: string
          error_code?: string | null
          error_message: string
          error_type: string
          function_name?: string | null
          id?: string
          metadata?: Json | null
          request_body?: Json | null
          request_method?: string | null
          request_path?: string | null
          severity?: string
          source: string
          stack_trace?: string | null
          user_id?: string | null
        }
        Update: {
          correlation_id?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string
          error_type?: string
          function_name?: string | null
          id?: string
          metadata?: Json | null
          request_body?: Json | null
          request_method?: string | null
          request_path?: string | null
          severity?: string
          source?: string
          stack_trace?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "error_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "error_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_pending_country_review"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          created_at: string
          entity_id: string | null
          entity_type: string | null
          error_code: string | null
          error_message: string | null
          event_name: string
          id: string
          ip_hash: string | null
          properties: Json | null
          role: string | null
          session_id: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          error_code?: string | null
          error_message?: string | null
          event_name: string
          id?: string
          ip_hash?: string | null
          properties?: Json | null
          role?: string | null
          session_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          error_code?: string | null
          error_message?: string | null
          event_name?: string
          id?: string
          ip_hash?: string | null
          properties?: Json | null
          role?: string | null
          session_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_pending_country_review"
            referencedColumns: ["id"]
          },
        ]
      }
      gallery_photos: {
        Row: {
          alt_text: string | null
          caption: string | null
          created_at: string
          file_name: string | null
          file_size: number | null
          id: string
          order_index: number
          photo_url: string
          updated_at: string
          user_id: string
        }
        Insert: {
          alt_text?: string | null
          caption?: string | null
          created_at?: string
          file_name?: string | null
          file_size?: number | null
          id?: string
          order_index?: number
          photo_url: string
          updated_at?: string
          user_id: string
        }
        Update: {
          alt_text?: string | null
          caption?: string | null
          created_at?: string
          file_name?: string | null
          file_size?: number | null
          id?: string
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
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles_pending_country_review"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunities: {
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
          gender: Database["public"]["Enums"]["opportunity_gender"] | null
          id: string
          location_city: string
          location_country: string
          opportunity_type: Database["public"]["Enums"]["opportunity_type"]
          position: Database["public"]["Enums"]["opportunity_position"] | null
          priority: Database["public"]["Enums"]["opportunity_priority"] | null
          published_at: string | null
          requirements: string[]
          start_date: string | null
          status: Database["public"]["Enums"]["opportunity_status"]
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
          gender?: Database["public"]["Enums"]["opportunity_gender"] | null
          id?: string
          location_city: string
          location_country: string
          opportunity_type?: Database["public"]["Enums"]["opportunity_type"]
          position?: Database["public"]["Enums"]["opportunity_position"] | null
          priority?: Database["public"]["Enums"]["opportunity_priority"] | null
          published_at?: string | null
          requirements?: string[]
          start_date?: string | null
          status?: Database["public"]["Enums"]["opportunity_status"]
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
          gender?: Database["public"]["Enums"]["opportunity_gender"] | null
          id?: string
          location_city?: string
          location_country?: string
          opportunity_type?: Database["public"]["Enums"]["opportunity_type"]
          position?: Database["public"]["Enums"]["opportunity_position"] | null
          priority?: Database["public"]["Enums"]["opportunity_priority"] | null
          published_at?: string | null
          requirements?: string[]
          start_date?: string | null
          status?: Database["public"]["Enums"]["opportunity_status"]
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "profiles_pending_country_review"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_applications: {
        Row: {
          applicant_id: string
          applied_at: string
          cover_letter: string | null
          id: string
          metadata: Json
          opportunity_id: string
          status: Database["public"]["Enums"]["application_status"]
          updated_at: string
        }
        Insert: {
          applicant_id: string
          applied_at?: string
          cover_letter?: string | null
          id?: string
          metadata?: Json
          opportunity_id: string
          status?: Database["public"]["Enums"]["application_status"]
          updated_at?: string
        }
        Update: {
          applicant_id?: string
          applied_at?: string
          cover_letter?: string | null
          id?: string
          metadata?: Json
          opportunity_id?: string
          status?: Database["public"]["Enums"]["application_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_applications_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_applications_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "profiles_pending_country_review"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_applications_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_applications_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "public_opportunities"
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
          {
            foreignKeyName: "opportunity_inbox_state_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles_pending_country_review"
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
            foreignKeyName: "profile_comments_author_profile_id_fkey"
            columns: ["author_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_pending_country_review"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_comments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_comments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_pending_country_review"
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
            foreignKeyName: "profile_friendships_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles_pending_country_review"
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
            foreignKeyName: "profile_friendships_user_one_fkey"
            columns: ["user_one"]
            isOneToOne: false
            referencedRelation: "profiles_pending_country_review"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_friendships_user_two_fkey"
            columns: ["user_two"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_friendships_user_two_fkey"
            columns: ["user_two"]
            isOneToOne: false
            referencedRelation: "profiles_pending_country_review"
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
          metadata: Json
          read_at: string | null
          recipient_profile_id: string
          seen_at: string | null
          source_entity_id: string | null
          target_url: string | null
          updated_at: string
        }
        Insert: {
          actor_profile_id?: string | null
          cleared_at?: string | null
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["profile_notification_kind"]
          metadata?: Json
          read_at?: string | null
          recipient_profile_id: string
          seen_at?: string | null
          source_entity_id?: string | null
          target_url?: string | null
          updated_at?: string
        }
        Update: {
          actor_profile_id?: string | null
          cleared_at?: string | null
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["profile_notification_kind"]
          metadata?: Json
          read_at?: string | null
          recipient_profile_id?: string
          seen_at?: string | null
          source_entity_id?: string | null
          target_url?: string | null
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
            foreignKeyName: "profile_notifications_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_pending_country_review"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_notifications_recipient_profile_id_fkey"
            columns: ["recipient_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_notifications_recipient_profile_id_fkey"
            columns: ["recipient_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_pending_country_review"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_references: {
        Row: {
          accepted_at: string | null
          created_at: string
          endorsement_text: string | null
          id: string
          reference_id: string
          relationship_type: string
          request_note: string | null
          requester_id: string
          responded_at: string | null
          revoked_at: string | null
          revoked_by: string | null
          status: Database["public"]["Enums"]["profile_reference_status"]
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          endorsement_text?: string | null
          id?: string
          reference_id: string
          relationship_type: string
          request_note?: string | null
          requester_id: string
          responded_at?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          status?: Database["public"]["Enums"]["profile_reference_status"]
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          endorsement_text?: string | null
          id?: string
          reference_id?: string
          relationship_type?: string
          request_note?: string | null
          requester_id?: string
          responded_at?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          status?: Database["public"]["Enums"]["profile_reference_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_references_reference_id_fkey"
            columns: ["reference_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_references_reference_id_fkey"
            columns: ["reference_id"]
            isOneToOne: false
            referencedRelation: "profiles_pending_country_review"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_references_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_references_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles_pending_country_review"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_references_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_references_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles_pending_country_review"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          base_country_id: number | null
          base_location: string | null
          bio: string | null
          blocked_at: string | null
          blocked_by: string | null
          blocked_reason: string | null
          club_bio: string | null
          club_history: string | null
          contact_email: string | null
          contact_email_public: boolean
          created_at: string
          current_club: string | null
          date_of_birth: string | null
          email: string
          full_name: string | null
          gender: string | null
          highlight_video_url: string | null
          highlight_visibility: string
          id: string
          is_blocked: boolean
          is_test_account: boolean
          last_active_at: string | null
          league_division: string | null
          mens_league_division: string | null
          mens_league_id: number | null
          nationality: string | null
          nationality_country_id: number | null
          nationality2_country_id: number | null
          notify_applications: boolean
          notify_opportunities: boolean
          onboarding_completed: boolean
          onboarding_completed_at: string | null
          onboarding_started_at: string | null
          open_to_coach: boolean
          open_to_opportunities: boolean
          open_to_play: boolean
          passport_1: string | null
          passport_2: string | null
          passport1_country_id: number | null
          passport2_country_id: number | null
          position: string | null
          role: string
          secondary_position: string | null
          social_links: Json | null
          updated_at: string
          username: string | null
          version: number
          website: string | null
          womens_league_division: string | null
          womens_league_id: number | null
          world_region_id: number | null
          year_founded: number | null
        }
        Insert: {
          avatar_url?: string | null
          base_country_id?: number | null
          base_location?: string | null
          bio?: string | null
          blocked_at?: string | null
          blocked_by?: string | null
          blocked_reason?: string | null
          club_bio?: string | null
          club_history?: string | null
          contact_email?: string | null
          contact_email_public?: boolean
          created_at?: string
          current_club?: string | null
          date_of_birth?: string | null
          email: string
          full_name?: string | null
          gender?: string | null
          highlight_video_url?: string | null
          highlight_visibility?: string
          id: string
          is_blocked?: boolean
          is_test_account?: boolean
          last_active_at?: string | null
          league_division?: string | null
          mens_league_division?: string | null
          mens_league_id?: number | null
          nationality?: string | null
          nationality_country_id?: number | null
          nationality2_country_id?: number | null
          notify_applications?: boolean
          notify_opportunities?: boolean
          onboarding_completed?: boolean
          onboarding_completed_at?: string | null
          onboarding_started_at?: string | null
          open_to_coach?: boolean
          open_to_opportunities?: boolean
          open_to_play?: boolean
          passport_1?: string | null
          passport_2?: string | null
          passport1_country_id?: number | null
          passport2_country_id?: number | null
          position?: string | null
          role: string
          secondary_position?: string | null
          social_links?: Json | null
          updated_at?: string
          username?: string | null
          version?: number
          website?: string | null
          womens_league_division?: string | null
          womens_league_id?: number | null
          world_region_id?: number | null
          year_founded?: number | null
        }
        Update: {
          avatar_url?: string | null
          base_country_id?: number | null
          base_location?: string | null
          bio?: string | null
          blocked_at?: string | null
          blocked_by?: string | null
          blocked_reason?: string | null
          club_bio?: string | null
          club_history?: string | null
          contact_email?: string | null
          contact_email_public?: boolean
          created_at?: string
          current_club?: string | null
          date_of_birth?: string | null
          email?: string
          full_name?: string | null
          gender?: string | null
          highlight_video_url?: string | null
          highlight_visibility?: string
          id?: string
          is_blocked?: boolean
          is_test_account?: boolean
          last_active_at?: string | null
          league_division?: string | null
          mens_league_division?: string | null
          mens_league_id?: number | null
          nationality?: string | null
          nationality_country_id?: number | null
          nationality2_country_id?: number | null
          notify_applications?: boolean
          notify_opportunities?: boolean
          onboarding_completed?: boolean
          onboarding_completed_at?: string | null
          onboarding_started_at?: string | null
          open_to_coach?: boolean
          open_to_opportunities?: boolean
          open_to_play?: boolean
          passport_1?: string | null
          passport_2?: string | null
          passport1_country_id?: number | null
          passport2_country_id?: number | null
          position?: string | null
          role?: string
          secondary_position?: string | null
          social_links?: Json | null
          updated_at?: string
          username?: string | null
          version?: number
          website?: string | null
          womens_league_division?: string | null
          womens_league_id?: number | null
          world_region_id?: number | null
          year_founded?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_base_country_id_fkey"
            columns: ["base_country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_base_country_id_fkey"
            columns: ["base_country_id"]
            isOneToOne: false
            referencedRelation: "world_countries_with_directory"
            referencedColumns: ["country_id"]
          },
          {
            foreignKeyName: "profiles_mens_league_id_fkey"
            columns: ["mens_league_id"]
            isOneToOne: false
            referencedRelation: "world_leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_nationality_country_id_fkey"
            columns: ["nationality_country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_nationality_country_id_fkey"
            columns: ["nationality_country_id"]
            isOneToOne: false
            referencedRelation: "world_countries_with_directory"
            referencedColumns: ["country_id"]
          },
          {
            foreignKeyName: "profiles_nationality2_country_id_fkey"
            columns: ["nationality2_country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_nationality2_country_id_fkey"
            columns: ["nationality2_country_id"]
            isOneToOne: false
            referencedRelation: "world_countries_with_directory"
            referencedColumns: ["country_id"]
          },
          {
            foreignKeyName: "profiles_passport1_country_id_fkey"
            columns: ["passport1_country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_passport1_country_id_fkey"
            columns: ["passport1_country_id"]
            isOneToOne: false
            referencedRelation: "world_countries_with_directory"
            referencedColumns: ["country_id"]
          },
          {
            foreignKeyName: "profiles_passport2_country_id_fkey"
            columns: ["passport2_country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_passport2_country_id_fkey"
            columns: ["passport2_country_id"]
            isOneToOne: false
            referencedRelation: "world_countries_with_directory"
            referencedColumns: ["country_id"]
          },
          {
            foreignKeyName: "profiles_womens_league_id_fkey"
            columns: ["womens_league_id"]
            isOneToOne: false
            referencedRelation: "world_leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_world_region_id_fkey"
            columns: ["world_region_id"]
            isOneToOne: false
            referencedRelation: "world_province_stats"
            referencedColumns: ["province_id"]
          },
          {
            foreignKeyName: "profiles_world_region_id_fkey"
            columns: ["world_region_id"]
            isOneToOne: false
            referencedRelation: "world_provinces"
            referencedColumns: ["id"]
          },
        ]
      }
      storage_cleanup_queue: {
        Row: {
          attempts: number
          bucket_id: string
          id: string
          last_error: string | null
          object_path: string
          processed_at: string | null
          queued_at: string
          reason: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          bucket_id: string
          id?: string
          last_error?: string | null
          object_path: string
          processed_at?: string | null
          queued_at?: string
          reason: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          bucket_id?: string
          id?: string
          last_error?: string | null
          object_path?: string
          processed_at?: string | null
          queued_at?: string
          reason?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_engagement_daily: {
        Row: {
          created_at: string
          date: string
          first_heartbeat_at: string | null
          heartbeat_count: number
          last_heartbeat_at: string | null
          session_count: number
          total_seconds: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date: string
          first_heartbeat_at?: string | null
          heartbeat_count?: number
          last_heartbeat_at?: string | null
          session_count?: number
          total_seconds?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          date?: string
          first_heartbeat_at?: string | null
          heartbeat_count?: number
          last_heartbeat_at?: string | null
          session_count?: number
          total_seconds?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_engagement_daily_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_engagement_daily_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_pending_country_review"
            referencedColumns: ["id"]
          },
        ]
      }
      user_engagement_heartbeats: {
        Row: {
          created_at: string
          id: string
          session_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          session_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_engagement_heartbeats_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_engagement_heartbeats_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_pending_country_review"
            referencedColumns: ["id"]
          },
        ]
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
          {
            foreignKeyName: "user_unread_counters_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles_pending_country_review"
            referencedColumns: ["id"]
          },
        ]
      }
      user_unread_senders: {
        Row: {
          sender_id: string
          unread_message_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          sender_id: string
          unread_message_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          sender_id?: string
          unread_message_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_unread_senders_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_unread_senders_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles_pending_country_review"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_unread_senders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_unread_senders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_pending_country_review"
            referencedColumns: ["id"]
          },
        ]
      }
      world_clubs: {
        Row: {
          claimed_at: string | null
          claimed_profile_id: string | null
          club_id: string
          club_name: string
          club_name_normalized: string
          country_id: number
          created_at: string
          created_from: string
          id: string
          is_claimed: boolean
          men_league_id: number | null
          province_id: number | null
          updated_at: string
          women_league_id: number | null
        }
        Insert: {
          claimed_at?: string | null
          claimed_profile_id?: string | null
          club_id: string
          club_name: string
          club_name_normalized: string
          country_id: number
          created_at?: string
          created_from?: string
          id?: string
          is_claimed?: boolean
          men_league_id?: number | null
          province_id?: number | null
          updated_at?: string
          women_league_id?: number | null
        }
        Update: {
          claimed_at?: string | null
          claimed_profile_id?: string | null
          club_id?: string
          club_name?: string
          club_name_normalized?: string
          country_id?: number
          created_at?: string
          created_from?: string
          id?: string
          is_claimed?: boolean
          men_league_id?: number | null
          province_id?: number | null
          updated_at?: string
          women_league_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "world_clubs_claimed_profile_id_fkey"
            columns: ["claimed_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "world_clubs_claimed_profile_id_fkey"
            columns: ["claimed_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_pending_country_review"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "world_clubs_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "world_clubs_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "world_countries_with_directory"
            referencedColumns: ["country_id"]
          },
          {
            foreignKeyName: "world_clubs_men_league_id_fkey"
            columns: ["men_league_id"]
            isOneToOne: false
            referencedRelation: "world_leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "world_clubs_province_id_fkey"
            columns: ["province_id"]
            isOneToOne: false
            referencedRelation: "world_province_stats"
            referencedColumns: ["province_id"]
          },
          {
            foreignKeyName: "world_clubs_province_id_fkey"
            columns: ["province_id"]
            isOneToOne: false
            referencedRelation: "world_provinces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "world_clubs_women_league_id_fkey"
            columns: ["women_league_id"]
            isOneToOne: false
            referencedRelation: "world_leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      world_leagues: {
        Row: {
          country_id: number | null
          created_at: string
          display_order: number | null
          id: number
          logical_id: string | null
          name: string
          province_id: number | null
          slug: string | null
          tier: number | null
          updated_at: string
        }
        Insert: {
          country_id?: number | null
          created_at?: string
          display_order?: number | null
          id?: number
          logical_id?: string | null
          name: string
          province_id?: number | null
          slug?: string | null
          tier?: number | null
          updated_at?: string
        }
        Update: {
          country_id?: number | null
          created_at?: string
          display_order?: number | null
          id?: number
          logical_id?: string | null
          name?: string
          province_id?: number | null
          slug?: string | null
          tier?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "world_leagues_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "world_leagues_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "world_countries_with_directory"
            referencedColumns: ["country_id"]
          },
          {
            foreignKeyName: "world_leagues_province_id_fkey"
            columns: ["province_id"]
            isOneToOne: false
            referencedRelation: "world_province_stats"
            referencedColumns: ["province_id"]
          },
          {
            foreignKeyName: "world_leagues_province_id_fkey"
            columns: ["province_id"]
            isOneToOne: false
            referencedRelation: "world_provinces"
            referencedColumns: ["id"]
          },
        ]
      }
      world_provinces: {
        Row: {
          country_id: number
          created_at: string
          description: string | null
          display_order: number | null
          id: number
          logical_id: string | null
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          country_id: number
          created_at?: string
          description?: string | null
          display_order?: number | null
          id?: number
          logical_id?: string | null
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          country_id?: number
          created_at?: string
          description?: string | null
          display_order?: number | null
          id?: number
          logical_id?: string | null
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "world_provinces_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "world_provinces_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "world_countries_with_directory"
            referencedColumns: ["country_id"]
          },
        ]
      }
    }
    Views: {
      country_migration_stats: {
        Row: {
          nationality_pending_review: number | null
          passport1_pending_review: number | null
          passport2_pending_review: number | null
          profiles_with_nationality_id: number | null
          profiles_with_nationality_text: number | null
          profiles_with_passport1_id: number | null
          profiles_with_passport1_text: number | null
          profiles_with_passport2_id: number | null
          profiles_with_passport2_text: number | null
          total_completed_profiles: number | null
        }
        Relationships: []
      }
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
      profiles_pending_country_review: {
        Row: {
          email: string | null
          full_name: string | null
          id: string | null
          nationality_country_id: number | null
          nationality_country_name: string | null
          nationality_needs_review: boolean | null
          nationality_text: string | null
          passport1_country_id: number | null
          passport1_country_name: string | null
          passport1_needs_review: boolean | null
          passport1_text: string | null
          passport2_country_id: number | null
          passport2_country_name: string | null
          passport2_needs_review: boolean | null
          passport2_text: string | null
          role: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_nationality_country_id_fkey"
            columns: ["nationality_country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_nationality_country_id_fkey"
            columns: ["nationality_country_id"]
            isOneToOne: false
            referencedRelation: "world_countries_with_directory"
            referencedColumns: ["country_id"]
          },
          {
            foreignKeyName: "profiles_passport1_country_id_fkey"
            columns: ["passport1_country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_passport1_country_id_fkey"
            columns: ["passport1_country_id"]
            isOneToOne: false
            referencedRelation: "world_countries_with_directory"
            referencedColumns: ["country_id"]
          },
          {
            foreignKeyName: "profiles_passport2_country_id_fkey"
            columns: ["passport2_country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_passport2_country_id_fkey"
            columns: ["passport2_country_id"]
            isOneToOne: false
            referencedRelation: "world_countries_with_directory"
            referencedColumns: ["country_id"]
          },
        ]
      }
      public_opportunities: {
        Row: {
          application_deadline: string | null
          benefits: string[] | null
          club_league: string | null
          club_location: string | null
          club_logo_url: string | null
          club_name: string | null
          created_at: string | null
          custom_benefits: string[] | null
          description: string | null
          duration_text: string | null
          gender: Database["public"]["Enums"]["opportunity_gender"] | null
          id: string | null
          location_city: string | null
          location_country: string | null
          opportunity_type:
            | Database["public"]["Enums"]["opportunity_type"]
            | null
          position: Database["public"]["Enums"]["opportunity_position"] | null
          priority: Database["public"]["Enums"]["opportunity_priority"] | null
          published_at: string | null
          requirements: string[] | null
          start_date: string | null
          title: string | null
        }
        Relationships: []
      }
      user_unread_counts: {
        Row: {
          unread_count: number | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          unread_count?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          unread_count?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_unread_counters_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_unread_counters_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles_pending_country_review"
            referencedColumns: ["id"]
          },
        ]
      }
      user_unread_counts_secure: {
        Row: {
          unread_count: number | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          unread_count?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          unread_count?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_unread_counters_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_unread_counters_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles_pending_country_review"
            referencedColumns: ["id"]
          },
        ]
      }
      world_countries_with_directory: {
        Row: {
          country_code: string | null
          country_id: number | null
          country_name: string | null
          flag_emoji: string | null
          has_regions: boolean | null
          region: string | null
          total_clubs: number | null
          total_leagues: number | null
        }
        Relationships: []
      }
      world_province_stats: {
        Row: {
          claimed_clubs: number | null
          country_code: string | null
          country_id: number | null
          country_name: string | null
          description: string | null
          display_order: number | null
          province_id: number | null
          province_name: string | null
          slug: string | null
          total_clubs: number | null
          total_leagues: number | null
        }
        Relationships: [
          {
            foreignKeyName: "world_provinces_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "world_provinces_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "world_countries_with_directory"
            referencedColumns: ["country_id"]
          },
        ]
      }
    }
    Functions: {
      acquire_profile_lock: { Args: { profile_id: string }; Returns: boolean }
      admin_block_user: {
        Args: { p_profile_id: string; p_reason?: string }
        Returns: Json
      }
      admin_delete_orphan_profile: {
        Args: { p_profile_id: string }
        Returns: Json
      }
      admin_get_audit_logs: {
        Args: {
          p_action?: string
          p_admin_id?: string
          p_limit?: number
          p_offset?: number
          p_target_type?: string
        }
        Returns: {
          action: string
          admin_email: string
          admin_id: string
          admin_name: string
          created_at: string
          id: string
          metadata: Json
          new_data: Json
          old_data: Json
          target_id: string
          target_type: string
          total_count: number
        }[]
      }
      admin_get_auth_orphans: {
        Args: never
        Returns: {
          created_at: string
          email: string
          email_confirmed_at: string
          intended_role: string
          last_sign_in_at: string
          user_id: string
        }[]
      }
      admin_get_broken_references: { Args: never; Returns: Json }
      admin_get_club_activity: {
        Args: { p_days?: number; p_limit?: number; p_offset?: number }
        Returns: {
          avatar_url: string
          avg_apps_per_vacancy: number
          base_location: string
          club_id: string
          club_name: string
          last_posted_at: string
          onboarding_completed: boolean
          open_vacancy_count: number
          total_applications: number
          total_count: number
          vacancy_count: number
        }[]
      }
      admin_get_club_summary: { Args: never; Returns: Json }
      admin_get_dashboard_stats: { Args: never; Returns: Json }
      admin_get_engagement_summary: { Args: never; Returns: Json }
      admin_get_engagement_trends: {
        Args: { p_days?: number }
        Returns: {
          active_users: number
          date: string
          total_minutes: number
          total_sessions: number
        }[]
      }
      admin_get_extended_dashboard_stats: { Args: never; Returns: Json }
      admin_get_opportunities: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_sort?: string
          p_status?: Database["public"]["Enums"]["opportunity_status"]
        }
        Returns: {
          application_count: number
          club_avatar_url: string
          club_id: string
          club_name: string
          created_at: string
          gender: Database["public"]["Enums"]["opportunity_gender"]
          id: string
          location_city: string
          location_country: string
          opportunity_type: string
          position: Database["public"]["Enums"]["opportunity_position"]
          priority: Database["public"]["Enums"]["opportunity_priority"]
          published_at: string
          status: Database["public"]["Enums"]["opportunity_status"]
          title: string
          total_count: number
          updated_at: string
        }[]
      }
      admin_get_opportunity_applicants: {
        Args: { p_limit?: number; p_offset?: number; p_opportunity_id: string }
        Returns: {
          applicant_avatar_url: string
          applicant_id: string
          applicant_name: string
          applicant_role: string
          application_id: string
          application_message: string
          application_status: string
          applied_at: string
          total_count: number
        }[]
      }
      admin_get_opportunity_detail: {
        Args: { p_opportunity_id: string }
        Returns: {
          application_count: number
          benefits: string[]
          closed_at: string
          club_avatar_url: string
          club_id: string
          club_name: string
          created_at: string
          description: string
          gender: Database["public"]["Enums"]["opportunity_gender"]
          id: string
          location_city: string
          location_country: string
          opportunity_type: string
          pending_count: number
          position: Database["public"]["Enums"]["opportunity_position"]
          priority: Database["public"]["Enums"]["opportunity_priority"]
          published_at: string
          rejected_count: number
          requirements: string[]
          shortlisted_count: number
          start_date: string
          status: Database["public"]["Enums"]["opportunity_status"]
          title: string
          updated_at: string
        }[]
      }
      admin_get_player_funnel: { Args: { p_days?: number }; Returns: Json }
      admin_get_profile_completeness_distribution: {
        Args: { p_role?: string }
        Returns: {
          bucket: string
          count: number
          percentage: number
        }[]
      }
      admin_get_profile_details: {
        Args: { p_profile_id: string }
        Returns: Json
      }
      admin_get_profile_orphans: {
        Args: never
        Returns: {
          created_at: string
          email: string
          full_name: string
          profile_id: string
          role: string
        }[]
      }
      admin_get_signup_trends: {
        Args: { p_days?: number }
        Returns: {
          clubs: number
          coaches: number
          date: string
          players: number
          total_signups: number
        }[]
      }
      admin_get_top_countries: {
        Args: { p_limit?: number }
        Returns: {
          country: string
          user_count: number
        }[]
      }
      admin_get_user_engagement: {
        Args: {
          p_days?: number
          p_limit?: number
          p_offset?: number
          p_sort_by?: string
          p_sort_dir?: string
        }
        Returns: {
          active_days: number
          avatar_url: string
          avg_session_minutes: number
          display_name: string
          email: string
          last_active_at: string
          role: string
          total_count: number
          total_sessions: number
          total_time_minutes: number
          user_id: string
        }[]
      }
      admin_get_user_engagement_detail: {
        Args: { p_days?: number; p_user_id: string }
        Returns: Json
      }
      admin_get_vacancies: {
        Args: {
          p_club_id?: string
          p_days?: number
          p_limit?: number
          p_offset?: number
          p_status?: Database["public"]["Enums"]["opportunity_status"]
        }
        Returns: {
          application_count: number
          application_deadline: string
          club_avatar_url: string
          club_id: string
          club_name: string
          created_at: string
          first_application_at: string
          id: string
          location_city: string
          location_country: string
          opportunity_type: Database["public"]["Enums"]["opportunity_type"]
          pending_count: number
          position: Database["public"]["Enums"]["opportunity_position"]
          published_at: string
          shortlisted_count: number
          status: Database["public"]["Enums"]["opportunity_status"]
          time_to_first_app_minutes: number
          title: string
          total_count: number
        }[]
      }
      admin_get_vacancy_applicants: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_status?: Database["public"]["Enums"]["application_status"]
          p_vacancy_id: string
        }
        Returns: {
          application_id: string
          applied_at: string
          avatar_url: string
          cover_letter: string
          highlight_video_url: string
          nationality: string
          onboarding_completed: boolean
          player_email: string
          player_id: string
          player_name: string
          position: string
          status: Database["public"]["Enums"]["application_status"]
          total_count: number
        }[]
      }
      admin_log_action: {
        Args: {
          p_action: string
          p_metadata?: Json
          p_new_data?: Json
          p_old_data?: Json
          p_target_id: string
          p_target_type: string
        }
        Returns: string
      }
      admin_resolve_country_mapping: {
        Args: { p_country_id: number; p_field: string; p_profile_id: string }
        Returns: undefined
      }
      admin_search_profiles: {
        Args: {
          p_is_blocked?: boolean
          p_is_test_account?: boolean
          p_limit?: number
          p_offset?: number
          p_onboarding_completed?: boolean
          p_query?: string
          p_role?: string
        }
        Returns: {
          avatar_url: string
          base_location: string
          created_at: string
          email: string
          full_name: string
          id: string
          is_blocked: boolean
          is_test_account: boolean
          nationality: string
          nationality2: string
          onboarding_completed: boolean
          role: string
          total_count: number
          updated_at: string
          username: string
        }[]
      }
      admin_set_test_account: {
        Args: { p_is_test: boolean; p_profile_id: string }
        Returns: Json
      }
      admin_unblock_user: { Args: { p_profile_id: string }; Returns: Json }
      admin_update_profile: {
        Args: { p_profile_id: string; p_reason?: string; p_updates: Json }
        Returns: Json
      }
      archive_old_messages: {
        Args: { p_batch?: number; p_retention_days?: number }
        Returns: number
      }
      claim_world_club: {
        Args: {
          p_men_league_id?: number
          p_profile_id: string
          p_women_league_id?: number
          p_world_club_id: string
        }
        Returns: Json
      }
      cleanup_stale_locks: { Args: never; Returns: undefined }
      clear_profile_notifications: {
        Args: {
          p_kind?: Database["public"]["Enums"]["profile_notification_kind"]
          p_notification_ids?: string[]
        }
        Returns: number
      }
      complete_user_profile:
        | {
            Args: {
              p_base_location: string
              p_bio?: string
              p_club_bio?: string
              p_club_history?: string
              p_contact_email?: string
              p_contact_email_public?: boolean
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
              base_country_id: number | null
              base_location: string | null
              bio: string | null
              blocked_at: string | null
              blocked_by: string | null
              blocked_reason: string | null
              club_bio: string | null
              club_history: string | null
              contact_email: string | null
              contact_email_public: boolean
              created_at: string
              current_club: string | null
              date_of_birth: string | null
              email: string
              full_name: string | null
              gender: string | null
              highlight_video_url: string | null
              highlight_visibility: string
              id: string
              is_blocked: boolean
              is_test_account: boolean
              last_active_at: string | null
              league_division: string | null
              mens_league_division: string | null
              mens_league_id: number | null
              nationality: string | null
              nationality_country_id: number | null
              nationality2_country_id: number | null
              notify_applications: boolean
              notify_opportunities: boolean
              onboarding_completed: boolean
              onboarding_completed_at: string | null
              onboarding_started_at: string | null
              open_to_coach: boolean
              open_to_opportunities: boolean
              open_to_play: boolean
              passport_1: string | null
              passport_2: string | null
              passport1_country_id: number | null
              passport2_country_id: number | null
              position: string | null
              role: string
              secondary_position: string | null
              social_links: Json | null
              updated_at: string
              username: string | null
              version: number
              website: string | null
              womens_league_division: string | null
              womens_league_id: number | null
              world_region_id: number | null
              year_founded: number | null
            }
            SetofOptions: {
              from: "*"
              to: "profiles"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
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
              base_country_id: number | null
              base_location: string | null
              bio: string | null
              blocked_at: string | null
              blocked_by: string | null
              blocked_reason: string | null
              club_bio: string | null
              club_history: string | null
              contact_email: string | null
              contact_email_public: boolean
              created_at: string
              current_club: string | null
              date_of_birth: string | null
              email: string
              full_name: string | null
              gender: string | null
              highlight_video_url: string | null
              highlight_visibility: string
              id: string
              is_blocked: boolean
              is_test_account: boolean
              last_active_at: string | null
              league_division: string | null
              mens_league_division: string | null
              mens_league_id: number | null
              nationality: string | null
              nationality_country_id: number | null
              nationality2_country_id: number | null
              notify_applications: boolean
              notify_opportunities: boolean
              onboarding_completed: boolean
              onboarding_completed_at: string | null
              onboarding_started_at: string | null
              open_to_coach: boolean
              open_to_opportunities: boolean
              open_to_play: boolean
              passport_1: string | null
              passport_2: string | null
              passport1_country_id: number | null
              passport2_country_id: number | null
              position: string | null
              role: string
              secondary_position: string | null
              social_links: Json | null
              updated_at: string
              username: string | null
              version: number
              website: string | null
              womens_league_division: string | null
              womens_league_id: number | null
              world_region_id: number | null
              year_founded: number | null
            }
            SetofOptions: {
              from: "*"
              to: "profiles"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      create_and_claim_world_club: {
        Args: {
          p_club_name: string
          p_country_id: number
          p_men_league_id?: number
          p_profile_id: string
          p_province_id: number
          p_women_league_id?: number
        }
        Returns: Json
      }
      create_profile_for_new_user: {
        Args: { user_email: string; user_id: string; user_role?: string }
        Returns: {
          avatar_url: string | null
          base_country_id: number | null
          base_location: string | null
          bio: string | null
          blocked_at: string | null
          blocked_by: string | null
          blocked_reason: string | null
          club_bio: string | null
          club_history: string | null
          contact_email: string | null
          contact_email_public: boolean
          created_at: string
          current_club: string | null
          date_of_birth: string | null
          email: string
          full_name: string | null
          gender: string | null
          highlight_video_url: string | null
          highlight_visibility: string
          id: string
          is_blocked: boolean
          is_test_account: boolean
          last_active_at: string | null
          league_division: string | null
          mens_league_division: string | null
          mens_league_id: number | null
          nationality: string | null
          nationality_country_id: number | null
          nationality2_country_id: number | null
          notify_applications: boolean
          notify_opportunities: boolean
          onboarding_completed: boolean
          onboarding_completed_at: string | null
          onboarding_started_at: string | null
          open_to_coach: boolean
          open_to_opportunities: boolean
          open_to_play: boolean
          passport_1: string | null
          passport_2: string | null
          passport1_country_id: number | null
          passport2_country_id: number | null
          position: string | null
          role: string
          secondary_position: string | null
          social_links: Json | null
          updated_at: string
          username: string | null
          version: number
          website: string | null
          womens_league_division: string | null
          womens_league_id: number | null
          world_region_id: number | null
          year_founded: number | null
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_profile_role: { Args: never; Returns: string }
      delete_rows_where_clause: {
        Args: {
          p_batch?: number
          p_table: unknown
          p_user_id: string
          p_where_sql: string
        }
        Returns: number
      }
      engagement_heartbeat_interval_seconds: { Args: never; Returns: number }
      enqueue_notification: {
        Args: {
          p_actor_profile_id: string
          p_kind: Database["public"]["Enums"]["profile_notification_kind"]
          p_metadata?: Json
          p_recipient_profile_id: string
          p_source_entity_id?: string
          p_target_url?: string
        }
        Returns: string
      }
      enqueue_orphaned_storage_objects: {
        Args: { p_limit?: number; p_min_age?: unknown }
        Returns: number
      }
      enqueue_storage_objects_for_prefix: {
        Args: { p_bucket: string; p_prefix: string; p_reason?: string }
        Returns: number
      }
      extract_storage_path: {
        Args: { p_bucket: string; p_url: string }
        Returns: string
      }
      fetch_club_opportunities_with_counts: {
        Args: { p_club_id: string }
        Returns: {
          application_count: number
          created_at: string
          gender: Database["public"]["Enums"]["opportunity_gender"]
          id: string
          location_city: string
          location_country: string
          opportunity_type: string
          pending_count: number
          position: Database["public"]["Enums"]["opportunity_position"]
          priority: Database["public"]["Enums"]["opportunity_priority"]
          published_at: string
          status: Database["public"]["Enums"]["opportunity_status"]
          title: string
          updated_at: string
        }[]
      }
      fetch_club_vacancies_with_counts: {
        Args: {
          p_club_id: string
          p_include_closed?: boolean
          p_limit?: number
        }
        Returns: {
          applicant_count: number
          application_deadline: string
          benefits: string[]
          closed_at: string
          club_id: string
          contact_email: string
          contact_phone: string
          created_at: string
          custom_benefits: string[]
          description: string
          duration_text: string
          gender: Database["public"]["Enums"]["opportunity_gender"]
          id: string
          location_city: string
          location_country: string
          opportunity_type: Database["public"]["Enums"]["opportunity_type"]
          position: Database["public"]["Enums"]["opportunity_position"]
          priority: Database["public"]["Enums"]["opportunity_priority"]
          published_at: string
          requirements: string[]
          start_date: string
          status: Database["public"]["Enums"]["opportunity_status"]
          title: string
          updated_at: string
          version: number
        }[]
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
      get_leagues_for_location: {
        Args: { p_country_id: number; p_region_id?: number }
        Returns: {
          id: number
          logical_id: string
          name: string
          tier: number
        }[]
      }
      get_message_recipient: {
        Args: { p_conversation_id: string; p_sender_id: string }
        Returns: string
      }
      get_my_reference_requests: {
        Args: never
        Returns: {
          created_at: string
          id: string
          reference_id: string
          relationship_type: string
          request_note: string
          requester_id: string
          requester_profile: Json
          status: Database["public"]["Enums"]["profile_reference_status"]
        }[]
      }
      get_my_references: {
        Args: never
        Returns: {
          accepted_at: string
          created_at: string
          endorsement_text: string
          id: string
          reference_id: string
          reference_profile: Json
          relationship_type: string
          request_note: string
          requester_id: string
          responded_at: string
          status: Database["public"]["Enums"]["profile_reference_status"]
        }[]
      }
      get_notification_counts: {
        Args: never
        Returns: {
          total_count: number
          unread_count: number
        }[]
      }
      get_notifications: {
        Args: {
          p_filter?: string
          p_kind?: Database["public"]["Enums"]["profile_notification_kind"]
          p_limit?: number
          p_offset?: number
        }
        Returns: {
          actor: Json
          cleared_at: string
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["profile_notification_kind"]
          metadata: Json
          read_at: string
          seen_at: string
          source_entity_id: string
          target_url: string
        }[]
      }
      get_opportunity_alerts: { Args: never; Returns: number }
      get_profile_references: {
        Args: { p_profile_id: string }
        Returns: {
          accepted_at: string
          endorsement_text: string
          id: string
          reference_id: string
          reference_profile: Json
          relationship_type: string
          requester_id: string
        }[]
      }
      get_references_i_gave: {
        Args: never
        Returns: {
          accepted_at: string
          endorsement_text: string
          id: string
          reference_id: string
          relationship_type: string
          requester_id: string
          requester_profile: Json
          status: Database["public"]["Enums"]["profile_reference_status"]
        }[]
      }
      get_user_conversations: {
        Args: {
          p_cursor_conversation_id?: string
          p_cursor_last_message_at?: string
          p_limit?: number
          p_user_id: string
        }
        Returns: {
          conversation_created_at: string
          conversation_id: string
          conversation_last_message_at: string
          conversation_updated_at: string
          has_more: boolean
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
      hard_delete_profile_relations: {
        Args: { p_batch?: number; p_user_id: string }
        Returns: Json
      }
      is_current_user_test_account: { Args: never; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
      is_test_opportunity: {
        Args: { opportunity_club_id: string }
        Returns: boolean
      }
      log_error: {
        Args: {
          p_correlation_id?: string
          p_error_code?: string
          p_error_message: string
          p_error_type: string
          p_function_name?: string
          p_metadata?: Json
          p_severity?: string
          p_source: string
          p_stack_trace?: string
        }
        Returns: string
      }
      mark_all_notifications_read: {
        Args: {
          p_kind?: Database["public"]["Enums"]["profile_notification_kind"]
        }
        Returns: number
      }
      mark_conversation_messages_read: {
        Args: { p_before?: string; p_conversation_id: string }
        Returns: number
      }
      mark_notification_read: {
        Args: { p_notification_id: string }
        Returns: boolean
      }
      mark_opportunities_seen: {
        Args: { p_seen_at?: string }
        Returns: undefined
      }
      match_text_to_country: {
        Args: { input_text: string }
        Returns: {
          confidence: string
          country_id: number
          match_type: string
        }[]
      }
      process_storage_cleanup_queue: {
        Args: { p_batch?: number; p_grace_period?: unknown }
        Returns: number
      }
      prune_old_heartbeats: {
        Args: { p_days_to_keep?: number }
        Returns: number
      }
      prune_profile_notifications: {
        Args: {
          p_batch?: number
          p_cleared_days?: number
          p_visible_days?: number
        }
        Returns: number
      }
      record_engagement_heartbeat: {
        Args: { p_session_id: string }
        Returns: Json
      }
      recover_zombie_accounts: {
        Args: never
        Returns: {
          action_taken: string
          user_id: string
        }[]
      }
      release_profile_lock: { Args: { profile_id: string }; Returns: boolean }
      remove_reference: {
        Args: { p_reference_id: string }
        Returns: {
          accepted_at: string | null
          created_at: string
          endorsement_text: string | null
          id: string
          reference_id: string
          relationship_type: string
          request_note: string | null
          requester_id: string
          responded_at: string | null
          revoked_at: string | null
          revoked_by: string | null
          status: Database["public"]["Enums"]["profile_reference_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profile_references"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      request_reference: {
        Args: {
          p_reference_id: string
          p_relationship_type: string
          p_request_note?: string
        }
        Returns: {
          accepted_at: string | null
          created_at: string
          endorsement_text: string | null
          id: string
          reference_id: string
          relationship_type: string
          request_note: string | null
          requester_id: string
          responded_at: string | null
          revoked_at: string | null
          revoked_by: string | null
          status: Database["public"]["Enums"]["profile_reference_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profile_references"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      respond_reference: {
        Args: {
          p_accept: boolean
          p_endorsement?: string
          p_reference_id: string
        }
        Returns: {
          accepted_at: string | null
          created_at: string
          endorsement_text: string | null
          id: string
          reference_id: string
          relationship_type: string
          request_note: string | null
          requester_id: string
          responded_at: string | null
          revoked_at: string | null
          revoked_by: string | null
          status: Database["public"]["Enums"]["profile_reference_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profile_references"
          isOneToOne: true
          isSetofReturn: false
        }
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
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      track_event: {
        Args: {
          p_entity_id?: string
          p_entity_type?: string
          p_error_code?: string
          p_error_message?: string
          p_event_name: string
          p_properties?: Json
        }
        Returns: string
      }
      try_parse_years_component: {
        Args: { component: string; years: string }
        Returns: string
      }
      user_in_conversation: {
        Args: { p_conversation_id: string; p_user_id: string }
        Returns: boolean
      }
      validate_social_links: { Args: { links: Json }; Returns: boolean }
      withdraw_reference: {
        Args: { p_reference_id: string }
        Returns: {
          accepted_at: string | null
          created_at: string
          endorsement_text: string | null
          id: string
          reference_id: string
          relationship_type: string
          request_note: string | null
          requester_id: string
          responded_at: string | null
          revoked_at: string | null
          revoked_by: string | null
          status: Database["public"]["Enums"]["profile_reference_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profile_references"
          isOneToOne: true
          isSetofReturn: false
        }
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
      journey_entry_type:
        | "club"
        | "national_team"
        | "achievement"
        | "tournament"
        | "milestone"
        | "academy"
        | "other"
      opportunity_gender: "Men" | "Women"
      opportunity_position: "goalkeeper" | "defender" | "midfielder" | "forward"
      opportunity_priority: "low" | "medium" | "high"
      opportunity_status: "draft" | "open" | "closed"
      opportunity_type: "player" | "coach"
      profile_notification_kind:
        | "friend_request_received"
        | "profile_comment_created"
        | "reference_request_received"
        | "reference_request_accepted"
        | "friend_request_accepted"
        | "reference_updated"
        | "profile_comment_reply"
        | "profile_comment_like"
        | "message_received"
        | "conversation_started"
        | "vacancy_application_received"
        | "vacancy_application_status"
        | "profile_completed"
        | "account_verified"
        | "system_announcement"
        | "reference_request_rejected"
      profile_reference_status: "pending" | "accepted" | "declined" | "revoked"
      question_category:
        | "trials_club_selection"
        | "visas_moving_abroad"
        | "scholarships_universities"
        | "highlights_visibility"
        | "training_performance"
        | "coaching_development"
        | "lifestyle_adaptation"
        | "other"
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
  graphql_public: {
    Enums: {},
  },
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
      journey_entry_type: [
        "club",
        "national_team",
        "achievement",
        "tournament",
        "milestone",
        "academy",
        "other",
      ],
      opportunity_gender: ["Men", "Women"],
      opportunity_position: ["goalkeeper", "defender", "midfielder", "forward"],
      opportunity_priority: ["low", "medium", "high"],
      opportunity_status: ["draft", "open", "closed"],
      opportunity_type: ["player", "coach"],
      profile_notification_kind: [
        "friend_request_received",
        "profile_comment_created",
        "reference_request_received",
        "reference_request_accepted",
        "friend_request_accepted",
        "reference_updated",
        "profile_comment_reply",
        "profile_comment_like",
        "message_received",
        "conversation_started",
        "vacancy_application_received",
        "vacancy_application_status",
        "profile_completed",
        "account_verified",
        "system_announcement",
        "reference_request_rejected",
      ],
      profile_reference_status: ["pending", "accepted", "declined", "revoked"],
      question_category: [
        "trials_club_selection",
        "visas_moving_abroad",
        "scholarships_universities",
        "highlights_visibility",
        "training_performance",
        "coaching_development",
        "lifestyle_adaptation",
        "other",
      ],
    },
  },
} as const
