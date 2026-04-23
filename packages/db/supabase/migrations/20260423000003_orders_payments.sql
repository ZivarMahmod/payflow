-- 003_orders_payments.sql — orders_cache + payments + payment_splits
-- BRIEF-DB-002
--
-- orders_cache is a CACHE over POS-owned state:
--   * POS is source of truth for totals, line items, VAT.
--   * We write to orders_cache only via a background sync from POS + to
--     mark `paid_at` when our own payment succeeds.
--   * No receipt numbers, no VAT breakdowns, no Z-reports live here —
--     those remain POS responsibilities.
--
-- payments is OUR own ledger of transactions we brokered via
-- Swish / Stripe. Independent from the POS side.
--
-- payment_splits models one row per guest when a bill is split — one
-- payment can have multiple splits summing to amount.

-- ─── orders_cache ──────────────────────────────────────────────────────────
create table if not exists public.orders_cache (
    id               uuid primary key default gen_random_uuid(),
    restaurant_id    uuid not null references public.restaurants(id) on delete cascade,
    location_id      uuid not null references public.locations(id)   on delete cascade,
    table_id         uuid         references public.tables(id)        on delete set null,
    pos_order_id     text not null,
    pos_type         text not null check (pos_type in ('onslip', 'caspeco', 'lightspeed')),
    order_token      text not null unique default encode(gen_random_bytes(16), 'hex'),
    total            numeric(10, 2) not null,
    currency         text not null default 'SEK',
    items            jsonb,
    status           text not null default 'open' check (status in ('open', 'paying', 'paid', 'closed')),
    opened_at        timestamptz not null default now(),
    last_synced_at   timestamptz not null default now(),
    paid_at          timestamptz,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now(),
    unique (restaurant_id, pos_order_id, pos_type)
);

comment on table public.orders_cache is
    'CACHE of POS orders — never source of truth. Refreshed via POS adapter sync.';
comment on column public.orders_cache.order_token is
    'Public opaque token used in guest URL /g/:order_token. Never predictable.';
comment on column public.orders_cache.items is
    'Cached POS line items as JSON. Shape is POS-specific — use the adapter.';
comment on column public.orders_cache.status is
    'open = bill viewable; paying = guest initiated payment; paid = our payment completed; closed = POS closed the bill.';

create index if not exists orders_cache_restaurant_status_idx
    on public.orders_cache (restaurant_id, status);
create index if not exists orders_cache_order_token_idx
    on public.orders_cache (order_token);
create index if not exists orders_cache_pos_order_id_idx
    on public.orders_cache (pos_order_id, pos_type);

drop trigger if exists orders_cache_set_updated_at on public.orders_cache;
create trigger orders_cache_set_updated_at
    before update on public.orders_cache
    for each row execute function public.set_updated_at();

-- ─── payments ──────────────────────────────────────────────────────────────
create table if not exists public.payments (
    id               uuid primary key default gen_random_uuid(),
    order_cache_id   uuid not null references public.orders_cache(id) on delete restrict,
    restaurant_id    uuid not null references public.restaurants(id)  on delete cascade,
    amount           numeric(10, 2) not null check (amount >= 0),
    tip_amount       numeric(10, 2) not null default 0 check (tip_amount >= 0),
    method           text not null check (method in ('swish', 'card')),
    provider         text not null check (provider in ('swish', 'stripe')),
    provider_tx_id   text,
    status           text not null default 'pending' check (status in ('pending', 'completed', 'failed', 'expired', 'refunded')),
    paid_at          timestamptz,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now()
);

comment on table public.payments is
    'Our own ledger of payments we brokered (Swish / Stripe). Independent from POS.';
comment on column public.payments.amount is
    'Amount guest paid excluding tip. NUMERIC(10,2) — never float.';
comment on column public.payments.tip_amount is
    'Tip added on top of amount. Stored separately so we can report tips per staff member later.';
comment on column public.payments.restaurant_id is
    'Denormalised from orders_cache for RLS efficiency.';

create index if not exists payments_order_cache_id_idx
    on public.payments (order_cache_id);
create index if not exists payments_status_created_idx
    on public.payments (status, created_at desc);
create index if not exists payments_restaurant_id_idx
    on public.payments (restaurant_id);

drop trigger if exists payments_set_updated_at on public.payments;
create trigger payments_set_updated_at
    before update on public.payments
    for each row execute function public.set_updated_at();

-- ─── payment_splits ────────────────────────────────────────────────────────
create table if not exists public.payment_splits (
    id                uuid primary key default gen_random_uuid(),
    payment_id        uuid not null references public.payments(id) on delete cascade,
    guest_identifier  text,
    amount            numeric(10, 2) not null check (amount > 0),
    created_at        timestamptz not null default now()
);

