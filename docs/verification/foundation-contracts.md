# Foundation Contracts Verification

## Scope

- Verification date: 2026-08-11
- Construction branch: `feature/foundation-contracts`
- Construction range: `46232e2` (`chore: initialize Xiadie TypeScript workspace`) through `ffd6975` (`fix: harden foundation trust boundaries`)
- Key contract commits: `1e02a3b` (core contracts), `c34af6f` (Self/Agent contracts), `91ab523` (delegate validation), `0bf0229` (partitioned Self requests), `01bce4f` (execution verification), `45307eb` (turn loop), and `ffd6975` (final trust-boundary hardening), plus their reviewed hardening commits in the range.

This is evidence for the Phase 1 foundation-contract vertical slice only. It does not claim that the product application, an adapter, or persistent storage has been implemented.

## Environment

| Item | Observed value |
| --- | --- |
| Node.js | `v24.16.0` |
| pnpm | `11.16.0` |
| Test runner | Vitest `v4.1.10` |

The normal developer commands remain `pnpm test` and `pnpm typecheck` (see the README). In this Codex environment, the default `pnpm.cmd` wrapper uses bundled Node `24.14` and emits an engine warning. To obtain clean evidence for the repository's locked Node version, this verification invoked the bundled pnpm `11.16.0` entry point with system Node `C:\Program Files\nodejs\node.exe` (`v24.16.0`) after setting `$env:CI='true'`.

## Actual Windows PowerShell commands

The following commands were used for this verification and can be copied into Windows PowerShell:

```powershell
$env:CI='true'
$systemNode = 'C:\Program Files\nodejs\node.exe'
$pnpmEntry = 'C:\Users\liyi\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\pnpm\bin\pnpm.mjs'

& $systemNode --version
& $systemNode $pnpmEntry --version
& $systemNode 'node_modules\vitest\vitest.mjs' run packages/xiadie-core/src/core-contracts.test.ts packages/application/src/self-request-assembler.test.ts packages/application/src/execution-verifier.test.ts packages/application/src/turn-service.test.ts packages/application/src/delegate-validator.test.ts
& $systemNode $pnpmEntry test
& $systemNode $pnpmEntry typecheck
git grep -ni -e '@mastra' -e 'electron' -e 'model SDK' -e 'zod' -e 'database' -- packages/xiadie-core
git diff --check
```

## Commands and results

| Check | Result |
| --- | --- |
| First PowerShell command block: Node version | `v24.16.0` |
| First PowerShell command block: pnpm version | `11.16.0` |
| Focused adversarial tests | exit `0`; 5 test files passed, 93 tests passed, 0 failed |
| First PowerShell command block: test | exit `0`; 8 test files passed, 96 tests passed, 0 failed |
| First PowerShell command block: typecheck | exit `0` |
| `git grep -ni -e '@mastra' -e 'electron' -e 'model SDK' -e 'zod' -e 'database' -- packages/xiadie-core` | no output; `git grep` exit `1` means no matching lines |
| `git diff --check` | exit `0` |

The final grep scans Core source and tracked package metadata for the prohibited Mastra, Electron, model SDK, Zod, and database references. It produced no output; exit `1` is `git grep`'s expected no-match status.

## Proven boundary evidence

| Boundary | Evidence exercised by the passing suite |
| --- | --- |
| `DelegateRequest` is not authorization | `delegate-validator.test.ts` rejects model-supplied permission fields, capability escalation, and non-policy task types; `turn-service.test.ts` confirms an unauthorized delegate never checkpoints or calls the agent. |
| `AgentTask` has minimal context | `delegate-validator.test.ts` shows untrusted `contextRefs` such as private persona and unrelated memory are excluded; `buildTaskContext` copies only explicit task-context fields, with symmetric source-mutation coverage for relevant facts, artifacts, and constraints. |
| Persona instructions are trusted and closed | Core narrows every `CompiledPersona` region to readonly `character + core + instruction` fragments; `self-request-assembler.test.ts` rejects poisoned user/tool sources, non-core trust, and non-instruction purposes with `persona_instruction_invalid`, while valid persona fixtures pass. |
| `ExecutionVerifier` exclusively verifies immutable facts | The opaque `VerifiedExecutionReport` type remains compile-time protected in `core-contracts.test.ts`; `execution-verifier.test.ts` proves the report, evidence array, and each evidence item are frozen, rejects malformed or contradictory records, and rejects empty/blank operation IDs plus non-finite, unsafe, fractional, or negative event sequences. |
| `SelfRequest` remains partitioned and immutable | `self-request-assembler.test.ts` proves user input stays outside persona instructions, factory context is snapshotted defensively, verifier-owned evidence identity is preserved, every request partition is frozen, and only permitted regions are budgeted. `turn-service.test.ts` proves malicious Self mutation cannot alter initial/follow-up provenance or committed facts. |
| Cached turn results cannot be polluted | `turn-service.test.ts` proves `TurnRunResult` wrappers are frozen and readonly: mutation attempts cannot change the exact Promise/result observed by concurrent callers or history retries; committed records remain frozen. |
| `executions` is an array | `core-contracts.test.ts` and `turn-service.test.ts` cover direct answers with `executions: []` and delegated turns with a verified execution entry. |
| `Checkpoint` is not a session fact | `turn-service.test.ts` commits only after `self.final`, removes the checkpoint after a committed delegated turn, and retains it without committing on agent, verifier, or final-event failure. |

These tests prove the stated interface and orchestration boundaries for the in-memory Phase 1 slice. They are not evidence of Mastra integration, SQLite durability, desktop integration, Dream, MemOS, Live2D, or voice behavior.
