-- seed.sql — minimal development seed
-- Safe to run multiple times: uses ON CONFLICT DO NOTHING keyed on natural keys.
--
-- Data intentionally deterministic (fixed UUIDs + qr_tokens) so the guest-PWA
-- can be demo'd with hard-coded links without re-seeding.

-- ─── 1 test restaurant ─────────────────────────────────────────────────────
insert into public.restaurants (id, slug, name, org_number, swish_number)
values (
    '11111111-1111-1111-1111-111111111111',
    'test-bistro',
    'Test Bistro',
    '556677-8899',
    '1234567890'
)
on conflict (slug) do nothing;

-- ─── 1 location ────────────────────────────────────────────────────────────
insert into public.locations (id, restaurant_id, address, city, postal_code, timezone)
values (
    '22222222-2222-2222-2222-222222222222',
    '11111111-1111-1111-1111-111111111111',
    'Testgatan 1',
    'Stockholm',
    '11122',
    'Europe/Stockholm'
)
on conflict (id) do nothing;

-- ─── 3 tables ──────────────────────────────────────────────────────────────
insert into public.tables (id, location_id, table_number, qr_token, active)
values
    ('33333333-3333-3333-3333-333333333301',
     '22222222-2222-2222-2222-222222222222',
     '1',
     'demo0000000000000000000000000001',
     true),
    ('33333333-3333-3333-3333-333333333302',
     '22222222-2222-2222-2222-222222222222',
     '2',
     'demo0000000000000000000000000002',
     true),
    ('33333333-3333-3333-3333-333333333303',
     '22222222-2222-2222-2222-222222222222',
     '3',
     'demo0000000000000000000000000003',
     true)
on conflict (id) do nothing;
