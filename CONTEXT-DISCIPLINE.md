# Context Discipline — Rules for the Scheduled Agent

> Principles extracted from `mksglu/context-mode` and adapted for Cowork/Claude's
> native tools (no plugin required). Read this whenever a brief involves heavy
> tool output, large files, or multi-file analysis. Referenced by
> `AGENT-BOOTSTRAP.md`.

## Core Principle — Think in Code

When analyzing data, **write a script that emits only the answer**. Do not
read many files into context to work things out mentally.

```bash
# BAD — eats 5-10k tokens of context
# Read apps/api/src/routes/*.ts (many files)
# Eyeball for all routes that call orderCache

# GOOD — script emits just the answer
cat > /tmp/find.mjs <<'EOF'
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
const dir = 'apps/api/src/routes';
for (const f of readdirSync(dir)) {
  const body = readFileSync(join(dir, f), 'utf8');
  if (body.includes('orderCache')) console.log(f);
}
EOF
node /tmp/find.mjs
# Output: orders.ts, payments.ts  <-- 2 lines, not 2000
```

## Tool Hierarchy (adapted to native Cowork tools)

| Need | Use | Why |
|---|---|---|
| Find files matching pattern | `Glob` tool | Returns paths only, no content |
| Search content across files | `Grep` tool with `head_limit` | Returns matching lines only |
| Read a known file | `Read` tool with `offset` + `limit` | Targeted sections, not whole file |
| Multi-file analysis | Write node/python script → Bash | One output line vs many file reads |
| Large command output | Pipe to file + grep/tail | Never dump 1000s of lines in context |
| Many independent checks | Parallel Bash calls in one message | Same round-trips, independent outputs |

## Prohibited Patterns

1. **Never** run Bash commands that produce >20 lines of output without piping
   to file or filtering:
   ```bash
   # BAD
   pnpm install
   # GOOD
   pnpm install > /tmp/install.log 2>&1 && tail -5 /tmp/install.log
   # GOOD (only see errors)
   pnpm install 2>&1 | grep -E 'ERR|WARN' | head -20
   ```

2. **Never** `Read` an entire file just to see its structure. Use `head`, `tail`,
   or `Read` with `offset`+`limit`.

3. **Never** dump the contents of a log file into the response. Grep for the
   relevant pattern, summarize in one sentence.

4. **Never** read >5 files sequentially to understand something. Write a
   script instead.

## Output Standards

- Commit messages: one-line summary + details only when needed.
- `.done.md` files: structured, verifiable, no verbose narration.
- Status files: bullets, not paragraphs. What happened + what's next.
- Block files: exact command + exact error + one-sentence hypothesis.

## Heavy Tool Output Checklist

Before running a command, ask:
- Will the output be >20 lines? → pipe to file or grep
- Will I read >3 files? → write a script that summarizes
- Will I do the same analysis twice? → cache the result to a temp file

## When You Catch Yourself Bloating Context

If you notice the conversation is getting long with tool output:
1. Commit progress (WIP-commit if brief isn't done).
2. Write status file with what's been accomplished.
3. End the run. Next hourly run picks up fresh.

Better to take 2 runs with clean context than cram one run with noise.
