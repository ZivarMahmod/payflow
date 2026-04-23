-- 002_rls_policies.sql — FlowPay RLS on multi-tenant tables
-- BRIEF-SC-001 (🔴 Think hard — foundational security)
--
-- Multi-tenancy isolation model:
--   * Every tenant-scoped table has a restaurant_id (direct or via FK chain).
--   * Authenticated staff can only see rows belonging to restaurants they
--     are in the `staff` table for.
--   * Service-role (server-side key) bypasses RLS entirely — Supabase
--     applies service_role as a superuser for its policy checks.
--   * Guest PWA does NOT authenticate. It uses opaque `order_token` /
--     `qr_token` URLs. Guest access happens through SECURITY DEFINER RPCs
--     that filter to a single row by token — NOT through direct table
--     SELECT via anon role. The anon policies below intentionally grant
--     nothing; DB-002 adds `get_order_by_token` as the single doorway.
--
-- Anti-recursion: a policy on `staff` that queries `staff` re-enters the
-- same check and deadlocks. We break the cycle with a SECURITY DEFINER
-- function `get_staff_restaurants()` that runs as the function owner
-- (postgres) and is immune to the caller's RLS. Policies then call this
-- function instead of querying `staff` directly.

-- ─── Enable RLS ─────────────────────────────────────────────────────────────
alter table public.restaurants enable row level security;
alter table public.locations   enable row level security;
alter table public.tables      enable row level security;
alter table public.staff       enable row level security;

-- Belt-and-braces: revoke default grants. Anon/authenticated get rows
-- only through explicit policies.
revoke all on public.restaurants from anon, authenticated;
revoke all on public.locations   from anon, authenticated;
revoke all on public.tables      from anon, authenticated;
revoke all on public.staff       from anon, authenticated;

-- Restore the sane defaults. RLS then narrows the visible rows.
grant select, insert, update, delete on public.restaurants to authenticated;
grant select, insert, update, delete on public.locations   to authenticated;
grant select, insert, update, delete on public.tables      to authenticated;
grant select, insert, update, delete on public.staff       to authenticated;

-- ─── SECURITY DEFINER helpers ──────────────────────────────────────────────
-- Returns the set of restaurant_ids the current auth.uid() is staff for.
-- Must be STABLE (never modifies data, idempotent within a statement) so
-- the planner can inline / cache it.
create or replace function public.get_staff_restaurants()
    returns setof uuid
    language sql
    security definer
    stable
    set search_path = public
as $$
    select restaurant_id
    from public.staff
    where user_id = auth.uid();
$$;

comment on function public.get_staff_restaurants() is
    'SECURITY DEFINER: returns restaurant_ids the current auth.uid() is staff for. Used in RLS policies to avoid recursion.';

-- Role-of-current-user helper — used for staff admin rules.
create or replace function public.get_staff_role(p_restaurant_id uuid)
    returns text
    language sql
    security definer
    stable
    set search_path = public
as $$
    select role
    from public.staff
    where user_id = auth.uid() and restaurant_id = p_restaurant_id
    limit 1;
$$;

comment on function public.get_staff_role(uuid) is
    'SECURITY DEFINER: returns the current user''s role for a given restaurant, or NULL.';

-- Lock down who can call helpers.
revoke all on function public.get_staff_restaurants()      from public;
revoke all on function public.get_staff_role(uuid)         from public;
grant  execute on function public.get_staff_restaurants() to authenticated;
grant  execute on function public.get_staff_role(uuid)    to authenticated;

-- ─── restaurants policies ───────────────────────────────────────────────────
drop policy if exists restaurants_select_staff   on public.restaurants;
drop policy if exists restaurants_update_owners  on public.restaurants;
drop policy if exists restaurants_insert_none    on public.restaurants;
drop policy if exists restaurants_delete_none    on public.restaurants;

create policy restaurants_select_staff on public.restaurants
    for select
    to authenticated
    using (id in (select public.get_staff_restaurants()));

create policy restaurants_update_owners on public.restaurants
    for update
    to authenticated
    using  (public.get_staff_role(id) = 'owner')
    with check (public.get_staff_role(id) = 'owner');

-- No INSERT/DELETE for anyone via RLS. Service-role bypasses and does the
-- creation during onboarding — SA-001 handles that flow.

-- ─── locations policies ────────────────────────────────────────────────────
drop policy if exists locations_select_staff         on public.locations;
drop policy if exists locations_insert_owners_mgrs   on public.locations;
drop policy if exists locations_update_owners_mgrs   on public.locations;
drop policy if exists locations_delete_owners        on public.locations;

