# Sprint paused — Cowork sandbox egress outage

**Paused:** 2026-04-21 14:50 CEST
**Reason:** Cowork scheduled sandbox proxy blocks all HTTPS egress
(github.com, registry.npmjs.org, supabase.com) with HTTP 403 since
2026-04-20 06:07. Confirmed across 33 hourly runs and 15 distinct
sandbox VMs. Not a credentials issue. Not per-VM. Platform-level block.

**Not paused:** Cowork chat sessions (like this one) still have egress.

## Current state

- 4/28 briefs done (IN-001, IN-002, UI-001, KI-001)
- All pushed to github.com/ZivarMahmod/payflow as of commit 1190e42
- Next eligible brief when unpaused: DB-001 (tenants schema)

## How to resume

Pick one:

**A. Wait for Cowork to restore egress.** When it works, delete this
PAUSE.md and push. Schemat plockar upp DB-001 nästa slot.

**B. Work locally.** Follow the "Kör lokalt" section in README.md,
use Claude Code CLI (`claude`) on your own machine to process briefs
one by one. Commit+push from your laptop. When done, delete PAUSE.md
if you still want Cowork schedule to take over later.

Zivar recommended option in README / AGENT-BOOTSTRAP: whichever has
momentum. Schedule can be disabled entirely in Cowork sidebar without
affecting this repo.
