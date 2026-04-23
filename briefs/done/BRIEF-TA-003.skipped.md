# BRIEF-TA-003 — Feedback inbox — SKIPPED

- **Date:** 2026-04-23T09:04+02:00
- **Commit:** pending-zivar-commit
- **Reason:** DEPENDENCY_SKIPPED (TA-001)
- **Thinking tier:** 🟡 Think

## What's needed to unskip

TA-001 must land first. The feedback inbox page lives at
`apps/admin/src/app/(dashboard)/feedback/page.tsx` and relies on the
admin shell's auth middleware, session helpers, and
`restaurant_id`-scoping from TA-001.

The feedback data itself exists already — BRIEF-DB-003 (PREPARED this
run) creates the `reviews` table with columns `rating`, `comment`,
`order_id`, `restaurant_id`, `created_at`, and BRIEF-KI-007 (PREPARED
this run) wires the guest-side submission flow. When TA-001 lands,
this inbox page is a SELECT + a list component.

## Why SKIPPED and not PREPARED

Same reason as TA-002: the page is a thin admin-shell consumer. Its
server component would import `createServerClient` from the admin's
own `lib/supabase/server.ts` — a file TA-001 is responsible for
authoring against whichever auth provider Zivar picks.

There's a weaker version of this brief that could be PREPARED — a
pure component in `packages/ui/` that renders a feedback list given
data — but the brief explicitly asks for a `(dashboard)/feedback/`
page, not a generic component. Splitting it pre-emptively creates
work that the brief didn't ask for.

## Blocks

- None. Feedback inbox is an end-user surface with no downstream
  briefs depending on it.

## When it's safe to run autonomously

Once TA-001 is in main, this brief runs without further input. The
data schema (reviews table) is already in place via DB-003.
