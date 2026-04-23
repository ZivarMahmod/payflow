-- 006_payments_swish.sql — Swish-specific columns on payments + helpers
-- BRIEF-API-003
--
-- DB-002 shipped the base `payments` table. Swish's private-QR flow needs
-- three extra columns:
--
--   * `swish_reference` — short human-readable code shown in the Swish
--     app's payment dialog. Generated per payment. Useful for the
--     restaurant when reconciling manually.
--   * `swish_message`   — the free-text "meddelande" pre-filled in the
--     Swish deep link, typically containing the order token prefix.
--   * `expires_at`      — hard cut-off (now() + 3 min for Swish). When
--     `now() > expires_at` and `status='pending'`, a cron job moves the
--     row to `status='expired'` so the guest UI stops polling.
--
-- Also introduces two helpers used by the API layer:
--
--   * `public.expire_pending_payments()` — bulk update of pending payments
--     past their `expires_at`. Idempotent; cron-friendly.
--
--   * `public.mark_order_paid_if_funded(p_order_cache_id uuid)` — checks
--     whether completed payments against the order_cache row sum to at
--     least the bill total, and if so flips `orders_cache.status='paid'`
--     and stamps `paid_at`. Called at the tail of every payment-completion
--     path. SECURITY DEFINER because completion runs as service_role.
--
-- Trigger: after update on payments when status transitions to 'completed',
-- we auto-run mark_order_paid_if_funded for that row's order_cache_id.
-- Explicit trigger keeps the API route thin — if we later add Stripe
-- completion via webhook the same trigger fires without touching route code.

-- ─── payments: Swish-specific columns ──────────────────────────────────────
alter table public.payments
    add column if not exists swish_reference text,
    add column if not exists swish_message   text,
    add column if not exists expires_at      timestamptz;

comment on column public.payments.swish_reference is
    'Short per-payment reference code rendered in the Swish app dialog. Human-readable, not a secret.';
comment on column public.payments.swish_message is
    'Pre-filled "meddelande" in the Swish deep link. Typically contains the order-token prefix for restaurant reconciliation.';
comment on column public.payments.expires_at is
    'Hard cut-off for a pending payment. Past this, the expire cron flips status → expired.';

-- Partial index so the cron sweeping pending-and-expiring payments is fast.
create index if not exists payments_pending_expires_idx
    on public.payments (expires_at)
    where status = 'pending';

-- ─── expire_pending_payments ───────────────────────────────────────────────
-- Invoked every ~30s by the API's payment-expirer scheduler. Idempotent.
-- Returns the number of rows transitioned so logs can track it.
create or replace function public.expire_pending_payments()
    returns integer
    language plpgsql
    security definer
    set search_path = public
as $$
declare
    v_count integer;
begin
    update public.payments
        set status = 'expired',
            updated_at = now()
        where status = 'pending'
          and expires_at is not null
          and expires_at < now();

    get diagnostics v_count = row_count;
    return v_count;
end;
$$;

comment on function public.expire_pending_payments() is
    'Bulk-expire payments past their expires_at. Cron-friendly. Returns number of rows transitioned.';

revoke all on function public.expire_pending_payments() from public;
grant  execute on function public.expire_pending_payments() to service_role;

-- ─── mark_order_paid_if_funded ─────────────────────────────────────────────
-- When a payment completes, check if the sum of completed payments on the
-- same order_cache row is >= total. If so, flip the order to paid + stamp
-- paid_at. If not (partial split), leave status alone — the remaining
-- guests still need to pay. Returns TRUE iff the order transitioned.
create or replace function public.mark_order_paid_if_funded(p_order_cache_id uuid)
    returns boolean
    language plpgsql
    security definer
    set search_path = public
as $$
declare
    v_total     numeric(10, 2);
    v_paid_sum  numeric(10, 2);
    v_status    text;
begin
    select status, total
        into v_status, v_total
        from public.orders_cache
        where id = p_order_cache_id
        for update;

    if v_status is null then
        return false;             -- row doesn't exist; nothing to do
    end if;

    if v_status = 'paid' or v_status = 'closed' then
        return false;             -- already final
    end if;

    select coalesce(sum(amount), 0)
        into v_paid_sum
        from public.payments
        where order_cache_id = p_order_cache_id
          and status = 'completed';

    if v_paid_sum >= v_total then
        update public.orders_cache
            set status = 'paid',
                paid_at = now()
            where id = p_order_cache_id;
        return true;
    end if;

    return false;
end;
$$;

comment on function public.mark_order_paid_if_funded(uuid) is
    'Flip orders_cache.status to paid iff sum(completed payments) >= total. Idempotent. Returns true iff the order transitioned this call.';

revoke all on function public.mark_order_paid_if_funded(uuid) from public;
grant  execute on function public.mark_order_paid_if_funded(uuid) to service_role;

-- ─── Trigger: auto-flip order on payment completion ────────────────────────
-- Keeps the API route thin. Anything that sets payments.status='completed'
-- (route handler, future Stripe webhook, manual admin action) triggers the
-- same funding check.
create or replace function public.payments_on_complete()
    returns trigger
    language plpgsql
    security definer
    set search_path = public
as $$
begin
    if new.status = 'completed'
       and (old.status is distinct from 'completed') then
        -- Stamp paid_at if the caller forgot.
        if new.paid_at is null then
            new.paid_at := now();
        end if;
        perform public.mark_order_paid_if_funded(new.order_cache_id);
    end if;
    return new;
end;
$$;

drop trigger if exists payments_on_complete_trigger on public.payments;
create trigger payments_on_complete_trigger
    before update on public.payments
    for each row execute function public.payments_on_complete();

comment on function public.payments_on_complete() is
    'Stamps paid_at on completion + runs mark_order_paid_if_funded. Runs BEFORE UPDATE so paid_at mutation is persisted in the same row.';
