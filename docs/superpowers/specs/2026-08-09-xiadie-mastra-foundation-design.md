# Xiadie Mastra Foundation Design

**Date:** 2026-08-09  
**Status:** Approved architecture baseline  
**Project root:** `E:\Xiadie\Xiadie-next`

## 1. Decision

Xiadie will be a new TypeScript project. The two existing Xiadie workspaces and the local Cyrene-Agent checkout are historical references only and will not be used as the new application's source tree.

The new application will use four explicit layers:

1. **Xiadie Core** owns identity, voice, values, boundaries, current self, relationship state, memory interfaces, and per-turn context compilation.
2. **Application Layer** coordinates a turn between Xiadie Core, the agent runtime, persistence, and the presentation layer.
3. **Mastra Runtime** owns agent execution, tools, MCP connections, sub-agents, workflows, runtime threads, and execution events.
4. **Desktop Presentation** renders conversation and execution state. The first proof of concept uses a minimal desktop chat interface; Live2D and voice are later presentation adapters.

The central architectural rule is:

> **Xiadie Self is not an Agent.** Xiadie is a persistent self that can delegate actions to an agent runtime. Tool traces, temporary reasoning, and implementation details do not define her identity. User-facing conclusions return through Xiadie Self.

## 2. Goals

The first version must prove that:

- the supplied Xiadie personality material can be compiled into stable model context;
- the same Xiadie Core can work independently of Mastra internals;
- normal conversation and tool-backed work return through one consistent Xiadie voice;
- one bounded tool and one sub-agent can execute through Mastra;
- conversation threads survive application restarts;
- all user-visible claims about tool execution are derived from actual runtime results;
- future memory providers and presentation adapters can be added without rewriting identity logic.

## 3. Non-goals for the first version

The first version will not include:

- Live2D rendering or imported Cyrene visual assets;
- TTS, ASR, voice calling, or lip synchronization;
- Herta's full narrative-completion runtime;
- Dream, autobiography mutation, relationship evolution, or simulated offline life;
- MemOS, Neo4j, Qdrant, Docker, or cloud memory infrastructure;
- proactive messages, schedules, mobile channels, or background autonomy;
- a large built-in tool catalogue;
- migration of old Xiadie databases or Cyrene runtime code.

These exclusions keep the proof of concept focused on identity stability and the Self-Agent boundary.

## 4. Source layout

```text
Xiadie-next/
├─ apps/
│  └─ desktop/
│     ├─ src/main/
│     ├─ src/preload/
│     └─ src/renderer/
├─ packages/
│  ├─ xiadie-core/
│  │  ├─ character/xiadie/
│  │  │  ├─ identity.md
│  │  │  ├─ values.md
│  │  │  ├─ voice.md
│  │  │  ├─ canon.md
│  │  │  ├─ boundaries.md
│  │  │  └─ examples.md
│  │  └─ src/
│  │     ├─ context-frame.ts
│  │     ├─ persona-compiler.ts
│  │     ├─ providers.ts
│  │     ├─ types.ts
│  │     └─ kernel.ts
│  ├─ application/
│  │  └─ src/
│  │     ├─ turn-service.ts
│  │     ├─ event-mapper.ts
│  │     └─ session-service.ts
│  ├─ mastra-runtime/
│  │  └─ src/
│  │     ├─ runtime-adapter.ts
│  │     ├─ agents/
│  │     ├─ tools/
│  │     └─ mcp/
│  └─ persistence/
│     └─ src/
│        ├─ sqlite-session-store.ts
│        └─ local-memory-provider.ts
├─ data/                 # development data only; ignored by Git
├─ docs/
└─ tests/
```

Production user data will live under the operating system's application-data directory, not inside the installed program or source checkout.

## 5. Xiadie Core

### 5.1 Immutable character assets

The Markdown files describe stable, human-maintained character material:

- `identity.md`: identity and self-recognition;
- `values.md`: judgments, commitments, and priorities;
- `voice.md`: rhythm, vocabulary, emotional expression, and prohibited assistant-like phrasing;
- `canon.md`: verified setting and character facts;
- `boundaries.md`: facts and behaviors that runtime learning may not overwrite;
- `examples.md`: curated examples of desirable and undesirable responses.

Models may read these assets but may not modify them. Changes require an explicit source-code edit and review.

### 5.2 Runtime state

Version 0.1 defines interfaces for current self, relationship, and memory, but their initial implementations are deliberately small:

```ts
interface SelfState {
  currentConcerns: string[];
}

interface RelationshipState {
  userDisplayName?: string;
  sharedProjects: string[];
}

interface MemoryProvider {
  recall(query: MemoryQuery): Promise<MemoryRecord[]>;
  write(candidate: MemoryCandidate): Promise<void>;
}
```

The first local provider stores only explicit, source-linked user facts and shared project facts. It does not invent Xiadie's private experiences, moods, schedules, or offline activities.

### 5.3 ContextFrame

Core produces structured context before rendering model instructions:

```ts
interface XiadieContextFrame {
  identity: CoreIdentity;
  self: SelfState;
  relationship: RelationshipState;
  memories: MemoryRecord[];
  scene: SceneContext;
  capabilities: CapabilitySummary;
}
```

No application or Mastra module may concatenate identity, memory, and scene prompts independently. `PersonaCompiler` is the single renderer from `XiadieContextFrame` to model-facing instructions.

### 5.4 Public API

