# Foundation Contracts Verification

## Scope

- Verification date: 2026-08-09
- Construction branch: `feature/foundation-contracts`
- Construction range: `46232e2` (`chore: initialize Xiadie TypeScript workspace`) through `d5f86ef` (`docs: record task 7 construction trail`)
- Key contract commits: `1e02a3b` (core contracts), `c34af6f` (Self/Agent contracts), `91ab523` (delegate validation), `0bf0229` (partitioned Self requests), `01bce4f` (execution verification), and `45307eb` (turn loop), plus their reviewed hardening commits in the range.

This is evidence for the Phase 1 foundation-contract vertical slice only. It does not claim that the product application, an adapter, or persistent storage has been implemented.

## Environment

| Item | Observed value |
| --- | --- |
| Node.js | `v24.16.0` |
| pnpm | `11.16.0` |
| Test runner | Vitest `v4.1.10` |

The normal developer commands remain `pnpm test` and `pnpm typecheck` (see the README). In this Codex environment, the default `pnpm.cmd` wrapper uses bundled Node `24.14` and emits an engine warning. To obtain clean evidence for the repository's locked Node version, this verification invoked the bundled pnpm `11.16.0` entry point with system Node `C:\Program Files\nodejs\node.exe` (`v24.16.0`) and `CI=true`.

## Commands and results

| Check | Result |
| --- | --- |
| `C:\Program Files\nodejs\node.exe --version` | `v24.16.0` |
| `CI=true C:\Program Files\nodejs\node.exe ...\pnpm.mjs --version` | `11.16.0` |
| `CI=true C:\Program Files\nodejs\node.exe ...\pnpm.mjs test` | exit `0`; 8 test files passed, 74 tests passed, 0 failed |
| `CI=true C:\Program Files\nodejs\node.exe ...\pnpm.mjs typecheck` | exit `0` |
| `git grep -niE '@mastra\|electron\|model[[:space:]-]*sdk\|zod\|database' -- packages/xiadie-core` | no output; `git grep` exit `1` means no matching lines |

The final grep covers the prohibited Core references for Mastra, Electron, model SDKs, Zod, and database implementations. No Core source or package metadata matched.

## Proven boundary evidence

| Boundary | Evidence exercised by the passing suite |
| --- | --- |
| `DelegateRequest` is not authorization | `delegate-validator.test.ts` rejects model-supplied permission fields, capability escalation, and non-policy task types; `turn-service.test.ts` confirms an unauthorized delegate never checkpoints or calls the agent. |
| `AgentTask` has minimal context | `delegate-validator.test.ts` shows untrusted `contextRefs` such as private persona and unrelated memory are excluded; `buildTaskContext` copies only explicit task-context fields. |
| `ExecutionVerifier` exclusively verifies | The opaque `VerifiedExecutionReport` type is compile-time protected in `core-contracts.test.ts`; `execution-verifier.test.ts` rejects malformed or contradictory runtime records and rejects an agent success claim when runtime facts report failure. |
| `SelfRequest` remains partitioned | `self-request-assembler.test.ts` proves user input stays outside persona instructions, copies mutable context defensively, preserves opaque verified evidence, and trims only permitted regions. |
| `executions` is an array | `core-contracts.test.ts` and `turn-service.test.ts` cover direct answers with `executions: []` and delegated turns with a verified execution entry. |
| `Checkpoint` is not a session fact | `turn-service.test.ts` commits only after `self.final`, removes the checkpoint after a committed delegated turn, and retains it without committing on agent, verifier, or final-event failure. |

These tests prove the stated interface and orchestration boundaries for the in-memory Phase 1 slice. They are not evidence of Mastra integration, SQLite durability, desktop integration, Dream, MemOS, Live2D, or voice behavior.
