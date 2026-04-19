**FLOWPAY**

Master System Brief

*QR-baserad pay-at-table som integration ovanpå befintliga POS-system*

Restaurangen byter ingenting. Personalen ändrar ingenting.

Version 2.0 --- POS-as-Source-of-Truth

Grundare: Zivar Mahmod

1\. Kärnprincipen

*FlowPay är INTE ett POS-system. FlowPay är INTE ett kassaregister.
FlowPay är ett betalningsgränssnitt som lyssnar på restaurangens
befintliga POS via API och förmedlar betalningar tillbaka.*

Allt FlowPay gör är att förkorta avståndet mellan \"gäst vill betala\"
och \"betalningen är registrerad i POS:en\". Vi äger inte notan. Vi äger
inte kvittot. Vi äger inte momsen, dagsavslutet, bokföringen eller något
annat regulatoriskt. Det äger POS:en som restaurangen redan har.

Om restaurangen stänger av FlowPay imorgon ska deras verksamhet fungera
precis som idag. Servitörer tar beställningar i sitt POS. Notor stängs i
kassan. Z-rapporter rullas. Skatteverket är glada. FlowPay var bara en
abstraktion som lät gäster betala via mobilen istället för att vänta på
personal.

Vad detta betyder konkret

-   Vi lagrar INGA kvittonummer --- POS:en gör det.

-   Vi gör INGA Z-rapporter --- POS:en gör det.

-   Vi exporterar INGEN moms-XML till Skatteverket --- POS:en gör det.

-   Vi sköter INGEN bokföring --- POS:en gör det.

-   Vi behöver INGEN kontrollenhet --- POS:en har den.

-   Vi är INTE ett certifierat kassaregister enligt SKVFS 2021:17 --- vi
    behöver inte vara det.

Vad vi DÅ gör

-   Läser öppna notor från POS:en via API.

-   Visar nota för gäst via QR-kod.

-   Tar emot betalning (Swish + kort via Stripe).

-   Säger till POS:en \"bord 7 är betald, metod Swish\" via API.

-   Samlar in feedback/reviews efter betalningen.

-   Visar enkel analytics + reviews-inkorg för restaurangägare.

2\. Aktörer & Skärmar

Vem ser vad

  -------------------- ------------------------------ ---------------------
  **Aktör**            **Skärm**                      **Hur ofta**

  Gäst                 Gäst-PWA (öppnas via QR)       Varje besök, \~2 min

  Servitör/Bartender   INGEN --- använder POS som     Aldrig
                       vanligt                        

  Kock                 INGEN --- använder POS som     Aldrig
                       vanligt                        

  Restaurangägare      Admin (reviews, stats,         1-2 ggr/vecka
                       inställningar)                 

  Du (Zivar)           Superadmin (alla kunder)       Dagligen
  -------------------- ------------------------------ ---------------------

*Det är BARA tre skärmar i hela produkten. Personalen i restaurangen rör
ingen av dem under dagen.*

Skärm 1: Gäst-PWA

-   Öppnas i mobilens webbläsare när gästen skannar QR-koden på bordet.

-   Ingen app, ingen installation, ingen inloggning.

-   Visar notan, splittar, dricks, betalning, kvitto, feedback.

-   Existerar i \~2 minuter per besök, sen stängs den.

Skärm 2: Restaurangadmin

-   Webbapp på app.flowpay.se.

-   Login via magic link eller BankID.

-   Tre vyer: Dashboard (stats), Feedback (reviews), Settings
    (Swish-nummer, dricks-default, QR-design).

-   PASSIV --- restaurangen behöver inte logga in dagligen. Push-notiser
    för låga reviews.

Skärm 3: Superadmin

-   Bara du och teknisk team.

-   Ser alla tenants, kan support-impersonate.

-   Sätter pricing, hanterar fakturering, ser systemhälsa.

3\. Systemarkitektur

Diagram