create policy locations_select_staff on public.locations
    for select
    to authenticated
    using (restaurant_id in (select public.get_staff_restaurants()));

create policy locations_insert_owners_mgrs on public.locations
    for insert
    to authenticated
    with check (public.get_staff_role(restaurant_id) in ('owner', 'manager'));

create policy locations_update_owners_mgrs on public.locations
    for update
    to authenticated
    using      (public.get_staff_role(restaurant_id) in ('owner', 'manager'))
    with check (public.get_staff_role(restaurant_id) in ('owner', 'manager'));

create policy locations_delete_owners on public.locations
    for delete
    to authenticated
    using (public.get_staff_role(restaurant_id) = 'owner');

-- ─── tables policies ───────────────────────────────────────────────────────
-- tables belong to a location → join back to restaurants via locations.
drop policy if exists tables_select_staff       on public.tables;
drop policy if exists tables_insert_staff       on public.tables;
drop policy if exists tables_update_staff       on public.tables;
drop policy if exists tables_delete_owners      on public.tables;

create policy tables_select_staff on public.tables
    for select
    to authenticated
    using (exists (
        select 1 from public.locations l
        where l.id = tables.location_id
          and l.restaurant_id in (select public.get_staff_restaurants())
    ));

create policy tables_insert_staff on public.tables
    for insert
    to authenticated
    with check (exists (
        select 1 from public.locations l
        where l.id = tables.location_id
          and public.get_staff_role(l.restaurant_id) in ('owner', 'manager', 'staff')
    ));

create policy tables_update_staff on public.tables
    for update
    to authenticated
    using (exists (
        select 1 from public.locations l
        where l.id = tables.location_id
          and public.get_staff_role(l.restaurant_id) in ('owner', 'manager', 'staff')
    ))
    with check (exists (
        select 1 from public.locations l
        where l.id = tables.location_id
          and public.get_staff_role(l.restaurant_id) in ('owner', 'manager', 'staff')
    ));

create policy tables_delete_owners on public.tables
    for delete
    to authenticated
    using (exists (
        select 1 from public.locations l
        where l.id = tables.location_id
          and public.get_staff_role(l.restaurant_id) = 'owner'
    ));

-- ─── staff policies ────────────────────────────────────────────────────────
-- Core rules:
--   * SELECT: staff of restaurant X can see all staff rows of X (so they
--     know who else is on their team).
--   * INSERT: owners can add anyone; managers can add manager/staff roles
--     but NOT owner.
--   * UPDATE: owners can change anyone's role; managers can modify
--     non-owner rows.
--   * DELETE: only owners.
--   * A user can ALWAYS see their own staff row (even without being on
--     the staff list of that restaurant — covers fresh onboarding).
drop policy if exists staff_select_team              on public.staff;
drop policy if exists staff_select_self              on public.staff;
drop policy if exists staff_insert_owners            on public.staff;
drop policy if exists staff_insert_managers_limited  on public.staff;
drop policy if exists staff_update_owners            on public.staff;
drop policy if exists staff_update_managers_limited  on public.staff;
drop policy if exists staff_delete_owners            on public.staff;

create policy staff_select_team on public.staff
    for select
    to authenticated
    using (restaurant_id in (select public.get_staff_restaurants()));

-- Self-row fallback for users whose staff row is the only one they can see.
create policy staff_select_self on public.staff
    for select
    to authenticated
    using (user_id = auth.uid());

create policy staff_insert_owners on public.staff
    for insert
    to authenticated
    with check (public.get_staff_role(restaurant_id) = 'owner');

-- Managers can add manager/staff but not owner.
create policy staff_insert_managers_limited on public.staff
    for insert
    to authenticated
    with check (
        public.get_staff_role(restaurant_id) = 'manager'
        and role in ('manager', 'staff')
    );

create policy staff_update_owners on public.staff
    for update
    to authenticated
    using      (public.get_staff_role(restaurant_id) = 'owner')
    with check (public.get_staff_role(restaurant_id) = 'owner');

-- Managers can update manager/staff rows but not owner rows.
-- (Using `role` on BOTH using + with-check covers both current state and
-- the post-update state.)
create policy staff_update_managers_limited on public.staff
    for update
    to authenticated
    using      (public.get_staff_role(restaurant_id) = 'manager' and role <> 'owner')
    with check (public.get_staff_role(restaurant_id) = 'manager' and role in ('manager', 'staff'));

create policy staff_delete_owners on public.staff
    for delete
    to authenticated
    using (public.get_staff_role(restaurant_id) = 'owner');
