# Egress blocked — Supabase unreachable from Cowork sandbox

- **Date:** 2026-04-22
- **HTTP code:** 403
- **Impact:** DB-001, DB-002, DB-003, SC-001, API-001 health-check blockeras.
- **Mock-first briefs OK:** POS-001, POS-002, API-003, API-006, KI-004, KI-005, TA-005.
- **Action:** Whitelista `*.supabase.co` i Cowork sandbox egress.
