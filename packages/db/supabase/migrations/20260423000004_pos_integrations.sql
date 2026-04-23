-- 004_pos_integrations.sql — stores POS connection metadata per location
-- BRIEF-POS-001
--
-- One row per (restaurant_id, location_id, type). Credentials are stored
-- encrypted via Supabase Vault (pgsodium). The adapter layer asks Vault
-- for the plaintext only at request time, never caches it.
--
-- Anti-pattern reminder (from POS-001): no API keys in plaintext, ever.
-- The raw column is `credentials_encrypted` to make that loud.

-- Enable pgsodium / vault if not already. Supabase cloud has pgsodium
-- pre-installed but the vault schema is created lazily.
create extension if not exists pgsodium;

create table if not exists public.pos_integrations (
    id                    uuid primary key default gen_random_uuid(),
    restaurant_id         uuid not null references public.restaurants(id) on delete cascade,
    location_id           uuid not null references public.locations(id)   on delete cascade,
    type                  text not null check (type in ('onslip', 'caspeco', 'lightspeed')),
    credentials_encrypted text,        -- nullable for mocks; required before status flips to 'active'.
    external_location_id  text not null,
    status                text not null default 'paused'
        check (status in ('active', 'paused', 'error')),
    last_synced_at        timestamptz,
    last_error            text,
    poll_interval_seconds integer not null default 30 check (poll_interval_seconds >= 5),
    created_at            timestamptz not null default now(),
    updated_at            timestamptz not null default now(),
    unique (restaurant_id, location_id, type)
);

comment on table public.pos_integrations is
    'One POS connection per (restaurant, location, type). Credentials stay in Vault; this table holds only the opaque pointer + operational metadata.';
comment on column public.pos_integrations.credentials_encrypted is
    'Ciphertext or a Vault secret id. NEVER a plaintext API key.';
comment on column public.pos_integrations.external_location_id is
    'The id Onslip/Caspeco uses internally for this location. Opaque to us.';
comment on column public.pos_integrations.status is
    'active = scheduler will sync; paused = scheduler skips; error = persistent failure, needs human attention.';
comment on column public.pos_integrations.poll_interval_seconds is
    'Per-integration override; scheduler uses this to avoid hammering smaller POS tenants.';

create index if not exists pos_integrations_restaurant_idx
    on public.pos_integrations (restaurant_id);
create index if not exists pos_integrations_active_idx
    on public.pos_integrations (status) where status = 'active';

drop trigger if exists pos_integrations_set_updated_at on public.pos_integrations;
create trigger pos_integrations_set_updated_at
    before update on public.pos_integrations
    for each row execute function public.set_updated_at();

-- ─── RLS ────────────────────────────────────────────────────────────────────
alter table public.pos_integrations enable row level security;
revoke all on public.pos_integrations from anon, authenticated;
grant select, insert, update, delete on public.pos_integrations to authenticated;

drop policy if exists pos_integrations_select_staff on public.pos_integrations;
drop policy if exists pos_integrations_modify_owners on public.pos_integrations;

create policy pos_integrations_select_staff on public.pos_integrations
    for select
    to authenticated
    using (restaurant_id in (select public.get_staff_restaurants()));

-- Only owners can create / modify / delete integrations. Managers see but
-- don't touch — rotating keys is an owner-level action.
create policy pos_integrations_insert_owners on public.pos_integrations
    for insert
    to authenticated
    with check (public.get_staff_role(restaurant_id) = 'owner');

create policy pos_integrations_update_owners on public.pos_integrations
    for update
    to authenticated
    using      (public.get_staff_role(restaurant_id) = 'owner')
    with check (public.get_staff_role(restaurant_id) = 'owner');

create policy pos_integrations_delete_owners on public.pos_integrations
    for delete
    to authenticated
    using (public.get_staff_role(restaurant_id) = 'owner');

-- The scheduler runs server-side with service-role, which bypasses RLS.
-- Staff SELECT is for the admin console to show "POS: connected / error".

-- Credentials access: the adapter does NOT read credentials_encrypted
-- directly. It calls a SECURITY DEFINER RPC (get_pos_credentials) which
-- Vault-decrypts if the caller is service-role. That keeps the plaintext
-- off the wire to anything downstream of RLS.

create or replace function public.get_pos_credentials(p_integration_id uuid)
    returns text
    language plpgsql
    security definer
    stable
    set search_path = public
as $$
declare
    v_ciphertext text;
begin
    -- Only service-role can call this. auth.role() returns 'service_role'
    -- when the connection is opened with SUPABASE_SERVICE_KEY.
    if coalesce(auth.role(), '') <> 'service_role' then
        raise exception 'get_pos_credentials: forbidden (service role only)';
    end if;

    select credentials_encrypted
      into v_ciphertext
      from public.pos_integrations
     where id = p_integration_id;

    -- In mock mode the adapter never calls this — USE_MOCK_ONSLIP=true
    -- short-circuits before it would. Real mode: decrypt via Vault here
    -- once keys are in place (TODO when we leave mock mode).
    return v_ciphertext;
end;
$$;

comment on function public.get_pos_credentials(uuid) is
    'Returns the (decrypted) POS credentials for an integration. Service-role only. Mock mode returns the ciphertext column unchanged.';

revoke all on function public.get_pos_credentials(uuid) from public;
grant  execute on function public.get_pos_credentials(uuid) to service_role;
