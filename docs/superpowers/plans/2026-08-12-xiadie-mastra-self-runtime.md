# Xiadie Mastra Self Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a real, tool-free Mastra SelfRuntime, a terminal chat path, and an opt-in live persona evaluation runner.

**Architecture:** Keep Mastra behind a new adapter package and preserve the existing SelfRuntime contract. The CLI composes existing loader/compiler/application services with the adapter; live evaluation reuses the same composition but never runs in the default test suite.

**Tech Stack:** Node.js 24.16.0, TypeScript 7.0.2, pnpm 11.16.0, Vitest 4.1.10, `@mastra/core` 1.57.0.

## Global Constraints

- `xiadie-core` must not depend on Mastra or a model SDK.
- The SelfRuntime must expose no tools, MCP, filesystem, shell, memory, or subagent.
- Mastra dependencies use exact versions and the lockfile is committed.
- Tests must not contact a model provider; live calls require an explicit command.
- Persona instructions and user/state/memory/evidence/capability data remain separate.
- Follow RED → GREEN → REFACTOR and commit after each task.

---

### Task 1: Mastra SelfRuntime adapter

**Files:**
- Create: `packages/mastra-self-runtime/package.json`
- Create: `packages/mastra-self-runtime/src/mastra-self-runtime.test.ts`
- Create: `packages/mastra-self-runtime/src/prompt-renderer.ts`
- Create: `packages/mastra-self-runtime/src/mastra-self-runtime.ts`
- Create: `packages/mastra-self-runtime/src/create-mastra-agent.ts`
- Create: `packages/mastra-self-runtime/src/index.ts`
- Modify: `tsconfig.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: `SelfRuntime.respond(input: SelfRequest): AsyncIterable<SelfEvent>`.
- Produces: `MastraSelfRuntime`, `MastraTextAgent`, `createMastraTextAgent({ model })`.

- [ ] **Step 1: Write failing adapter tests**

Cover canonical persona order, separation of user/context data, deterministic started/delta/final events, empty output, and provider failure.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `$env:CI='true'; pnpm.cmd exec vitest run packages/mastra-self-runtime/src/mastra-self-runtime.test.ts`
Expected: FAIL because the adapter package implementation does not exist.

- [ ] **Step 3: Implement the smallest adapter and production Mastra factory**

Render only compiled persona fragments into instructions, pass the current user message independently, adapt `textStream` to SelfEvents, and create a no-tools `Agent` using the exact model string.

- [ ] **Step 4: Verify GREEN and type safety**

Run: `$env:CI='true'; pnpm.cmd exec vitest run packages/mastra-self-runtime/src/mastra-self-runtime.test.ts`
Expected: all focused tests PASS.

Run: `$env:CI='true'; pnpm.cmd typecheck`
Expected: exit 0.

- [ ] **Step 5: Commit**

```powershell
git add packages/mastra-self-runtime tsconfig.json pnpm-lock.yaml
git commit -m "feat: add tool-free Mastra self runtime"
```

### Task 2: Terminal chat vertical slice

**Files:**
- Create: `apps/cli/package.json`
- Create: `apps/cli/src/config.ts`
- Create: `apps/cli/src/bootstrap.ts`
- Create: `apps/cli/src/chat.ts`
- Create: `apps/cli/src/main.ts`
- Create: `apps/cli/src/chat.test.ts`
- Modify: `pnpm-workspace.yaml`
- Modify: `package.json`
- Modify: `tsconfig.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: `MastraSelfRuntime`, character loader/compiler/budgeter, `TurnService` and in-memory stores.
- Produces: `runChatTurn(message, io, dependencies)` and `pnpm chat`.

- [ ] **Step 1: Write failing CLI composition tests**

Cover invalid/missing `XIADIE_MODEL`, one committed direct-response turn, streaming output, and provider error without a committed turn.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `$env:CI='true'; pnpm.cmd exec vitest run apps/cli/src/chat.test.ts`
Expected: FAIL because CLI modules do not exist.

- [ ] **Step 3: Implement configuration, bootstrap and chat loop**

Use the repository character assets, bootstrap empty state, create a direct-response TurnService composition, and support both one-shot arguments and readline interaction.

- [ ] **Step 4: Verify GREEN and type safety**

Run the focused test, then `$env:CI='true'; pnpm.cmd typecheck`; both must exit 0.

- [ ] **Step 5: Commit**

```powershell
git add apps/cli package.json pnpm-workspace.yaml tsconfig.json pnpm-lock.yaml
git commit -m "feat: add Xiadie terminal chat"
```

### Task 3: Opt-in live persona evaluation

**Files:**
- Create: `apps/cli/src/persona-eval.ts`
- Create: `apps/cli/src/persona-eval.test.ts`
- Modify: `apps/cli/package.json`
- Modify: `package.json`
- Modify: `README.md`

**Interfaces:**
- Consumes: the existing strict persona fixture and the same runtime bootstrap as CLI chat.
- Produces: `runLivePersonaEvaluation()` and `pnpm persona:eval:live` JSONL output.

- [ ] **Step 1: Write failing evaluation-runner tests**

Prove deterministic case order, provenance fields, JSONL shape, no implicit invocation, and fail-fast model configuration.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `$env:CI='true'; pnpm.cmd exec vitest run apps/cli/src/persona-eval.test.ts`
Expected: FAIL because the runner does not exist.

- [ ] **Step 3: Implement the opt-in runner and usage documentation**

Run each fixture through the same direct-response path and emit one JSON object per case without logging provider credentials.

- [ ] **Step 4: Verify GREEN and the full repository**

Run focused tests, manifest idempotence, full tests, typecheck, and `git diff --check`; all must pass.

- [ ] **Step 5: Commit**

```powershell
git add apps/cli package.json README.md
git commit -m "feat: add opt-in live persona evaluation"
```

### Task 4: Final architecture and boundary verification

**Files:**
- Modify: `ARCHITECTURE.md`
- Modify: `docs/implementation-progress/persona-assets.md`

**Interfaces:**
- Consumes: all previous deliverables.
- Produces: current implementation status and reproducible verification commands.

- [ ] **Step 1: Add an architecture boundary regression test if any gap was found during implementation**

The test must fail before its corresponding production correction; otherwise record that no correction was necessary.

- [ ] **Step 2: Update only factual implementation status**

Document exact package versions, commands, scope exclusions, and live-run prerequisites.

- [ ] **Step 3: Run final gates**

Run: `$env:CI='true'; pnpm.cmd character:manifest`
Run: `$env:CI='true'; pnpm.cmd test`
Run: `$env:CI='true'; pnpm.cmd typecheck`
Run: `git diff --check`
Expected: manifest produces no diff; all commands exit 0.

- [ ] **Step 4: Commit**

```powershell
git add ARCHITECTURE.md docs/implementation-progress/persona-assets.md
git commit -m "docs: record Mastra self runtime verification"
```
