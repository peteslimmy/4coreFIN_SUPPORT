export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          name: string;
          email: string;
          password_hash: string;
          role: string;
          bu: string;
          phone: string;
        };
        Insert: {
          id: string;
          name: string;
          email: string;
          password_hash: string;
          role: string;
          bu: string;
          phone?: string;
        };
        Update: {
          id?: string;
          name?: string;
          email?: string;
          password_hash?: string;
          role?: string;
          bu?: string;
          phone?: string;
        };
      };
      tickets: {
        Row: {
          id: string;
          customer_name: string;
          customer_email: string;
          customer_phone: string;
          customer_last_name: string;
          customer_id: string | null;
          business_unit: string;
          provider: string;
          category: string;
          issue_type: string;
          priority: string;
          status: string;
          amount: number;
          transaction_id: string;
          card_pan: string;
          description: string;
          created_at: string;
          sla_deadline: string;
          is_escalated: boolean;
          escalation_count: number;
          assigned_agent_id: string;
          major_incident_id: string | null;
          feedback_score: number | null;
          feedback_comment: string | null;
          root_cause: string | null;
          corrective_action: string | null;
          submitted_by: string;
          submitted_by_name: string;
          submitted_by_phone: string;
          is_deleted: boolean;
          watchers: Json;
          rca_details: Json | null;
        };
        Insert: {
          id: string;
          customer_name?: string;
          customer_email?: string;
          customer_phone?: string;
          customer_last_name?: string;
          customer_id?: string | null;
          business_unit: string;
          provider: string;
          category: string;
          issue_type: string;
          priority: string;
          status: string;
          amount?: number;
          transaction_id?: string;
          card_pan?: string;
          description?: string;
          created_at?: string;
          sla_deadline: string;
          is_escalated?: boolean;
          escalation_count?: number;
          assigned_agent_id?: string;
          major_incident_id?: string | null;
          feedback_score?: number | null;
          feedback_comment?: string | null;
          root_cause?: string | null;
          corrective_action?: string | null;
          submitted_by?: string;
          submitted_by_name?: string;
          submitted_by_phone?: string;
          is_deleted?: boolean;
          watchers?: Json;
          rca_details?: Json | null;
        };
        Update: Partial<Database['public']['Tables']['tickets']['Insert']>;
      };
      comments: {
        Row: {
          id: string;
          ticket_id: string;
          author: string;
          role: string;
          message: string;
          timestamp: string;
          is_internal: boolean;
          seen: boolean;
          parent_comment_id: string | null;
          seen_by: Json;
        };
        Insert: {
          id: string;
          ticket_id: string;
          author: string;
          role: string;
          message: string;
          timestamp?: string;
          is_internal?: boolean;
          seen?: boolean;
          parent_comment_id?: string | null;
          seen_by?: Json;
        };
        Update: Partial<Database['public']['Tables']['comments']['Insert']>;
      };
      audit_logs: {
        Row: {
          id: string;
          timestamp: string;
          ticket_id: string | null;
          actor: string;
          role: string;
          action: string;
          details: string;
          hash: string;
          previous_hash: string;
          immutable: boolean;
        };
        Insert: {
          id: string;
          timestamp?: string;
          ticket_id?: string | null;
          actor: string;
          role: string;
          action: string;
          details: string;
          hash: string;
          previous_hash?: string;
          immutable?: boolean;
        };
        Update: Partial<Database['public']['Tables']['audit_logs']['Insert']>;
      };
      watcher_notifications: {
        Row: {
          id: string;
          timestamp: string;
          ticket_id: string;
          message: string;
          recipient: string;
          seen: boolean;
        };
        Insert: {
          id: string;
          timestamp?: string;
          ticket_id: string;
          message: string;
          recipient: string;
          seen?: boolean;
        };
        Update: Partial<Database['public']['Tables']['watcher_notifications']['Insert']>;
      };
      major_incidents: {
        Row: {
          id: string;
          name: string;
          description: string;
          provider: string;
          category: string;
          severity: string;
          active: boolean;
          ticket_count: number;
          created_at: string;
          status: string;
          timeline: Json;
          notifications: Json;
          pir: Json | null;
        };
        Insert: {
          id: string;
          name: string;
          description?: string;
          provider?: string;
          category?: string;
          severity?: string;
          active?: boolean;
          ticket_count?: number;
          created_at?: string;
          status?: string;
          timeline?: Json;
          notifications?: Json;
          pir?: Json | null;
        };
        Update: Partial<Database['public']['Tables']['major_incidents']['Insert']>;
      };
      customers: {
        Row: {
          id: string;
          first_name: string;
          last_name: string;
          email: string;
          phone: string;
          business_unit: string;
          created_at: string;
          total_tickets: number;
          notes: string | null;
        };
        Insert: {
          id: string;
          first_name: string;
          last_name: string;
          email: string;
          phone?: string;
          business_unit: string;
          created_at?: string;
          total_tickets?: number;
          notes?: string | null;
        };
        Update: Partial<Database['public']['Tables']['customers']['Insert']>;
      };
      sla_rules: {
        Row: {
          id: string;
          category: string;
          priority: string;
          duration_hours: number;
        };
        Insert: {
          id: string;
          category: string;
          priority: string;
          duration_hours?: number;
        };
        Update: Partial<Database['public']['Tables']['sla_rules']['Insert']>;
      };
      holidays: {
        Row: {
          id: string;
          name: string;
          date: string;
          country: string;
        };
        Insert: {
          id: string;
          name: string;
          date: string;
          country?: string;
        };
        Update: Partial<Database['public']['Tables']['holidays']['Insert']>;
      };
      ticket_templates: {
        Row: {
          id: string;
          name: string;
          description: string;
          category: string;
          issue_type: string;
          priority: string;
          provider: string;
          amount: string;
          ticket_description: string;
        };
        Insert: {
          id: string;
          name: string;
          description?: string;
          category: string;
          issue_type: string;
          priority?: string;
          provider?: string;
          amount?: string;
          ticket_description?: string;
        };
        Update: Partial<Database['public']['Tables']['ticket_templates']['Insert']>;
      };
      kb_articles: {
        Row: {
          id: string;
          title: string;
          category: string;
          provider: string;
          content: string;
          tags: Json;
          last_updated: string;
        };
        Insert: {
          id: string;
          title: string;
          category: string;
          provider?: string;
          content?: string;
          tags?: Json;
          last_updated?: string;
        };
        Update: Partial<Database['public']['Tables']['kb_articles']['Insert']>;
      };
      app_config: {
        Row: {
          key: string;
          value: Json;
        };
        Insert: {
          key: string;
          value: Json;
        };
        Update: {
          key?: string;
          value?: Json;
        };
      };
      evidence: {
        Row: {
          id: string;
          ticket_id: string;
          file_name: string;
          file_size: number;
          file_type: string;
          uploaded_at: string;
          uploaded_by: string;
        };
        Insert: {
          id: string;
          ticket_id: string;
          file_name: string;
          file_size?: number;
          file_type?: string;
          uploaded_at?: string;
          uploaded_by?: string;
        };
        Update: Partial<Database['public']['Tables']['evidence']['Insert']>;
      };
    };
    Functions: Record<string, never>;
  };
}
