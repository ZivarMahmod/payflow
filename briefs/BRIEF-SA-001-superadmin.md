# BRIEF-SA-001: Superadmin + impersonation
Thinking: 🔴 Think hard

## Mål
Bygg superadmin-gränssnitt: ser alla tenants, sökbart, kan logga in som tenant i read-only support-läge.

## Kontext
- Superadmin = du + tekniska teamet.
- Egen path /admin-panel — separat från tenant-admin.
- Impersonate via signerad JWT, INTE localStorage (Corevo-anti-pattern).
- Alla impersonate-events loggas i audit_log.

## Berörda filer
- `apps/admin/src/app/(superadmin)/layout.tsx`
- `apps/admin/src/app/(superadmin)/tenants/page.tsx`
- `apps/admin/src/app/(superadmin)/tenants/[id]/page.tsx`
- `apps/admin/src/app/api/impersonate/route.ts`
- `packages/db/supabase/migrations/011_platform_staff.sql`

## Steg
1. Migration 011:
   - CREATE TABLE platform_staff (id, user_id fk auth.users, role text check in ('superadmin','support'), created_at)
   - CREATE TABLE audit_log (id, actor_user_id, action text, target_restaurant_id uuid, payload jsonb, created_at) om ej finns
2. Middleware: /(superadmin)/* kräver platform_staff-rad.
3. /tenants/page.tsx:
   - Lista alla restaurants
   - Sök på namn/org_number/slug
   - Stats per rad: senaste betalning, MRR, antal staff, antal reviews 7d
   - Klick → /tenants/[id]
4. /tenants/[id]/page.tsx:
   - Detail-vy: settings (read), staff (read), senaste payments (read), POS-status
   - Knapp "Logga in som denna restaurang (support-mode)"
5. /api/impersonate POST { restaurant_id }:
   - Validera platform_staff
   - Generera signerad JWT (Supabase JWT eller egen) med claims: super_user, target_restaurant_id, exp: 1h
   - Sätt som httpOnly cookie
   - INSERT audit_log { action: 'impersonate_start' }
6. Middleware känner igen impersonate-cookie, applicerar target_restaurant_id som RLS-kontext.
7. Read-only enforce: alla mutation-routes blockerar om impersonate_active=true.
8. UI-banner alltid synlig i support-mode: "🛡 SUPPORT MODE — visar som [Restaurant Name] — [Avsluta]".
9. Avsluta → DELETE cookie + INSERT audit_log { action: 'impersonate_end' }.
10. Commit: `feat(superadmin): tenants view + impersonation`.

## Verifiering
- [ ] Endast platform_staff kommer åt /(superadmin).
- [ ] Tenants-list visar alla med korrekt stats.
- [ ] Impersonate fungerar — visa som restaurant.
- [ ] Skrivning blockerad i support-mode.
- [ ] Banner alltid synlig.
- [ ] Audit-log har spår av varje impersonate.
- [ ] Cookie expirerar efter 1h.

## Anti-patterns
- ALDRIG localStorage för impersonate — knäckbart.
- ALDRIG skrivning i support-mode.
- INTE tidlös impersonation — max 1h.

## Kopplingar
Beror på: TA-001, SC-001.