┌──────────────────────────────────────────────────────────────┐ │
RESTAURANGENS POS │ │ (Caspeco / Onslip / Lightspeed) │ │ - Servitör tar
beställning │ │ - Nota skapas på bord 7 │ │ - Z-rapport, moms, bokföring
(allt i deras system) │
└─────────────────────┬────────────────────────────────────────┘ │ API
(poll var 30s eller webhook) │ ┌──────────────┴───────────────┐ │
FLOWPAY API (Fastify) │ │ - Cache av öppna notor │ │ - Payment
orchestration │ │ - \"markera som betald\" → │
└──────┬──────────┬────────────┘ │ │ ▼ ▼ Swish API Stripe API │ │
└────┬─────┘ │ (pengar går direkt till restaurangens konto) │ ▼
┌─────────────────────────────┐ │ GÄST-PWA (skanna → betala) │
└─────────────────────────────┘ ┌─────────────────────────────┐ │ ADMIN
(reviews + stats) │ └─────────────────────────────┘

Vad som lagras hos oss

  ------------------ ---------------------------------- --------------------
  **Tabell**         **Vad**                            **Källa**

  restaurants        Våra kunder (org-nr, namn,         Vi skapar vid
                     Swish-nr)                          onboarding

  pos_integrations   API-credentials per restaurang     Vi sätter upp
                     (krypterat)                        

  tables             Bord (för QR-koder)                Synkas från POS

  orders_cache       Cachad kopia av öppna notor        Synkas från POS var
                                                        30s

  payments           Betalningar vi förmedlat           Vi skapar

  reviews            Feedback från gäster               Vi samlar in

  staff              Vilka kan logga in i adminen       Vi skapar
  ------------------ ---------------------------------- --------------------

*Notera: orders_cache är CACHE --- sanningen ligger alltid i POS:en. Vi
skriver INTE till den (utöver att markera betald), bara läser.*

Vad som INTE lagras hos oss

-   Kvittonummer (POS:en har dem).

-   Z-rapporter (POS:en gör dem).

-   Momsuppdelning per kvitto (POS:en räknar).

-   Personalens scheman, lön, dricks-fördelning (inget av vårt bord).

-   Lagerhantering, recept, beställningar till leverantörer.

4\. Kärnflödet --- End-to-End

Vad gästen upplever (\~30 sekunder)

1.  Gäst skannar QR-kod på bordet med mobilkameran.

2.  Webbläsare öppnar flowpay.se/t/\[restaurant-slug\]/\[bord-id\].

3.  Vår server slår upp i POS:en: \"vilken öppen nota finns på bord 7
    just nu?\"

4.  Gäst ser notan med rätter, priser, totalsumma.

5.  Gäst väljer: Betala allt / Splitta lika / Betala del / Välj rader.

6.  Gäst lägger till dricks (0/5/10%/eget).

7.  Gäst väljer betalningsmetod: Swish eller kort.

8.  Vid Swish: QR + \"öppna Swish\"-knapp. Vid kort: Stripe Elements.

9.  Betalningen genomförs. Pengarna går DIREKT till restaurangens konto
    via Stripe Connect.

10. Vi anropar POS:ens API: \"markera nota X som betald, metod: Swish\".

11. POS:en stänger notan precis som om servitören tryckt på
    \"betala\"-knappen.

12. Gäst ser success-skärm + email-input för digitalt kvitto (genererat
    av POS:en, vi forwardar).

13. Gäst får feedback-prompt: 1-5 stjärnor.

14. Vid 4-5: \"Skulle du dela detta på Google?\" → deep link.

15. Vid 1-3: privat textruta som går till restaurangägaren.

Vad servitören upplever

16. Tar beställningen i POS:en som vanligt.

17. Gör inget mer.

18. Ser i POS:en att bordet är betalt (precis som om de tagit betalt
    själva).

19. Sätter bordet på nytt.

*Servitören vet inte (och behöver inte veta) om gästen betalade via
FlowPay eller via dem. Båda flöden ser identiska ut i POS:en.*

