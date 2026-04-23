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

-- ─── 1 open order on table 1 ───────────────────────────────────────────────
-- Items jsonb shape matches packages/schemas/src/order.ts cachedOrderItemSchema.
-- Guest URL: http://localhost:5173/t/test-bistro/1?order=test-order-token-abc123
insert into public.orders_cache
    (id, restaurant_id, location_id, table_id,
     pos_order_id, pos_type, order_token,
     total, currency, items, status)
values (
    '44444444-4444-4444-4444-444444444401',
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222',
    '33333333-3333-3333-3333-333333333301',
    'SEED-001',
    'onslip',
    'test-order-token-abc123',
    485.00,
    'SEK',
    '[
      {"name":"Köttbullar","qty":2,"unitPrice":165,"lineTotal":330},
      {"name":"Öl 50cl","qty":2,"unitPrice":77.5,"lineTotal":155}
    ]'::jsonb,
    'open'
)
on conflict (id) do nothing;