comment on table public.payment_splits is
    'One row per guest when a bill is split. Sum of amounts should equal parent payment.amount.';
comment on column public.payment_splits.guest_identifier is
    'Optional name/label ("Anna", "G2") — purely for UI clarity, never authentication.';

create index if not exists payment_splits_payment_id_idx
    on public.payment_splits (payment_id);

-- ─── RLS ────────────────────────────────────────────────────────────────────
-- Same SC-001 pattern: restaurant_id IN get_staff_restaurants(), guests
-- use token RPC only.
alter table public.orders_cache   enable row level security;
alter table public.payments       enable row level security;
alter table public.payment_splits enable row level security;

revoke all on public.orders_cache   from anon, authenticated;
revoke all on public.payments       from anon, authenticated;
revoke all on public.payment_splits from anon, authenticated;

grant select, insert, update, delete on public.orders_cache   to authenticated;
grant select, insert, update, delete on public.payments       to authenticated;
grant select, insert, update, delete on public.payment_splits to authenticated;

-- orders_cache — staff of the restaurant see/mutate their own.
drop policy if exists orders_cache_select_staff on public.orders_cache;
drop policy if exists orders_cache_insert_staff on public.orders_cache;
drop policy if exists orders_cache_update_staff on public.orders_cache;
drop policy if exists orders_cache_delete_owner on public.orders_cache;

create policy orders_cache_select_staff on public.orders_cache
    for select
    to authenticated
    using (restaurant_id in (select public.get_staff_restaurants()));

-- Writes to orders_cache happen server-side (service-role) in normal
-- operation — this policy is here as a fallback for admin-console edits
-- and to keep RLS honest.
create policy orders_cache_insert_staff on public.orders_cache
    for insert
    to authenticated
    with check (public.get_staff_role(restaurant_id) in ('owner', 'manager', 'staff'));

create policy orders_cache_update_staff on public.orders_cache
    for update
    to authenticated
    using      (public.get_staff_role(restaurant_id) in ('owner', 'manager', 'staff'))
    with check (public.get_staff_role(restaurant_id) in ('owner', 'manager', 'staff'));

create policy orders_cache_delete_owner on public.orders_cache
    for delete
    to authenticated
    using (public.get_staff_role(restaurant_id) = 'owner');

-- payments — staff see their restaurant's transactions; mutations go
-- through service-role in production but SELECT is common from dashboards.
drop policy if exists payments_select_staff on public.payments;
drop policy if exists payments_insert_none  on public.payments;
drop policy if exists payments_update_none  on public.payments;
drop policy if exists payments_delete_none  on public.payments;

create policy payments_select_staff on public.payments
    for select
    to authenticated
    using (restaurant_id in (select public.get_staff_restaurants()));

-- No staff INSERT/UPDATE/DELETE policies on payments. Service-role is the
-- only writer (payment endpoints, webhook handlers). Intentional.

-- payment_splits — inherit visibility through the parent payment.
drop policy if exists payment_splits_select_staff on public.payment_splits;

create policy payment_splits_select_staff on public.payment_splits
    for select
    to authenticated
    using (exists (
        select 1 from public.payments p
        where p.id = payment_splits.payment_id
          and p.restaurant_id in (select public.get_staff_restaurants())
    ));

-- ─── Anon RPC: get_order_by_token ──────────────────────────────────────────
-- The guest PWA is anon. It reads an order exclusively through this RPC,
-- which filters to a single row by token and returns a curated projection
-- (no internal ids, no POS credentials, no restaurant PII beyond name).
create or replace function public.get_order_by_token(p_token text)
    returns table (
        order_token    text,
        status         text,
        total          numeric,
        currency       text,
        items          jsonb,
        opened_at      timestamptz,
        last_synced_at timestamptz,
        restaurant_name text,
        restaurant_slug text,
        table_number    text
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
        r.name  as restaurant_name,
        r.slug  as restaurant_slug,
        t.table_number
    from public.orders_cache oc
    join public.restaurants r on r.id = oc.restaurant_id
    left join public.tables t on t.id = oc.table_id
    where oc.order_token = p_token
      and oc.status in ('open', 'paying');   -- completed/closed bills are hidden
$$;

comment on function public.get_order_by_token(text) is
    'Anon-safe lookup by order_token. Returns a curated projection only — never raw restaurant PII or POS credentials.';

revoke all on function public.get_order_by_token(text) from public;
grant  execute on function public.get_order_by_token(text) to anon, authenticated;
