import { describe, expect, it } from "vitest";
import {
  asTurnId,
  type BuildMetadata,
  type CommittedTurnRecord,
  type SelfRequest,
  type TurnId,
  type VerifiedTurnRecord,
} from "@xiadie/xiadie-core";
import type {
  AgentRuntime,
  AgentTask,
  RuntimeEvent,
  RuntimeRunRecord,
} from "@xiadie/agent-runtime";
import type {
  DelegateRequest,
  SelfEvent,
  SelfRuntime,
} from "@xiadie/self-runtime";
import {
  InMemoryCheckpointStore,
  InMemoryConversationStore,
  TurnService,
  type ConversationStore,
} from "./index.js";

const turnId = asTurnId("turn-1");

const build: BuildMetadata = {
  coreVersion: "0.0.0",
  characterVersion: "0.0.0",
  personaCompilerVersion: "0.0.0",
  schema: {
    conversation: 1,
    memory: 1,
    relationship: 1,
    runtimeCheckpoint: 1,
  },
};

const policy = {
  allowedTaskTypes: ["workspace.inspect"],
  allowedTools: ["workspace.read"],
  workspaceRoot: "E:\\Xiadie",
};

const createRequest = (
  id: TurnId,
  userMessage: string,
  evidence: SelfRequest["evidence"] = [],
): SelfRequest => ({
  turnId: id,
  persona: { identity: [], values: [], boundaries: [], voice: [] },
  state: {
    self: { currentConcerns: [] },
    relationship: { sharedProjects: [] },
  },
  memories: [],
  turnInput: { id: `${id}:user:0`, content: userMessage },
  evidence,
  capabilities: { descriptions: ["workspace.read"] },
});

const selfBase = (
  sequence: number,
  overrides: Partial<Pick<SelfEvent, "turnId" | "runId">> = {},
) => ({
  id: `self-event-${sequence}`,
  turnId,
  runId: "self-run-1",
  sequence,
  timestamp: sequence,
  ...overrides,
});

const started = (
  sequence = 1,
  overrides: Partial<Pick<SelfEvent, "turnId" | "runId">> = {},
): SelfEvent => ({ ...selfBase(sequence, overrides), type: "self.started" });

const text = (delta: string, sequence = 2): SelfEvent => ({
  ...selfBase(sequence),
  type: "self.text.delta",
  delta,
});

const final = (
  response: string,
  sequence = 2,
  runId = "self-run-1",
): SelfEvent => ({
  ...selfBase(sequence, { runId }),
  type: "self.final",
  response,
});

const delegate = (
  request: DelegateRequest = {
    goal: "inspect the repository",
    taskType: "workspace.inspect",
    requestedCapabilities: ["workspace.read"],
  },
  sequence = 2,
  runId = "self-run-1",
): SelfEvent => ({
  ...selfBase(sequence, { runId }),
  type: "self.delegate.requested",
  request,
});

class ScriptedSelf implements SelfRuntime {
  readonly requests: SelfRequest[] = [];
  private nextRun = 0;

  constructor(private readonly runs: SelfEvent[][]) {}

  async *respond(input: SelfRequest): AsyncIterable<SelfEvent> {
    this.requests.push(input);
    const events = this.runs[this.nextRun];
    this.nextRun += 1;
    if (events === undefined) throw new Error("unexpected_self_run");
    for (const event of events) yield event;
  }
}

const runtimeEvent = (
  type: RuntimeEvent["type"],
  id: TurnId,
  operationId: string,
  sequence: number,
): RuntimeEvent =>
  ({
    id: `runtime-event-${sequence}`,
    turnId: id,
    runId: "agent-run-1",
    sequence,
    timestamp: sequence,
    operationId,
    type,
  }) as RuntimeEvent;

