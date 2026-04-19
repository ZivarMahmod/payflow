# BRIEF-SC-001: RLS-policies på alla tenant-tabeller
Thinking: 🔴 Think hard

## Mål
Aktivera RLS på alla tenant-specifika tabeller. Skriv policies så att staff bara ser data från sin egen restaurant. Service-role bypassar (server-side only).

## Kontext
- RLS är grundplåten i multi-tenancy. Missar vi en policy → en restaurang kan se en annans data.
- Gäst-PWA använder INTE auth — den använder order_token-URL:er. Anon-access via specifika RPC:er.
- Regel: staff (auth.uid()) ser bara rader där restaurant_id matchar deras staff-rad.

## Berörda filer
- `packages/db/supabase/migrations/002_rls_policies.sql`

## Steg
1. ALTER TABLE … ENABLE ROW LEVEL SECURITY för restaurants, locations, tables, staff.
2. Skapa SECURITY DEFINER-funktion `get_staff_restaurants()`:
   ```sql
   CREATE OR REPLACE FUNCTION public.get_staff_restaurants()
   RETURNS SETOF uuid LANGUAGE sql SECURITY DEFINER STABLE
   SET search_path = public AS $$
     SELECT restaurant_id FROM staff WHERE user_id = auth.uid();
   $$;
   ```
3. Policy för restaurants (SELECT): id IN (SELECT get_staff_restaurants()).
4. Samma pattern för locations, tables, staff.
5. För staff INSERT/UPDATE/DELETE: owner kan allt inom sin restaurant, manager kan INSERT/UPDATE staff/staff (inte owner), staff kan bara SELECT sig själv.
6. Test-scenarion lokalt:
   - Skapa 2 test-restaurants, 2 staff-users
   - Logga in som A → ser bara A
   - Service-role-client kan se båda
7. Commit: `feat(db): RLS on all tenant tables`.

## Verifiering
- [ ] RLS ENABLED på alla 4 tabellerna.
- [ ] Test: staff A queryar restaurants → ser bara A, ej B.
- [ ] Service_role kan se allt.
- [ ] Inga infinite recursion-fel.
- [ ] get_staff_restaurants() returnerar rätt ids.

## Anti-patterns
- ALDRIG direkt staff-uppslag i policies utan SECURITY DEFINER → recursion.
- Glöm INTE INSERT/UPDATE/DELETE — SELECT räcker inte.
- Service_role-keyen ALDRIG i klientkod.

## Kopplingar
Beror på: DB-001.

## Rollback
- DROP POLICY för alla skapade.
- ALTER TABLE … DISABLE ROW LEVEL SECURITY.
- Ta bort migration-filen.
