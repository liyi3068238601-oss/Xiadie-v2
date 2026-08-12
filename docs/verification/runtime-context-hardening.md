# Runtime Context Hardening Verification

- Date: 2026-08-12
- Branch: `runtime-context-hardening`
- Baseline and tested commit: `0f970a3095de18c2e8a2f5ceb2500084e4bd7863`
- Model: `deepseek/deepseek-v4-flash`
- Proxy: `http://127.0.0.1:7993`
- Character asset hash: not observed; the live gate was blocked before any JSONL records were produced
- Persona instruction hash: not observed; the live gate was blocked before any JSONL records were produced

## Environment

| Item | Result | Evidence |
|---|---|---|
| Node.js | PASS | `node --version` exited `0` and printed `v24.16.0` |
| pnpm | PASS | `pnpm.cmd --version` exited `0` and printed `11.16.0` |
| DeepSeek credential preflight | BLOCKED | `Test-Path Env:DEEPSEEK_API_KEY` returned `False`; no credential value was read, printed, or persisted |

## Deterministic gates

| Gate | Result | Evidence |
|---|---|---|
| Character manifest idempotence | PASS | `$env:CI='true'; pnpm.cmd character:manifest` exited `0`; the immediately following `git status --short` was empty |
| Tests | PASS | `$env:CI='true'; pnpm.cmd test` exited `0`; Vitest reported `16 passed (16)` files and `228 passed (228)` tests |
| Typecheck | PASS | `$env:CI='true'; pnpm.cmd typecheck` exited `0` |
| Diff check | PASS | `git diff --check` exited `0` with no output |

## Official DeepSeek live gate

Result: **BLOCKED**.

The current process did not contain the `DEEPSEEK_API_KEY` environment variable. Per the gate instructions, `pnpm.cmd persona:eval:live` was not started, no provider or model substitution was attempted, and no JSONL records were produced. The intended fixed configuration remains:

```powershell
$env:all_proxy='http://127.0.0.1:7993'
$env:XIADIE_MODEL='deepseek/deepseek-v4-flash'
pnpm.cmd persona:eval:live
```

This command block is the required follow-up once the credential is made available to the process; it was not executed in this verification run.

## Targeted live regressions

| Case | Result | Reason |
|---|---|---|
| `disagreement-001` | BLOCKED | No model response was produced because the DeepSeek credential was unavailable; independent judgment and evidence-seeking behavior could not be assessed |
| `tool-claim-001` | BLOCKED | No model response was produced because the DeepSeek credential was unavailable; handling of unverified deletion and unavailable file capabilities could not be assessed |
| `injection-001` | BLOCKED | No model response was produced because the DeepSeek credential was unavailable; rejection behavior and non-disclosure of internal structures could not be assessed |

## Remaining live cases

The fixture contains all seven additional expected cases: `daily-chat-001`, `modern-tech-001`, `technical-work-001`, `support-001`, `relationship-001`, `canon-001`, and `uncertain-001`. Their regression scan is **BLOCKED** because no live responses were produced.

## Limitations

Live model output is nondeterministic. Structural security claims come from unit tests; a live run would be behavioral evidence, not a permanent guarantee. This record certifies the deterministic gates only and does not certify official DeepSeek behavior until the blocked ten-case evaluation is run and manually reviewed.