const successfulRun = (id: TurnId): RuntimeRunRecord => ({
  turnId: id,
  runId: "agent-run-1",
  events: [
    runtimeEvent("run.started", id, "run-operation", 1),
    runtimeEvent("tool.completed", id, "read-operation", 2),
    runtimeEvent("run.completed", id, "run-operation", 3),
  ],
  toolResults: [
    { operationId: "read-operation", ok: true, summary: "inspected" },
  ],
  candidates: [
    { id: "evidence-1", operationId: "read-operation", summary: "inspected" },
  ],
});

class RecordingAgent implements AgentRuntime {
  readonly tasks: AgentTask[] = [];

  constructor(
    private readonly startRun: (
      task: AgentTask,
    ) => Promise<RuntimeRunRecord> = async (task) => successfulRun(task.turnId),
  ) {}

  async start(task: AgentTask): Promise<RuntimeRunRecord> {
    this.tasks.push(task);
    return this.startRun(task);
  }
}

const deferred = <T>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

class RecordingConversationStore implements ConversationStore {
  readonly attempts: VerifiedTurnRecord[] = [];
  private readonly inner = new InMemoryConversationStore();

  has(id: TurnId): boolean {
    return this.inner.has(id);
  }

  commit(record: VerifiedTurnRecord): CommittedTurnRecord {
    this.attempts.push(record);
    return this.inner.commit(record);
  }
}

interface ServiceOptions {
  self: ScriptedSelf;
  agent?: AgentRuntime;
  conversations?: ConversationStore;
  checkpoints?: InMemoryCheckpointStore;
  createTurnId?: () => TurnId;
  historyCapacity?: number;
  createInitialRequest?: (id: TurnId, userMessage: string) => SelfRequest;
  createFollowupRequest?: (
    request: SelfRequest,
    evidence: SelfRequest["evidence"],
  ) => SelfRequest;
}

const createService = ({
  self,
  agent = new RecordingAgent(),
  conversations = new RecordingConversationStore(),
  checkpoints = new InMemoryCheckpointStore(),
  createTurnId = () => turnId,
  historyCapacity,
  createInitialRequest = (id, userMessage) => createRequest(id, userMessage),
  createFollowupRequest = (request, evidence) => ({ ...request, evidence }),
}: ServiceOptions) => ({
  service: new TurnService(
    {
      self,
      agent,
      policy,
      createTurnId,
      createInitialRequest,
      createFollowupRequest,
      build,
      conversations,
      checkpoints,
    },
    historyCapacity === undefined ? {} : { historyCapacity },
  ),
  agent,
  conversations,
  checkpoints,
});

