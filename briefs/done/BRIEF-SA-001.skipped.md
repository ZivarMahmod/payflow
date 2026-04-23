# BRIEF-SA-001 — Security audit + hardening — SKIPPED

- **Date:** 2026-04-23T09:08+02:00
- **Commit:** pending-zivar-commit
- **Reason:** ULTRATHINK
- **Thinking tier:** ⚫ Ultrathink

## What's needed to unskip

Zivar reviews before run. SA-001 is tier ⚫ Ultrathink, and per
`SKIP-CONDITIONS.md` §Principle:

> **Tier ⚫ Ultrathink.** These require review before commit. Never
> run unattended.

The brief should be executed interactively — the agent should not
author a security audit unsupervised because:

1. An audit implies CHANGES (RLS tightening, header hardening, rate
   limits, secret rotation playbooks). Each change has a non-obvious
   blast radius. The whole sprint runs on mock-first adapters; a
   "harden everything" pass that flips behavior can mask real bugs
   behind new protections that weren't there during unit tests.
2. Authored unattended, a security brief tends to over-lock or
   under-lock. Zivar's taste + FlowPay's actual threat model (small
   sample of Swedish restaurants, single-tenant restaurants, Swish
   as primary rail) should drive which risks are P0 vs. backlog.
3. The sprint has now processed 22 briefs — a lot of new surface
   area. A fresh audit pass against a moving codebase would chase
   ghosts. Waiting for the sprint to settle first is better.

## Why SKIPPED and not PREPARED

PREPARED is for briefs that ship code whose correctness is
mechanical (migrations, route skeletons against a well-specified
interface). A security audit's correctness is judgment-bound.
Writing a "draft audit" now and asking Zivar to review it is
functionally identical to skipping and letting her run the brief
interactively — except the SKIPPED path doesn't add a file that
would need to be un-committed if her audit disagrees.

## Blocks

- Nothing downstream. SA-001 is a cross-cutting review, not a
  dependency of any implementation brief.

## What the night-run DID do in lieu of SA-001

Each PREPARED/DONE brief in this run includes a short "anti-pattern
coverage" block that lists security-adjacent checks: RLS filter
paths, service-role isolation, secret handling, CSRF state
signing, HMAC timing-safe comparison, webhook signature verification,
rate limiting intent. Those are point-in-time notes a real audit
should corroborate or correct — they are not a substitute for the
audit.

A consolidated list of the security-relevant invariants asserted
across this run is in `STATUS-ZIVAR-EFTER-KONTROLL.md` under the
"Security surface" section; SA-001 can use it as a starting checklist.

## When it's safe to run autonomously

Never fully unattended. SA-001 should always be an interactive run
with Zivar reading each finding and approving each tightening.
