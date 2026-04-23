/**
 * Supabase generated types placeholder.
 *
 * Normally produced by:
 *   pnpm supabase gen types typescript --linked > packages/db/src/database.types.ts
 *
 * Authored by hand because the sandbox cannot reach *.supabase.co. Kept
 * in sync with migrations:
 *   - 20260423000001_initial_tenants.sql   (restaurants, locations, tables, staff)
 *   - 20260423000002_rls_policies.sql      (no new tables)
 *   - 20260423000003_orders_payments.sql   (orders_cache, payments, payment_splits + RPC)
 *   - 20260423000004_pos_integrations.sql  (pos_integrations + get_pos_credentials RPC)
 *   - 20260423000005_order_by_token_v2.sql (widened get_order_by_token projection)
 *   - 20260423000006_payments_swish.sql    (swish_* columns + expire/mark_order_paid RPCs)
 *   - 20260423000007_pos_update_queue.sql  (pos_update_queue + claim/complete/fail RPCs)
 *   - 20260423000008_restaurant_tip_config.sql (tip defaults per restaurant — KI-005)
 *   - 20260423000009_reviews.sql           (reviews + submit_review RPC — DB-003)
 *   - 20260423000010_google_place_id.sql   (restaurants.google_place_id — API-006)
 *
 * When Zivar regenerates from the live DB this file will be overwritten.
 * Preserve nothing application-specific here.
 */

export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[];

/** Shared enums used across tables. */
export type StaffRole = "owner" | "manager" | "staff";
export type PosType = "onslip" | "caspeco" | "lightspeed";
export type OrderStatus = "open" | "paying" | "paid" | "closed";
export type PaymentMethod = "swish" | "card";
export type PaymentProvider = "swish" | "stripe";
export type PaymentStatus =
    | "pending"
    | "completed"
    | "failed"
    | "expired"
    | "refunded";

