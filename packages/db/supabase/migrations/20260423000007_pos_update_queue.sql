-- 007_pos_update_queue.sql — durable queue for POS-side mutations
-- BRIEF-API-004
--
-- When a payment flips to status='completed' we must tell the POS that the
-- bill is settled (otherwise the staff terminal still shows it as open and
-- a waiter would try to charge again). Doing that synchronously inside the
-- /payments/:id/confirm handler is unsafe: the POS API can be slow,
-- rate-limited, or temporarily unreachable, and we MUST NOT roll back the
-- payment row just because the POS hiccupped — the guest already paid.
--
-- This migration introduces a small, durable work queue:
--
--   * `pos_update_queue` — one row per POS-side action we owe to a POS.
--     Uniquely keyed on (payment_id, action) so that even if the
--     enqueue path runs multiple times for the same payment we only ever
--     create ONE row → one POS call. That gives us the brief's
--     idempotency guarantee at the storage layer.
--
--   * `payments_enqueue_pos_update` — AFTER UPDATE trigger on payments.
--     Fires when a row transitions to status='completed'. Reads the order
--     cache + pos_integrations row to learn the POS coordinates, then
--     INSERT … ON CONFLICT DO NOTHING into the queue. Inline in SQL
--     because we want every path that completes a payment (route handler,
--     future Stripe webhook, manual admin action) to enqueue without the
--     application code having to remember.
--
--   * `claim_pos_update_queue_items(p_limit int, p_lease_seconds int)` —
--     atomic worker-side dequeue. Selects pending rows whose
--     next_attempt_at has passed, FOR UPDATE SKIP LOCKED, marks them
--     status='processing' with a lease timestamp, and returns them.
--     SKIP LOCKED means N parallel workers don't fight for the same row.
--
--   * `complete_pos_update_queue_item(p_id uuid)` — happy-path finalise.
--   * `fail_pos_update_queue_item(p_id, p_error, p_next_attempt_at)` —
--     bumps attempts, stores last_error, computes status='pending' or
--     'failed' depending on whether attempts has exceeded the cap.
--
-- Backoff policy is OWNED BY THE WORKER, not the DB — see
-- apps/api/src/services/pos-update-queue.ts. We hand the next_attempt_at
-- in to keep the SQL surface narrow and let the schedule evolve without
-- a migration.
--
-- All of this runs as service_role. Staff get SELECT-only via RLS so the
-- admin dashboard can show "pos sync: pending / failed".

-- ─── pos_update_queue ──────────────────────────────────────────────────────
create table if not exists public.pos_update_queue (
    id                    uuid primary key default gen_random_uuid(),
    payment_id            uuid not null references public.payments(id)        on delete restrict,
    restaurant_id         uuid not null references public.restaurants(id)     on delete cascade,
    location_id           uuid not null references public.locations(id)       on delete cascade,
    integration_id        uuid not null references public.pos_integrations(id) on delete cascade,
    external_location_id  text not null,
    external_order_id     text not null,
    action                text not null default 'mark_paid'
        check (action in ('mark_paid')),
    payload               jsonb not null,
    attempts              integer not null default 0 check (attempts >= 0),
    status                text not null default 'pending'
        check (status in ('pending', 'processing', 'done', 'failed')),
    last_error            text,
    next_attempt_at       timestamptz not null default now(),
    -- Set when a worker claims the row. NULL on pending/done/failed.
    -- Used to detect orphaned 'processing' rows (worker crashed mid-call).
    leased_until          timestamptz,
    created_at            timestamptz not null default now(),
    updated_at            timestamptz not null default now(),
    -- Idempotency: at most one queue row per (payment, action). Two
    -- simultaneous completePayment calls converge on the same row.
    unique (payment_id, action)
);

comment on table public.pos_update_queue is
    'Durable work queue for POS-side mutations after payment completion. UNIQUE(payment_id, action) makes enqueue idempotent.';
comment on column public.pos_update_queue.payload is
    'JSON snapshot passed to the adapter: { method, amount, tipAmount, reference }. Captured at enqueue so later credential rotations or partial-pay edge cases can replay deterministically.';
comment on column public.pos_update_queue.attempts is
    'Number of times the worker has tried this row. Backoff schedule lives in the worker, not here.';
comment on column public.pos_update_queue.status is
    'pending = waiting in queue; processing = a worker has claimed it; done = POS acknowledged; failed = attempts exceeded the cap.';
comment on column public.pos_update_queue.next_attempt_at is
    'Worker only considers pending rows where next_attempt_at <= now(). Used to implement exponential backoff.';
comment on column public.pos_update_queue.leased_until is
    'Set when a worker claims the row. Lets us detect crashed workers (lease expired but status still ''processing'').';

