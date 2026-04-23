# BRIEF-TA-004 — Settings — SKIPPED

- **Date:** 2026-04-23T09:06+02:00
- **Commit:** pending-zivar-commit
- **Reason:** DEPENDENCY_SKIPPED (TA-001)
- **Thinking tier:** 🟡 Think

## What's needed to unskip

TA-001 must land first. The settings area lives at
`apps/admin/src/app/(dashboard)/settings/*` and is role-gated to
owner/manager (the staff role cannot see the Settings sidebar link,
per TA-001's anti-patterns). Role-gating depends on the middleware +
session shape TA-001 authors.

Settings is also the natural host for admin-surfaced POS integration
onboarding:
- Onslip API-key entry (mock or real token).
- Caspeco OAuth "Connect" button — routes to the endpoint POS-002
  already landed (`GET /integrations/caspeco/auth`). The admin-side
  UI for that button belongs here.
- Swish, Google Reviews, Stripe (when API-005 ships) credential
  entry forms.

## Why SKIPPED and not PREPARED

Per TA-002/003's reasoning: this is a thin admin-shell consumer.
Additionally, the Caspeco OAuth "Connect" button TA-004 would host is
currently unprotected — the `/integrations/caspeco/auth` and
`/callback` routes POS-002 registered (`apps/api/src/routes/integrations/caspeco-oauth.ts`)
do NOT yet validate an admin session. The intended story is:

1. TA-001 puts a Supabase-Auth session cookie on the admin subdomain.
2. TA-004's Settings page sends a session-bearing fetch to the API.
3. The API's Caspeco OAuth route adds a guard that looks up the
   current staff + `restaurant_id` and only then issues the redirect.

Writing the Settings page pre-emptively would either (a) skip the
guard entirely (unsafe), or (b) commit to a specific session shape
before TA-001 exists (throwaway work).

## Blocks

- The admin-UI portion of POS-002 (Caspeco "Connect" button) is
  implicitly blocked here — the backend routes are live but no UI
  surfaces them until TA-004.
- Same pattern for TA-005 admin-UI (QR-PDF download page) — the
  pure generator package is live but there is no UI. Brief TA-005
  documents a ~40-line wiring snippet ready to drop in.

## When it's safe to run autonomously

Once TA-001 is in main AND the admin's auth middleware can return the
logged-in staff's `restaurant_id`, this brief runs cleanly. The API
routes it consumes (POS-002's OAuth, TA-005's PDF generator) are
already in place.