export interface Database {
    public: {
        Tables: {
            restaurants: {
                Row: {
                    id: string;
                    slug: string;
                    org_number: string | null;
                    name: string;
                    swish_number: string | null;
                    logo_url: string | null;
                    google_place_id: string | null;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id?: string;
                    slug: string;
                    org_number?: string | null;
                    name: string;
                    swish_number?: string | null;
                    logo_url?: string | null;
                    google_place_id?: string | null;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    id?: string;
                    slug?: string;
                    org_number?: string | null;
                    name?: string;
                    swish_number?: string | null;
                    logo_url?: string | null;
                    google_place_id?: string | null;
                    created_at?: string;
                    updated_at?: string;
                };
                Relationships: [];
            };
            locations: {
                Row: {
                    id: string;
                    restaurant_id: string;
                    address: string | null;
                    city: string | null;
                    postal_code: string | null;
                    timezone: string;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id?: string;
                    restaurant_id: string;
                    address?: string | null;
                    city?: string | null;
                    postal_code?: string | null;
                    timezone?: string;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    id?: string;
                    restaurant_id?: string;
                    address?: string | null;
                    city?: string | null;
                    postal_code?: string | null;
                    timezone?: string;
                    created_at?: string;
                    updated_at?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "locations_restaurant_id_fkey";
                        columns: ["restaurant_id"];
                        isOneToOne: false;
                        referencedRelation: "restaurants";
                        referencedColumns: ["id"];
                    },
                ];
            };
            tables: {
                Row: {
                    id: string;
                    location_id: string;
                    table_number: string;
                    qr_token: string;
                    active: boolean;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id?: string;
                    location_id: string;
                    table_number: string;
                    qr_token?: string;
                    active?: boolean;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    id?: string;
                    location_id?: string;
                    table_number?: string;
                    qr_token?: string;
                    active?: boolean;
                    created_at?: string;
                    updated_at?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "tables_location_id_fkey";
                        columns: ["location_id"];
                        isOneToOne: false;
                        referencedRelation: "locations";
                        referencedColumns: ["id"];
                    },
                ];
            };
            staff: {
                Row: {
                    id: string;
                    restaurant_id: string;
                    user_id: string;
                    role: StaffRole;
                    email: string | null;
                    phone: string | null;
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    restaurant_id: string;
                    user_id: string;
                    role: StaffRole;
                    email?: string | null;
                    phone?: string | null;
                    created_at?: string;
                };
                Update: {
                    id?: string;
                    restaurant_id?: string;
                    user_id?: string;
                    role?: StaffRole;
                    email?: string | null;
                    phone?: string | null;
                    created_at?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "staff_restaurant_id_fkey";
                        columns: ["restaurant_id"];
                        isOneToOne: false;
                        referencedRelation: "restaurants";
                        referencedColumns: ["id"];
                    },
                ];
            };
            orders_cache: {
                Row: {
                    id: string;
                    restaurant_id: string;
                    location_id: string;
                    table_id: string | null;
                    pos_order_id: string;
                    pos_type: PosType;
                    order_token: string;
                    total: number;
                    currency: string;
                    items: Json | null;
                    status: OrderStatus;
                    opened_at: string;
                    last_synced_at: string;
                    paid_at: string | null;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id?: string;
                    restaurant_id: string;
                    location_id: string;
                    table_id?: string | null;
                    pos_order_id: string;
                    pos_type: PosType;
                    order_token?: string;
                    total: number;
                    currency?: string;
                    items?: Json | null;
                    status?: OrderStatus;
                    opened_at?: string;
                    last_synced_at?: string;
                    paid_at?: string | null;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    id?: string;
                    restaurant_id?: string;
                    location_id?: string;
                    table_id?: string | null;
                    pos_order_id?: string;
                    pos_type?: PosType;
                    order_token?: string;
                    total?: number;
                    currency?: string;
                    items?: Json | null;
                    status?: OrderStatus;
                    opened_at?: string;
                    last_synced_at?: string;
                    paid_at?: string | null;
                    created_at?: string;
                    updated_at?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "orders_cache_restaurant_id_fkey";
                        columns: ["restaurant_id"];
                        isOneToOne: false;
                        referencedRelation: "restaurants";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "orders_cache_location_id_fkey";
                        columns: ["location_id"];
                        isOneToOne: false;
                        referencedRelation: "locations";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "orders_cache_table_id_fkey";
                        columns: ["table_id"];
                        isOneToOne: false;
                        referencedRelation: "tables";
                        referencedColumns: ["id"];
                    },
                ];
            };
            payments: {
                Row: {
                    id: string;
                    order_cache_id: string;
                    restaurant_id: string;
                    amount: number;
                    tip_amount: number;
                    method: PaymentMethod;
                    provider: PaymentProvider;
                    provider_tx_id: string | null;
                    status: PaymentStatus;
                    swish_reference: string | null;
                    swish_message: string | null;
                    expires_at: string | null;
                    paid_at: string | null;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id?: string;
                    order_cache_id: string;
                    restaurant_id: string;
                    amount: number;
                    tip_amount?: number;
                    method: PaymentMethod;
                    provider: PaymentProvider;
                    provider_tx_id?: string | null;
                    status?: PaymentStatus;
                    swish_reference?: string | null;
                    swish_message?: string | null;
                    expires_at?: string | null;
                    paid_at?: string | null;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    id?: string;
                    order_cache_id?: string;
                    restaurant_id?: string;
                    amount?: number;
                    tip_amount?: number;
                    method?: PaymentMethod;
                    provider?: PaymentProvider;
                    provider_tx_id?: string | null;
                    status?: PaymentStatus;
                    swish_reference?: string | null;
                    swish_message?: string | null;
                    expires_at?: string | null;
                    paid_at?: string | null;
                    created_at?: string;
                    updated_at?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "payments_order_cache_id_fkey";
                        columns: ["order_cache_id"];
                        isOneToOne: false;
                        referencedRelation: "orders_cache";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "payments_restaurant_id_fkey";
                        columns: ["restaurant_id"];
                        isOneToOne: false;
                        referencedRelation: "restaurants";
                        referencedColumns: ["id"];
                    },
                ];
            };
            pos_integrations: {
                Row: {
                    id: string;
                    restaurant_id: string;
                    location_id: string;
                    type: PosType;
                    credentials_encrypted: string | null;
                    external_location_id: string;
                    status: "active" | "paused" | "error";
                    last_synced_at: string | null;
                    last_error: string | null;
                    poll_interval_seconds: number;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id?: string;
                    restaurant_id: string;
                    location_id: string;
                    type: PosType;
                    credentials_encrypted?: string | null;
                    external_location_id: string;
                    status?: "active" | "paused" | "error";
                    last_synced_at?: string | null;
                    last_error?: string | null;
                    poll_interval_seconds?: number;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    id?: string;
                    restaurant_id?: string;
                    location_id?: string;
                    type?: PosType;
                    credentials_encrypted?: string | null;
                    external_location_id?: string;
                    status?: "active" | "paused" | "error";
                    last_synced_at?: string | null;
                    last_error?: string | null;
                    poll_interval_seconds?: number;
                    created_at?: string;
                    updated_at?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "pos_integrations_restaurant_id_fkey";
                        columns: ["restaurant_id"];
                        isOneToOne: false;
                        referencedRelation: "restaurants";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "pos_integrations_location_id_fkey";
                        columns: ["location_id"];
                        isOneToOne: false;
                        referencedRelation: "locations";
                        referencedColumns: ["id"];
                    },
                ];
            };
            pos_update_queue: {
                Row: {
                    id: string;
                    payment_id: string;
                    restaurant_id: string;
                    location_id: string;
                    integration_id: string;
                    external_location_id: string;
                    external_order_id: string;
                    action: "mark_paid";
                    payload: Json;
                    attempts: number;
                    status: "pending" | "processing" | "done" | "failed";
                    last_error: string | null;
                    next_attempt_at: string;
                    leased_until: string | null;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id?: string;
                    payment_id: string;
                    restaurant_id: string;
                    location_id: string;
                    integration_id: string;
                    external_location_id: string;
                    external_order_id: string;
                    action?: "mark_paid";
                    payload: Json;
                    attempts?: number;
                    status?: "pending" | "processing" | "done" | "failed";
                    last_error?: string | null;
                    next_attempt_at?: string;
                    leased_until?: string | null;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    id?: string;
                    payment_id?: string;
                    restaurant_id?: string;
                    location_id?: string;
                    integration_id?: string;
                    external_location_id?: string;
                    external_order_id?: string;
                    action?: "mark_paid";
                    payload?: Json;
                    attempts?: number;
                    status?: "pending" | "processing" | "done" | "failed";
                    last_error?: string | null;
                    next_attempt_at?: string;
                    leased_until?: string | null;
                    created_at?: string;
                    updated_at?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "pos_update_queue_payment_id_fkey";
                        columns: ["payment_id"];
                        isOneToOne: false;
                        referencedRelation: "payments";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "pos_update_queue_restaurant_id_fkey";
                        columns: ["restaurant_id"];
                        isOneToOne: false;
                        referencedRelation: "restaurants";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "pos_update_queue_location_id_fkey";
                        columns: ["location_id"];
                        isOneToOne: false;
                        referencedRelation: "locations";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "pos_update_queue_integration_id_fkey";
                        columns: ["integration_id"];
                        isOneToOne: false;
                        referencedRelation: "pos_integrations";
                        referencedColumns: ["id"];
                    },
                ];
            };
            reviews: {
                Row: {
                    id: string;
                    payment_id: string;
                    restaurant_id: string;
                    rating: number;
                    text: string | null;
                    guest_email: string | null;
                    guest_phone: string | null;
                    google_consent: boolean;
                    published_to_google_at: string | null;
                    replied_at: string | null;
                    reply_text: string | null;
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    payment_id: string;
                    restaurant_id: string;
                    rating: number;
                    text?: string | null;
                    guest_email?: string | null;
                    guest_phone?: string | null;
                    google_consent?: boolean;
                    published_to_google_at?: string | null;
                    replied_at?: string | null;
                    reply_text?: string | null;
                    created_at?: string;
                };
                Update: {
                    id?: string;
                    payment_id?: string;
                    restaurant_id?: string;
                    rating?: number;
                    text?: string | null;
                    guest_email?: string | null;
                    guest_phone?: string | null;
                    google_consent?: boolean;
                    published_to_google_at?: string | null;
                    replied_at?: string | null;
                    reply_text?: string | null;
                    created_at?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "reviews_payment_id_fkey";
                        columns: ["payment_id"];
                        isOneToOne: true;
                        referencedRelation: "payments";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "reviews_restaurant_id_fkey";
                        columns: ["restaurant_id"];
                        isOneToOne: false;
                        referencedRelation: "restaurants";
                        referencedColumns: ["id"];
                    },
                ];
            };
            payment_splits: {
                Row: {
                    id: string;
                    payment_id: string;
                    guest_identifier: string | null;
                    amount: number;
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    payment_id: string;
                    guest_identifier?: string | null;
                    amount: number;
                    created_at?: string;
                };
                Update: {
                    id?: string;
                    payment_id?: string;
                    guest_identifier?: string | null;
                    amount?: number;
                    created_at?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "payment_splits_payment_id_fkey";
                        columns: ["payment_id"];
                        isOneToOne: false;
                        referencedRelation: "payments";
                        referencedColumns: ["id"];
                    },
                ];
            };
        };
        Views: Record<string, never>;
        Functions: {
            get_staff_restaurants: {
                Args: Record<string, never>;
                Returns: string[];
            };
            get_staff_role: {
                Args: { p_restaurant_id: string };
                Returns: string | null;
            };
            get_pos_credentials: {
                Args: { p_integration_id: string };
                Returns: string | null;
            };
            get_order_by_token: {
                Args: { p_token: string };
                Returns: {
                    order_token: string;
                    status: OrderStatus;
                    total: number;
                    currency: string;
                    items: Json | null;
                    opened_at: string;
                    last_synced_at: string;
                    restaurant_name: string;
                    restaurant_slug: string;
                    restaurant_logo_url: string | null;
                    restaurant_swish_number: string | null;
                    restaurant_default_tip_percent: number;
                    restaurant_tip_options: Json;
                    table_number: string | null;
                }[];
            };
            expire_pending_payments: {
                Args: Record<string, never>;
                Returns: number;
            };
            mark_order_paid_if_funded: {
                Args: { p_order_cache_id: string };
                Returns: boolean;
            };
            claim_pos_update_queue_items: {
                Args: { p_limit?: number; p_lease_seconds?: number };
                Returns: {
                    id: string;
                    payment_id: string;
                    restaurant_id: string;
                    location_id: string;
                    integration_id: string;
                    external_location_id: string;
                    external_order_id: string;
                    action: "mark_paid";
                    payload: Json;
                    attempts: number;
                }[];
            };
            complete_pos_update_queue_item: {
                Args: { p_id: string };
                Returns: void;
            };
            fail_pos_update_queue_item: {
                Args: {
                    p_id: string;
                    p_error: string;
                    p_next_attempt_at: string;
                    p_max_attempts?: number;
                };
                Returns: string;
            };
            submit_review: {
                Args: {
                    payment_id_param: string;
                    rating_param: number;
                    text_param: string | null;
                    email_param: string | null;
                    phone_param: string | null;
                    consent_param: boolean;
                };
                Returns: string;
            };
        };
        Enums: Record<string, never>;
        CompositeTypes: Record<string, never>;
    };
}