Vad restaurangägaren upplever

20. Onboardas en gång (45 min).

21. Får QR-koder att sätta på bord.

22. Får en push när det kommer en låg review (att svara på).

23. Loggar in i adminen 1-2 ggr/vecka för att se stats.

24. Får faktura månadsvis.

5\. POS-integration --- Det kritiska

*Hela produkten står och faller på POS-integrationen. Om vi inte kan
tala med restaurangens POS finns ingen produkt.*

Vad vi kräver av POS:en

  -------------------------- ------------- ------------------------------
  **Operation**              **Behov**     **Frekvens**

  Lista öppna notor per      MUST          Var 30:e sekund
  location                                 

  Hämta nota med items per   MUST          Vid QR-skan
  nota-id                                  

  Markera nota som betald +  MUST          Vid completed payment
  ange metod + belopp                      

  Lista bord (för            SHOULD        Vid setup + sync
  QR-generation)                           

  Webhook vid nota-ändringar NICE          Realtime istället för poll
  -------------------------- ------------- ------------------------------

Adapter-pattern

Varje POS-leverantör implementerar samma interface. Detta gör det
trivialt att lägga till nya POS-system utan att röra core-logiken.

interface POSProvider { authenticate(credentials): Promise\<Session\>
fetchOpenOrders(locationId): Promise\<Order\[\]\> fetchOrder(orderId):
Promise\<OrderDetail\> markOrderPaid(orderId, payment: { method, amount,
ref }): Promise\<void\> fetchTables(locationId): Promise\<Table\[\]\>
subscribeToWebhooks?(callback): Unsubscribe // optional }

Prio-ordning för adapters

  ------------- ----------------- ------------------ ---------------------
  **POS**       **Marknadsandel   **API-kvalitet**   **Prio**
                SE**                                 

  Caspeco       \~30%             Bra REST + OAuth   P0

  Onslip        \~15%             Bra REST + API-key P0

  Lightspeed K  \~10%             Bra REST + OAuth   P1

  Paynova       \~10%             OK                 P2

  Zettle        \~10%             Begränsad          P2

  Wopla         \~5%              Okänd, kollas vid  P3
                                  behov              
  ------------- ----------------- ------------------ ---------------------

Säljargumentet till POS-leverantörer

Vi konkurrerar inte med POS:en --- vi gör den mer värdefull.
Restauranger som har FlowPay byter inte POS. Vi vill bli rekommenderade
som \"the payment add-on\" i POS-leverantörens partner-katalog.

6\. Betalningar

Swish (primär)

MVP: Swish privat QR-flöde. Vi genererar en swish:// deep link med
restaurangens Swish-nummer + belopp + meddelande. Gästen betalar i
Swish-appen. Pengarna går direkt till restaurangens Swish-konto.

Problem: vi vet inte automatiskt när det är betalt. Lösningar i
prio-ordning:

25. Open Banking via Tink --- pollar restaurangens kontotransaktioner i
    realtid (1-3 sek delay).

26. Swish Handel API --- kräver avtal med bank, ger webhook (\~5-10 sek
    delay). Långsiktigt mål.

27. Manuell bekräftelse i admin (fallback under MVP).

Kort + Apple Pay + Google Pay (sekundär)

Stripe Connect Standard --- restaurangen onboardas till Stripe (10 min,
kräver org-nummer + bankkonto). Pengarna går direkt till deras
Stripe-konto. Vi tar vår avgift via application_fee_amount automatiskt.

Pengaflödet --- viktigt

*FlowPay ROR ALDRIG vid pengarna. Allt går direkt till restaurangens
konto. Detta gör att vi INTE behöver Finansinspektionens tillstånd som
betalningsinstitut.*

-   Swish: gäst → restaurangens Swish-konto direkt.

-   Kort: gäst → restaurangens Stripe-konto direkt.

-   Vår fee: dras automatiskt av Stripe (application_fee_amount). Vi får
    utbetalning från Stripe månadsvis.

-   Swish-fee: faktureras månadsvis baserat på transaktionsvolym.

7\. Datamodell

Tabeller