-- Worker scan path: cheapest possible — partial index on the rows that
-- actually need work, ordered by next_attempt_at so the oldest-due item
-- comes out first.
create index if not exists pos_update_queue_pending_idx
    on public.pos_update_queue (next_attempt_at)
    where status = 'pending';

-- Visibility for the admin dashboard ("show me failed POS updates").
create index if not exists pos_update_queue_restaurant_status_idx
    on public.pos_update_queue (restaurant_id, status);

-- Recovery scan path for orphaned processing rows whose lease expired.
create index if not exists pos_update_queue_processing_lease_idx
    on public.pos_update_queue (leased_until)
    where status = 'processing';

drop trigger if exists pos_update_queue_set_updated_at on public.pos_update_queue;
create trigger pos_update_queue_set_updated_at
    before update on public.pos_update_queue
    for each row execute function public.set_updated_at();

-- ─── RLS ────────────────────────────────────────────────────────────────────
alter table public.pos_update_queue enable row level security;
revoke all on public.pos_update_queue from anon, authenticated;
grant select on public.pos_update_queue to authenticated;

drop policy if exists pos_update_queue_select_staff on public.pos_update_queue;

create policy pos_update_queue_select_staff on public.pos_update_queue
    for select
    to authenticated
    using (restaurant_id in (select public.get_staff_restaurants()));

-- INSERT/UPDATE/DELETE only via service-role (the worker + the trigger
-- below). No staff write policies on purpose.

-- ─── enqueue trigger on payments ───────────────────────────────────────────
-- Fires AFTER UPDATE on payments when the row transitions to completed.
-- AFTER (not BEFORE) so the existing 006-trigger has already stamped
-- paid_at and the row is final by the time we read it back here.
create or replace function public.payments_enqueue_pos_update()
    returns trigger
    language plpgsql
    security definer
    set search_path = public
as $$
declare
    v_order        public.orders_cache%rowtype;
    v_integration  public.pos_integrations%rowtype;
begin
    if new.status <> 'completed' then
        return new;
    end if;
    if old.status = 'completed' then
        return new;            -- already processed once; do nothing
    end if;

    select *
        into v_order
        from public.orders_cache
        where id = new.order_cache_id;

    if v_order.id is null then
        -- Defensive: payments.order_cache_id has a fk so this should never
        -- happen. Log via a noisy raise notice rather than crashing the
        -- update, because the payment IS legitimately completed.
        raise notice 'payments_enqueue_pos_update: orders_cache row % not found', new.order_cache_id;
        return new;
    end if;

    -- Find the active POS integration for this (restaurant, location, pos_type).
    select *
        into v_integration
        from public.pos_integrations
        where restaurant_id = v_order.restaurant_id
          and location_id   = v_order.location_id
          and type          = v_order.pos_type
        order by status = 'active' desc, updated_at desc
        limit 1;

    if v_integration.id is null then
        -- No POS integration configured. Mark a row 'failed' immediately
        -- so the admin dashboard surfaces the misconfiguration. We still
        -- only ever insert ONE row thanks to the unique constraint.
        insert into public.pos_update_queue
            (payment_id, restaurant_id, location_id, integration_id,
             external_location_id, external_order_id, payload,
             status, last_error, next_attempt_at)
        values
            (new.id, v_order.restaurant_id, v_order.location_id,
             '00000000-0000-0000-0000-000000000000'::uuid,
             '', v_order.pos_order_id,
             jsonb_build_object(
                 'method',    new.method,
                 'amount',    new.amount,
                 'tipAmount', new.tip_amount,
                 'reference', new.id::text
             ),
             'failed',
             format('No pos_integrations row for restaurant %s / location %s / type %s',
                    v_order.restaurant_id, v_order.location_id, v_order.pos_type),
             now())
        on conflict (payment_id, action) do nothing;
        return new;
    end if;

    insert into public.pos_update_queue
        (payment_id, restaurant_id, location_id, integration_id,
         external_location_id, external_order_id, payload,
         status, next_attempt_at)
    values
        (new.id, v_order.restaurant_id, v_order.location_id, v_integration.id,
         v_integration.external_location_id, v_order.pos_order_id,
         jsonb_build_object(
             'method',    new.method,
             'amount',    new.amount,
             'tipAmount', new.tip_amount,
             'reference', new.id::text
         ),
         'pending',
         now())
    on conflict (payment_id, action) do nothing;

    return new;
end;
$$;

comment on function public.payments_enqueue_pos_update() is
    'AFTER UPDATE trigger: enqueue a pos_update_queue row when a payment becomes completed. Idempotent via UNIQUE(payment_id, action).';

drop trigger if exists payments_enqueue_pos_update_trigger on public.payments;
create trigger payments_enqueue_pos_update_trigger
    after update on public.payments
    for each row execute function public.payments_enqueue_pos_update();