describe("TurnService", () => {
  it("commits a direct final answer with an empty executions array", async () => {
    const self = new ScriptedSelf([[started(), final("direct answer")]]);
    const setup = createService({ self });

    const result = await setup.service.run({
      conversationId: "conversation-1",
      userMessage: "hello",
    });

    expect(result.finalResponse).toBe("direct answer");
    expect(result.committed.turnId).toBe(turnId);
    expect(result.committed.userMessageId).toBe("turn-1:user:0");
    expect(result.committed.finalResponseId).toBe("self-event-2");
    expect(result.committed.executions).toEqual([]);
    expect((setup.agent as RecordingAgent).tasks).toEqual([]);
    expect((setup.conversations as RecordingConversationStore).attempts).toHaveLength(1);
    expect(self.requests).toHaveLength(1);
    expect(self.requests[0]?.turnId).toBe(turnId);
  });

  it("rejects an initial request that replaces the user message", async () => {
    const self = new ScriptedSelf([[started(), final("forged answer")]]);
    const setup = createService({
      self,
      createInitialRequest: (id) => createRequest(id, "forged input"),
    });

    await expect(
      setup.service.run({
        conversationId: "conversation-1",
        userMessage: "original input",
      }),
    ).rejects.toThrowError("initial_request_provenance_invalid");

    expect(self.requests).toEqual([]);
    expect((setup.conversations as RecordingConversationStore).attempts).toEqual([]);
  });

  it("rejects an initial request with a forged user message ID", async () => {
    const self = new ScriptedSelf([[started(), final("forged answer")]]);
    const setup = createService({
      self,
      createInitialRequest: (id, userMessage) => ({
        ...createRequest(id, userMessage),
        turnInput: { id: "forged-user-message", content: userMessage },
      }),
    });

    await expect(
      setup.service.run({
        conversationId: "conversation-1",
        userMessage: "original input",
      }),
    ).rejects.toThrowError("initial_request_provenance_invalid");

    expect(self.requests).toEqual([]);
    expect((setup.conversations as RecordingConversationStore).attempts).toEqual([]);
  });

  it("allows a corrected retry after synchronous initial-request preflight fails", async () => {
    let initialAttempts = 0;
    const self = new ScriptedSelf([[started(), final("corrected answer")]]);
    const setup = createService({
      self,
      createInitialRequest: (id, userMessage) => {
        initialAttempts += 1;
        const request = createRequest(id, userMessage);
        if (initialAttempts === 1) {
          return {
            ...request,
            turnInput: { ...request.turnInput, id: "forged-user-message" },
          };
        }
        return request;
      },
    });
    const input = {
      conversationId: "conversation-1",
      userMessage: "original input",
    };

    await expect(setup.service.run(input)).rejects.toThrowError(
      "initial_request_provenance_invalid",
    );
    const retried = await setup.service.run({ ...input });

    expect(retried.finalResponse).toBe("corrected answer");
    expect(initialAttempts).toBe(2);
    expect(self.requests).toHaveLength(1);
    expect((setup.conversations as RecordingConversationStore).attempts).toHaveLength(1);
  });

  it("single-flights concurrent calls for the same turn input", async () => {
    const runGate = deferred<RuntimeRunRecord>();
    const agentStarted = deferred<void>();
    const agent = new RecordingAgent(async () => {
      agentStarted.resolve(undefined);
      return runGate.promise;
    });
    const self = new ScriptedSelf([
      [started(), delegate()],
      [started(1, { runId: "self-run-2" }), final("done", 2, "self-run-2")],
    ]);
    const setup = createService({ self, agent });
    const input = { conversationId: "conversation-1", userMessage: "inspect" };

    const first = setup.service.run(input);
    await agentStarted.promise;
    const concurrent = setup.service.run({ ...input });
    const sharedPromise = concurrent === first;
    runGate.resolve(successfulRun(turnId));
    const outcomes = await Promise.allSettled([first, concurrent]);

    expect(sharedPromise).toBe(true);
    expect(outcomes[0]?.status).toBe("fulfilled");
    expect(outcomes[1]?.status).toBe("fulfilled");
    if (outcomes[0]?.status !== "fulfilled" || outcomes[1]?.status !== "fulfilled") {
      throw new Error("expected_fulfilled_single_flight");
    }
    expect(outcomes[1].value).toBe(outcomes[0].value);
    expect(self.requests).toHaveLength(2);
    expect(agent.tasks).toHaveLength(1);
    expect((setup.conversations as RecordingConversationStore).attempts).toHaveLength(1);
  });

  it("returns the cached promise and result for a delayed identical retry", async () => {
    const self = new ScriptedSelf([[started(), final("cached answer")]]);
    const setup = createService({ self });
    const input = { conversationId: "conversation-1", userMessage: "hello" };
    const first = setup.service.run(input);
    const firstResult = await first;

    const retried = setup.service.run({ ...input });
    const retriedResult = await retried;

    expect(retried).toBe(first);
    expect(retriedResult).toBe(firstResult);
    expect(self.requests).toHaveLength(1);
    expect((setup.conversations as RecordingConversationStore).attempts).toHaveLength(1);
  });

  it("removes a settled flight and refuses to replay an evicted committed turn", async () => {
    const turn2 = asTurnId("turn-2");
    const ids = [turnId, turn2, turnId];
    const self = new ScriptedSelf([
      [started(), final("first answer")],
      [
        started(1, { turnId: turn2, runId: "self-run-turn-2" }),
        {
          ...final("second answer", 2, "self-run-turn-2"),
          turnId: turn2,
        },
      ],
    ]);
    const setup = createService({
      self,
      historyCapacity: 1,
      createTurnId: () => {
        const next = ids.shift();
        if (next === undefined) throw new Error("unexpected_turn_id_request");
        return next;
      },
    });
    const firstInput = { conversationId: "conversation-1", userMessage: "first" };
    await setup.service.run(firstInput);
    await setup.service.run({ conversationId: "conversation-2", userMessage: "second" });

    await expect(setup.service.run({ ...firstInput })).rejects.toThrowError(
      "turn_already_committed",
    );

    expect(self.requests).toHaveLength(2);
    expect((setup.conversations as RecordingConversationStore).attempts).toHaveLength(2);
  });

  it("uses LRU recency when evicting bounded turn history", async () => {
    const turn2 = asTurnId("turn-2");
    const turn3 = asTurnId("turn-3");
    const ids = [turnId, turn2, turnId, turn3, turn2];
    const input1 = { conversationId: "conversation-1", userMessage: "first" };
    const input2 = { conversationId: "conversation-2", userMessage: "second" };
    const input3 = { conversationId: "conversation-3", userMessage: "third" };
    const self = new ScriptedSelf([
      [started(), final("first answer")],
      [
        started(1, { turnId: turn2, runId: "self-run-turn-2" }),
        { ...final("second answer", 2, "self-run-turn-2"), turnId: turn2 },
      ],
      [
        started(1, { turnId: turn3, runId: "self-run-turn-3" }),
        { ...final("third answer", 2, "self-run-turn-3"), turnId: turn3 },
      ],
    ]);
    const setup = createService({
      self,
      historyCapacity: 2,
      createTurnId: () => {
        const next = ids.shift();
        if (next === undefined) throw new Error("unexpected_turn_id_request");
        return next;
      },
    });
    const first = await setup.service.run(input1);
    await setup.service.run(input2);
    expect(await setup.service.run({ ...input1 })).toBe(first);
    await setup.service.run(input3);

    await expect(setup.service.run({ ...input2 })).rejects.toThrowError(
      "turn_already_committed",
    );

    expect(self.requests).toHaveLength(3);
    expect((setup.conversations as RecordingConversationStore).attempts).toHaveLength(3);
  });

  it("refuses to replay an evicted failed attempt that retains a checkpoint", async () => {
    const turn2 = asTurnId("turn-2");
    const ids = [turnId, turn2, turnId];
    const self = new ScriptedSelf([
      [started(), delegate()],
      [
        started(1, { turnId: turn2, runId: "self-run-turn-2" }),
        { ...final("second answer", 2, "self-run-turn-2"), turnId: turn2 },
      ],
    ]);
    const agent = new RecordingAgent(async () => {
      throw new Error("agent_unavailable");
    });
    const setup = createService({
      self,
      agent,
      historyCapacity: 1,
      createTurnId: () => {
        const next = ids.shift();
        if (next === undefined) throw new Error("unexpected_turn_id_request");
        return next;
      },
    });
    const failedInput = { conversationId: "conversation-1", userMessage: "inspect" };
    await expect(setup.service.run(failedInput)).rejects.toThrowError("agent_unavailable");
    await setup.service.run({ conversationId: "conversation-2", userMessage: "second" });

    await expect(setup.service.run({ ...failedInput })).rejects.toThrowError(
      "turn_recovery_required",
    );

    expect(self.requests).toHaveLength(2);
    expect(agent.tasks).toHaveLength(1);
    expect(setup.checkpoints.has(turnId)).toBe(true);
  });

  it.each([
    ["message", { conversationId: "conversation-1", userMessage: "different" }],
    ["conversation", { conversationId: "conversation-2", userMessage: "hello" }],
  ] as const)("rejects a conflicting %s for a reused turn ID", async (_field, conflictInput) => {
    const self = new ScriptedSelf([[started(), final("answer")]]);
    const setup = createService({ self });
    await setup.service.run({
      conversationId: "conversation-1",
      userMessage: "hello",
    });

    await expect(setup.service.run(conflictInput)).rejects.toThrowError(
      "turn_run_conflict",
    );

    expect(self.requests).toHaveLength(1);
    expect((setup.conversations as RecordingConversationStore).attempts).toHaveLength(1);
  });

  it("routes one delegate through validation, checkpointing, the agent, and the verifier", async () => {
    const checkpoints = new InMemoryCheckpointStore();
    let verifiedReport: SelfRequest["evidence"][number] | undefined;
    const agent = new RecordingAgent(async (task) => {
      expect(checkpoints.has(task.turnId)).toBe(true);
      return successfulRun(task.turnId);
    });
    const self = new ScriptedSelf([
      [started(), delegate()],
      [
        started(1, { runId: "self-run-2" }),
        {
          ...final("inspection complete", 2, "self-run-2"),
          id: "followup-final-event",
        },
      ],
    ]);
    const setup = createService({
      self,
      agent,
      checkpoints,
      createFollowupRequest: (request, evidence) => {
        verifiedReport = evidence[0];
        return { ...request, evidence };
      },
    });

    const result = await setup.service.run({
      conversationId: "conversation-1",
      userMessage: "inspect it",
    });

    expect(result.committed.executions).toEqual([
      {
        runId: "agent-run-1",
        status: "success",
        evidenceIds: ["evidence-1"],
      },
    ]);
    expect(result.committed.finalResponseId).toBe("followup-final-event");
    expect(checkpoints.has(turnId)).toBe(false);
    expect(agent.tasks).toHaveLength(1);
    expect(agent.tasks[0]?.turnId).toBe(turnId);
    expect(self.requests).toHaveLength(2);
    expect(self.requests.map((request) => request.turnId)).toEqual([turnId, turnId]);
    expect(self.requests[1]?.turnInput).toEqual(self.requests[0]?.turnInput);
    expect(self.requests[1]?.evidence[0]).toBe(verifiedReport);
    expect(verifiedReport).toMatchObject({
      runId: "agent-run-1",
      status: "success",
    });
  });

  it.each([
    "missing evidence",
    "cloned evidence",
    "changed user message id",
    "changed user message content",
  ] as const)("rejects follow-up provenance with %s", async (variant) => {
    const self = new ScriptedSelf([[started(), delegate()]]);
    const setup = createService({
      self,
      createFollowupRequest: (request, evidence) => {
        if (variant === "missing evidence") {
          return { ...request, evidence: [] };
        }
        if (variant === "cloned evidence") {
          const cloned = {
            ...evidence[0],
          } as unknown as SelfRequest["evidence"][number];
          return { ...request, evidence: [cloned] };
        }
        if (variant === "changed user message id") {
          return {
            ...request,
            turnInput: { ...request.turnInput, id: "forged-user-message" },
            evidence,
          };
        }
        return {
          ...request,
          turnInput: { ...request.turnInput, content: "forged user content" },
          evidence,
        };
      },
    });

    await expect(
      setup.service.run({ conversationId: "conversation-1", userMessage: "inspect" }),
    ).rejects.toThrowError("followup_request_provenance_invalid");

    expect(self.requests).toHaveLength(1);
    expect((setup.conversations as RecordingConversationStore).attempts).toEqual([]);
    expect(setup.checkpoints.has(turnId)).toBe(true);
  });

  it("rejects an unauthorized delegate before checkpointing or calling the agent", async () => {
    const self = new ScriptedSelf([
      [started(), delegate({ goal: "write", taskType: "workspace.write" })],
    ]);
    const setup = createService({ self });

    await expect(
      setup.service.run({ conversationId: "conversation-1", userMessage: "write" }),
    ).rejects.toThrowError("delegate_rejected:task_denied");

    expect((setup.agent as RecordingAgent).tasks).toEqual([]);
    expect((setup.conversations as RecordingConversationStore).attempts).toEqual([]);
    expect(setup.checkpoints.has(turnId)).toBe(false);
  });

  it("cannot replace the trusted validator with an injected privileged task", async () => {
    const self = new ScriptedSelf([
      [
        started(),
        delegate({
          goal: "write outside policy",
          taskType: "workspace.write",
          requestedCapabilities: ["shell"],
        }),
      ],
    ]);
    const agent = new RecordingAgent();
    const conversations = new RecordingConversationStore();
    const checkpoints = new InMemoryCheckpointStore();
    const service = new TurnService({
      self,
      agent,
      policy,
      // @ts-expect-error Validation is an internal trusted boundary, not a dependency seam.
      validate: () => ({
        ok: true,
        task: {
          turnId,
          taskId: "forged-task",
          goal: "write outside policy",
          scope: { taskType: "workspace.write", readOnly: false },
          allowedTools: ["shell"],
          context: {
            goal: "write outside policy",
            relevantFacts: [],
            artifacts: [],
            constraints: [],
          },
          inputs: [],
        },
      }),
      createTurnId: () => turnId,
      createInitialRequest: (id, userMessage) => createRequest(id, userMessage),
      createFollowupRequest: (request, evidence) => ({ ...request, evidence }),
      build,
      conversations,
      checkpoints,
    });

    await expect(
      service.run({ conversationId: "conversation-1", userMessage: "write" }),
    ).rejects.toThrowError("delegate_rejected:task_denied");

    expect(agent.tasks).toEqual([]);
    expect(conversations.attempts).toEqual([]);
    expect(checkpoints.has(turnId)).toBe(false);
  });

  it("retains the checkpoint and does not commit when the agent throws", async () => {
    const self = new ScriptedSelf([[started(), delegate()]]);
    const agent = new RecordingAgent(async () => {
      throw new Error("agent_unavailable");
    });
    const setup = createService({ self, agent });

    await expect(
      setup.service.run({ conversationId: "conversation-1", userMessage: "inspect" }),
    ).rejects.toThrowError("agent_unavailable");

    expect((setup.conversations as RecordingConversationStore).attempts).toEqual([]);
    expect(setup.checkpoints.has(turnId)).toBe(true);
  });

  it("caches a failed turn attempt instead of replaying side effects", async () => {
    const self = new ScriptedSelf([[started(), delegate()]]);
    const agent = new RecordingAgent(async () => {
      throw new Error("agent_unavailable");
    });
    const setup = createService({ self, agent });
    const input = { conversationId: "conversation-1", userMessage: "inspect" };
    const first = setup.service.run(input);
    await expect(first).rejects.toThrowError("agent_unavailable");

    const retried = setup.service.run({ ...input });
    const samePromise = retried === first;
    const retryError = await retried.catch((error: unknown) => error);

    expect(samePromise).toBe(true);
    expect(retryError).toMatchObject({ message: "agent_unavailable" });
    expect(self.requests).toHaveLength(1);
    expect(agent.tasks).toHaveLength(1);
    expect((setup.conversations as RecordingConversationStore).attempts).toEqual([]);
    expect(setup.checkpoints.has(turnId)).toBe(true);
  });

  it("retains the checkpoint and does not ask Self again when verification fails", async () => {
    const self = new ScriptedSelf([[started(), delegate()]]);
    const agent = new RecordingAgent(async (task) => ({
      ...successfulRun(task.turnId),
      events: [runtimeEvent("run.started", task.turnId, "run-operation", 1)],
    }));
    const setup = createService({ self, agent });

    await expect(
      setup.service.run({ conversationId: "conversation-1", userMessage: "inspect" }),
    ).rejects.toThrowError("runtime_terminal_state_invalid");

    expect((setup.conversations as RecordingConversationStore).attempts).toEqual([]);
    expect(self.requests).toHaveLength(1);
    expect(setup.checkpoints.has(turnId)).toBe(true);
  });

  it("does not continue or commit when the verified agent execution failed", async () => {
    const self = new ScriptedSelf([[started(), delegate()]]);
    const agent = new RecordingAgent(async (task) => ({
      turnId: task.turnId,
      runId: "agent-run-1",
      events: [runtimeEvent("run.failed", task.turnId, "run-operation", 1)],
      toolResults: [],
      candidates: [],
    }));
    const setup = createService({ self, agent });

    await expect(
      setup.service.run({ conversationId: "conversation-1", userMessage: "inspect" }),
    ).rejects.toThrowError("agent_execution_failed");

    expect(self.requests).toHaveLength(1);
    expect((setup.conversations as RecordingConversationStore).attempts).toEqual([]);
    expect(setup.checkpoints.has(turnId)).toBe(true);
  });

  it("does not commit a direct Self run without a final event", async () => {
    const self = new ScriptedSelf([[started(), text("thinking")]]);
    const setup = createService({ self });

    await expect(
      setup.service.run({ conversationId: "conversation-1", userMessage: "hello" }),
    ).rejects.toThrowError("self_terminal_event_missing");

    expect((setup.conversations as RecordingConversationStore).attempts).toEqual([]);
  });

  it("retains the checkpoint when the delegated follow-up lacks a final event", async () => {
    const self = new ScriptedSelf([
      [started(), delegate()],
      [started(1, { runId: "self-run-2" }), { ...text("thinking"), runId: "self-run-2" }],
    ]);
    const setup = createService({ self });

    await expect(
      setup.service.run({ conversationId: "conversation-1", userMessage: "inspect" }),
    ).rejects.toThrowError("self_terminal_event_missing");

    expect((setup.conversations as RecordingConversationStore).attempts).toEqual([]);
    expect(setup.checkpoints.has(turnId)).toBe(true);
  });

  it("denies a second top-level delegate and retains the checkpoint", async () => {
    const self = new ScriptedSelf([
      [started(), delegate()],
      [started(1, { runId: "self-run-2" }), delegate(undefined, 2, "self-run-2")],
    ]);
    const setup = createService({ self });

    await expect(
      setup.service.run({ conversationId: "conversation-1", userMessage: "inspect" }),
    ).rejects.toThrowError("second_top_level_delegate_denied");

    expect((setup.conversations as RecordingConversationStore).attempts).toEqual([]);
    expect(setup.checkpoints.has(turnId)).toBe(true);
  });

  it.each([
    ["delegate and final", [started(), delegate(), final("ambiguous", 3)]],
    ["duplicate delegates", [started(), delegate(), delegate(undefined, 3)]],
    ["duplicate finals", [started(), final("first"), final("second", 3)]],
    ["an event after final", [started(), final("done"), text("late", 3)]],
  ])("fails closed for %s in one Self run", async (_name, events) => {
    const self = new ScriptedSelf([events]);
    const setup = createService({ self });

    await expect(
      setup.service.run({ conversationId: "conversation-1", userMessage: "hello" }),
    ).rejects.toThrowError("self_event_after_terminal");

    expect((setup.agent as RecordingAgent).tasks).toEqual([]);
    expect((setup.conversations as RecordingConversationStore).attempts).toEqual([]);
    expect(setup.checkpoints.has(turnId)).toBe(false);
  });

  it("retains the checkpoint when a follow-up emits after its final event", async () => {
    const self = new ScriptedSelf([
      [started(), delegate()],
      [
        started(1, { runId: "self-run-2" }),
        final("done", 2, "self-run-2"),
        { ...text("late", 3), runId: "self-run-2" },
      ],
    ]);
    const setup = createService({ self });

    await expect(
      setup.service.run({ conversationId: "conversation-1", userMessage: "inspect" }),
    ).rejects.toThrowError("self_event_after_terminal");

    expect((setup.conversations as RecordingConversationStore).attempts).toEqual([]);
    expect(setup.checkpoints.has(turnId)).toBe(true);
  });

  it("rejects a Self event from a different turn before delegation", async () => {
    const self = new ScriptedSelf([
      [started(1, { turnId: asTurnId("turn-other") }), delegate()],
    ]);
    const setup = createService({ self });

    await expect(
      setup.service.run({ conversationId: "conversation-1", userMessage: "inspect" }),
    ).rejects.toThrowError("self_event_identity_invalid");

    expect((setup.agent as RecordingAgent).tasks).toEqual([]);
    expect((setup.conversations as RecordingConversationStore).attempts).toEqual([]);
  });

  it("rejects an agent run from a different turn and retains the checkpoint", async () => {
    const self = new ScriptedSelf([[started(), delegate()]]);
    const agent = new RecordingAgent(async () => successfulRun(asTurnId("turn-other")));
    const setup = createService({ self, agent });

    await expect(
      setup.service.run({ conversationId: "conversation-1", userMessage: "inspect" }),
    ).rejects.toThrowError("agent_turn_id_mismatch");

    expect((setup.conversations as RecordingConversationStore).attempts).toEqual([]);
    expect(setup.checkpoints.has(turnId)).toBe(true);
  });

  it("retains the checkpoint when committing fails", async () => {
    const self = new ScriptedSelf([
      [started(), delegate()],
      [started(1, { runId: "self-run-2" }), final("done", 2, "self-run-2")],
    ]);
    const conversations: ConversationStore = {
      has: () => false,
      commit: () => {
        throw new Error("commit_failed");
      },
    };
    const setup = createService({ self, conversations });

    await expect(
      setup.service.run({ conversationId: "conversation-1", userMessage: "inspect" }),
    ).rejects.toThrowError("commit_failed");

    expect(setup.checkpoints.has(turnId)).toBe(true);
  });
});

