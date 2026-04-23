-- 009_reviews.sql — Guest reviews (1:1 with payments)
-- BRIEF-DB-003
--
-- Rule: only the guest who successfully paid can leave a review. Enforced
-- by requiring a valid payment_id with status='completed' in the anon-
-- callable SECURITY DEFINER RPC `submit_review`. Direct anon INSERT on
-- the table is forbidden.
--
-- Guests may choose to:
--   * Give consent for their text to be published to Google (google_consent).
--     When the API subsequently pushes to Google Business Profile it stamps
--     published_to_google_at for audit.
--   * Leave an email / phone for the restaurant to reply (staff sees these).
--     Phone is kept so low-rating reviews can be addressed via SMS.
--
-- Staff of the owning restaurant can read all reviews tied to payments at
-- their restaurant and update the reply fields (replied_at, reply_text)
-- only. All other columns are immutable once inserted.

-- ─── reviews table ──────────────────────────────────────────────────────────
create table if not exists public.reviews (
    id                        uuid primary key default gen_random_uuid(),
    payment_id                uuid not null unique references public.payments(id)   on delete cascade,
    restaurant_id             uuid not null        references public.restaurants(id) on delete cascade,
    rating                    integer not null check (rating between 1 and 5),
    text                      text,
    guest_email               text,
    guest_phone               text,
    google_consent            boolean not null default false,
    published_to_google_at    timestamptz,
    replied_at                timestamptz,
    reply_text                text,
    created_at                timestamptz not null default now()
);

comment on table  public.reviews is
    'Guest reviews. 1:1 with payments — unique (payment_id). Only completed payments can have a review.';
comment on column public.reviews.restaurant_id is
    'Denormalised from payments.restaurant_id for efficient RLS + indexing. Enforced by submit_review RPC.';
comment on column public.reviews.rating is
    '1..5. Enforced by CHECK constraint.';
comment on column public.reviews.guest_phone is
    'Optional. Kept so staff can reach out via SMS on low ratings.';
comment on column public.reviews.google_consent is
    'Guest explicitly opted in to publishing this text on Google.';
comment on column public.reviews.published_to_google_at is
    'Audit stamp — non-null iff review was pushed to Google Business Profile.';
comment on column public.reviews.replied_at is
    'Audit stamp set by staff when they reply.';
comment on column public.reviews.reply_text is
    'Staff reply (internal or Google — depends on whether review was published).';

create index if not exists reviews_restaurant_created_idx
    on public.reviews (restaurant_id, created_at desc);

create index if not exists reviews_rating_created_idx
    on public.reviews (rating, created_at desc);

-- Partial index for the "unreplied" staff queue.
create index if not exists reviews_unreplied_idx
    on public.reviews (restaurant_id, created_at desc)
    where replied_at is null;

-- ─── RLS ────────────────────────────────────────────────────────────────────
alter table public.reviews enable row level security;

revoke all on public.reviews from anon, authenticated;
grant  select, update on public.reviews to authenticated;

-- Staff of the owning restaurant can read all reviews.
drop policy if exists reviews_select_staff on public.reviews;
create policy reviews_select_staff on public.reviews
    for select
    to authenticated
    using (restaurant_id in (select public.get_staff_restaurants()));

-- Staff can ONLY update replied_at + reply_text. Enforced by gating on the
-- original columns being unchanged via the WITH CHECK clause below. The
-- actual column-level immutability is expressed as: if any protected field
-- is mutated, the check fails.
drop policy if exists reviews_update_staff_reply on public.reviews;
create policy reviews_update_staff_reply on public.reviews
    for update
    to authenticated
    using      (restaurant_id in (select public.get_staff_restaurants()))
    with check (restaurant_id in (select public.get_staff_restaurants()));

-- No staff INSERT / DELETE policies. All inserts go through the anon RPC
-- below; deletes are only possible via the payments cascade (payment gone
-- => review gone) or via service_role.

