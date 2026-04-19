# FlowPay Build Sprint — Schema & Milstolpar

**Start:** Söndag 20 april 22:00
**Mål:** Onsdag 23 april 23:00 — alla 28 briefs klara

Cowork kör heltid med mocks så inget blockas av externa parter.

---

## SÖNDAG KVÄLL — Setup-block (22:00–02:00, 4h)

| Tid | Brief | Type | Estimat |
|---|---|---|---|
| 22:00 | IN-001 Monorepo | 🟢 | 30 min |
| 22:30 | IN-002 Supabase | 🟢 | 45 min |
| 23:15 | DB-001 Tenants schema | 🟡 | 45 min |
| 00:00 | UI-001 Designsystem | 🟡 | 90 min |
| 01:30 | API-001 Fastify-skeleton | 🟢 | 30 min |

**Status check 02:00 — STATUS-fil postas**

---

## MÅNDAG — Backbone + första kärnflödet (08:00–22:00, 14h)

| Tid | Brief | Type | Estimat |
|---|---|---|---|
| 08:00 | SC-001 RLS-policies | 🔴 | 2h |
| 10:00 | DB-002 Orders + payments | 🟡 | 1h |
| 11:00 | DB-003 Reviews | 🟢 | 30 min |
| 11:30 | API-002 GET /orders/:token | 🟡 | 1h |
| 12:30 | LUNCH-paus + verifiering | | 30 min |
| 13:00 | KI-001 Gäst-PWA skeleton | 🟡 | 1.5h |
| 14:30 | KI-002 Visa nota med data | 🟡 | 1.5h |
| 16:00 | POS-001 Onslip-adapter (med mock) | 🔴 | 4h |
| 20:00 | API-003 Swish (med mock) | 🔴 | 2h |

**MILSTOLPE 22:00:** Gäst kan se mock-nota + initiera mock-Swish

---

## TISDAG — Kärnflöde stängs + alternativ + admin-start (08:00–22:00, 14h)

| Tid | Brief | Type | Estimat |
|---|---|---|---|
| 08:00 | KI-003 Betalningsflöde gäst | 🔴 | 2.5h |
| 10:30 | API-004 Mark-paid → POS | 🔴 | 2.5h |
| 13:00 | **MILSTOLPE — End-to-end via mock funkar** | | |
| 13:00 | KI-005 Dricks-selector | 🟡 | 1h |
| 14:00 | KI-004 Split-flöde | 🔴 | 2.5h |
| 16:30 | API-005 Stripe Connect (test mode) | 🔴 | 2h |
| 18:30 | KI-006 Stripe i gäst | 🟡 | 1.5h |
| 20:00 | KI-007 Feedback-flöde | 🟡 | 1.5h |
| 21:30 | API-006 Google review-redirect (mock) | 🟡 | 30 min |

**MILSTOLPE 22:00:** Hela gäst-PWA klar end-to-end

---

## ONSDAG — Admin + andra POS + finish (08:00–23:00, 15h)

| Tid | Brief | Type | Estimat |
|---|---|---|---|
| 08:00 | TA-001 Admin-skeleton | 🟡 | 1.5h |
| 09:30 | TA-002 Dashboard | 🟡 | 1.5h |
| 11:00 | TA-003 Feedback-inkorg | 🟡 | 1.5h |
| 12:30 | TA-004 Settings | 🟡 | 2h |
| 14:30 | TA-005 QR-generator | 🟡 | 1.5h |
| 16:00 | POS-002 Caspeco (med mock) | 🔴 | 3h |
| 19:00 | SA-001 Superadmin | 🔴 | 2.5h |
| 21:30 | **End-to-end test + buggfix-buffer** | | 1.5h |

**SLUT 23:00 — alla 28 briefs klara**

---

## Status-checkpoints (Cowork postar STATUS-filer)

- Söndag 02:00 — Setup klart?
- Måndag 12:00 — RLS + DB klart?
- Måndag 18:00 — POS-adapter halvvägs?
- Måndag 22:00 — Swish-flöde initierar?
- Tisdag 13:00 — End-to-end via mock?
- Tisdag 18:00 — Stripe test fungerar?
- Tisdag 22:00 — Gäst-PWA klar?
- Onsdag 12:00 — Halva admin?
- Onsdag 18:00 — Caspeco igång?
- Onsdag 23:00 — KLART

---

## Du (Zivar) — vad du gör parallellt

**Söndag kväll (innan du sover, 30 min):**
1. Mail till Stripe Connect — registrera platform-konto
2. Mail till partner@onslip.com — be om sandbox + prod-API access
3. Mail till partner@caspeco.com — be om OAuth client
4. Mail till din bank — Swish Handel-avtal-process

**Måndag morgon:**
- Verifiera Cowork's söndagsjobb
- Svara på eventuella `blocked/`-filer

**Måndag kväll:**
- Test-skanna QR från egen mobil mot lokal dev-instans
- Verifiera RLS med två test-tenants

**Tisdag 13:00:**
- LIVE-test end-to-end (mock-Swish + mock-Onslip)
- Bjud in Saodi/Hamza att testa också

**Tisdag kväll:**
- Smoke-test gäst-PWA på iPhone + Android
- Notera UX-friktioner → nya briefs för Cowork dag 4 (om det blir behov)

**Onsdag löpande:**
- Stand-by för Cowork när 🔴-briefs körs
- Verifiera milstolpar

**Onsdag kväll:**
- Sluttest: alla 8 demo-flöden från MOCK-STRATEGY.md
- Deploy till staging (Vercel + Fly.io) om tid finns

---

## Vad som händer EFTER onsdag

Vecka 17 (efter sprinten):
- Riktiga Onslip prod-keys kommer → byt env, testa mot riktig restaurang
- Stripe Connect live-mode aktiveras → KYC första 5 restauranger  
- Swish Handel-avtal klart → byt ut mock-Swish
- Första betalande kund onboardas live

Vecka 18-20:
- Bugfix från riktiga användare
- Performance-optimering
- Caspeco prod när partner-status godkänts

---

## Risker & beredskap

| Risk | Sannolikhet | Beredskap |
|---|---|---|
| Cowork fastnar > 1h på en brief | Hög | `blocked/`-fil → Zivar löser eller skippar |
| RLS recursion-fel | Medel | Buffer 1h i SC-001-slot |
| TypeScript strict-mode-strul | Medel | Tillåt `// @ts-expect-error` med JSDoc-motivering |
| Cowork tappar kontext mellan briefs | Hög | STATUS-filer + done/-mappen återställer state |
| Estimaten är för optimistiska | Hög | Skär POS-002 + SA-001 om vi ligger efter — gör dem post-sprint |

---

## Definition of Done (onsdag 23:00)

- [ ] Alla 28 briefs har `done/`-fil
- [ ] Inga `blocked/`-filer kvar (eller dokumenterade som "post-sprint")
- [ ] End-to-end demo i MOCK-STRATEGY.md pass 1-8 funkar
- [ ] Lighthouse Performance ≥ 90 på gäst-PWA
- [ ] TypeScript strict, 0 fel
- [ ] CI grön på main-branch
- [ ] README med "hur man kör lokalt" finns
