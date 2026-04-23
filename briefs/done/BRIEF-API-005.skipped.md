# BRIEF-API-005 — Stripe Connect-integration — SKIPPED

- **Date:** 2026-04-23T05:03+02:00
- **Commit:** pending-zivar-commit
- **Reason:** MISSING_SECRET
- **Thinking tier:** 🔴 Think hard (would have been)

## What's needed to unskip

Zivar provisions the following in `.agent/secrets.env` (gitignored):

```
STRIPE_SECRET_KEY=sk_test_...        # FlowPay platform account, test mode
STRIPE_PUBLISHABLE_KEY=pk_test_...   # platform publishable, ships to guest PWA
STRIPE_CONNECT_CLIENT_ID=ca_...      # Connect Standard client id for AccountLinks
STRIPE_WEBHOOK_SECRET=whsec_...      # signing secret for /webhooks/stripe
```

Steps required before re-running the brief:

1. Create Stripe account for FlowPay AB. Activate **Connect Standard** in Dashboard → Connect → Settings.
2. In **Developers → API keys** grab `sk_test_…` + `pk_test_…`.
3. In **Connect → Settings → Integration** grab the `ca_…` client id.
4. After API-005 lands and POST `/webhooks/stripe` is reachable, create a webhook endpoint in Stripe (events: `payment_intent.succeeded`, `payment_intent.payment_failed`), grab the `whsec_…` signing secret.
5. Fill `.agent/secrets.env` with the four values above, push (file is in `.gitignore` so only the local copy on Zivar's machine), and re-queue API-005.

## Why SKIPPED and not PREPARED

Per `SKIP-CONDITIONS.md` the Stripe brief is MISSING_SECRET, not EGRESS_BLOCKED. The difference matters:

- **EGRESS_BLOCKED** briefs can have all their files written and typecheck/lint clean locally; only the live-API verif is deferred. → PREPARED.
- **MISSING_SECRET** briefs cannot even have their files authored correctly without the secret. The brief wants:
  - `packages/payments/src/stripe/index.ts` — needs real `Stripe` client bootstrapping against a real account to know which onboarding-link scopes + `application_fee_amount` semantics apply for `express` vs `standard` (the brief says Standard — behavior depends on what Zivar actually provisions).
  - `apps/api/src/routes/webhooks/stripe.ts` — signature verification is meaningless without `STRIPE_WEBHOOK_SECRET`.
  - `packages/db/supabase/migrations/008_stripe_integration.sql` — columns like `stripe_account_id`, `stripe_onboarding_completed` are straightforward, but committing them in isolation (without the code path that writes them) produces a dead migration that ships empty columns to prod and can't be tested end-to-end.

Writing only the migration now would give a 20-line SQL file that contradicts the brief's "commit once Stripe flows through". Writing the TS skeleton with placeholder envs would ship a route that 500s on first real call. Both outcomes are worse than a clean skip.

## Blocks

- **KI-006** (`BRIEF-KI-006-stripe-payment.md`) — guest-side Stripe PaymentElement. Depends on `STRIPE_PUBLISHABLE_KEY` being reachable from the guest PWA (via `/payments/initiate` response) and on the POST `/payments/initiate` change this brief makes. Will also be SKIPPED this sprint with reason `DEPENDENCY_SKIPPED (API-005)`.

No other downstream brief depends on Stripe — card is an **additional** payment method, Swish (API-003) is already the core happy-path, split (KI-004) + tip (KI-005) work against any method.

## When it's safe to run autonomously

Once `STRIPE_SECRET_KEY` + `STRIPE_CONNECT_CLIENT_ID` + `STRIPE_WEBHOOK_SECRET` are in `secrets.env` **and** egress to `api.stripe.com` is on the sandbox allowlist, the night-run can retake this brief. If egress still blocks Stripe but the keys are present, it drops to PREPARED instead of SKIPPED (we can author the routes + migration + webhook handler against documented Stripe types; only the live `curl` check is deferred).

## Notes

- `USE_MOCK_STRIPE=true` is already in `.agent/secrets.env`. That flag is reserved for a future mock adapter under `packages/payments/src/stripe/mock.ts`; the brief doesn't ask for one and `docs/mock-strategy.md` doesn't list Stripe among mock-first integrations (unlike Swish/Onslip/Caspeco/Google Reviews). If Zivar wants a mock-first path here, that's a new brief — probably API-005a.
- API-005 is a 🔴 Think-hard brief. Per CHARTER, Think-hard briefs that need `engineering:code-review` should never run unattended; this is a second reason the agent errs toward SKIP even if creds arrived mid-run.