  ------------------ ------------------ ------------------------------------
  **Tabell**         **Syfte**          **Nyckelkolumner**

  restaurants        Våra kunder        id, slug, org_number, name,
                                        swish_number

  locations          Fysiska platser    id, restaurant_id, address, timezone

  pos_integrations   POS-koppling       id, restaurant_id, type, credentials
                                        (vault), status

  tables             Bord               id, location_id, table_number,
                                        qr_token

  orders_cache       Cache av öppna     id, restaurant_id, pos_order_id,
                     notor              table_id, total, status, items_json,
                                        last_synced_at

  payments           Betalningar vi     id, restaurant_id, pos_order_id,
                     förmedlat          amount, method, provider_tx_id,
                                        status

  payment_splits     Vid split          id, payment_id, guest_identifier,
                                        amount

  reviews            Feedback           id, payment_id, restaurant_id,
                                        rating, text

  staff              Adminanvändare     id, restaurant_id, user_id, role
  ------------------ ------------------ ------------------------------------

Vad orders_cache INTE är

-   Det är INTE source of truth --- POS:en är.

-   Vi VALIDERAR ALDRIG mot orders_cache vid betalning --- vi hämtar
    färsk data från POS innan vi visar för gäst.

-   orders_cache används för UI-listor i adminen + analytics, inte för
    transaktionsbeslut.

RPC-funktioner

-   get_or_fetch_order(restaurant_id, table_id) --- kolla cache, hämta
    fresh från POS om stale.

-   create_payment(order_id, amount, method, split_info?) --- skapar
    pending payment.

-   complete_payment(payment_id, provider_tx_id) --- markerar betald +
    triggar POS-update.

-   submit_review(payment_id, rating, text, consent) --- skapar review.

8\. Admin för Restaurangägare

*Adminen är PASSIV. Den är inte ett dagligt arbetsverktyg. Personalen
rör den ALDRIG.*

Tre vyer

Dashboard

-   Idag: antal betalningar via FlowPay, total volym, snittrating.

-   Veckans trend (graf).

-   Top recensioner senaste veckan.

Feedback-inkorg

-   Lista över alla reviews, sorterat senaste först.

-   Filter: alla / låga (≤3) / höga (≥4).

-   Vid låg rating: \"Svara via SMS\"-knapp (om gäst lämnat nummer).

-   Realtime-uppdatering.

Inställningar

-   Swish-nummer.

-   Dricks-default + alternativ (0/5/10/custom).

-   QR-kod-design (logga, färg).

-   Team (lägga till anställda som ska kunna se admin).

-   POS-integration status.

Vad adminen INTE har

-   Ingen \"skapa nota\"-funktion (POS:en gör det).

-   Ingen \"refunda\"-funktion direkt (görs i POS:en, vi syncar).

-   Ingen kvittolista (POS:en har dem).

-   Ingen Z-rapport-knapp (POS:en gör det).

-   Ingen lagerhantering.

-   Ingen schemaläggning.

9\. Design & Estetik

Designprinciper

-   Premium-känsla. Awwwards-nivå, inte \"payment company-blue\".

-   Gäst-flödet ska kännas som en exklusiv app, inte ett formulär.

-   Snabbhet upplevs som premium --- animationer ska aldrig blocka,
    alltid förstärka.

Color tokens

\--flow-ink: #0A0A0A (primär text) \--flow-paper: #FAFAFA (bakgrund)
\--flow-accent: #FF5A1F (orange CTA) \--flow-mint: #00C08B (success)
\--flow-blush: #FFE5D9 (warm neutral) \--flow-graphite: #3F3F46
(sekundär text) \--flow-hairline: #E4E4E7 (dividers)

Typografi

-   Display: Inter Display (variable).

-   Text: Inter (variable).

-   Mono: JetBrains Mono (för belopp + kvitto-look).

Motion

-   Allt via Framer Motion.

-   Easing: cubic-bezier(0.16, 1, 0.3, 1) --- spring-känsla.

-   280ms för state-change, 500ms för page-transition.

-   Haptics (navigator.vibrate) på betala-tap, success, stjärnval.

Gäst-PWA-specifikt

-   Single column, fullscreen, dark mode automatisk.

-   Min 18px body-text, 32px för totalsumma.

-   Touch-targets min 56px höjd.

-   Progress-indikator högst upp: nota → split → dricks → betala → klar.

-   Inga refresh-knappar --- pull-to-refresh fungerar.

10\. Teknisk Stack

Apps

