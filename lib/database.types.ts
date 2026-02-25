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
  public: {
    Tables: {
      account_types: {
        Row: {
          created_at: string | null
          id: string
          is_budget_account: boolean
          is_liability: boolean
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_budget_account?: boolean
          is_liability?: boolean
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_budget_account?: boolean
          is_liability?: boolean
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      accounts: {
        Row: {
          created_at: string | null
          id: string
          is_closed: boolean
          name: string
          note: string | null
          on_budget: boolean | null
          payment_category_id: string | null
          sort_order: number
          type_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_closed?: boolean
          name: string
          note?: string | null
          on_budget?: boolean | null
          payment_category_id?: string | null
          sort_order?: number
          type_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_closed?: boolean
          name?: string
          note?: string | null
          on_budget?: boolean | null
          payment_category_id?: string | null
          sort_order?: number
          type_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_type_id_fkey"
            columns: ["type_id"]
            isOneToOne: false
            referencedRelation: "account_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_accounts_payment_category"
            columns: ["payment_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      budgets: {
        Row: {
          created_at: string | null
          id: string
          month: number
          updated_at: string | null
          user_id: string
          year: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          month: number
          updated_at?: string | null
          user_id: string
          year: number
        }
        Update: {
          created_at?: string | null
          id?: string
          month?: number
          updated_at?: string | null
          user_id?: string
          year?: number
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string | null
          group_id: string
          id: string
          is_hidden: boolean
          is_system: boolean
          name: string
          note: string | null
          sort_order: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          group_id: string
          id?: string
          is_hidden?: boolean
          is_system?: boolean
          name: string
          note?: string | null
          sort_order?: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          group_id?: string
          id?: string
          is_hidden?: boolean
          is_system?: boolean
          name?: string
          note?: string | null
          sort_order?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "category_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      category_allocations: {
        Row: {
          budget_id: string
          budgeted_amount: number
          category_id: string
          created_at: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          budget_id: string
          budgeted_amount?: number
          category_id: string
          created_at?: string | null
          id?: string
          updated_at?: string | null
        }
        Update: {
          budget_id?: string
          budgeted_amount?: number
          category_id?: string
          created_at?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "category_allocations_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "budgets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_allocations_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      category_goals: {
        Row: {
          category_id: string
          created_at: string | null
          goal_type: string
          id: string
          monthly_amount: number | null
          target_amount: number | null
          target_date: string | null
          updated_at: string | null
        }
        Insert: {
          category_id: string
          created_at?: string | null
          goal_type: string
          id?: string
          monthly_amount?: number | null
          target_amount?: number | null
          target_date?: string | null
          updated_at?: string | null
        }
        Update: {
          category_id?: string
          created_at?: string | null
          goal_type?: string
          id?: string
          monthly_amount?: number | null
          target_amount?: number | null
          target_date?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "category_goals_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: true
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      category_groups: {
        Row: {
          created_at: string | null
          id: string
          is_hidden: boolean
          name: string
          sort_order: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_hidden?: boolean
          name: string
          sort_order?: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_hidden?: boolean
          name?: string
          sort_order?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      payees: {
        Row: {
          created_at: string | null
          default_category_id: string | null
          id: string
          name: string
          transfer_account_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          default_category_id?: string | null
          id?: string
          name: string
          transfer_account_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          default_category_id?: string | null
          id?: string
          name?: string
          transfer_account_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payees_default_category_id_fkey"
            columns: ["default_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payees_transfer_account_id_fkey"
            columns: ["transfer_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          currency: string
          display_name: string | null
          first_day_of_week: number
          id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          currency?: string
          display_name?: string | null
          first_day_of_week?: number
          id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          currency?: string
          display_name?: string | null
          first_day_of_week?: number
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      scheduled_transactions: {
        Row: {
          account_id: string
          amount: number
          category_id: string | null
          created_at: string | null
          end_date: string | null
          flag_color: string | null
          frequency: string
          id: string
          memo: string | null
          next_date: string
          payee_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          account_id: string
          amount: number
          category_id?: string | null
          created_at?: string | null
          end_date?: string | null
          flag_color?: string | null
          frequency: string
          id?: string
          memo?: string | null
          next_date: string
          payee_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          account_id?: string
          amount?: number
          category_id?: string | null
          created_at?: string | null
          end_date?: string | null
          flag_color?: string | null
          frequency?: string
          id?: string
          memo?: string | null
          next_date?: string
          payee_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_transactions_payee_id_fkey"
            columns: ["payee_id"]
            isOneToOne: false
            referencedRelation: "payees"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          account_id: string
          amount: number
          approved: boolean
          category_id: string | null
          cleared: string
          created_at: string | null
          date: string
          flag_color: string | null
          id: string
          import_id: string | null
          is_split: boolean
          memo: string | null
          parent_transaction_id: string | null
          payee_id: string | null
          scheduled_transaction_id: string | null
          transfer_transaction_id: string | null
          type: string
          updated_at: string | null
        }
        Insert: {
          account_id: string
          amount: number
          approved?: boolean
          category_id?: string | null
          cleared?: string
          created_at?: string | null
          date?: string
          flag_color?: string | null
          id?: string
          import_id?: string | null
          is_split?: boolean
          memo?: string | null
          parent_transaction_id?: string | null
          payee_id?: string | null
          scheduled_transaction_id?: string | null
          transfer_transaction_id?: string | null
          type: string
          updated_at?: string | null
        }
        Update: {
          account_id?: string
          amount?: number
          approved?: boolean
          category_id?: string | null
          cleared?: string
          created_at?: string | null
          date?: string
          flag_color?: string | null
          id?: string
          import_id?: string | null
          is_split?: boolean
          memo?: string | null
          parent_transaction_id?: string | null
          payee_id?: string | null
          scheduled_transaction_id?: string | null
          transfer_transaction_id?: string | null
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_parent_transaction_id_fkey"
            columns: ["parent_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_payee_id_fkey"
            columns: ["payee_id"]
            isOneToOne: false
            referencedRelation: "payees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_scheduled_transaction_id_fkey"
            columns: ["scheduled_transaction_id"]
            isOneToOne: false
            referencedRelation: "scheduled_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_transfer_transaction_id_fkey"
            columns: ["transfer_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