-- Protect the immutable columns with a trigger (RLS can't express "only
-- these two columns may change"). The update policy above scopes to the
-- restaurant; this trigger scopes which columns can move.
create or replace function public.reviews_enforce_reply_only()
    returns trigger
    language plpgsql
    security definer
    set search_path = public
as $$
begin
    -- Service-role bypass: we sometimes need to stamp published_to_google_at
    -- from the API after pushing to Google. Service-role auth.uid() is null.
    if auth.uid() is null then
        return new;
    end if;

    -- Protected fields — staff cannot modify these.
    if new.id                     is distinct from old.id                     or
       new.payment_id             is distinct from old.payment_id             or
       new.restaurant_id          is distinct from old.restaurant_id          or
       new.rating                 is distinct from old.rating                 or
       new.text                   is distinct from old.text                   or
       new.guest_email            is distinct from old.guest_email            or
       new.guest_phone            is distinct from old.guest_phone            or
       new.google_consent         is distinct from old.google_consent         or
       new.published_to_google_at is distinct from old.published_to_google_at or
       new.created_at             is distinct from old.created_at
    then
        raise exception 'reviews: staff may only update replied_at and reply_text'
            using errcode = '42501';
    end if;

    return new;
end;
$$;

comment on function public.reviews_enforce_reply_only() is
    'Enforces staff-update immutability: only replied_at + reply_text may change via authenticated role.';

drop trigger if exists reviews_enforce_reply_only_trigger on public.reviews;
create trigger reviews_enforce_reply_only_trigger
    before update on public.reviews
    for each row execute function public.reviews_enforce_reply_only();

-- ─── Anon RPC: submit_review ───────────────────────────────────────────────
-- The guest PWA is anon. It submits a review exclusively through this
-- SECURITY DEFINER RPC which:
--   1. Validates payment exists + status='completed'.
--   2. Reads restaurant_id from the payment (anti-tamper — guest can't pick).
--   3. Inserts the review. The UNIQUE constraint on payment_id is the
--      dedup: second submission on the same payment → 23505.
create or replace function public.submit_review(
        payment_id_param uuid,
        rating_param     integer,
        text_param       text,
        email_param      text,
        phone_param      text,
        consent_param    boolean
    )
    returns uuid
    language plpgsql
    security definer
    set search_path = public
as $$
declare
    v_restaurant_id uuid;
    v_status        text;
    v_new_id        uuid;
begin
    if rating_param is null or rating_param < 1 or rating_param > 5 then
        raise exception 'submit_review: rating must be between 1 and 5'
            using errcode = '22023';
    end if;

    select p.restaurant_id, p.status
        into v_restaurant_id, v_status
        from public.payments p
        where p.id = payment_id_param;

    if v_restaurant_id is null then
        raise exception 'submit_review: payment % not found', payment_id_param
            using errcode = '02000';
    end if;

    if v_status is distinct from 'completed' then
        raise exception 'submit_review: payment % is not completed (status=%)',
            payment_id_param, v_status
            using errcode = '22023';
    end if;

    insert into public.reviews (
        payment_id,
        restaurant_id,
        rating,
        text,
        guest_email,
        guest_phone,
        google_consent
    ) values (
        payment_id_param,
        v_restaurant_id,
        rating_param,
        nullif(text_param,  ''),
        nullif(email_param, ''),
        nullif(phone_param, ''),
        coalesce(consent_param, false)
    )
    returning id into v_new_id;

    return v_new_id;
end;
$$;

comment on function public.submit_review(uuid, integer, text, text, text, boolean) is
    'Anon-safe review submission. Validates payment.status=completed, derives restaurant_id from the payment, inserts a reviews row. UNIQUE(payment_id) dedups.';

revoke all on function public.submit_review(uuid, integer, text, text, text, boolean) from public;
grant  execute on function public.submit_review(uuid, integer, text, text, text, boolean) to anon, authenticated;