  --------------- ---------------------------------- ---------------------
  **App**         **Tech**                           **Hosting**

  Gäst-PWA        Vite + React 19 + Tailwind v4      Cloudflare Pages

  Admin           Next.js 15 + Tailwind v4 +         Vercel
                  shadcn/ui                          

  API             Fastify + TypeScript + Zod         Fly.io (eu-north)
  --------------- ---------------------------------- ---------------------

Shared packages

-   packages/db --- Supabase types + migrations.

-   packages/ui --- shared design system.

-   packages/pos-adapters --- Caspeco, Onslip, Lightspeed adapters.

-   packages/payments --- Swish + Stripe wrappers.

-   packages/schemas --- Zod-schemas delade mellan klient + server.

Backend services

-   Supabase (managed) --- PostgreSQL, Auth, Realtime, Storage.

-   Stripe --- kort + Apple/Google Pay.

-   Swish --- privat QR initialt, Handel API senare.

-   Tink --- Open Banking för Swish-confirmation.

-   Postmark eller Resend --- transaktionella emails
    (kvitto-forwarding).

-   Sentry --- error tracking.

-   PostHog --- produktanalys.

Monorepo

-   pnpm workspaces + Turborepo.

-   Biome för lint/format (snabbare än ESLint+Prettier).

-   Vitest för tester.

11\. Affärsmodell

Pricing

-   Setup engångs: 2 000 kr (QR-skyltar tryckta + onboarding).

-   Standard: 499 kr/mån.

-   Premium: 1 499 kr/mån (custom branding på QR + advanced analytics).

-   Transaktionsavgift: 0,8 % på betalningar genom plattformen.

-   Pass-through: Swish-/Stripe-kostnader passas igenom.

Mål år 1

-   50-100 betalande restauranger i Stockholm/Göteborg/Malmö.

-   MRR: 50-100k kr.

-   Genomsnittsrestaurang: 200+ kuvert/dag, 50% adoption → \~100
    betalningar/dag via FlowPay.

-   ARR-mål: 1 MSEK.

Säljkanaler

-   Direktsälj till restauranger med 50+ stolar (där dricks-volymen
    motiverar).

-   POS-leverantör-partnerships (Caspeco, Onslip listar oss som
    integration).

-   Influencer-restauranger (frequent diners delar på Instagram).

12\. Roadmap

Fas 0 --- Grunden (vecka 1-2)

-   Monorepo + Supabase + designsystem.

-   Landningssida + demo-bokning.

Fas 1 --- Kärnflödet (vecka 3-7)

-   POS-adapter för Onslip (enklast).

-   Cache-sync av öppna notor.

-   Gäst-PWA: skanna → nota → Swish → success.

-   Mark-as-paid tillbaka till POS.

-   Mål: en riktig betalning på en riktig restaurang.

Fas 2 --- Split + Feedback (vecka 8-11)

-   Split-flöde (lika/del/items).

-   Dricks-selector.

-   Stripe-integration för kort.

-   Reviews + Google deep link.

Fas 3 --- Admin + skala (vecka 12-15)

-   Admin: dashboard, feedback-inkorg, settings.

-   Caspeco-adapter.

-   Onboarding-flow self-serve.

-   Första 5-10 betalande kunder.

Fas 4 --- Skala (månad 4-6)

-   Lightspeed-adapter.

-   Tink för Swish-auto-confirmation.

-   Analytics-fördjupning.

-   Mål: 25 kunder, 250k MRR.

Fas 5 --- Internationellt (månad 7-12)

-   Norge (Vipps), Danmark (MobilePay).

-   Mål: 100+ kunder över Norden.

13\. Risker

