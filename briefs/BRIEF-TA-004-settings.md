# BRIEF-TA-004: Settings (Swish, dricks, Stripe-onboarding, team)
Thinking: 🟡 Think

## Mål
Settings-sida för restauranginställningar: Swish-nummer, dricks-default, Stripe-onboarding, team-hantering, POS-integration-status.

## Kontext
- Endast owner/manager ser denna.
- Stripe-onboarding är kritisk — utan den kan restaurangen inte ta kort.

## Berörda filer
- `apps/admin/src/app/(dashboard)/settings/page.tsx`
- `apps/admin/src/app/(dashboard)/settings/payments/page.tsx`
- `apps/admin/src/app/(dashboard)/settings/team/page.tsx`
- `apps/admin/src/app/(dashboard)/settings/integrations/page.tsx`
- `apps/admin/src/app/(dashboard)/settings/branding/page.tsx`

## Steg
1. settings/page.tsx — landing med tabs/links till sub-sidor.
2. /settings/payments:
   - Swish-nummer-input + spara
   - Dricks-default % + tip_options-config
   - Stripe Connect-status: "Inte onboardad" → knapp "Anslut Stripe" (createOnboardingLink från API-005). "Onboardad" → "✓ Aktivt" + redigera-länk till Stripe Dashboard.
3. /settings/team:
   - Lista staff (email, role, lägg till/ta bort)
   - Owner kan invitera nya via email magic link
   - Roll-edit (manager kan ändra staff↔manager, owner kan ändra allt)
4. /settings/integrations:
   - POS-status: "Onslip — ✓ Aktivt — senast synkad: 2 sek sedan" eller "❌ Fel: API-key ogiltig"
   - Manuell "synca nu"-knapp
   - Pause/resume-toggle
5. /settings/branding:
   - Logo-uppladdning (Supabase Storage)
   - Google Place ID (för review-redirect)
   - Restaurant-färg (för QR-design senare)
6. Form-validering med Zod + react-hook-form.
7. Commit: `feat(admin): settings pages`.

## Verifiering
- [ ] Spara Swish-nummer → reflekteras i gäst-flöde.
- [ ] Stripe-onboarding-länk genereras och leder till Stripe.
- [ ] Team-add → ny user kan logga in via magic link.
- [ ] POS-status uppdaterar realtid.
- [ ] Logo-uppladdning + visning fungerar.

## Anti-patterns
- ALDRIG visa Stripe-secret-keys.
- Validera ALDRIG bara client-side — server-side i RPC också.

## Kopplingar
Beror på: TA-001, API-005, POS-001.
