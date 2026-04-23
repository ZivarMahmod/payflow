# BRIEF-KI-006 — Stripe-betalning i gäst-PWA — SKIPPED

- **Date:** 2026-04-23T06:03:22+02:00
- **Reason:** DEPENDENCY_SKIPPED (API-005)
- **What's needed to unskip:** Zivar provisions Stripe credentials in `.agent/secrets.env` (STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY, STRIPE_CONNECT_CLIENT_ID, STRIPE_WEBHOOK_SECRET). Then API-005 can be processed, and KI-006 unskipped.
- **Blocks:** none (this is a leaf brief — no downstream depends on KI-006).

## Background
KI-006 wires Stripe PaymentElement (kort / Apple Pay / Google Pay) into the
guest PWA. It depends on API-005 (Stripe Connect server-side: account
onboarding, PaymentIntent creation, webhook handler). API-005 was already
SKIPPED for `MISSING_SECRET` (see `briefs/done/BRIEF-API-005.skipped.md`).

Without `client_secret` from the server side, there is nothing for the
client to confirm — running KI-006 in isolation would be writing UI that
calls a non-existent endpoint. Rather than scaffolding a half-flow that
will need to be reworked once API-005 lands, we skip cleanly and let the
two briefs run together when credentials arrive.

## Files
None created or modified.

## Suggested commit message (for Zivar)
`chore(briefs): skip KI-006 pending Stripe credentials (DEP on API-005)`
