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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_logs: {
        Row: {
          created_at: string
          event_type: string
          id: string
          ip_address: string | null
          metadata: Json
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      audio_analysis_reports: {
        Row: {
          band_high_db: number | null
          band_highmid_db: number | null
          band_low_db: number | null
          band_lowmid_db: number | null
          band_mid_db: number | null
          bit_rate: number | null
          bpm: number | null
          channels: number | null
          created_at: string
          deleted_at: string | null
          detected_issues: Json
          detected_key: string | null
          duration_sec: number | null
          dynamic_range_db: number | null
          file_format: string | null
          file_name: string
          file_size_bytes: number | null
          id: string
          lufs_estimate: number | null
          peak_db: number | null
          recommendations: Json
          rms_db: number | null
          sample_rate: number | null
          stereo_width: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          band_high_db?: number | null
          band_highmid_db?: number | null
          band_low_db?: number | null
          band_lowmid_db?: number | null
          band_mid_db?: number | null
          bit_rate?: number | null
          bpm?: number | null
          channels?: number | null
          created_at?: string
          deleted_at?: string | null
          detected_issues?: Json
          detected_key?: string | null
          duration_sec?: number | null
          dynamic_range_db?: number | null
          file_format?: string | null
          file_name: string
          file_size_bytes?: number | null
          id?: string
          lufs_estimate?: number | null
          peak_db?: number | null
          recommendations?: Json
          rms_db?: number | null
          sample_rate?: number | null
          stereo_width?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          band_high_db?: number | null
          band_highmid_db?: number | null
          band_low_db?: number | null
          band_lowmid_db?: number | null
          band_mid_db?: number | null
          bit_rate?: number | null
          bpm?: number | null
          channels?: number | null
          created_at?: string
          deleted_at?: string | null
          detected_issues?: Json
          detected_key?: string | null
          duration_sec?: number | null
          dynamic_range_db?: number | null
          file_format?: string | null
          file_name?: string
          file_size_bytes?: number | null
          id?: string
          lufs_estimate?: number | null
          peak_db?: number | null
          recommendations?: Json
          rms_db?: number | null
          sample_rate?: number | null
          stereo_width?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      audio_purge_runs: {
        Row: {
          id: string
          purged_count: number
          ran_at: string
          source: string
          triggered_by: string | null
        }
        Insert: {
          id?: string
          purged_count?: number
          ran_at?: string
          source?: string
          triggered_by?: string | null
        }
        Update: {
          id?: string
          purged_count?: number
          ran_at?: string
          source?: string
          triggered_by?: string | null
        }
        Relationships: []
      }
      beta_feedback: {
        Row: {
          admin_notes: string | null
          created_at: string
          id: string
          message: string
          page_url: string | null
          rating: number | null
          status: Database["public"]["Enums"]["feedback_status"]
          type: Database["public"]["Enums"]["feedback_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          id?: string
          message: string
          page_url?: string | null
          rating?: number | null
          status?: Database["public"]["Enums"]["feedback_status"]
          type?: Database["public"]["Enums"]["feedback_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          id?: string
          message?: string
          page_url?: string | null
          rating?: number | null
          status?: Database["public"]["Enums"]["feedback_status"]
          type?: Database["public"]["Enums"]["feedback_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      beta_invites: {
        Row: {
          code: string | null
          created_at: string
          created_by: string | null
          email: string | null
          expires_at: string | null
          id: string
          updated_at: string
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          code?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          expires_at?: string | null
          id?: string
          updated_at?: string
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          code?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          expires_at?: string | null
          id?: string
          updated_at?: string
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: []
      }
      incidents: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          id: string
          resolved_at: string | null
          severity: Database["public"]["Enums"]["incident_severity"]
          started_at: string
          status: Database["public"]["Enums"]["incident_status"]
          title: string
          updated_at: string
        }
        Insert: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          resolved_at?: string | null
          severity?: Database["public"]["Enums"]["incident_severity"]
          started_at?: string
          status?: Database["public"]["Enums"]["incident_status"]
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          resolved_at?: string | null
          severity?: Database["public"]["Enums"]["incident_severity"]
          started_at?: string
          status?: Database["public"]["Enums"]["incident_status"]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      pending_admin_emails: {
        Row: {
          created_at: string
          email: string
        }
        Insert: {
          created_at?: string
          email: string
        }
        Update: {
          created_at?: string
          email?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          audio_startup_scope: string | null
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          audio_startup_scope?: string | null
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          audio_startup_scope?: string | null
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      security_alerts: {
        Row: {
          alert_type: string
          created_at: string
          id: string
          message: string
          metadata: Json
          resolved: boolean
          severity: string
          user_id: string | null
        }
        Insert: {
          alert_type: string
          created_at?: string
          id?: string
          message: string
          metadata?: Json
          resolved?: boolean
          severity: string
          user_id?: string | null
        }
        Update: {
          alert_type?: string
          created_at?: string
          id?: string
          message?: string
          metadata?: Json
          resolved?: boolean
          severity?: string
          user_id?: string | null
        }
        Relationships: []
      }
      user_active_track_session: {
        Row: {
          audio_analysis_report_id: string
          created_at: string
          id: string
          track_name: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          audio_analysis_report_id: string
          created_at?: string
          id?: string
          track_name?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          audio_analysis_report_id?: string
          created_at?: string
          id?: string
          track_name?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_active_track_session_audio_analysis_report_id_fkey"
            columns: ["audio_analysis_report_id"]
            isOneToOne: false
            referencedRelation: "audio_analysis_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      user_plugin_inventory: {
        Row: {
          created_at: string
          custom_plugins: string[]
          id: string
          inventory_completed: boolean
          native_plugins: string[]
          third_party_plugins: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          custom_plugins?: string[]
          id?: string
          inventory_completed?: boolean
          native_plugins?: string[]
          third_party_plugins?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          custom_plugins?: string[]
          id?: string
          inventory_completed?: boolean
          native_plugins?: string[]
          third_party_plugins?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_plugin_inventory_history: {
        Row: {
          change_type: string
          changed_by: string | null
          created_at: string
          custom_plugins: string[]
          id: string
          inventory_completed: boolean
          native_plugins: string[]
          third_party_plugins: string[]
          user_id: string
        }
        Insert: {
          change_type: string
          changed_by?: string | null
          created_at?: string
          custom_plugins?: string[]
          id?: string
          inventory_completed?: boolean
          native_plugins?: string[]
          third_party_plugins?: string[]
          user_id: string
        }
        Update: {
          change_type?: string
          changed_by?: string | null
          created_at?: string
          custom_plugins?: string[]
          id?: string
          inventory_completed?: boolean
          native_plugins?: string[]
          third_party_plugins?: string[]
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_studio_setup: {
        Row: {
          created_at: string
          fl_edition: string | null
          fl_version: string | null
          id: string
          main_genre: string | null
          main_use: string | null
          setup_completed: boolean
          skill_level: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          fl_edition?: string | null
          fl_version?: string | null
          id?: string
          main_genre?: string | null
          main_use?: string | null
          setup_completed?: boolean
          skill_level?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          fl_edition?: string | null
          fl_version?: string | null
          id?: string
          main_genre?: string | null
          main_use?: string | null
          setup_completed?: boolean
          skill_level?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_studio_setup_history: {
        Row: {
          change_type: string
          changed_at: string
          changed_by: string | null
          fl_edition: string | null
          fl_version: string | null
          id: string
          main_genre: string | null
          main_use: string | null
          setup_completed: boolean
          skill_level: string | null
          user_id: string
        }
        Insert: {
          change_type?: string
          changed_at?: string
          changed_by?: string | null
          fl_edition?: string | null
          fl_version?: string | null
          id?: string
          main_genre?: string | null
          main_use?: string | null
          setup_completed?: boolean
          skill_level?: string | null
          user_id: string
        }
        Update: {
          change_type?: string
          changed_at?: string
          changed_by?: string | null
          fl_edition?: string | null
          fl_version?: string | null
          id?: string
          main_genre?: string | null
          main_use?: string | null
          setup_completed?: boolean
          skill_level?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_list_user_emails: {
        Args: never
        Returns: {
          email: string
          user_id: string
        }[]
      }
      admin_rotate_beta_codes: {
        Args: never
        Returns: {
          new_code: string
          revoked_count: number
        }[]
      }
      check_beta_invite: {
        Args: { _code?: string; _email: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      purge_deleted_audio_reports: { Args: never; Returns: number }
    }
    Enums: {
      app_role: "admin" | "paid" | "free"
      feedback_status: "open" | "in_progress" | "resolved"
      feedback_type: "bug" | "feature" | "general"
      incident_severity: "info" | "minor" | "major" | "critical"
      incident_status:
        | "investigating"
        | "identified"
        | "monitoring"
        | "resolved"
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
      app_role: ["admin", "paid", "free"],
      feedback_status: ["open", "in_progress", "resolved"],
      feedback_type: ["bug", "feature", "general"],
      incident_severity: ["info", "minor", "major", "critical"],
      incident_status: [
        "investigating",
        "identified",
        "monitoring",
        "resolved",
      ],
    },
  },
} as const
