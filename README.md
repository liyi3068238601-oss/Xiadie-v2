# Xiadie Foundation Contracts

This repository contains the TypeScript foundation contracts and a Phase 3A real-model terminal vertical slice. It establishes and tests the boundaries between Self, Application, Agent, conversation facts, and execution evidence; it is **not** a complete Xiadie application.

## Implemented

- Frozen `xiadie-core` contracts for IDs, partitioned `SelfRequest`, turn facts, and opaque verified execution facts.
- Separate `self-runtime` and `agent-runtime` event/task contracts.
- Application-level delegate validation, policy-constrained minimal `AgentTask` creation, partitioned Self request assembly, deterministic context budgeting, and deterministic execution verification.
- An in-memory `TurnService`, conversation store, and checkpoint store that exercise the direct-answer and one-delegation paths.
- Contract and orchestration tests for authorization, context, evidence, committed turns, and checkpoint lifecycle behavior.
- Versioned Xiadie Character 1.0.3 assets with canonical Manifest validation.
- A deterministic PersonaCompiler with immutable instruction/reference partitions and full/per-turn SHA-256 audit hashes.
- Policy-aware whole-fragment Persona budgeting and a ten-category static evaluation set.
- A tool-free `@xiadie/mastra-self-runtime` adapter and terminal chat entry point.

## Terminal chat (Phase 3A)

Set a Mastra model-router ID and the matching provider credential, then run a one-shot message:

```powershell
$env:XIADIE_MODEL='openai/gpt-5-mini'
$env:OPENAI_API_KEY='...'
pnpm.cmd chat -- '你好，遐蝶'
```

Run `pnpm.cmd chat` without a message for an interactive loop. The Self runtime has no Shell, filesystem, MCP, memory, tools, or subagents. API keys are read from environment variables and are never written to character assets or conversation content.

The ten-case live persona evaluation is opt-in because it makes paid provider calls:

```powershell
pnpm.cmd persona:eval:live
```

It emits JSONL containing the case ID, model, character asset hash, effective persona instruction hash, and response. Default tests never contact a model provider.

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

- SQLite persistence
- Electron application shell
- Dream
- MemOS
- Live2D
- Voice
- Runtime Lore retrieval
- Product UI

Future adapters and persistence must preserve the frozen architecture boundaries in [ARCHITECTURE.md](ARCHITECTURE.md).