```ts
interface XiadieKernel {
  prepareTurn(input: TurnInput): Promise<PreparedTurn>;
  observeTurn(result: ObservedTurn): Promise<void>;
}
```

`prepareTurn` loads stable assets and bounded runtime state, retrieves relevant memories, constructs a frame, and renders instructions. `observeTurn` accepts only verified conversation and execution results. It may propose memory candidates but cannot claim or synthesize tool outcomes.

Xiadie Core must not import Mastra, Electron, model SDKs, or a concrete memory database.

## 6. Mastra Runtime

Mastra is behind an application-owned interface so it can be replaced without changing Xiadie Core:

```ts
interface AgentRuntime {
  run(request: RuntimeRequest): AsyncIterable<RuntimeEvent>;
  cancel(runId: string): Promise<void>;
}
```

The proof of concept contains:

- one primary Xiadie-facing agent;
- one read-only workspace inspection tool;
- one specialist sub-agent with a narrow task contract;
- one model-provider configuration path;
- persistent runtime thread identifiers;
- structured events for text, tool requests, approvals, results, failures, and completion.

Mastra owns execution mechanics. It does not own Xiadie's identity files, long-term self, or final wording policy.

## 7. Turn data flow

```text
User message
  -> Desktop UI
  -> Application TurnService
  -> XiadieKernel.prepareTurn()
  -> RuntimeRequest(context + message + capabilities)
  -> Mastra AgentRuntime
  -> tool or sub-agent execution when required
  -> structured RuntimeResult
  -> Xiadie-facing final response generation
  -> XiadieKernel.observeTurn(verified result)
  -> persist transcript and accepted memory candidates
  -> Desktop UI
```

Tool activity may be visible as neutral execution cards, but low-level traces must not be written in Xiadie's voice. The final explanation is generated only after verified execution results are available.

## 8. Persistence and memory roadmap

### Version 0.1

- SQLite-backed conversations and thread metadata;
- explicit user facts and shared-project facts;
- exact source message references;
- deletion and inspection through a minimal developer interface.

### Later versions

- relationship state;
- autobiography and stable self-state;
- Dream worthiness, reinforcement, reconsolidation, capacity, and forgetting;
- a `MemOSProvider` if real usage demonstrates that the local provider cannot meet scale or retrieval-quality needs.

MemOS remains an adapter behind `MemoryProvider`; it never becomes Xiadie Core itself.

## 9. Failure and safety behavior

- If character assets fail validation, startup stops with a clear diagnostic rather than falling back to an unrelated generic assistant.
- If memory retrieval fails, the turn continues without recalled memory and reports the degraded state to diagnostics, not as character dialogue.
- If Mastra or the model provider fails before execution, no tool-success claim is produced.
- If a tool requires mutation or broader access, the runtime emits an approval request before execution.
- Cancellation propagates from the UI through the application layer to the runtime.
- Partial tool output is retained as diagnostic evidence but is not treated as completed work.
- Secrets are stored using operating-system credential protection where available and are never written to prompts, transcripts, or ordinary logs.
- Workspace tools are restricted to explicitly selected roots. Path validation and permission decisions are deterministic code, not persona instructions.

## 10. Testing strategy

### Core tests

- character asset schema and required-section validation;
- deterministic `ContextFrame` assembly;
- prompt snapshot tests with secret and injection resistance checks;
- token-budget behavior and priority ordering;
- memory-source preservation;
- proof that Core has no Mastra, Electron, or concrete storage dependency.

### Runtime tests

- direct conversation without tools;
- read-only tool execution;
- sub-agent delegation and structured return;
- cancellation, provider failure, tool failure, and approval denial;
- final responses cannot report success without a matching successful runtime event.

### Product tests

- create, resume, rename, and delete a conversation;
- restart persistence;
- visible separation between Xiadie speech and execution events;
- provider configuration and invalid-credential handling;
- Windows packaging smoke test.

### Persona evaluation

A small fixed evaluation set will test casual conversation, disagreement, uncertainty, emotional support, technical work, tool failure, and long-form explanation across at least two supported models. Evaluation focuses on identity consistency, voice consistency, factual honesty, and resistance to generic assistant tone.

## 11. Proof-of-concept acceptance criteria

The foundation proof of concept is accepted when:

1. a fresh install starts and displays a minimal chat interface;
2. character assets compile into a validated context frame;
3. the user can complete a normal non-tool conversation;
4. the user can request a bounded workspace inspection and see real evidence;
5. the primary agent can delegate one narrow task to a sub-agent;
6. tool details remain separate from Xiadie's final speech;
7. the conversation resumes after restart;
8. cancelling a run stops further execution and produces no false completion claim;
9. automated tests and a production build pass;
10. old Xiadie and Cyrene workspaces remain unchanged.

## 12. Delivery sequence

1. Initialize the TypeScript monorepo and quality gates.
2. Engineer the supplied personality text into immutable character assets.
3. Implement Xiadie Core, `ContextFrame`, and `PersonaCompiler`.
4. Implement the Mastra runtime adapter with one tool and one sub-agent.
5. Implement the application turn service and SQLite session persistence.
6. Implement the minimal desktop chat and execution-event UI.
7. Run cross-model persona evaluation and correct prompt or boundary defects.
8. Package and smoke-test the Windows proof of concept.

Dream, relationship evolution, MemOS, Live2D, and voice begin only after this foundation passes its acceptance criteria.