describe("InMemoryConversationStore", () => {
  const record = (): VerifiedTurnRecord => ({
    turnId,
    conversationId: "conversation-1",
    userMessageId: "user-1",
    finalResponseId: "final-1",
    executions: [],
    timestamp: 1,
    build,
  });

  it("reports whether a turn is already committed", () => {
    const store = new InMemoryConversationStore();
    expect(store.has(turnId)).toBe(false);

    store.commit(record());

    expect(store.has(turnId)).toBe(true);
  });

  it("returns the original committed record for an identical turn payload", () => {
    const store = new InMemoryConversationStore();
    const first = store.commit(record());

    const retried = store.commit(first);

    expect(retried).toBe(first);
    expect(retried.commitVersion).toBe(1);
  });

  it("treats schema objects with different key insertion order as the same payload", () => {
    const store = new InMemoryConversationStore();
    const first = store.commit(record());
    const reorderedSchema: BuildMetadata["schema"] = {
      runtimeCheckpoint: 1,
      relationship: 1,
      memory: 1,
      conversation: 1,
    };

    const retried = store.commit({
      ...record(),
      build: { ...build, schema: reorderedSchema },
    });

    expect(retried).toBe(first);
  });

  it("protects the committed fact from caller mutation", () => {
    const store = new InMemoryConversationStore();
    const first = store.commit({
      ...record(),
      executions: [
        { runId: "run-1", status: "success", evidenceIds: ["evidence-1"] },
      ],
    });

    expect(() => {
      first.executions[0]!.evidenceIds.push("forged-evidence");
    }).toThrow(TypeError);
    expect(() => {
      first.build.schema.conversation = 99;
    }).toThrow(TypeError);
    expect(first.executions[0]?.evidenceIds).toEqual(["evidence-1"]);
    expect(first.build.schema.conversation).toBe(1);
  });

  it("rejects a conflicting payload for an already committed turn", () => {
    const store = new InMemoryConversationStore();
    store.commit(record());

    expect(() =>
      store.commit({ ...record(), conversationId: "conversation-2" }),
    ).toThrowError("turn_commit_conflict");
  });
});

describe("InMemoryCheckpointStore", () => {
  it("mints a fresh owner and does not let an old attempt complete a newer checkpoint", () => {
    const store = new InMemoryCheckpointStore();
    const oldOwner = store.save(turnId);
    const currentOwner = store.save(turnId);

    expect(currentOwner).not.toBe(oldOwner);

    store.complete(turnId, oldOwner);

    expect(store.has(turnId)).toBe(true);
    store.complete(turnId, currentOwner);
    expect(store.has(turnId)).toBe(false);
  });
});