  ---------------------- -------------- ------------------------------------
  **Risk**               **Påverkan**   **Mitigering**

  POS-leverantör blockar Hög            Bygg goda relationer,
  API-åtkomst                           multi-POS-strategi, börja med Onslip
                                        som är pro-API

  Sunday lanserar i      Hög            Snabb MVP, exklusiv-deals med
  Sverige före oss                      top-restauranger vecka 1-4

  Swish-confirmation går Medel          Tink + manuell bekräftelse-fallback
  inte att automatisera                 under MVP

  Stripe Connect KYC     Låg            Manuell onboarding-support de första
  stoppar restauranger                  20 kunderna

  Servitörer motarbetar  Medel          Dricks-flödet visar HÖGRE dricks via
  för att de tror de                    FlowPay än kortterminal ---
  förlorar dricks                       utbildningsmaterial

  Gäst tycker            Låg            Test live, optimera tills \<30 sek
  QR-skanning är                        
  krångligt                             
  ---------------------- -------------- ------------------------------------

14\. Brief-serien (Översikt)

Se separata .md-filer för Claude Code. Briefs körs en åt gången enligt
beroenden.

Fas 0 --- Grunden

  ------------ -------------------------------------- --------------------
  **ID**       **Titel**                              **Thinking**

  IN-001       Monorepo setup                         🟢

  IN-002       Supabase + lokal dev                   🟢

  DB-001       Initial schema (restaurants, tables,   🟡
               staff)                                 

  SC-001       RLS på alla tenant-tabeller            🔴

  UI-001       Designsystem + baskomponenter          🟡
  ------------ -------------------------------------- --------------------

Fas 1 --- Kärnflödet

  ------------ -------------------------------------- --------------------
  **ID**       **Titel**                              **Thinking**

  DB-002       orders_cache + payments schema         🟡

  API-001      Fastify-skeleton                       🟢

  POS-001      Onslip-adapter + sync-jobb             🔴

  API-002      GET /orders/:token endpoint            🟡

  KI-001       Gäst-PWA skeleton + QR-route           🟡

  KI-002       Visa nota-skärm med riktig data        🟡

  API-003      Swish privat QR + payment-API          🔴

  KI-003       Betalningsflöde + success-sida         🔴

  API-004      Mark-order-paid → POS                  🔴
  ------------ -------------------------------------- --------------------

Fas 2 --- Split + Feedback

  ------------ -------------------------------------- --------------------
  **ID**       **Titel**                              **Thinking**

  KI-004       Split-flöde (lika/del/items)           🔴

  KI-005       Dricks-selector                        🟡

  API-005      Stripe Connect-integration (kort)      🔴

  KI-006       Stripe-betalning i gäst-PWA            🟡

  DB-003       Reviews-tabell                         🟢

  KI-007       Feedback-flöde efter betalning         🟡

  API-006      Google review deep link service        🟡
  ------------ -------------------------------------- --------------------

Fas 3 --- Admin + skala

  ------------ -------------------------------------- --------------------
  **ID**       **Titel**                              **Thinking**

  TA-001       Admin-skeleton + auth                  🟡

  TA-002       Dashboard-vy                           🟡

  TA-003       Feedback-inkorg + realtime             🟡

  TA-004       Settings (Swish, dricks, QR)           🟡

  POS-002      Caspeco-adapter                        🔴

  TA-005       QR-generator + print-PDF               🟡

  SA-001       Superadmin + impersonation             🔴
  ------------ -------------------------------------- --------------------

*--- SLUT PÅ MASTER BRIEF v2.0 ---*