-- ─── worker RPCs ───────────────────────────────────────────────────────────
-- claim: atomically pull up to N pending rows whose next_attempt_at has
-- passed, mark them processing with a lease, return them. SKIP LOCKED so
-- parallel workers don't contend.
create or replace function public.claim_pos_update_queue_items(
        p_limit         integer default 10,
        p_lease_seconds integer default 60
    )
    returns table (
        id                   uuid,
        payment_id           uuid,
        restaurant_id        uuid,
        location_id          uuid,
        integration_id       uuid,
        external_location_id text,
        external_order_id    text,
        action               text,
        payload              jsonb,
        attempts             integer
    )
    language plpgsql
    security definer
    set search_path = public
as $$
begin
    if p_limit is null or p_limit <= 0 then p_limit := 10; end if;
    if p_lease_seconds is null or p_lease_seconds <= 0 then p_lease_seconds := 60; end if;

    return query
    with claimable as (
        select q.id
          from public.pos_update_queue q
         where q.status = 'pending'
           and q.next_attempt_at <= now()
         order by q.next_attempt_at
         limit p_limit
         for update skip locked
    ),
    -- Also recover orphaned 'processing' rows whose lease expired (a
    -- worker crashed mid-call). Treat them as if they were pending — the
    -- worker about to take them is responsible for figuring out whether
    -- the prior attempt actually reached the POS or not. Adapters whose
    -- markOrderPaid is idempotent (Onslip /close is) can safely retry.
    orphaned as (
        select q.id
          from public.pos_update_queue q
         where q.status = 'processing'
           and q.leased_until is not null
           and q.leased_until < now()
         order by q.leased_until
         limit greatest(p_limit - (select count(*) from claimable), 0)
         for update skip locked
    ),
    to_claim as (
        select id from claimable
        union all
        select id from orphaned
    ),
    updated as (
        update public.pos_update_queue q
           set status       = 'processing',
               leased_until = now() + make_interval(secs => p_lease_seconds),
               updated_at   = now()
          where q.id in (select id from to_claim)
        returning q.*
    )
    select u.id, u.payment_id, u.restaurant_id, u.location_id,
           u.integration_id, u.external_location_id, u.external_order_id,
           u.action, u.payload, u.attempts
      from updated u
     order by u.next_attempt_at;
end;
$$;

comment on function public.claim_pos_update_queue_items(integer, integer) is
    'Atomically claim up to p_limit pending queue items. Uses FOR UPDATE SKIP LOCKED for safe parallel workers. Recovers orphaned processing rows whose lease has expired.';

revoke all on function public.claim_pos_update_queue_items(integer, integer) from public;
grant  execute on function public.claim_pos_update_queue_items(integer, integer) to service_role;

-- complete: row succeeded → status='done', clear lease.
create or replace function public.complete_pos_update_queue_item(p_id uuid)
    returns void
    language sql
    security definer
    set search_path = public
as $$
    update public.pos_update_queue
       set status        = 'done',
           leased_until  = null,
           last_error    = null,
           updated_at    = now()
     where id = p_id
       and status = 'processing';
$$;

comment on function public.complete_pos_update_queue_item(uuid) is
    'Mark a claimed queue item as done. No-op if the row was not in processing state (defensive).';

revoke all on function public.complete_pos_update_queue_item(uuid) from public;
grant  execute on function public.complete_pos_update_queue_item(uuid) to service_role;

-- fail: bump attempts, store error, schedule next attempt or finalise.
create or replace function public.fail_pos_update_queue_item(
        p_id                uuid,
        p_error             text,
        p_next_attempt_at   timestamptz,
        p_max_attempts      integer default 5
    )
    returns text   -- the resulting status: 'pending' or 'failed'
    language plpgsql
    security definer
    set search_path = public
as $$
declare
    v_attempts integer;
    v_status   text;
begin
    update public.pos_update_queue
       set attempts        = attempts + 1,
           last_error      = left(coalesce(p_error, ''), 1000),
           leased_until    = null,
           next_attempt_at = p_next_attempt_at,
           status          = case
                                when attempts + 1 >= p_max_attempts then 'failed'
                                else 'pending'
                             end,
           updated_at      = now()
     where id = p_id
       and status = 'processing'
    returning attempts, status
      into v_attempts, v_status;

    return coalesce(v_status, 'unchanged');
end;
$$;

comment on function public.fail_pos_update_queue_item(uuid, text, timestamptz, integer) is
    'Worker reports failure: bump attempts, set last_error, schedule retry or finalise as failed (after p_max_attempts).';

revoke all on function public.fail_pos_update_queue_item(uuid, text, timestamptz, integer) from public;
grant  execute on function public.fail_pos_update_queue_item(uuid, text, timestamptz, integer) to service_role;
