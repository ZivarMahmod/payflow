# Mock-strategi — så Cowork aldrig fastnar på externa parter

Alla externa beroenden mockas så Cowork kan bygga end-to-end utan att vänta på Stripe live-keys, Onslip prod-API, Caspeco OAuth-godkännande eller Swish Handel-avtal.

**Princip:** Riktig kod skrivs alltid. Kod kallar adapter-interface. Adapter har två implementationer: `real` och `mock`. Switching via env-variabel.

```typescript
// Exempel
const provider = process.env.USE_MOCK_ONSLIP === 'true'
  ? new OnslipMockAdapter()
  : new OnslipAdapter();
```

---

## 1. Onslip POS — `USE_MOCK_ONSLIP=true`

### Mock-implementation
`packages/pos-adapters/src/onslip/mock.ts` — implementerar samma `POSProvider`-interface men returnerar in-memory data.

### Mock-data
- 3 fake-restaurants med 5 bord vardera
- Slumpmässiga öppna notor (1-3 items: "Husets öl", "Pasta", "Tiramisu")
- Belopp 150-800 kr
- Notor "öppnas" och "stängs" via test-endpoint `/test/mock-onslip/create-order`

### Test-endpoints (endast i dev)
```
POST /test/mock-onslip/create-order { restaurantId, tableNumber, items[] }
POST /test/mock-onslip/close-order  { externalOrderId }
GET  /test/mock-onslip/state
```

### När verklig Onslip kopplas in
- Zivar får sandbox-credentials → läggs i `.env.local` 
- Sätter `USE_MOCK_ONSLIP=false`
- Allt annat fungerar identiskt

---

## 2. Caspeco POS — `USE_MOCK_CASPECO=true`

Samma pattern som Onslip. Mock-adapter med slumpmässiga notor.

OAuth-flödet mockas också — endpoint `/integrations/caspeco/auth` returnerar en fake-redirect till `/integrations/caspeco/callback?code=mock_code` som auto-completar.

---

## 3. Swish — `USE_MOCK_SWISH=true`

### Mock-flöde
`packages/payments/src/swish/mock.ts`:
- `generateSwishUrl()` returnerar `swish://mock?payment_id=X` (öppnar inget riktigt)
- QR-data-URL renderas som vanlig QR med samma URL
- `confirmPayment(paymentId)` finns som test-endpoint

### Test-flöde i gäst-PWA
- Gästen ser QR-koden
- Istället för att öppna Swish: extra knapp "🧪 Bekräfta som betald (mock)" syns när `VITE_USE_MOCK_SWISH=true`
- Knappen anropar `/test/mock-swish/confirm` → triggar samma webhook-flow som riktig Swish

### När riktigt Swish kopplas in
- Zivar lägger restaurang-Swish-nummer i restaurants.swish_number
- Sätter `USE_MOCK_SWISH=false`
- Mock-knappen försvinner automatiskt
- Bekräftelse sker manuellt via admin (tills Tink Open Banking implementeras)

---

## 4. Stripe — använd Stripe TEST MODE (inte mock)

Stripe har excellent test mode med riktiga API-anrop. Använd den.

### Test-keys
- `sk_test_...` och `pk_test_...` skapas instant av Cowork via stripe.com (Zivar får logga in)
- Eller: Cowork använder Stripe-CLI för att skapa lokal test-account
- Test-kort: `4242 4242 4242 4242`

### Stripe Connect-onboarding
- Test-mode tillåter automatisk approval av Connect-accounts
- Onboarding-länk fungerar end-to-end utan KYC i test

### Webhooks
- Cowork installerar Stripe CLI lokalt: `stripe listen --forward-to localhost:3001/webhooks/stripe`
- Webhook-secret från CLI går i `.env.local`

### När prod kopplas in
- Byt `sk_test_` → `sk_live_`
- Konfigurera prod-webhook i Stripe Dashboard
- Kör KYC på riktiga restauranger

---

## 5. Google Business Profile — `USE_MOCK_GOOGLE_PLACE=true`

### Mock
- `restaurant.google_place_id` sätts till `MOCK_PLACE_ID_*`
- `generateReviewUrl()` returnerar `https://example.com/mock-google-review?place=...`
- Vid review-redirect: visa "Du skulle ha skickats till Google här" istället för riktig redirect

### Verkligt
- Restaurang fyller i sitt Google Place ID i settings
- `USE_MOCK_GOOGLE_PLACE=false` 
- Riktig redirect till `https://search.google.com/local/writereview?placeid=XXX`

---

## 6. Email (Postmark/Resend) — använd Mailpit

Mailpit är en lokal SMTP-fångare som körs i Docker (kommer redan med Supabase Local).

```typescript
const transport = process.env.NODE_ENV === 'production'
  ? createPostmarkTransport({ apiKey: process.env.POSTMARK_KEY })
  : createSmtpTransport({ host: 'localhost', port: 54324 }); // Mailpit
```

Cowork kan se alla emails på http://localhost:54324.

---

## 7. SMS (vid feedback-svar) — `USE_MOCK_SMS=true`

### Mock
- Anropet loggar bara: `console.log('[MOCK SMS]', to, body)`
- Status visas i admin: "SMS skickat (mock-läge)"

### Verkligt (post-MVP)
- 46Elks eller Twilio
- API-key i .env

---

## .env.example för utveckling

```bash
# === SUPABASE ===
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=eyJ... (lokal anon key)
SUPABASE_SERVICE_KEY=eyJ... (lokal service key)

# === MOCKS (default i dev) ===
USE_MOCK_ONSLIP=true
USE_MOCK_CASPECO=true
USE_MOCK_SWISH=true
USE_MOCK_GOOGLE_PLACE=true
USE_MOCK_SMS=true

# === STRIPE (riktiga test-keys, inte mock) ===
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_... (från stripe CLI)

# === EMAIL ===
SMTP_HOST=localhost
SMTP_PORT=54324
EMAIL_FROM=noreply@flowpay.local
```

## Verifiering — innan onsdag

Cowork ska kunna demonstrera:
1. ✅ Skanna QR → se mock-nota → välj Swish → klicka "Bekräfta mock" → success
2. ✅ Skanna QR → se mock-nota → välj kort → 4242-test → success (riktig Stripe test)
3. ✅ Split-flöde funkar (lika, del, items)
4. ✅ Feedback → mock Google-redirect
5. ✅ Admin: ser fake-betalningar i dashboard
6. ✅ Admin: feedback-inkorg visar reviews realtime
7. ✅ Admin: settings-vy fungerar
8. ✅ Superadmin: tenant-list + impersonate

När Zivar har fått in riktiga keys (Onslip prod, Swish Handel, etc) — VECKAN EFTER — växlar vi env-variabler och allt fungerar utan kodändring.