/** Row helper aliases. */
export type Restaurant = Database["public"]["Tables"]["restaurants"]["Row"];
export type RestaurantInsert =
    Database["public"]["Tables"]["restaurants"]["Insert"];
export type RestaurantUpdate =
    Database["public"]["Tables"]["restaurants"]["Update"];

export type Location = Database["public"]["Tables"]["locations"]["Row"];
export type LocationInsert =
    Database["public"]["Tables"]["locations"]["Insert"];
export type LocationUpdate =
    Database["public"]["Tables"]["locations"]["Update"];

export type TableRow = Database["public"]["Tables"]["tables"]["Row"];
export type TableInsert = Database["public"]["Tables"]["tables"]["Insert"];
export type TableUpdate = Database["public"]["Tables"]["tables"]["Update"];

export type StaffMember = Database["public"]["Tables"]["staff"]["Row"];
export type StaffInsert = Database["public"]["Tables"]["staff"]["Insert"];
export type StaffUpdate = Database["public"]["Tables"]["staff"]["Update"];

export type OrderCache = Database["public"]["Tables"]["orders_cache"]["Row"];
export type OrderCacheInsert =
    Database["public"]["Tables"]["orders_cache"]["Insert"];
export type OrderCacheUpdate =
    Database["public"]["Tables"]["orders_cache"]["Update"];

