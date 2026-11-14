/**
 * Tipos gerados a partir da base Supabase LOCAL (esquema `public`). Não editar à mão.
 *
 * Regenerar após cada migração:
 *   npx.cmd supabase gen types --lang typescript --schema public > src/lib/supabase/database.types.ts
 *   npx.cmd prettier --write src/lib/supabase/database.types.ts
 * (e voltar a acrescentar este cabeçalho).
 *
 * Descrevem a ESTRUTURA das tabelas, não os privilégios: por exemplo, `ticket_events.evidence_ref`
 * aparece no tipo `Row`, mas a M3 não concede SELECT dessa coluna. As leituras usam listas de
 * colunas explícitas; nunca `select("*")`.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      account_members: {
        Row: {
          account_id: string;
          created_at: string;
          member_role: Database["public"]["Enums"]["member_role"];
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          account_id: string;
          created_at?: string;
          member_role?: Database["public"]["Enums"]["member_role"];
          user_id: string;
        };
        Update: {
          account_id?: string;
          created_at?: string;
          member_role?: Database["public"]["Enums"]["member_role"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "account_members_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "account_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      accounts: {
        Row: {
          country: string | null;
          created_at: string;
          created_by: string;
          id: string;
          name: string;
          sector: string | null;
          status: Database["public"]["Enums"]["account_status"];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          country?: string | null;
          created_at?: string;
          created_by: string;
          id?: string;
          name: string;
          sector?: string | null;
          status?: Database["public"]["Enums"]["account_status"];
          updated_at?: string;
        };
        Update: {
          country?: string | null;
          created_at?: string;
          created_by?: string;
          id?: string;
          name?: string;
          sector?: string | null;
          status?: Database["public"]["Enums"]["account_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "accounts_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          full_name: string | null;
          id: string;
          kind: Database["public"]["Enums"]["profile_kind"];
          locale: string;
          phone: string | null;
          status: Database["public"]["Enums"]["profile_status"];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          full_name?: string | null;
          id: string;
          kind?: Database["public"]["Enums"]["profile_kind"];
          locale?: string;
          phone?: string | null;
          status?: Database["public"]["Enums"]["profile_status"];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          full_name?: string | null;
          id?: string;
          kind?: Database["public"]["Enums"]["profile_kind"];
          locale?: string;
          phone?: string | null;
          status?: Database["public"]["Enums"]["profile_status"];
          updated_at?: string;
        };
        Relationships: [];
      };
      ticket_events: {
        Row: {
          actor_id: string | null;
          created_at: string;
          event_type: Database["public"]["Enums"]["ticket_event_type"];
          evidence_ref: string | null;
          from_status: Database["public"]["Enums"]["ticket_status"] | null;
          id: number;
          reason: string | null;
          ticket_id: string;
          to_status: Database["public"]["Enums"]["ticket_status"] | null;
          visibility: Database["public"]["Enums"]["event_visibility"];
        };
        ComputedFields: never;
        Insert: {
          actor_id?: string | null;
          created_at?: string;
          event_type: Database["public"]["Enums"]["ticket_event_type"];
          evidence_ref?: string | null;
          from_status?: Database["public"]["Enums"]["ticket_status"] | null;
          id?: never;
          reason?: string | null;
          ticket_id: string;
          to_status?: Database["public"]["Enums"]["ticket_status"] | null;
          visibility: Database["public"]["Enums"]["event_visibility"];
        };
        Update: {
          actor_id?: string | null;
          created_at?: string;
          event_type?: Database["public"]["Enums"]["ticket_event_type"];
          evidence_ref?: string | null;
          from_status?: Database["public"]["Enums"]["ticket_status"] | null;
          id?: never;
          reason?: string | null;
          ticket_id?: string;
          to_status?: Database["public"]["Enums"]["ticket_status"] | null;
          visibility?: Database["public"]["Enums"]["event_visibility"];
        };
        Relationships: [
          {
            foreignKeyName: "ticket_events_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ticket_events_ticket_id_fkey";
            columns: ["ticket_id"];
            isOneToOne: false;
            referencedRelation: "tickets";
            referencedColumns: ["id"];
          },
        ];
      };
      ticket_internal_notes: {
        Row: {
          author_id: string;
          body: string;
          created_at: string;
          id: number;
          ticket_id: string;
        };
        ComputedFields: never;
        Insert: {
          author_id: string;
          body: string;
          created_at?: string;
          id?: never;
          ticket_id: string;
        };
        Update: {
          author_id?: string;
          body?: string;
          created_at?: string;
          id?: never;
          ticket_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ticket_internal_notes_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ticket_internal_notes_ticket_id_fkey";
            columns: ["ticket_id"];
            isOneToOne: false;
            referencedRelation: "tickets";
            referencedColumns: ["id"];
          },
        ];
      };
      ticket_messages: {
        Row: {
          author_id: string;
          body: string;
          created_at: string;
          id: number;
          ticket_id: string;
        };
        ComputedFields: never;
        Insert: {
          author_id: string;
          body: string;
          created_at?: string;
          id?: never;
          ticket_id: string;
        };
        Update: {
          author_id?: string;
          body?: string;
          created_at?: string;
          id?: never;
          ticket_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ticket_messages_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ticket_messages_ticket_id_fkey";
            columns: ["ticket_id"];
            isOneToOne: false;
            referencedRelation: "tickets";
            referencedColumns: ["id"];
          },
        ];
      };
      tickets: {
        Row: {
          account_id: string;
          assigned_operator_id: string | null;
          closed_at: string | null;
          created_at: string;
          description: string;
          id: string;
          reference: string;
          requester_id: string;
          status: Database["public"]["Enums"]["ticket_status"];
          subject: string;
          type: Database["public"]["Enums"]["ticket_type"];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          account_id: string;
          assigned_operator_id?: string | null;
          closed_at?: string | null;
          created_at?: string;
          description: string;
          id?: string;
          reference: string;
          requester_id: string;
          status?: Database["public"]["Enums"]["ticket_status"];
          subject: string;
          type: Database["public"]["Enums"]["ticket_type"];
          updated_at?: string;
        };
        Update: {
          account_id?: string;
          assigned_operator_id?: string | null;
          closed_at?: string | null;
          created_at?: string;
          description?: string;
          id?: string;
          reference?: string;
          requester_id?: string;
          status?: Database["public"]["Enums"]["ticket_status"];
          subject?: string;
          type?: Database["public"]["Enums"]["ticket_type"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tickets_assigned_operator_id_fkey";
            columns: ["assigned_operator_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tickets_requester_member_fk";
            columns: ["account_id", "requester_id"];
            isOneToOne: false;
            referencedRelation: "account_members";
            referencedColumns: ["account_id", "user_id"];
          },
        ];
      };
      user_roles: {
        Row: {
          granted_at: string;
          granted_by: string | null;
          id: number;
          revoked_at: string | null;
          revoked_by: string | null;
          role: Database["public"]["Enums"]["staff_role"];
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          granted_at?: string;
          granted_by?: string | null;
          id?: never;
          revoked_at?: string | null;
          revoked_by?: string | null;
          role: Database["public"]["Enums"]["staff_role"];
          user_id: string;
        };
        Update: {
          granted_at?: string;
          granted_by?: string | null;
          id?: never;
          revoked_at?: string | null;
          revoked_by?: string | null;
          role?: Database["public"]["Enums"]["staff_role"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_roles_granted_by_fkey";
            columns: ["granted_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_roles_revoked_by_fkey";
            columns: ["revoked_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_roles_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      add_internal_note: { Args: { p_body: string; p_ticket_id: string }; Returns: number };
      add_ticket_message: { Args: { p_body: string; p_ticket_id: string }; Returns: number };
      admin_audit_log: {
        Args: { p_entity_id?: string; p_entity_type?: string; p_limit?: number; p_since?: string };
        Returns: {
          action: string;
          actor_aal: string;
          actor_id: string;
          after: Json;
          before: Json;
          entity_id: string;
          entity_type: string;
          id: number;
          occurred_at: string;
        }[];
      };
      admin_cancel_staff_provisioning: { Args: { p_provisioning_id: number }; Returns: undefined };
      admin_provision_staff: { Args: { p_email: string }; Returns: number };
      admin_set_profile_status: {
        Args: { p_status: Database["public"]["Enums"]["profile_status"]; p_user_id: string };
        Returns: undefined;
      };
      assign_ticket: { Args: { p_operator_id?: string; p_ticket_id: string }; Returns: Json };
      change_ticket_status: {
        Args: {
          p_evidence_ref?: string;
          p_expected_status?: Database["public"]["Enums"]["ticket_status"];
          p_reason?: string;
          p_ticket_id: string;
          p_to_status: Database["public"]["Enums"]["ticket_status"];
        };
        Returns: Json;
      };
      create_ticket: {
        Args: {
          p_description: string;
          p_subject: string;
          p_type: Database["public"]["Enums"]["ticket_type"];
        };
        Returns: Json;
      };
      grant_role: {
        Args: { p_role: Database["public"]["Enums"]["staff_role"]; p_user_id: string };
        Returns: number;
      };
      reopen_ticket: { Args: { p_reason: string; p_ticket_id: string }; Returns: Json };
      revoke_role: {
        Args: { p_role: Database["public"]["Enums"]["staff_role"]; p_user_id: string };
        Returns: undefined;
      };
      staff_ticket_events: {
        Args: { p_ticket_id: string };
        Returns: {
          actor_id: string | null;
          created_at: string;
          event_type: Database["public"]["Enums"]["ticket_event_type"];
          evidence_ref: string | null;
          from_status: Database["public"]["Enums"]["ticket_status"] | null;
          id: number;
          reason: string | null;
          ticket_id: string;
          to_status: Database["public"]["Enums"]["ticket_status"] | null;
          visibility: Database["public"]["Enums"]["event_visibility"];
        }[];
        SetofOptions: {
          from: "*";
          to: "ticket_events";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
    };
    Enums: {
      account_status: "activa" | "arquivada";
      event_visibility: "cliente" | "interno";
      member_role: "titular" | "membro";
      profile_kind: "cliente" | "interno";
      profile_status: "activo" | "suspenso" | "anonimizado";
      staff_role: "operador" | "admin";
      ticket_event_type:
        | "created"
        | "status_changed"
        | "assigned"
        | "unassigned"
        | "reopened"
        | "message_added"
        | "note_added";
      ticket_status:
        | "recebido"
        | "em_analise"
        | "aguarda_cliente"
        | "em_preparacao_proposta"
        | "proposta_enviada"
        | "aceite"
        | "recusado"
        | "cancelado"
        | "concluido";
      ticket_type:
        | "desenvolvimento_websites"
        | "solucoes_digitais"
        | "consultoria"
        | "gestao"
        | "formacao"
        | "comercio"
        | "demonstracao_core"
        | "acesso_demo"
        | "informacoes_hcm"
        | "pedido_generico";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      account_status: ["activa", "arquivada"],
      event_visibility: ["cliente", "interno"],
      member_role: ["titular", "membro"],
      profile_kind: ["cliente", "interno"],
      profile_status: ["activo", "suspenso", "anonimizado"],
      staff_role: ["operador", "admin"],
      ticket_event_type: [
        "created",
        "status_changed",
        "assigned",
        "unassigned",
        "reopened",
        "message_added",
        "note_added",
      ],
      ticket_status: [
        "recebido",
        "em_analise",
        "aguarda_cliente",
        "em_preparacao_proposta",
        "proposta_enviada",
        "aceite",
        "recusado",
        "cancelado",
        "concluido",
      ],
      ticket_type: [
        "desenvolvimento_websites",
        "solucoes_digitais",
        "consultoria",
        "gestao",
        "formacao",
        "comercio",
        "demonstracao_core",
        "acesso_demo",
        "informacoes_hcm",
        "pedido_generico",
      ],
    },
  },
} as const;
