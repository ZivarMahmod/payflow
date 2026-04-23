-- 005_order_by_token_v2.sql — extend get_order_by_token for API-002
-- BRIEF-API-002
--
-- DB-002 shipped get_order_by_token with restaurant_name/restaurant_slug
-- and table_number. The guest PWA (KI-002) also needs the restaurant
-- logo and swish number, so this migration replaces the function with
-- a superset — CREATE OR REPLACE is safe here because signature widens
-- only on output columns; grants are re-applied below.

create or replace function public.get_order_by_token(p_token text)
    returns table (
        order_token      text,
        status           text,
        total            numeric,
        currency         text,
        items            jsonb,
        opened_at        timestamptz,
        last_synced_at   timestamptz,
        restaurant_name  text,
        restaurant_slug  text,
        restaurant_logo_url  text,
        restaurant_swish_number text,
        table_number     text
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
        r.name           as restaurant_name,
        r.slug           as restaurant_slug,
        r.logo_url       as restaurant_logo_url,
        r.swish_number   as restaurant_swish_number,
        t.table_number
    from public.orders_cache oc
    join public.restaurants r on r.id = oc.restaurant_id
    left join public.tables t on t.id = oc.table_id
    where oc.order_token = p_token
      and oc.status in ('open', 'paying');
$$;

comment on function public.get_order_by_token(text) is
    'Anon-safe lookup by order_token. Returns curated projection including restaurant logo + swish number. NEVER returns internal ids, POS credentials, or org_number.';

revoke all on function public.get_order_by_token(text) from public;
grant  execute on function public.get_order_by_token(text) to anon, authenticated;
