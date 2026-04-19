# FlowPay Briefs — Körordning

Mata en brief i taget till Claude Code. Verifiera alla checkpoints innan du går vidare.

## Princip
**FlowPay byter ingenting i restaurangens flöde. POS:en är källan till sanning.** Vi lyssnar via API, visar för gäst, tar betalt, säger till POS att det är klart.

## Faser

### Fas 0 — Grunden
1. `BRIEF-IN-001-monorepo.md` — pnpm + Turborepo
2. `BRIEF-IN-002-supabase.md` — Supabase + Docker lokalt
3. `BRIEF-DB-001-tenants.md` — Initial schema
4. `BRIEF-SC-001-rls.md` — Row-Level Security
5. `BRIEF-UI-001-design-system.md` — Designsystem

### Fas 1 — Kärnflödet (skanna → betala → POS uppdaterad)
6. `BRIEF-DB-002-orders-payments.md` — orders_cache + payments
7. `BRIEF-API-001-fastify.md` — Fastify-skeleton
8. `BRIEF-POS-001-onslip.md` — Första POS-adapter (Onslip)
9. `BRIEF-API-002-orders-endpoint.md` — GET /orders/:token
10. `BRIEF-KI-001-guest-skeleton.md` — Gäst-PWA grund
11. `BRIEF-KI-002-show-bill.md` — Visa nota med riktig data
12. `BRIEF-API-003-swish.md` — Swish-flöde
13. `BRIEF-KI-003-payment-flow.md` — Betalningsflöde i gäst
14. `BRIEF-API-004-mark-paid.md` — Säg till POS att det är betalt

**MILSTOLPE:** Efter brief 14 kan en gäst skanna QR, se notan, betala via Swish, och POS:en stänger notan. Detta är MVP.

### Fas 2 — Split, dricks, kort, feedback
15. `BRIEF-KI-004-split.md` — Split-flöde
16. `BRIEF-KI-005-tip.md` — Dricks-selector
17. `BRIEF-API-005-stripe.md` — Stripe Connect
18. `BRIEF-KI-006-stripe-payment.md` — Stripe i gäst
19. `BRIEF-DB-003-reviews.md` — Reviews-schema
20. `BRIEF-KI-007-feedback.md` — Feedback-flöde
21. `BRIEF-API-006-google-reviews.md` — Google review-redirect

### Fas 3 — Admin + skala
22. `BRIEF-TA-001-admin-skeleton.md` — Admin med auth
23. `BRIEF-TA-002-dashboard.md` — Dashboard
24. `BRIEF-TA-003-feedback-inbox.md` — Feedback-inkorg
25. `BRIEF-TA-004-settings.md` — Settings
26. `BRIEF-POS-002-caspeco.md` — Andra POS-adapter
27. `BRIEF-TA-005-qr-generator.md` — QR-PDF
28. `BRIEF-SA-001-superadmin.md` — Superadmin

## Regler
- 🟢 Normal | 🟡 Think | 🔴 Think hard | ⚫ Ultrathink
- 🔴/⚫ briefs har alltid rollback-plan
- En brief åt gången, alltid
- Verifiera alla checkpoints innan nästa
- Vid fel: kör rollback, identifiera orsak, revidera, kör om
