-- 008_restaurant_tip_config.sql — per-restaurant tip defaults + presets
-- BRIEF-KI-005
--
-- The guest PWA needs two pieces of information to render a sensible tip
-- selector:
--
--   * `default_tip_percent` — the preset that is pre-selected when the
--     guest opens the payment screen. Swedish dining norm: many places
--     don't tip at all (0%), bars round up on the terminal, some fine
--     dining rooms nudge 10. The admin picks what feels right for their
--     concept from the admin dashboard (TA-004, later).
--
--   * `tip_options` — the list of preset % buttons. Must always include 0
--     as an explicit, first-class option (anti-pattern #1 in the brief:
--     "Tvinga ALDRIG dricks-val — 0 ska vara synligt och jämställt").
--
-- Both live on `restaurants` rather than `locations` because tip culture
-- is a concept-level decision, not a per-site one; a chain with a bar +
-- a restaurant concept will fork into two `restaurants` rows anyway.
--
-- Constraints:
--
--   * `default_tip_percent` is NUMERIC(5,2) bounded [0, 30]. 30% is the
--     same ceiling the guest PWA's custom input enforces (per the brief's
--     "UX-skydd"), so the DB won't admit a value that the client would
--     reject mid-flow.
--
--   * `tip_options` is `jsonb` with a CHECK that it's an array. Element
--     validation (each entry a number in [0, 30]) lives in the Zod schema
--     — a recursive SQL check against a jsonb_array_elements scan is
--     expensive on every insert/update and Postgres' subquery-in-CHECK
--     support is historically gnarly. Tight-enough at the boundary.
--
--   * NOT NULL + DEFAULT applied via `add column if not exists` so the
--     migration is idempotent and existing rows are backfilled to the
--     "conservative Swedish" defaults (0% preselected, [0, 5, 10] options).
--
-- The RPC `public.get_order_by_token` is CREATE OR REPLACE'd to add the
-- two new columns to its projection. The output-columns widen, which is
-- a safe shape change for anon callers — older guest PWA builds simply
-- ignore the new columns. Grants are re-applied for belt-and-braces.

-- ─── restaurants: tip columns ──────────────────────────────────────────────
alter table public.restaurants
    add column if not exists default_tip_percent numeric(5,2) not null default 0,
    add column if not exists tip_options jsonb not null default '[0, 5, 10]'::jsonb;

comment on column public.restaurants.default_tip_percent is
    'Preset tip percent pre-selected when the guest opens /pay. 0 means no tip — the Swedish norm. Admin-editable via TA-004.';
comment on column public.restaurants.tip_options is
    'JSON array of preset tip percents shown as buttons on the guest tip selector, e.g. [0, 5, 10]. 0 must always be present and visually equal (brief anti-pattern #1). Element validation lives in the Zod schema.';

-- Bounds check on the default. Kept in a DO-block so the migration is
-- idempotent: `ADD CONSTRAINT IF NOT EXISTS` is only supported in pg16+
-- and we still have to run on pg15 in local dev.
do $$
begin
    if not exists (
        select 1 from pg_constraint
         where conname = 'restaurants_default_tip_percent_range'
           and conrelid = 'public.restaurants'::regclass
    ) then
        alter table public.restaurants
            add constraint restaurants_default_tip_percent_range
            check (default_tip_percent >= 0 and default_tip_percent <= 30);
    end if;

    if not exists (
        select 1 from pg_constraint
         where conname = 'restaurants_tip_options_is_array'
           and conrelid = 'public.restaurants'::regclass
    ) then
        alter table public.restaurants
            add constraint restaurants_tip_options_is_array
            check (jsonb_typeof(tip_options) = 'array');
    end if;
end$$;

-- ─── get_order_by_token (v3): now returns tip config ──────────────────────
-- DB-002 shipped the base RPC; 005 extended it with restaurant_logo_url +
-- restaurant_swish_number. This migration widens it one more step for
-- KI-005. We CREATE OR REPLACE the function; because it's SECURITY DEFINER
-- with an explicit search_path it's safe to re-declare in place.
create or replace function public.get_order_by_token(p_token text)
    returns table (
        order_token                     text,
        status                          text,
        total                           numeric,
        currency                        text,
        items                           jsonb,
        opened_at                       timestamptz,
        last_synced_at                  timestamptz,
        restaurant_name                 text,
        restaurant_slug                 text,
        restaurant_logo_url             text,
        restaurant_swish_number         text,
        restaurant_default_tip_percent  numeric,
        restaurant_tip_options          jsonb,
        table_number                    text
    )
    language sql
    security definer
    stable
    set search_path = public
as $$
    select
        oc.order_token,
        oc.status,
        oc.total,
        oc.currency,
        oc.items,
        oc.opened_at,
        oc.last_synced_at,
        r.name                 as restaurant_name,
        r.slug                 as restaurant_slug,
        r.logo_url             as restaurant_logo_url,
        r.swish_number         as restaurant_swish_number,
        r.default_tip_percent  as restaurant_default_tip_percent,
        r.tip_options          as restaurant_tip_options,
        t.table_number
    from public.orders_cache oc
    join public.restaurants r on r.id = oc.restaurant_id
    left join public.tables t on t.id = oc.table_id
    where oc.order_token = p_token
      and oc.status in ('open', 'paying');
$$;

comment on function public.get_order_by_token(text) is
    'Anon-safe lookup by order_token. Returns curated projection including restaurant logo, swish number, and tip config (default + preset options). NEVER returns internal ids, POS credentials, or org_number.';

-- Re-apply grants. CREATE OR REPLACE preserves them in practice but being
-- explicit keeps the migration self-contained.
revoke all on function public.get_order_by_token(text) from public;
grant  execute on function public.get_order_by_token(text) to anon, authenticated;
