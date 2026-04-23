-- 001_initial_tenants.sql — FlowPay initial multi-tenant schema
-- BRIEF-DB-001
--
-- Creates: restaurants, locations, tables, staff.
-- No RLS in this migration — SC-001 adds policies.
--
-- Conventions:
--   * PK: uuid default gen_random_uuid()
--   * Timestamps: timestamptz default now()
--   * snake_case in DB, camelCase in frontend (converted at data layer)
--   * All FK cascade on delete
--
-- Idempotent via CREATE TABLE IF NOT EXISTS + CREATE OR REPLACE FUNCTION +
-- DROP TRIGGER IF EXISTS ... before CREATE TRIGGER.

-- Enable extensions required for UUID + random bytes.
create extension if not exists "pgcrypto";

-- ─── restaurants ────────────────────────────────────────────────────────────
create table if not exists public.restaurants (
    id            uuid primary key default gen_random_uuid(),
    slug          text not null unique,
    org_number    text,
    name          text not null,
    swish_number  text,
    logo_url      text,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

comment on table public.restaurants is
    'FlowPay tenants (customer restaurants). Source of truth for tenant identity.';
comment on column public.restaurants.slug is
    'URL-safe identifier used in guest links (e.g. /t/:slug/...).';
comment on column public.restaurants.swish_number is
    'Swedish Swish merchant number — used when provider = swish.';

create index if not exists restaurants_slug_idx
    on public.restaurants (slug);

-- ─── locations ──────────────────────────────────────────────────────────────
create table if not exists public.locations (
    id             uuid primary key default gen_random_uuid(),
    restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
    address        text,
    city           text,
    postal_code    text,
    timezone       text not null default 'Europe/Stockholm',
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now()
);

comment on table public.locations is
    'Physical sites belonging to a restaurant. A restaurant can have multiple.';

create index if not exists locations_restaurant_id_idx
    on public.locations (restaurant_id);

-- ─── tables ─────────────────────────────────────────────────────────────────
create table if not exists public.tables (
    id            uuid primary key default gen_random_uuid(),
    location_id   uuid not null references public.locations(id) on delete cascade,
    table_number  text not null,
    qr_token      text not null unique default encode(gen_random_bytes(16), 'hex'),
    active        boolean not null default true,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

comment on table public.tables is
    'Physical tables with QR codes. qr_token is the public URL token guests scan.';
comment on column public.tables.qr_token is
    'Opaque random token (32 hex chars). Regenerate by UPDATE ... SET qr_token = encode(gen_random_bytes(16), ''hex'').';

create unique index if not exists tables_qr_token_idx
    on public.tables (qr_token);
create index if not exists tables_location_id_idx
    on public.tables (location_id);

-- ─── staff ──────────────────────────────────────────────────────────────────
create table if not exists public.staff (
    id             uuid primary key default gen_random_uuid(),
    restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
    user_id        uuid not null references auth.users(id) on delete cascade,
    role           text not null check (role in ('owner', 'manager', 'staff')),
    email          text,
    phone          text,
    created_at     timestamptz not null default now(),
    unique (restaurant_id, user_id)
);

comment on table public.staff is
    'Restaurant admin users. Links a Supabase auth user to a restaurant + role.';

create index if not exists staff_user_id_idx
    on public.staff (user_id);
create index if not exists staff_restaurant_id_idx
    on public.staff (restaurant_id);

-- ─── updated_at trigger ─────────────────────────────────────────────────────
-- Generic function — reused across tables that carry updated_at.
create or replace function public.set_updated_at()
    returns trigger
    language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

comment on function public.set_updated_at() is
    'Trigger helper: stamps updated_at = now() on BEFORE UPDATE.';

-- Attach to the three tables carrying updated_at.
-- DROP first so the migration is idempotent.
drop trigger if exists restaurants_set_updated_at on public.restaurants;
create trigger restaurants_set_updated_at
    before update on public.restaurants
    for each row execute function public.set_updated_at();

drop trigger if exists locations_set_updated_at on public.locations;
create trigger locations_set_updated_at
    before update on public.locations
    for each row execute function public.set_updated_at();

drop trigger if exists tables_set_updated_at on public.tables;
create trigger tables_set_updated_at
    before update on public.tables
    for each row execute function public.set_updated_at();
