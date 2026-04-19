# Mail-mallar — skicka söndag kväll, processas måndag morgon

Klistra in, byt [PLACEHOLDER]-fält, skicka. 30 min totalt.

---

## 1. Stripe Connect — registrera platform

**Detta är inte ett mail — du gör det själv på 15 min:**

1. Gå till https://dashboard.stripe.com/register
2. Skapa Stripe-konto för FlowPay AB (eller ditt företag)
3. Aktivera "Connect" från sidopanelen
4. Välj "Standard" Connect-typ
5. Spara `pk_test_...` och `sk_test_...` i lösenordshanterare
6. Lägg dem i `apps/api/.env.local` (Cowork använder dem direkt i API-005)

**Live-keys behövs först när första riktiga restaurang ska onboarda — efter sprinten.**

---

## 2. Onslip — partner API access

**Till:** partner@onslip.com (eller via deras kontaktformulär på https://onslip.com)

**Ämne:** Förfrågan om partner-API och sandbox-access — pay-at-table-integration

**Innehåll:**

Hej,

Mitt namn är [Zivar Mahmod] och jag är grundare av Corevo (corevo.se), ett B2B SaaS-bolag som bygger self-service-lösningar för svensk handel.

Vi lanserar nu FlowPay — en pay-at-table-tjänst för restauranger där gästen skannar en QR-kod på bordet och betalar direkt via mobilen (Swish/kort). Lösningen ligger ovanpå restaurangens befintliga POS-system och konkurrerar inte med er — den gör er produkt mer värdefull för era kunder.

Vi vill bygga Onslip som första integration eftersom ert API är välbyggt och ni är pro-integration.

Vi behöver:
1. Sandbox-access för utveckling (omedelbart)
2. Dokumentation över order-API (öppna notor, mark-as-paid, webhooks om finns)
3. Production-credentials när vår första gemensamma kund är redo (förmodligen om 2-3 veckor)

Kan vi boka 30 minuter denna vecka för att gå igenom upplägget? Jag vill att Onslip ska känna sig 100% trygg med integrationen — vi vill bli rekommenderade i er partner-katalog när det är moget.

Tack på förhand,
Zivar Mahmod
Grundare, Corevo / FlowPay
[telefonnummer]
[email]

---

## 3. Caspeco — partner API + OAuth

**Till:** partners@caspeco.com (eller via https://caspeco.se/kontakt)

**Ämne:** Förfrågan om partner-status och OAuth-integration för pay-at-table

**Innehåll:**

Hej,

Jag heter Zivar Mahmod, grundare av Corevo. Vi bygger FlowPay — en pay-at-table-lösning som ligger ovanpå befintliga POS-system. Restaurangen byter inget, vi adderar bara mobilbetalning via QR-kod på bordet.

Caspeco är största aktören i den svenska restaurangmarknaden så ni är vår viktigaste integrationsmål.

Vi behöver:
1. Partner-status med OAuth client_id + client_secret
2. Sandbox-miljö för utveckling
3. Dokumentation för Order API (open orders, mark paid, webhooks)
4. Eventuellt listas i er marketplace när vi är produktionsklara

Vi konkurrerar inte med Caspeco — vi gör Caspeco-restauranger mer attraktiva för moderna gäster som inte vill vänta på notan. Sunday (USA, $4B i årlig betalvolym) bevisar att modellen funkar globalt.

Kan vi prata 30 min nästa vecka?

Tack,
Zivar Mahmod
Corevo / FlowPay
[telefonnummer]
[email]

---

## 4. Swish Handel — via banken

**Till:** Din företagsbankrådgivare (SEB / Handelsbanken / Swedbank / Nordea)

**Ämne:** Swish Handel API för ny SaaS-tjänst — process och kostnader

**Innehåll:**

Hej [bankrådgivare],

Jag bygger en SaaS-tjänst (FlowPay) för restauranger som integrerar mot Swish så att gäster kan betala notan direkt via mobilen.

För MVP använder vi Swish privata QR-flöden (gästen betalar till restaurangens egna Swish-nummer, vi förmedlar bara), men för en proper produktion behöver vi tillgång till Swish Handel API per restaurang som onboardar oss.

Frågor:
1. Vilken process gäller för att en restaurang ska få Swish Handel-avtal?
2. Vad är typisk handläggningstid?
3. Kostnader (engångs + transaktionsavgifter)?
4. Kan ni hjälpa oss bli "Swish-partner" så att flera restauranger kan onboarda mot oss enklare?
5. Finns det möjlighet till webhooks eller polling-API för att vi automatiskt ska se när en betalning kommit in på vår kunds konto?

Vill gärna boka ett möte eller telefonsamtal denna vecka.

Tack,
Zivar Mahmod
Corevo / FlowPay  
[telefonnummer]
[email]

---

## 5. (Valfritt) Tink — Open Banking för Swish-confirmation

**Till:** sales@tink.com

**Ämne:** Open Banking för automatisk Swish-betalningsbekräftelse

**Innehåll:**

Hej,

Bygger en pay-at-table-tjänst där restauranger tar emot Swish-betalningar via QR-kod. Vi behöver real-time-confirmation att en specifik betalning kommit in på restaurangens konto för att kunna stänga notan i deras POS.

Behov:
1. Account Information Service (AISP-license) — läsa transaktioner
2. Real-time push av transaktioner (helst webhook)
3. Match transaction → vår payment-id (via meddelande/referens)

Restaurangen ger consent en gång vid onboarding.

Frågor:
1. Stödjer Tink detta use-case?
2. Vilka svenska banker är supported?
3. Pris-modell?
4. Time-to-integration för MVP?

Vill boka 30 min nästa vecka.

Tack,
Zivar
[telefonnummer]
[email]

---

## Ordning att skicka i

**Söndag kväll (innan sömn — 30 min):**
1. ✅ Stripe (gör själv, 15 min) — KRITISKT, behövs för API-005 på tisdag
2. ✅ Onslip (5 min)
3. ✅ Caspeco (5 min)
4. ✅ Bank Swish (5 min)

**Måndag eftermiddag (om du har tid):**
5. ⚪ Tink (5 min) — kan vänta

**Vad du gör om svar dröjer:**
Cowork bygger alltid mot mocks först. Riktiga keys kopplas in vecka 17. Nothing blocks.
