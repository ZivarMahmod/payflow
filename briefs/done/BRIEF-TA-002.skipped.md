# BRIEF-TA-002 — Dashboard — SKIPPED

- **Date:** 2026-04-23T09:02+02:00
- **Commit:** pending-zivar-commit
- **Reason:** DEPENDENCY_SKIPPED (TA-001)
- **Thinking tier:** 🟡 Think

## What's needed to unskip

TA-001 must land first. `apps/admin/` does not exist in the tree — the
dashboard page lives at `apps/admin/src/app/(dashboard)/page.tsx` and
the entire (dashboard) segment, layout, and auth middleware are
scaffolded by TA-001.

Once TA-001 is in main and Zivar has logged in to the admin shell once
to verify auth works end-to-end, this brief is ready to run.

## Why SKIPPED and not PREPARED

The dashboard brief's outputs are a page component, a server-action
that queries aggregate stats (today's volume, open orders, avg ticket),
and charts against `recharts` or `@flowpay/ui` primitives. Each of
those imports from either the admin's own `@/lib/supabase/server` or
the dashboard layout's session helpers — both of which TA-001 defines.

Writing the page now against hypothetical imports would be wrong in
three predictable ways:

1. The session-hydration contract TA-001 chooses (Supabase SSR vs.
   Clerk vs. BankID OIDC) dictates what arguments the server component
   gets — `createServerClient` from @supabase/ssr is NOT the same as
   what a Clerk-wrapped layout would pass down.
2. The sidebar layout + tailwind class names come from TA-001's
   scaffold; landing a dashboard page that lives at a path the
   (dashboard) layout doesn't render under produces a 404, not a
   useful preview.
3. Role-gating (staff vs owner/manager) is set up in TA-001's
   middleware. Writing the SQL aggregate query without knowing whether
   the logged-in staff's `restaurant_id` comes from a JWT claim or a
   DB lookup means the query filter is a guess.

Waiting for TA-001 turns this brief into a 30-minute mechanical merge
rather than a speculative rewrite.

## Blocks

- None directly. Nothing else in the sprint depends on the dashboard
  page existing.

## When it's safe to run autonomously

Once TA-001 is in main (and therefore `apps/admin/src/app/(dashboard)/`
exists with a working layout + session helpers), the night-run can
retake this brief without additional human input.
