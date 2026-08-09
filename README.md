# Xiadie Foundation Contracts

This repository currently contains the Phase 1 TypeScript foundation-contract vertical slice. It establishes and tests the boundaries between Self, Application, Agent, conversation facts, and execution evidence; it is **not** a complete Xiadie application.

## Implemented

- Frozen `xiadie-core` contracts for IDs, partitioned `SelfRequest`, turn facts, and opaque verified execution facts.
- Separate `self-runtime` and `agent-runtime` event/task contracts.
- Application-level delegate validation, policy-constrained minimal `AgentTask` creation, partitioned Self request assembly, deterministic context budgeting, and deterministic execution verification.
- An in-memory `TurnService`, conversation store, and checkpoint store that exercise the direct-answer and one-delegation paths.
- Contract and orchestration tests for authorization, context, evidence, committed turns, and checkpoint lifecycle behavior.

## Requirements

- Node.js `24.16.0`
- pnpm `11.16.0`

## Run checks

```bash
pnpm test
pnpm typecheck
```

The reproducible Phase 1 verification record is in [docs/verification/foundation-contracts.md](docs/verification/foundation-contracts.md).

## Not implemented

The following are intentionally outside this Phase 1 foundation slice:

- Mastra Adapter
- SQLite persistence
- Electron application shell
- Dream
- MemOS
- Live2D
- Voice

Future adapters and persistence must preserve the frozen architecture boundaries in [ARCHITECTURE.md](ARCHITECTURE.md).
