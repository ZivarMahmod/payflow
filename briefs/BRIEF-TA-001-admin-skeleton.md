# BRIEF-TA-001: Admin-skeleton + auth
Thinking: 🟡 Think

## Mål
Skapa apps/admin — Next.js 15 med Supabase Auth (magic link). Sidebar med rutter: Dashboard, Feedback, Settings.

## Kontext
- Admin är PASSIV — inte ett dagligt verktyg. Personalen rör den ALDRIG.
- Auth via magic link initialt (BankID senare).
- Role-gating via Supabase Auth + staff-tabellen.

## Berörda filer
- `apps/admin/package.json`
- `apps/admin/next.config.mjs`
- `apps/admin/src/app/layout.tsx`
- `apps/admin/src/app/(auth)/login/page.tsx`
- `apps/admin/src/app/(dashboard)/layout.tsx`
- `apps/admin/src/app/(dashboard)/page.tsx`
- `apps/admin/src/lib/supabase/server.ts`
- `apps/admin/src/lib/supabase/client.ts`
- `apps/admin/src/middleware.ts`

## Steg
1. `pnpm create next-app apps/admin` → App Router + TypeScript + Tailwind.
2. Installera @supabase/ssr, @flowpay/ui, @flowpay/schemas.
3. lib/supabase/server.ts + client.ts enligt Supabase Next.js-guide.
4. middleware.ts: skydda /(dashboard)/* — redirect till /login om ej auth.
5. login/page.tsx: magic link-form (email-input + "Skicka magisk länk").
6. (dashboard)/layout.tsx:
   - Sidebar: Dashboard (📊), Feedback (💬), Settings (⚙️), logout-knapp
   - Rendera staff-namn + restaurant-namn högst upp
7. (dashboard)/page.tsx — placeholder dashboard (tomt, kommer i TA-002).
8. Hämta staff-rad → bestämma restaurant_id + role.
9. Role-gating: staff ser inte Settings (endast owner/manager).
10. Commit: `feat(admin): skeleton with auth`.

## Verifiering
- [ ] Magic link funkar lokalt (Mailpit på localhost:54324).
- [ ] Login → redirect till /dashboard med korrekt restaurant-kontext.
- [ ] Logout funkar.
- [ ] Unauthed → /login.
- [ ] Role-gating: staff ser inte Settings-länk.

## Anti-patterns
- ALDRIG service_role i klientkomponenter.
- INTE useState för session — Supabase Auth-hook.

## Kopplingar
Beror på: SC-001, UI-001.