export type Payment = Database["public"]["Tables"]["payments"]["Row"];
export type PaymentInsert = Database["public"]["Tables"]["payments"]["Insert"];
export type PaymentUpdate = Database["public"]["Tables"]["payments"]["Update"];

export type PaymentSplit =
    Database["public"]["Tables"]["payment_splits"]["Row"];
export type PaymentSplitInsert =
    Database["public"]["Tables"]["payment_splits"]["Insert"];
export type PaymentSplitUpdate =
    Database["public"]["Tables"]["payment_splits"]["Update"];

export type PosIntegration =
    Database["public"]["Tables"]["pos_integrations"]["Row"];
export type PosIntegrationInsert =
    Database["public"]["Tables"]["pos_integrations"]["Insert"];
export type PosIntegrationUpdate =
    Database["public"]["Tables"]["pos_integrations"]["Update"];

export type PosUpdateQueueRow =
    Database["public"]["Tables"]["pos_update_queue"]["Row"];
export type PosUpdateQueueInsert =
    Database["public"]["Tables"]["pos_update_queue"]["Insert"];
export type PosUpdateQueueUpdate =
    Database["public"]["Tables"]["pos_update_queue"]["Update"];

export type Review = Database["public"]["Tables"]["reviews"]["Row"];
export type ReviewInsert = Database["public"]["Tables"]["reviews"]["Insert"];
export type ReviewUpdate = Database["public"]["Tables"]["reviews"]["Update"];

/** RPC return projection shared with the guest PWA. */
export type GuestOrderView =
    Database["public"]["Functions"]["get_order_by_token"]["Returns"][number];
