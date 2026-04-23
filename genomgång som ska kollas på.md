# Payflow — Djupgående teknisk research för en svensk QR-baserad pay-at-table-lösning

**Datum:** 23 april 2026
**Målkund i pilot:** O'Learys Linköping (franchise, del av O'Learys Trademark / Social Eatertainment Group) — [career.olearyssportsbar.com](https://career.olearyssportsbar.com/locations/o-learys-linkoping)
**Positionering:** Kompletterande checkout-layer *vid sidan av* POS — INTE en POS-ersättare.

Denna rapport är strukturerad i de 10 områden som efterfrågades. Rekommendationer är konkreta och svenskmarknadsspecifika. Där data är osäker (t.ex. privata POS-leverantörers API-priser) är det uttryckligen noterat.

---

## 1. POS-integrationer — det tekniska mönstret

### Det kanoniska "open check API"-mönstret
Internationella restaurang-POS (Toast, Square, Lightspeed K-Series, Oracle Simphony) implementerar i princip samma primitiver. Lightspeed Restaurant K-Series (byggt på iKentoo) är det renaste offentligt dokumenterade exemplet och kan användas som referensarkitektur för Payflows integrationslager:

**Hämta öppna notor** ([Lightspeed K-Series docs](https://api-docs.lsk.lightspeed.app/operation/operation-apegetcheck)):
```http
GET /o/op/1/order/table/{tableId}/getCheck?businessLocationId=45454565682155
Authorization: Bearer $ACCESS_TOKEN
```
Svaret innehåller `identifier`, `uuid`, `clientCount`, `openDate`, `paidAmount`, `currentAmount`, `salesEntries[]` (med `itemName`, `unitAmount`, `quantity`, `amountWithTax`, `amountLessTax`), samt `staffName`/`staffId`.

**Lägga till betalning / stänga nota** — ett utomstående "payments API" från Lightspeed låter en integratör POSTa en `payment` mot en check och markera den betald; `Get Payment Methods`-endpointen [listar](https://api-docs.lsk.lightspeed.app/operation/operation-financial-apigetpaymentmethods) tillgängliga payment-methods (name, code, pmId) så att Payflow kan mappa sig mot en förkonfigurerad metod som heter t.ex. "Payflow" i restaurangens POS.

### Autentisering
- **Toast:** OAuth 2.0 med scopes (t.ex. `orders.gift_cards:read`), separata sandbox- och produktionsmiljöer. Partners får clientId/clientSecret från Toast efter onboarding. ([Toast docs](https://doc.toasttab.com/doc/devguide/index.html))
- **Lightspeed K-Series:** Bearer tokens per `businessLocationId`. ([docs](https://api-docs.lsk.lightspeed.app/))
- **Square:** OAuth 2.0.
- **Onslip (SE):** Öppet REST-API, kontakt via `api@onslip.com`. ([Onslip developer](https://developer.onslip360.com/))

För Payflow betyder det: **tenant-isolation måste ske på tre nivåer** — (1) Payflows egen tenant-ID (restaurangen), (2) POS-leverantörens locationId/restaurantGuid, (3) Payflows egna API-nycklar per restaurang lagrade i Supabase Vault (se sektion 6).

### Push vs Poll
Toast rekommenderar [explicit](https://doc.toasttab.com/doc/cookbook/apiWebhookUsageChecklist.html) en **hybrid**: prenumerera på webhooks men **polla varje timme som backup** eftersom webhooks kan paueras om endpoint returnerar fel. Typiska webhook-events:
- `orders.updated` (Toast — släppt 2024, används för att få orderuppdateringar i realtid)
- `partner_added` / `partner_removed` (när restaurang kopplar in/ur integrationen)
- För Payflows use case är `check.updated` och `check.closed` de viktigaste.

Varje webhook-event från Toast har ett `Toast-Attempt-Number`-header (1, 2, 3...) så du kan bygga idempotens via event GUID.

### Rekommendation för Payflow
- Implementera **pull-first** (polling var 5–15 sekund för öppna notor på aktiva bord) med webhook-push *när den finns*.
- Skäl: alla svenska POS-leverantörer har inte webhooks. Polling mot `GET /checks?status=open` är den lägsta gemensamma nämnaren.
- Bygg en abstraherad **POS Adapter Interface** (TypeScript):
```ts
interface POSAdapter {
  listOpenChecks(locationId: string): Promise<Check[]>
  getCheck(checkId: string): Promise<Check>
  addPayment(checkId: string, payment: PaymentPayload): Promise<void>
  subscribeWebhook?(event: 'check.updated', handler: Handler): void
}
```
Implementera sedan `TrivecAdapter`, `CaspecoAdapter`, `OnslipAdapter`, `TruePOSAdapter` etc.

---

## 2. Svenska POS-system — konkreta integrationsvägar

### TruePOS / Kassacentralen (primär — används av O'Learys Linköping med hög sannolikhet)
TruePOS har **dokumenterade integrationer**: Fortnox, Björn Lundén, Visma, Personalkollen, Caspeco, Swish Handel, Stripe, Elavon, Worldline. TruePOS skickar automatiskt dagsrapporter till bokföringsintegrationer vid Z-rapport. ([Kassacentralen integrationer](https://www.kassacentralen.se/integrationer/))

- **API-öppenhet:** Ingen publik API-dokumentation. Integrationer görs på projektbasis via Kassacentralens egen utvecklingsorganisation i Malmö.
- **Kontaktväg:** `info@kassacentralen.se` / 040-30 60 10. Ring och be om "partnerintegration / ISV-samarbete".
- **Certifieringskrav:** Inte publikt — men eftersom TruePOS är **tillverkardeklarerat** enligt SKVFS 2014:9 kommer varje integration som rör fiskal data behöva godkännas av deras compliance-team.
- **Bedömning:** Medelsvårt. Kassacentralen har redan Swish Handel och Stripe på sin partnerlista, så en QR-betalningspartner passar konceptuellt in. **Time-to-integration: realistiskt 3–6 månader** inklusive legal + dev.

> **Verifieringssteg för O'Learys Linköping:** Bekräfta via Facebook/på plats att de verkligen kör TruePOS. Svenska O'Learys-franchisetagare väljer POS självständigt — andra O'Learys-enheter kör Trivec eller Caspeco. En tidig 20-minuters ringning till franchisetagaren löser detta.

### Trivec (efter mars 2025 = "Trivec by Caspeco")
Caspeco förvärvade Trivec våren 2025; båda drivs nu under samma grupp men med separata produktlinjer. ([trivecgroup.com](https://trivecgroup.com/)) Trivec har **8 000+ kunder** i Sverige/Norge/Danmark/Belgien/Frankrike och det största partnerekosystemet.

- **Partnerportal:** Lanserad 2022 — [trivecgroup.com/products/integrations](https://trivecgroup.com/products/integrations/). Öppen ansökan.
- **Direkt konkurrent redan etablerad:** **TrivecPay powered by Karma** — djupintegrerad QR-lösning för split-bill/tip. Karma tar ett avtal, pengar går till separat konto, betalningar syns i MyTrivec-rapporten. ([trivec.se/karma](https://www.trivec.se/produkter/integrationer/karma/)) Detta är Payflows närmaste head-to-head-rival.
- **Konsekvens:** Att bli en andra QR-partner på Trivec är fullt möjligt (Trivec erbjuder också Adyen, Stripe och Swish som payment providers i Buddy — [Trivec Help Center](https://trivec.zendesk.com/hc/en-gb/articles/13997232346641-Getting-started-with-Buddy)), men man säljer *mot* en inbakad lösning. Trivec har inget incitament att hjälpa en konkurrent till Karma.
- **Kontakt:** partner@trivecgroup.com via [trivecgroup.com/news/trivec-invests-in-a-rich-partner-ecosystem](https://trivecgroup.com/news/trivec-invests-in-a-rich-partner-ecosystem-to-strengthen-its-offer-to-restaurants/).
- **Bedömning:** Svårt av strategiska skäl. Bygg inte pilot här först.

### Caspeco (fristående)
Caspeco hade redan innan Trivec-förvärvet eget kassa- och API-ekosystem. Offentlig Apiary-docs för betalningar: [caspecopayment.docs.apiary.io](https://caspecopayment.docs.apiary.io/) — men detta är Caspecos egna payments API, inte ett open-check API för tredjepartsintegration. De har även en JavaScript-SDK för bokningswidgets ([docs](https://caspeco.atlassian.net/wiki/spaces/DD/pages/304185348/Caspeco+JavaScript+SDK)) och publik GitHub-org. Caspecos egna svar på frågan "är ni öppna för integration": *"Caspeco är integrerat med i stort sett alla POS-system"* — utåt positionerar de sig som plattform, inte partner. ([caspeco.com hjälpcenter](https://caspeco.com/en/hjalpcenter/))
- **Bedömning:** Medelsvårt. Gör inte detta först, men sök kontakt parallellt.

### Onslip (baserade i LINKÖPING — Kungsgatan 20)
Geografisk match med O'Learys Linköping. **Öppet REST-API**, partnerprogram med tre ingångsmodeller: återförsäljare, teknikpartner, affärsförmedlare. ([onslip.com/bli-partner](https://www.onslip.com/bli-partner/), [developer.onslip360.com](https://developer.onslip360.com/)) De stödjer webhooks ("Prenumerera på events och få dem levererade direkt till er applikation, så slipper ni skicka återkommande förfrågningar").
- **Kontakt:** `api@onslip.com` eller `partner@onslip.com`.
- **Certifieringskrav:** Inte publika, men Onslip har lägre tröskel än Trivec/Caspeco och är explicit tech-positivt. Kostnaden är i praktiken noll utöver egen utvecklingstid.
- **Bedömning: ENKLAST — starta piloten här** om O'Learys inte kör Onslip (vilket de troligen inte gör), så ändå ideal för *andra* piloter. För O'Learys: se TruePOS ovan.

### ES Kassasystem
Integrerar med Fortnox, Björn Lundén, Visma eEkonomi, Swish, Klarna, Deliverect, Timetjek, Personalkollen, Pricer, Cashguard, m.fl. ([eskassa.se](https://eskassa.se/)). Ingen publik API-dokumentation — projektbaserade integrationer. **Bedömning:** Medelsvårt. Mindre marknadsandel i restaurangsegmentet jämfört med Trivec/Caspeco.

### Vendion
Nyare svensk all-in-one-plattform (POS + bokning + personal + AI) med transparent pris *från 2 490 kr/mån*. Väldigt modernt byggd men ingen öppen publik API-dokumentation ännu — kontakta dem direkt. ([vendion.com](https://www.vendion.com/en)) Positionerar sig mot Trivec/Caspeco som "inga integrationer behövs — allt är inbyggt". För Payflow betyder det både en konkurrent *och* en potentiell partner för mindre krogar.

### Sammanfattning — rangordning för Payflows POS-integrationsstrategi
| POS | API-öppenhet | Konkurrens i QR | Svårighetsgrad | Rekommendation |
|---|---|---|---|---|
| **TruePOS / Kassacentralen** | Stängt men integrations-villigt | Ingen integrerad QR-betalning idag | Medium | **Primär — för O'Learys-piloten** |
| **Onslip** | Öppet REST + webhooks | Ingen | Enkel | **Sekundär — för de första 10 kunderna utanför O'Learys** |
| **Caspeco (fristående)** | Delvis API, delvis stängt | Har inte egen integrerad QR | Medium | Tertiär |
| **Trivec / Trivec by Caspeco** | Partnerportal finns | **Karma/TrivecPay redan inbakat** | Strategiskt svårt | Undvik som första pilot |
| **ES Kassasystem** | Stängt | Ingen | Medium | Senare |
| **Vendion** | Stängt | Har inbyggd all-in-one | Strategiskt svårt | Senare |

---

## 3. Swish Handel / Företag / Privat — tekniskt djup

### Vilken produkt behövs?
- **Swish Privat** — *får ej* användas i näringsverksamhet enligt Swedbanks villkor. ([swedbank.se](https://www.swedbank.se/foretag/betala-och-ta-betalt/swish.html))
- **Swish Företag** — "manuell" betalning mot ett Swish-nummer. Ingen API-trigger från butik, återrapportering görs mot företagsappen eller fil. Månadsavgift typiskt 30–50 kr, transaktion 1,50–2 kr. ([alltomforetagande.se](https://alltomforetagande.se/foretag/swish-foretag/))
- **Swish Handel** — det Payflow ska använda. Betalning triggas från kassa/app/e-handel via Swish Commerce API. Handelsbanken: **85 kr/mån + 1,75 kr/transaktion** ([handelsbanken.se](https://www.handelsbanken.se/sv/foretag/konton-betalningar/ta-betalt/swish-for-foretag)), större banker ligger mellan 85–299 kr/mån och 1,75–3 kr/transaktion ([ekonomipiloten.se](https://ekonomipiloten.se/guider/betalningar/swish-foretag-guide), [Handelsbanken](https://www.handelsbanken.se/sv/foretag/konton-betalningar/ta-betalt/swish-for-foretag)).

### Teknisk arkitektur — M-Commerce-flöde (Payflow's use case)
Från [developer.swish.nu](https://developer.swish.nu/documentation/integration) och Swish Merchant Integration Guide ([v2.6 PDF](https://assets.ctfassets.net/zrqoyh8r449h/aBolaUxwMBZWntQ9CsuLD/c5b0c94c5fb2a298bda91bf4e567d039/Merchant_Integration_Guide_2.6.pdf)):

1. **Enrollment:** Restaurangen skriver avtal med sin bank om Swish Handel. Banken registrerar **CPOC (Certificate Point of Contact)** — upp till 5 personer med BankID-behörighet att administrera certifikat. Banken skickar in enrollment-request till Swish security. Aktivering kräver även att banken tar in **teknisk leverantör** i avtalet — här kan Payflow listas.
2. **Certifikat:** CPOC loggar in i Swish Certificate Management och skapar CSR → får tillbaka ett **PKI-certifikat (.p12)** giltigt 2 år. Konverteras till .pem för användning.
3. **Payment request:**
```http
PUT https://cpc.getswish.net/swish-cpcapi/api/v2/paymentrequests/{instructionUUID}
Content-Type: application/json
[mTLS med merchant-certifikat]

{
  "payeeAlias": "1231181189",          // Restaurangens Swish-nummer
  "amount": "450.00",
  "currency": "SEK",
  "message": "Bord 7 – O'Learys Linköping",
  "callbackUrl": "https://api.payflow.se/swish/callback",
  "payeePaymentReference": "CHECK-8472"
}
```
Svar: `201 Created` + `Location: .../paymentrequests/AB23D7406ECE4542A80152D909EF9F6B` — detta är **payment token**.

4. **QR-kod eller deep link:**
```
Deep link:   swish://paymentrequest?token=AB23D74...&callbackurl=https://payflow.se/done
QR content:  genereras via Swish QR API https://mpc.getswish.net/qrg-swish/api/v1/commerce
```
Swish kan generera prefilled QR med `payee;amount;message;bitmask` där bitmask styr vilka fält som är editable. ([Swish QR code specification v1.7.2](https://assets.ctfassets.net/zrqoyh8r449h/12uwjDy5xcCArc2ZeY5zbU/ce02e0321687bbb2aa5dbf5a50354ced/Guide-Swish-QR-code-design-specification_v1.7.2.pdf))

5. **Callback:** Swish POST:ar till `callbackUrl` när status blir `PAID | DECLINED | CANCELLED | ERROR`. **Viktigt:** Enligt officiell guide "merchant server should retrieve the result of the payment request directly from the Swish server" — förlita dig inte bara på callback-body, utan gör en bekräftelse-GET mot Swish.

Stateflöde: `CREATED → PENDING → PAID | DECLINED | CANCELLED | ERROR`. Timeout → ERROR efter 3 minuter. ([Swish Payment Flows – Techkiz](https://techkiz.com/en/tutorials/swish-pay/payment-flows/))

6. **Sandbox:** "Merchant Swish Simulator" — ([user guide](https://developer.getswish.se/merchants/)). Test-certifikat ingår i paketet. I Adyen-världen simuleras fel genom `shopperStatement: "FF08"` etc. ([Adyen docs](https://docs.adyen.com/payment-methods/swish/api-only)).

### Kan Payflow vara merchant-of-record för restaurangens räkning?
**Nej** — åtminstone inte utan PI-licens. Swish Handel-avtalet måste skrivas **mellan restaurangen och deras bank**; Swish tillåter explicit en "teknisk leverantör" (Payflow) men inte att pengar går via en tredje parts konto utan PSP-licens från Finansinspektionen. Svensk tröskel för PI-licens: ~€3M/månad i omsättning enligt [Stripe](https://stripe.com/en-se/resources/more/how-merchant-bank-contracts-work-in-sweden).

**Konsekvens:** Varje restaurang behöver eget Swish Handel-avtal. Payflow är registrerad som teknisk leverantör hos banken (liknande hur Quickpay beskriver sig själva: *"Should Swish ask for Quickpay's technical supplier number, the number is: 9873490727"* — [Quickpay](https://quickpay.net/payment-methods/swish/)). Payflow behöver få ett eget Swish Technical Supplier-ID från Getswish AB.

### Jämförelse Swish vs Stripe Connect för Payflow

| Dimension | Swish Handel (direkt) | Stripe Connect (destination charges) |
|---|---|---|
| Pengar går till | Restaurangens konto direkt | Via Stripe → restaurangens konto (next-day payout) |
| Onboarding per restaurang | 2–4 veckor via bank | 10 minuter via Stripe Express Onboarding |
| Avgift | 85–299 kr/mån + 1,75–3 kr/tx | 1,5 % + 1,80 kr (EU-kort), 0 kr/mån |
| Kan Payflow ta application fee? | Nej, direkt. Ja, via separat fakturering. | **Ja**, `application_fee_amount` per PaymentIntent |
| Chargebacks | Minimalt (Swish är "account-to-account push payment") | Standard kort-chargeback-risk (kort via Stripe) |
| Kundpreferens | 86 % marknadsandel i Sverige ([PPRO](https://www.ppro.com/payment-methods/swish/)) | Kort används ändå av internationella gäster |
| PCI-scope | Ingen (Swish är bank-till-bank) | SAQ A (hosted payment page/iframe) |
| Teknisk komplexitet | Hög (mTLS, .p12, callback-contract) | Låg (Stripe SDK) |

**Rekommendation:** Kör **både Swish Handel *och* Stripe Connect**.
- Swish för svenska gäster (majoritet) — minimerar restaurangens kortinlösenavgifter.
- Stripe Connect för internationella gäster + Apple Pay/Google Pay — använd **destination charges** så pengarna styrs direkt till restaurangens Stripe-konto med Payflow som `application_fee_amount`-mottagare. ([Stripe Connect docs](https://stripe.com/connect))

Alternativt kan Viva.com eller Braintree fungera som **teknisk leverantör för Swish** om ni inte vill bygga Swish Handel-integrationen själva första året ([Viva.com](https://developer.viva.com/payment-methods/local-payment-methods/swish/), [Braintree](https://developer.paypal.com/braintree/docs/guides/local-payment-methods/swish/)) — men detta lägger på extra mellanhandsavgifter.

---

## 4. Kassaregisterlagen (SKVFS 2014:9 + SFL 39 kap) — faktiskt rättsläge

### Grundregeln
Skatteverkets föreskrifter slår fast: "Alla former av elektroniska betalningar är enligt Skatteverket att jämställa med betalning med kontokort." ([skatteverket.se](https://skatteverket.se/foretag/drivaforetag/kassaregister.4.121b82f011a74172e5880005263.html), [Rättslig vägledning](https://www4.skatteverket.se/rattsligvagledning/edition/2023.14/339817.html)). Detta inkluderar Swish och kortbetalningar via Payflow. Allt måste registreras i ett **certifierat kassaregister** (med kontrollenhet eller kontrollsystem enligt SKVFS 2020:9) när restaurangens omsättning överstiger 4 prisbasbelopp — för 2026: **236 800 kr** ([onslip.com](https://www.onslip.com/anmala-kassaregister-och-kontrollenhet-till-skatteverket/)).

### Den avgörande förenklingen 1 oktober 2025
Detta är **kritiskt** för Payflows juridiska modell. Skatteverket införde 2025 en ändring:
> "Företag behöver inte längre anmäla registreringsenheter som tillhör deras kunder till Skatteverket. **Den situation som avses är att företagen sätter upp en QR-kod eller på annat sätt låter kunden sköta registreringen av försäljningen och betala för sina varor/tjänster via sin egen enhet t.ex. mobiltelefon.**" ([Tidningen Konsulten / Srf](https://tidningenkonsulten.se/artiklar/srf-konsulterna-tipsar-forenkling-av-reglerna-om-kassaregister/))

Det betyder: gästens mobiltelefon när hen betalar via Payflow räknas inte som en registreringsenhet restaurangen måste anmäla. Undantaget gäller *under förutsättning att företagen anmält minst en registreringsenhet till Skatteverket med samma kontrollenhet*.

### Hur ansvarsfördelningen ser ut i praktiken
**Restaurangen** (inte Payflow) är **alltid ansvarig** för att försäljningen registreras i kassaregistret. Försäljningen sker mellan restaurangen och gästen; Payflow är bara en betaltransportkanal. Det fiskala kvittot med kontrollkod måste utfärdas av **POS-kassaregistret**, inte av Payflow.

Praktisk arkitektur:
1. Gäst beställer hos servitören → POS skapar check (ingen registrerad försäljning ännu, detta är en "öppen nota" — inte en avslutad transaktion).
2. Gäst scannar Payflow-QR → betalar via Swish/kort → pengar går till restaurangens konto.
3. **Payflow anropar POS API:n**: `POST /checks/{id}/payments` med `{ method: "Payflow", amount: X, tip: Y }` — **detta triggar POS:ens kassaregister att registrera försäljningen, skapa kontrollkod och utfärda fiskalt kvitto**.
4. POS skickar tillbaka kvittoreferens → Payflow visar/mailar digitalt kvitto till gästen (elektroniskt kassakvitto enligt SKVFS 2014:10 1 §).

**Detta mönster är EXAKT samma som Sunday, Karma och Trivec Buddy använder.** Karma säger själva: "Betalningarna via Karma skickas snabbt, enkelt och säkert till Trivecs kassasystem" ([trivec.se/karma](https://www.trivec.se/produkter/integrationer/karma/)). Sunday: "Once items are added to the order, tap on the 'Pay by deposit' button... deposit can be applied as a payment" — Sunday triggerar POS:en att avsluta.

### Kritisk designprincip för Payflow
**Payflow får aldrig "äga" försäljningen.** Om betalningen går till ett Payflow-konto (istället för direkt till restaurangens konto) blir Payflow potentiellt kommissionär enligt Rättslig vägledning 339817 ("Det mottagna beloppet för någon annans räkning är generellt att anse som en sådan kontant försäljning") — och då måste Payflow själva ha kassaregister. Detta är vad som händer om man bygger på Stripe Connect utan Connect's destination-modell.

**Rekommendation:** Använd Stripe Connect **destination charges** och Swish Handel **direkt mot restaurangens Swish-nummer**. Pengar rör aldrig Payflows konto. Payflow debiterar månadsavgift + revenue share via separat faktura eller application_fee.

### Vad händer om POS:ens API är ner?
Payflow måste ha en **fail-safe**: vid API-fel, visa gästen ett digitalt Swish/kort-kvitto + en uppmaning till personalen att manuellt markera notan betald i POS. Alternativt: buffra betalningen och retrya POS-anropet. Gör INTE betalningen utan POS-registrering, eftersom restaurangen då bryter mot SKVFS.

---

## 5. Dagsrapporter, bokföring, SIE-export

### Innehåll i dagsrapport (Payflow krogardashboard)
Enligt SKVFS 2014:9 kap 7 måste en Z-dagrapport från ett kassaregister innehålla bestämda uppgifter. **Payflow är inte kassaregistret** — men den dashboard krögaren loggar in i ska komplettera POS-rapporten. Minimuminnehåll:

- **Transaktionsnivå:** tidpunkt, bord/check-id, belopp brutto, dricks, avgift (Payflow + PSP), netto till krögaren, betalmetod (Swish/kort/Apple Pay), gästen eventuella betyg 1–5.
- **Aggregerat per dag:** antal transaktioner, total bruttoomsättning via Payflow, **moms per sats** (12 % mat, 25 % dryck/alkohol — OBS sänkning till 6 % på livsmedel från 1 april 2026 enligt [Kassacentralen](https://www.kassacentralen.se/) och Skatteverket), total dricks, Payflow-avgifter, Swish/Stripe-avgifter, **netto-utbetalning till restaurangens konto**.
- **Månadsrapport:** samma data + topplista rätter, servitörer med högst dricks, snittnota, konverteringsgrad (scans → betalda notor).
- **Genomsnittligt review-score** (Sunday rapporterar att 85 % av gästerna lämnar recension efter betalning — [Restaurant Business](https://www.restaurantbusinessonline.com/technology/qr-code-payments-company-sunday-raises-21m)).

### X-rapport vs Z-rapport
- **X-rapport** = avstämningsrapport mitt i dagen (kan tas flera gånger). Nollställer inte räknare.
- **Z-rapport** = dagsavslut. Nollställer räknare, skapar grund för bokföring. Skickas automatiskt till bokföringsintegrationen enligt SKVFS 2014:9.

Payflow genererar en **"Payflow-Z" per dag** per location som kan matchas mot POS:ens Z-rapport. Avstämning: Payflow-Z-summa ≡ Summan av `payment.method = "Payflow"` i POS:ens Z-rapport (± avgifter som dras efter).

### SIE-fil för svensk bokföring
SIE är svensk öppen standard för överföring av bokföringsdata. Spiris var en av grundarna ([spiris.se](https://www.spiris.se/ekonomiplattform/bokforing-fakturering/vad-ar-en-sie-fil)). Fyra typer:
- **SIE 1:** årssaldon
- **SIE 2:** periodsaldon
- **SIE 3:** objektsaldon
- **SIE 4:** inkluderar verifikationer (transaktioner) — **detta är det enda relevanta för Payflow**
- **SIE 4i:** endast verifikationer, avsedd för försystem — ideal för Payflows export till Fortnox/Visma/Bokio.

Exempel SIE 4i-struktur (inkomstverifikation):
```
#FLAGGA 0
#PROGRAM "Payflow" 1.0
#FORMAT PC8
#GEN 20260423 "Payflow Export"
#SIETYP 4
#FNAMN "O'Learys Linköping AB"
#ORGNR 556789-1234
#VER "P" "20260423-001" 20260423 "Payflow dag"
{
  #TRANS 1930 {} 12500.00    // Bank (Swish-kontot)
  #TRANS 3001 {} -10000.00   // Försäljning mat 12% moms
  #TRANS 3002 {} -2000.00    // Försäljning dryck 25% moms
  #TRANS 2611 {} -400.00     // Utgående moms 12%
  #TRANS 2610 {} -500.00     // Utgående moms 25%
  #TRANS 6570 {} 400.00      // Bankavgifter (Swish)
}
```
Viktigt: Filformatet är **PC8-kodat** (DOS-kodning), inte UTF-8 — detta är en klassisk integrationsfälla för utvecklare.

Rekommenderad stack:
- **Fortnox** — dominerande i Sverige (360 000+ företag). Har både integrationsbiblioteket och en **fakturamodul** som TruePOS redan integrerar mot ([support.fortnox.se](https://support.fortnox.se/produkthjalp/bokforing/sie-fil)). Fortnox Integrations License kostar från ca 189 kr/mån för slutkund ([fortnox.se](https://www.fortnox.se/integrationer/integration/kassacentralen-i-skane-ab/truepos-by-kassacentralen)).
- **Visma eEkonomi** — näst störst.
- **Bokio** — populärt bland småföretagare med gratis-plan.
- **Björn Lundén (Lundify)** — vanligt hos restauranger.

**Rekommendation för Payflow MVP:** Börja med **SIE 4i export-knapp** i dashboarden (nedladdning av .se-fil) + **Fortnox API-push** via deras officiella API. Spara integration mot Visma/Bokio till MVP v2.

### Avstämning Payflow ↔ POS
Två matchningsnycklar:
1. **POS check-id** (från `POST /checks/{id}/payments`).
2. **Payflow transaction-id** (loggas i POS:ens payment row som metadata/reference).

Denna dubbelriktade referens gör att en månads-reconciliation kan göras automatiskt: ge krögaren en rapport som visar om alla Payflow-transaktioner hittas i POS:en och vice versa.

---

## 6. Supabase-arkitektur för multi-tenant Payflow

### Databasschema (förslag, Postgres + Supabase RLS)

```sql
-- Tenants = restaurangägarorganisationer (franchise, kedja)
create table tenants (
  id uuid primary key default gen_random_uuid(),
  org_name text not null,              -- "O'Learys Linköping AB"
  org_number text not null unique,     -- "556789-1234"
  created_at timestamptz default now()
);

-- Locations = enskilda fysiska restauranger
create table locations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  name text not null,                  -- "O'Learys Linköping Stora Torget"
  pos_system text not null,            -- 'truepos' | 'trivec' | 'onslip'
  pos_location_id text,                -- external id i POS
  swish_payee_alias text,              -- restaurangens Swish-nummer
  stripe_connected_account_id text,    -- acct_xxx
  timezone text default 'Europe/Stockholm',
  vat_mat_percent numeric default 12,  -- 6% från 1/4 2026
  vat_dryck_percent numeric default 25,
  vat_alkohol_percent numeric default 25
);

-- Bord med QR-kod
create table tables (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id),
  label text not null,                 -- "Bord 7"
  qr_token text not null unique,       -- randomized, public URL-safe
  active boolean default true
);

-- Öppna notor speglade från POS
create table checks (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id),
  table_id uuid references tables(id),
  pos_check_id text not null,          -- id från POS
  status text not null check (status in ('open','partially_paid','paid','closed','cancelled')),
  total_amount_ore integer not null,   -- spara som integer öre, aldrig float
  paid_amount_ore integer default 0,
  opened_at timestamptz not null,
  last_synced_at timestamptz default now(),
  pos_snapshot jsonb,                  -- full senaste check-payload
  unique (location_id, pos_check_id)
);

create table check_items (
  id uuid primary key default gen_random_uuid(),
  check_id uuid not null references checks(id) on delete cascade,
  pos_item_id text,
  name text not null,
  quantity numeric not null,
  unit_price_ore integer not null,
  vat_percent numeric not null,
  amount_ore integer not null
);

-- En Payflow-betalning (kan vara partiell av en nota)
create table payments (
  id uuid primary key default gen_random_uuid(),
  check_id uuid not null references checks(id),
  location_id uuid not null references locations(id),
  method text not null check (method in ('swish','stripe_card','apple_pay','google_pay')),
  amount_ore integer not null,
  tip_ore integer default 0,
  payflow_fee_ore integer default 0,
  psp_fee_ore integer default 0,
  external_reference text,             -- Swish paymentRequest token / Stripe PI id
  status text not null check (status in ('pending','paid','declined','refunded','error')),
  paid_at timestamptz,
  receipt_url text
);

create table receipts (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references payments(id),
  pos_receipt_number text,             -- fiskala kvittonumret från POS
  pos_control_code text,               -- kontrollkod från kontrollenheten
  pdf_url text,
  emailed_to text
);

create table tips (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references payments(id),
  server_staff_id text,                -- POS staffId som var ansvarig för bordet
  amount_ore integer not null
);

create table reviews (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references payments(id),
  location_id uuid not null references locations(id),
  rating_food smallint check (rating_food between 1 and 5),
  rating_service smallint check (rating_service between 1 and 5),
  rating_overall smallint check (rating_overall between 1 and 5),
  comment text,
  google_review_posted boolean default false
);

create table daily_reports (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id),
  report_date date not null,
  tx_count integer default 0,
  gross_amount_ore bigint default 0,
  tip_amount_ore bigint default 0,
  vat_12_ore bigint default 0,
  vat_25_ore bigint default 0,
  payflow_fee_ore bigint default 0,
  psp_fee_ore bigint default 0,
  net_payout_ore bigint default 0,
  unique (location_id, report_date)
);

-- Användare (krögaradmin)
create table memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  tenant_id uuid not null references tenants(id),
  role text not null check (role in ('owner','manager','staff')),
  unique (user_id, tenant_id)
);
```

### Row Level Security (RLS)
Följer [MakerKit-mönstret](https://makerkit.dev/blog/tutorials/supabase-rls-best-practices) för team-based access. Helper function:

```sql
create or replace function public.current_tenant_ids()
returns setof uuid language sql security definer stable as $$
  select tenant_id from public.memberships where user_id = auth.uid();
$$;

alter table locations enable row level security;
create policy "tenant_members_read_locations" on locations
  for select using (tenant_id in (select public.current_tenant_ids()));
create policy "tenant_owners_modify_locations" on locations
  for all using (
    exists (select 1 from memberships m
            where m.user_id = auth.uid()
              and m.tenant_id = locations.tenant_id
              and m.role in ('owner','manager'))
  );

-- Samma mönster för checks, payments etc via location_id
alter table checks enable row level security;
create policy "tenant_members_read_checks" on checks
  for select using (
    location_id in (
      select id from locations
      where tenant_id in (select public.current_tenant_ids())
    )
  );
```

**Kritiskt:** Indexera `tenant_id` och `location_id` på *alla* tabeller — utan index sänker RLS queries från 2ms till 3 minuter ([makerkit.dev](https://makerkit.dev/blog/tutorials/supabase-rls-best-practices)).

```sql
create index on locations(tenant_id);
create index on checks(location_id, status);
create index on payments(location_id, paid_at);
create index on memberships(user_id);
```

Lägg `tenant_id` som **custom JWT claim** via en Auth Hook istället för att joina memberships varje query — detta är en av Supabase-communityns best practices 2025–2026. I policyerna blir det: `using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)`.

### Realtime subscriptions
Supabase Realtime respekterar RLS. Servitörers Payflow-app prenumererar:

```ts
// På servitörens enhet / PWA
supabase
  .channel(`payments:${locationId}`)
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'payments',
    filter: `location_id=eq.${locationId}`
  }, (payload) => {
    notify(`Bord ${payload.new.table_label} har betalat ${payload.new.amount_ore/100} kr`)
  })
  .subscribe()
```

### Edge Functions — rollfördelning
| Edge Function | Syfte |
|---|---|
| `pos-webhook-ingest` | Tar emot webhooks från POS (`check.updated` etc), uppdaterar `checks`-tabellen |
| `pos-poll-worker` | Cron-schemalagd (Supabase Scheduled Functions), pollar POS API var 10 sek per aktiv restaurang |
| `swish-callback` | Tar emot Swish payment callbacks, uppdaterar `payments.status = 'paid'`, triggerar POS payment-registrering |
| `stripe-webhook` | Hanterar `payment_intent.succeeded`, `charge.refunded` |
| `pos-register-payment` | Anropar POS API `POST /checks/{id}/payments` efter lyckad Swish/Stripe |
| `generate-daily-report` | Kör 03:00 varje natt, summerar gårdagens payments → `daily_reports` |
| `send-receipt-email` | Skickar e-post med fiskalt kvitto från POS + Payflow-review-länk |

### Supabase Vault för API-nycklar
Varje location's POS API credentials måste krypteras i vila. Supabase Vault (pgsodium-baserad):

```sql
select vault.create_secret(
  'bearer_token_xyz',
  'pos_credentials_location_<uuid>',
  'POS API credentials for O''Learys Linköping'
);

-- I Edge Function
const { data } = await supabaseAdmin.rpc('vault.decrypted_secret', {
  secret_name: `pos_credentials_location_${locationId}`
})
```

### Multi-location per tenant
Tenant (O'Learys Trademark eller den enskilda franchisetagaren) kan ha flera `locations`. Varje `location` har egen `pos_location_id`, egna Swish/Stripe-credentials, egen timezone. Krögaradmin med `role = 'owner'` ser alla, `role = 'manager'` kan vara begränsad till en location via en `location_access`-kopplingstabell vid behov.

### Pull vs Push — rekommendation
**Starta med pull (polling) via pos-poll-worker.** Skäl:
1. Alla svenska POS stöder inte webhooks än.
2. Polling är deterministiskt — du vet exakt när data kommer.
3. Webhooks är skört när en gäst öppnar Payflow just nu och behöver färsk data.

Implementera webhook-listeners som **optimization** (lägre latens) när POS stödjer det. Belt-and-suspenders: polla alltid var 1–5 minut som backup även när webhooks är på, exakt som Toast rekommenderar.

---

## 7. Hårdvara på plats i restaurangen

### QR-klistermärken och bordsstativ
Sunday-grundaren Christine de Wendel noterar: *"Consumers love them if they look good"* — de investerar i "beautiful tabletop placards" ([Restaurant Business](https://www.restaurantbusinessonline.com/technology/qr-code-payments-company-sunday-raises-21m)). Rekommendation:

- **Material:** Laminerad tryckt akryl eller borstad aluminium, minst A6. Billigare: laminerat papper i plexihållare.
- **QR-kodtyp:** **Statisk** — varje bord har egen permanent QR som pekar på `https://payflow.se/t/{qr_token}`. Backend slår upp token → bord → aktiv check via POS API.
- **Storlek:** QR ≥ 3×3 cm, scannbar från 30 cm avstånd.
- **Design:** Dubbel information — "Scanna för att betala själv + lämna dricks" + Payflow-logga + restaurangens logga.
- **Produktion:** VistaPrint Sverige / Bolero / lokal tryckare, ca 50–100 kr per bordsstativ. Kvalitetsalternativ: svarvad aluminium från Etsy, 200–400 kr per bord.
- **Hållbarhet:** Akryl/metall tål mat/öl/städkemikalier i 2+ år.

För O'Learys Linköping (3 500 m², 600 sittande gäster) → ~100 bord → bordstativ kostar 5 000–40 000 kr beroende på kvalitet. **Inkludera i pilotpaketet som gåva** (finansieras via parfymmaskinen — se sektion 8).

### Lokal bridge-enhet (när POS saknar öppet API)
Om POS saknar publikt API (vanligt med legacy TruePOS-installationer) behöver Payflow en **local bridge**: en liten Android-enhet i restaurangens nätverk som pratar med POS via dess lokala nätverksprotokoll (oftast TCP-socket eller serial/USB) och exponerar en HTTP-tunnel mot Payflows moln.

- **Rekommenderad hårdvara:** **Teclast P25T** eller **Lenovo Tab M10** — 10" Android-surfplatta, 1 500–2 500 kr. Alternativt Raspberry Pi 5 + 7" skärm, ~2 000 kr (men Android är enklare för drift).
- **Kiosk mode:** Android Enterprise **Dedicated Devices / Lock Task Mode** (Android 9+) via tredjeparts MDM som Scalefusion, Esper eller Fully Kiosk Browser ([Esper blog](https://www.esper.io/blog/android-kiosk-mode-vs-kiosk-software), [Android Developer docs](https://developer.android.com/work/dpc/dedicated-devices)). Screen pinning räcker inte för produktion — det kan kringgås.
- **Provisioning:** QR-kod-baserad provisioning (skanna QR vid första boot → Payflow MDM tar över enheten → installerar Payflow Bridge-app → låser). Tar ~3 minuter per enhet.
- **Leveransmodell:** Skicka enhet förkonfigurerad + strömadapter + instruktionskort till restaurangen. Kostnad: 2 500 kr hårdvara + 500 kr frakt/provisioning = **3 000 kr per restaurang**, ingår i onboarding.

### Personalnotis när gäst betalat
Tre alternativ:

| Alternativ | Fördelar | Nackdelar | Rekommendation |
|---|---|---|---|
| **PWA på personalens privata telefon** | 0 kr hårdvara, omedelbar rollout | BYOD-friktion, vissa vill inte installera appar | **Primär** |
| **Dedikerad Android-telefon per station** | Full kontroll, delas mellan skift | Kostar + driftansvar | För större kedjor (>50 bord) |
| **Integrerad i POS:ens notis-skärm** | Inga nya enheter | Kräver djupare POS-integration | Långsiktig v2 |

Rekommendation: **Bygg en PWA** (progressive web app) som personalen lägger till på hemskärmen. Web Push Notifications fungerar på Android via VAPID; på iOS from 16.4+. För ljudnotis använd `navigator.vibrate()` + anpassad audio. Krögaren kan skapa personal-konton med `role = 'staff'` som RLS-begränsar till endast `realtime payments`-stream för deras location.

### ESC/POS-skrivare för att trycka Payflow-QR på förnota
Alla svenska termiska kvittoskrivare (Epson TM-T20IV, Star TSP143, Citizen CT-E301 m.fl.) stödjer ESC/POS-kommandosprog inklusive **native QR-code rendering** ([hprt.com](https://swe.hprt.com/Thermal-Receipt-Printer/Best-Practices-for-Choosing-and-Integrating-a-Receipt-Printer-into-Your-POS-System.html), [enetto.com](https://enetto.com/kvittoskrivare)). ESC/POS QR-kommando (GS ( k):

```
GS ( k pL pH cn fn n1 n2      // Select QR model
GS ( k pL pH cn fn n           // Set module size (1–16)
GS ( k pL pH cn fn n           // Set error correction (L/M/Q/H)
GS ( k pL pH cn fn m           // Store data: URL https://payflow.se/c/{check_id}
GS ( k pL pH cn fn m           // Print
```

**Integrationstrick:** Istället för att bygga en egen extension i POS:en, be POS-leverantören att lägga till en **"footer-template"-variabel** i förnotan (`pre-receipt`) som POS:en kan populera med Payflow-URL. Trivec Buddy använder exakt detta mönster — QR skrivs ut på förnotan direkt från POS:en ([blog.trivecgroup.com](https://blog.trivecgroup.com/benefits-of-using-qr-codes-for-restaurant)).

Fallback: Om POS inte stödjer footer-injection, skriv ut separata QR-kort från Payflows moln och lägg permanent på bordet. Enkelt men mindre elegant.

---

## 8. Affärsmodell och prissättning

### Konkurrentanalys (publika data)
| Aktör | Modell | Pris | Källa |
|---|---|---|---|
| **Sunday** | QR pay-at-table + Stripe | "Free to sign up, commission on each transaction" (historiskt ~1% extra utöver Stripe) | [Restaurant Business 2021](https://www.restaurantbusinessonline.com/technology/pay-table-startup-sunday-launches-24m-seed-round) |
| **Karma (Serve)** | QR order & pay | Prissida offentlig men priser ej detaljerade där — typiskt 99–199 €/mån + revenue share | [karma.life/pricing/serve](https://www.karma.life/sv/pricing/serve) |
| **Trivec Buddy / TrivecPay** | QR via Trivec | Ingår i Trivec-kontrakt; QR-hårdvara separat; TrivecPay går via Karma | [trivecgroup.com](https://trivecgroup.com/products/ordering/mobile-ordering/) |
| **Caspeco QR** | Under Caspeco-helhet | Skräddarsydd prissättning, offertbaserad | [caspeco.com](https://caspeco.com/kassasystem-restaurang/) |
| **Typisk PSP-rate** | Kort | 1,5–2,5 % + 0–1,80 kr/tx | [alltomforetagande.se](https://alltomforetagande.se/foretag/swish-foretag/) |
| **Swish Handel** | Direkt | 85–299 kr/mån + 1,75–3 kr/tx | [Handelsbanken](https://www.handelsbanken.se/sv/foretag/konton-betalningar/ta-betalt/swish-for-foretag) |

### Är 1 899 kr/mån realistiskt?
**Ja, på pappret — men svårt att motivera ensamt.** Krogens alternativ:
- Trivec Buddy kostar "extra ovanpå" Trivec-kontrakt — uppskattningsvis 500–1 500 kr/mån.
- Karma Serve tar ofta **transaktionsavgift 2–4%** på det som passerar plattformen.
- Onslip Premium-licens: 829–1 229 kr/mån ([onslip.com](https://www.onslip.com/pos-restaurang/)).

En krögare som redan betalar 2 500 kr/mån för POS tittar på 1 899 kr som "70 % ökning" utan att Payflow har POS-funktionalitet. Detta är varför parfymmaskin-hooken är smart.

### Parfymmaskin-ekonomin
Data på svenska parfymautomater i bar-/restaurangmiljö är inte publikt dokumenterad. Generisk automatekonomi (baserat på [1000affarsideer.se](https://www.1000affarsideer.se/handel-grossist/737-varuautomater.html)):
- **Placering:** Krögaren lånar ut ~0,5 m² vid damtoaletten.
- **Typisk intäkt för automatägaren:** 3 000–8 000 kr/mån per hög-frekvens bar (10–30 sprej/dag à 10 kr).
- **Provision till restaurangen:** 20–30 % → **600–2 400 kr/mån** till krögaren, ofta nettot efter påfyllnad.

**Bundle-matte:**
- Payflow: 1 899 kr/mån
- − Parfymprovision till krögaren: 1 500 kr/mån (medelvärde)
- = **Netto för krögaren: 399 kr/mån**
- Resonemanget i säljmötet: *"Du får pay-at-table som ersätter rusningshantering under fredagkvällar för under 400 kr — mindre än en servitörstimme."*

Detta är **exakt parallellen** till hur Karma pitchade "gratis" — de sa inte att det var gratis utan fokuserade på att deras provision gick balanserad mot svinn/ökad försäljning.

### Break-even för krögaren
Antag O'Learys Linköping: 600 sittande, 3,5 vändningar/kväll 4 kvällar/vecka = ~8 400 gäster/vecka. Snittnota enl. Trivec-data ökar 12–50 % med QR ([trivec.se/qr-kod](https://www.trivec.se/produkter/qr-kod-for-restaurang/)), säg konservativt **+5 %**. Snittnota O'Learys ca 280 kr → +14 kr/nota × 8 400 = **+117 600 kr/vecka** i topline = **~470 000 kr/mån** incremental revenue. Vid 20 % marginal: **~94 000 kr/mån** netto-vinst.

Break-even mot 1 899 kr/mån: inträffar redan efter **12 notor/månad** med bara 14 kr mer per gäst. **Pitchen skriver sig själv.**

Dessutom: Sunday mäter **12 minuter sparad tid per transaktion** genom självbetalning ([Restaurant Business](https://www.restaurantbusinessonline.com/technology/qr-code-payments-company-sunday-raises-21m)). Även om det bara är 3–5 minuter i Sverige (BankID är snabbt), motsvarar 3 min × 100 notor/kväll = 5 timmars sparad servitörstid per dag = ~1 350 kr × 28 dagar = **~38 000 kr/mån i labor saved**.

### No-risk trial-struktur
Rekommenderade upplägg:
1. **30 dagars gratis pilot** — ingen månadsavgift, ingen transaktionsavgift, parfymmaskin installeras dag 1. Krögaren förlorar *inget*.
2. **Från dag 31: revenue share 2,5% på transaktionsvärde över Swish** istället för fast månadsavgift under första 6 månaderna. Då är din årliga ekonomi kopplad till faktisk volym.
3. **Efter 6 månader:** Konvertera till **1 899 kr/mån flat** (eller kvar på revenue share, krögarens val). Parfymmaskin kvar — oberoende intäkt.
4. **Exit-klausul:** 30 dagars uppsägning, ingen bindning. Detta krävs egentligen enligt modern SaaS-praxis i Sverige där Northmill Flo, Vendion och Onslip alla pushar "ingen bindningstid" ([vendion.com](https://www.vendion.com/en), [northmill.com](https://www.northmill.com/se/foretag/branschlosningar/restaurang-cafe/)).

---

## 9. "Komma in på restaurangen" — praktiska vägar

### 30-dagars pilotprocedur
**Vecka -2:** Initial workshop på plats 60 min. Karta ut bordsnumrering, flöden, servitörsscheman. Identifiera pilotens "champion" bland servitörerna (oftast skiftledaren — O'Learys Linköping har tydligt en skiftledar-roll enl. [manpower.se](https://www.manpower.se/jobb/service-handel-butik/skiftledare-hos-olearys-linkping/29681624)).

**Vecka -1:** Installera local bridge + bordsstativ. Testa med 2 bord live. Utbildning för personalen 30 min.

**Vecka 0–4:** Live på alla bord. Dagliga Slack/WhatsApp-check-ins med champion. Veckovis data-review med krögaren.

**Vecka 4:** Results-meeting:
- Antal QR-scans
- Konvertering scan → betalning
- Snittnota via Payflow vs via servitörsterminal
- Genomsnittligt dricks (industridata: Sunday rapporterar att QR-självbetalning ökar dricks eftersom preset tip-buttons trycker användaren till 18–20 % — [sundayapp.com](https://sundayapp.com/tipping-trends-for-restaurants-in-2025/))
- Personalens netto-tid sparad

### Servitörsfacket — hantera hotbilden
Servitörer oroar sig *primärt för två saker*: (1) förlorad dricks, (2) förlorade jobb. Motverka proaktivt:

1. **Dricks-spel:** Payflow fördelar dricks enligt *samma staff assignment* som POS:en redan har. Bygg **preset tip-knappar** (10/15/20 %) — data från Sunday visar att detta *ökar* dricks signifikant vs. att låta gästen skriva belopp själv.
2. **Hot-botten-hantering:** Tydlig kommunikation internt — "Payflow tar inte era jobb, det tar bort den minst trevliga delen (väntan på terminalen) och låter er fokusera på service och upsell."
3. **Belöning för tidig adoption:** Erbjud servitören som gör flest gäst-handovers till Payflow (t.ex. genom att säga "du kan betala själv med den här QR-koden när du är klar") ett 500 kr presentkort.

### Soft launch vs hard launch
- **Soft launch** (rekommenderad): Starta med 10 bord i bardelen eller uteserveringen. Inom en vecka, rulla ut till alla bord. Detta är exakt mönstret [Svenska Brasserier beskriver för Trivec Buddy](https://blog.trivecgroup.com/benefits-of-using-qr-codes-for-restaurant): *"We saw this as smooth for us and something that was also appreciated by many guests. Most guests used it because they did not have to leave the table to order."*
- **Hard launch** (undvik): Rulla ut allt på en gång, vilket skapar kaos om något går fel.

### Case studies / referenser
- **Sunday** — 3 500 restauranger globalt, $145M i capital. Har etablerat att modellen fungerar. ([Restaurant Business](https://www.restaurantbusinessonline.com/technology/qr-code-payments-company-sunday-raises-21m))
- **Miss Voon (Stockholm) via TrivecPay/Karma** — *"49% ökning av snittnotan"* citerat av Ida Svensson. ([trivec.se](https://www.trivec.se/produkter/qr-kod-for-restaurang/))
- **Svenska Brasserier (Sturehof, Riche, Brillo, AIRA) via Trivec Buddy** — gäster föredrar QR-betalning särskilt vid lunch. ([Trivec blog](https://blog.trivecgroup.com/benefits-of-using-qr-codes-for-restaurant))
- **Big Mamma Group** — Sundays ursprung, $300M-restauranggrupp. ([cbinsights.com](https://www.cbinsights.com/company/sunday-2))

Använd dessa som social proof i säljpitchen utan att påstå egen prestanda innan du har den.

---

## 10. Konkreta nästa steg för en teknisk startup

### MVP-scope (vad bygga först)
**Bygg dessa tre saker innan en enda POS-integration är klar:**

1. **Demo-läge utan POS-integration** — Servitören matar in öppen nota manuellt i Payflow-backoffice:
 - Webformulär: "Bord 7, 4 gäster: 2 burgare 185 kr, 1 sallad 165 kr, 4 öl 68 kr..."
 - Genererar QR → gäst betalar → servitör stänger notan manuellt i POS:en.
 - Detta är **Sunday på dag 1, 2021**. Ingen POS-integration behövdes för pilot. ([Restaurant Business](https://www.restaurantbusinessonline.com/technology/pay-table-startup-sunday-launches-24m-seed-round))
2. **Swish Handel-integration** — Få eget tekniskt leverantörs-ID från Getswish. 1 CPOC-certifikat räcker för sandbox.
3. **Dashboard för krögaren** — Lista alla transaktioner, dagsrapport, SIE 4i export-knapp.

### Senare (MVP v2 efter 3–5 piloter)
4. POS-integration via TruePOS (första) och Onslip (andra).
5. Dricksfördelning per servitör.
6. Review-flow (Google Business-integration).
7. Stripe Connect för kort/Apple Pay.

### Demo utan färdig POS-integration
**Demo-rig för säljmöten:**
- Bärbar surfplatta (Payflow "bord 7 QR" taped på baksidan)
- Krögaren scannar → ser en mockad nota "2 IPA + 1 burgare = 320 kr"
- Krögaren klickar Swish → Merchant Swish Simulator returnerar PAID
- Dashboardet uppdateras live — "Du fick just 320 kr + 32 kr dricks"

Detta kan byggas på en helg med Next.js + Supabase + Swish sandbox. Testa på 5 krögare *innan* du skriver en rad integrationskod.

### Juridisk bolagsstruktur
- **Aktiebolag (AB)** är nödvändigt — enskild firma eller handelsbolag funkar inte för att teckna Swish Handel teknisk-leverantörsavtal eller Stripe Connect platform-avtal.
- Grundkapital 25 000 kr (sänkt från 50 000 kr 2020). Skapas via [verksamt.se](https://verksamt.se) → Bolagsverket, kostnad ~2 200 kr. Tar 1–2 veckor.
- **F-skatt** och momsregistrering — momsplikt från 120 000 kr/år, men **registrera ändå** för att kunna dra av ingående moms.
- **Villkor i kundavtalen måste tydligt säga** att restaurangen är säljansvarig (moms, kassaregisterskyldighet). Payflow är "technology service provider". Anlita en jurist med SaaS + betaltjänst-erfarenhet (Vinge, Mannheimer Swartling, Setterwalls eller specialiserade SaaS-advokater från 15 000–30 000 kr för standardavtal).

### PSP-avtal och kortinlösen
Du har tre vägar:

1. **Stripe direkt** — Enklast. Skapa Stripe-konto på [stripe.com/se](https://stripe.com). För marketplace-modellen: aktivera **Stripe Connect**. Dina restauranger onboardas som "Connected Accounts" (express eller custom). Pengarna routas direkt till dem, din `application_fee_amount` dras av. Time-to-live: 1 vecka. Stripe är [PCI DSS Level 1 compliant](https://stripe.com/en-se/legal/ssa).
2. **Worldline / Elavon via Nordea eller Swedbank Pay** — Lokal, etablerad. Mer administrativ overhead, möjligen bättre priser för svensk volym. ([swedbankpay.se](https://www.swedbankpay.se/vara-losningar/ta-betalt-i-butik/kortterminal-betalterminal), [nordea.se](https://www.nordea.se/foretag/produkter/foretagskort/kortinlosen.html))
3. **Payment facilitator-modell via en partner (Finix, Viva.com)** — För större skala. Onödigt komplext innan 10 000+ transaktioner/mån.

**Rekommendation för år 1:** Stripe Connect + Swish Handel. Migrera inte förrän du har 1M+ kr/månad i volym — då kan en kortinlösenförhandling spara ~0,3 procentenheter.

### Certifieringar
**PCI DSS — vad gäller för Payflow?**
Om betalningssidan använder Stripe's **hosted payment page** eller **Payment Element (iframe)**:
- Ni kvalificerar för **SAQ A** (den lättaste nivån) från SAQ A v4.0.1 som började gälla 1 april 2025. ([pcisecuritystandards.org](https://listings.pcisecuritystandards.org/documents/PCI-DSS-v4-0-SAQ-A.pdf))
- Kärnkrav: HTTPS, starka lösenord, fysisk säkerhet för papperskvitton om ni har dem, och (nytt i v4) **script attack protection** per Requirement 6.4.3 och 11.6.1.
- Tidsåtgång: några dagar av paperwork + ett externt ASV scan (från t.ex. [Trustwave](https://www.trustwave.com/) ~5 000 kr/år). **Attestation of Compliance** kan signeras av er själva — ingen QSA-audit krävs för SAQ A under volymtröskeln (~6M transaktioner/år).
- **Viktigt:** lagra ALDRIG kortdata ens temporärt på era servrar. Stripe.js + Payment Element löser detta.

**Skatteverkets kassaregister-certifiering:**
- Gäller **inte Payflow** så länge ni inte själva agerar kassaregister (vilket ni inte gör — POS:en fortsätter vara kassaregister).
- Men om ni senare bygger en "Payflow POS Lite"-variant måste ni **tillverkardeklarera** och skicka in blankett SKV 1509 + testprotokoll enligt SKVFS 2014:9 kap 8. ([expowera.se](https://www.expowera.se/ekonomi/krav-pa-kassaregister))

**GDPR:**
- Ni är **personuppgiftsansvarig** för krögar-kontona och **personuppgiftsbiträde** för gästernas betalningsdata som kör igenom systemet. Biträdesavtal (DPA) med varje restaurang.
- Data Processing Agreement med Supabase, Stripe, Getswish.
- Hosta EU-baserat (Supabase har EU-region i Stockholm).

### Första 90 dagarna — konkret roadmap
| Vecka | Aktivitet |
|---|---|
| 1–2 | AB-registrering, F-skatt, Fortnox för egen bokföring. Jurist engagerad. |
| 2–4 | Supabase-schema + RLS live. Next.js-frontend. Stripe-konto aktiverat (sandbox). |
| 4–6 | Swish Handel test-certifikat via hackerpaketet på developer.swish.nu. Fungerande demo-rig. |
| 6–8 | Säljmöten med 5 Linköping-restauranger (inkl. O'Learys). Pilotavtal med 1–2. |
| 8–10 | TruePOS-kontakt formaliserad, börja integrationsbygge eller local-bridge. |
| 10–12 | Första live-pilot på O'Learys. Daglig iteration. |
| 12 | Results-meeting + konverteringsbeslut till betalkund. |

### Sammanfattning — de 5 avgörande designvalen
1. **Pengar rör aldrig Payflow.** Stripe Connect destination charges + Swish direkt till krögarens nummer. Undviker PI-licens, PCI-scope, kassaregisterkrav för Payflow.
2. **POS:en är alltid kassaregistret** — Payflow triggerar POS att registrera försäljningen via API. Följer SKVFS 2014:9 rent.
3. **Polling-first, webhooks som optimization** — fungerar mot alla svenska POS, även de med stängt API.
4. **Starta med TruePOS (O'Learys) + Onslip (lokala Linköping-krogar)**, hoppa över Trivec/Caspeco tills ni har 20+ kunder och förhandlingspoäng.
5. **Parfymautomat är framing, inte affärsmodell** — den netto-noll-räkningen är säljverktyget, men själva Payflow måste ha sin egen positiva unit economics oberoende.

---

## Källor, sammanfattade

**POS-leverantörer och API:**
- [Trivec partnerekosystem](https://trivecgroup.com/products/integrations/), [TrivecPay via Karma](https://www.trivec.se/produkter/integrationer/karma/), [Trivec Buddy](https://trivecgroup.com/products/ordering/mobile-ordering/)
- [Kassacentralen / TruePOS integrationer](https://www.kassacentralen.se/integrationer/)
- [Onslip partnerprogram](https://www.onslip.com/bli-partner/) och [Onslip developer API](https://developer.onslip360.com/)
- [Caspeco Apiary docs](https://caspecopayment.docs.apiary.io/), [Caspeco SDK](https://caspeco.atlassian.net/wiki/spaces/DD/pages/304185348/Caspeco+JavaScript+SDK)
- [Lightspeed K-Series API](https://api-docs.lsk.lightspeed.app/)
- [Toast developer docs](https://doc.toasttab.com/doc/devguide/index.html), [Toast webhook docs](https://doc.toasttab.com/doc/cookbook/apiWebhookUsageChecklist.html)
- [ES Kassasystem](https://eskassa.se/), [Vendion](https://www.vendion.com/en)

**Swish och betalningar:**
- [Swish developer portal](https://developer.swish.nu/documentation/integration), [Swish Merchant Integration Guide v2.6 PDF](https://assets.ctfassets.net/zrqoyh8r449h/aBolaUxwMBZWntQ9CsuLD/c5b0c94c5fb2a298bda91bf4e567d039/Merchant_Integration_Guide_2.6.pdf)
- [Swish QR code spec](https://assets.ctfassets.net/zrqoyh8r449h/12uwjDy5xcCArc2ZeY5zbU/ce02e0321687bbb2aa5dbf5a50354ced/Guide-Swish-QR-code-design-specification_v1.7.2.pdf)
- [Handelsbanken Swish-priser](https://www.handelsbanken.se/sv/foretag/konton-betalningar/ta-betalt/swish-for-foretag), [alltomforetagande Swish-priser](https://alltomforetagande.se/foretag/swish-foretag/)
- [Stripe Connect](https://stripe.com/connect), [Stripe marketplace guide](https://docs.stripe.com/connect/marketplace), [Stripe merchant contracts i Sverige](https://stripe.com/en-se/resources/more/how-merchant-bank-contracts-work-in-sweden)
- [PPRO Swish statistik](https://www.ppro.com/payment-methods/swish/), [Stripe Swish-guide](https://stripe.com/resources/more/swish-an-in-depth-guide)

**Juridik:**
- [Skatteverket kassaregister](https://skatteverket.se/foretag/drivaforetag/kassaregister.4.121b82f011a74172e5880005263.html), [Rättslig vägledning 339817](https://www4.skatteverket.se/rattsligvagledning/edition/2023.14/339817.html)
- [SKVFS 2014:10 konsoliderad](https://www.skatteverket.se/funktioner/rattsinformation/arkivforrattsligvagledning/arkiv/foreskrifter/konsoliderade/2014/skvfs201410.5.3aa8c78a1466c584587755.html)
- [Förenklingar 1 oktober 2025 — Tidningen Konsulten](https://tidningenkonsulten.se/artiklar/srf-konsulterna-tipsar-forenkling-av-reglerna-om-kassaregister/)
- [PCI DSS SAQ A v4.0](https://listings.pcisecuritystandards.org/documents/PCI-DSS-v4-0-SAQ-A.pdf), [FAQ 1588 för e-commerce](https://blog.pcisecuritystandards.org/faq-clarifies-new-saq-a-eligibility-criteria-for-e-commerce-merchants)

**Konkurrenter och marknad:**
- [Sunday fundraise](https://www.restaurantbusinessonline.com/technology/pay-table-startup-sunday-launches-24m-seed-round), [Sunday 2024 raise](https://www.restaurantbusinessonline.com/technology/qr-code-payments-company-sunday-raises-21m)
- [Karma Trivec-integration](https://www.trivec.se/produkter/integrationer/karma/), [Karma Life](https://karma.life/)
- [Svenska Brasserier case med Trivec Buddy](https://blog.trivecgroup.com/benefits-of-using-qr-codes-for-restaurant)

**Supabase och multi-tenant arkitektur:**
- [Supabase RLS best practices](https://makerkit.dev/blog/tutorials/supabase-rls-best-practices)
- [Stacksync multi-tenancy guide](https://www.stacksync.com/blog/supabase-multi-tenancy-crm-integration)
- [Supabase multi-tenant discussion](https://github.com/orgs/supabase/discussions/1615)

**SIE-format och bokföring:**
- [Spiris SIE-guide](https://www.spiris.se/ekonomiplattform/bokforing-fakturering/vad-ar-en-sie-fil), [Fortnox SIE-docs](https://support.fortnox.se/produkthjalp/bokforing/sie-fil)
- [Fortnox × TruePOS integration](https://www.fortnox.se/integrationer/integration/kassacentralen-i-skane-ab/truepos-by-kassacentralen)

**Android kiosk mode:**
- [Android Dedicated Devices officiella docs](https://developer.android.com/work/dpc/dedicated-devices)
- [Esper Android kiosk guide](https://www.esper.io/blog/android-kiosk-mode-vs-kiosk-software)

**O'Learys Linköping:**
- [Career.olearyssportsbar.com](https://career.olearyssportsbar.com/locations/o-learys-linkoping)
- [Skiftledare-jobb hos Manpower](https://www.manpower.se/jobb/service-handel-butik/skiftledare-hos-olearys-linkping/29681624)
- [O'Learys franchise-info](https://www.olearystrademark.com/franchise/)

---

**Slutord:** Denna marknad är het men långt från mättad. Sunday har ~3 500 kunder globalt men <100 i Sverige. Karma driver TrivecPay men är fokuserad på matsvinn-appen. TruePOS har 9 000 svenska kunder och *ingen inbyggd QR-betalningskonkurrent*. Parfymmaskin-hooken är orthodox men fungerar — den eliminerar invändningen "ännu en månadskostnad". Börja med 2 piloter, lär på dem, bygg integration nummer 1 till TruePOS. Lycka till.