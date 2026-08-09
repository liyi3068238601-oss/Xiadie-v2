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
  validateDelegate,
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
  turnInput: { id: `${id}:user`, content: userMessage },
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

class RecordingConversationStore implements ConversationStore {
  readonly attempts: VerifiedTurnRecord[] = [];
  private readonly inner = new InMemoryConversationStore();

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
}

const createService = ({
  self,
  agent = new RecordingAgent(),
  conversations = new RecordingConversationStore(),
  checkpoints = new InMemoryCheckpointStore(),
}: ServiceOptions) => ({
  service: new TurnService({
    self,
    agent,
    policy,
    validate: validateDelegate,
    createTurnId: () => turnId,
    createInitialRequest: (id, userMessage) => createRequest(id, userMessage),
    createFollowupRequest: (request, evidence) => ({ ...request, evidence }),
    build,
    conversations,
    checkpoints,
  }),
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
    expect(result.committed.executions).toEqual([]);
    expect((setup.agent as RecordingAgent).tasks).toEqual([]);
    expect((setup.conversations as RecordingConversationStore).attempts).toHaveLength(1);
    expect(self.requests).toHaveLength(1);
    expect(self.requests[0]?.turnId).toBe(turnId);
  });

  it("routes one delegate through validation, checkpointing, the agent, and the verifier", async () => {
    const checkpoints = new InMemoryCheckpointStore();
    const agent = new RecordingAgent(async (task) => {
      expect(checkpoints.has(task.turnId)).toBe(true);
      return successfulRun(task.turnId);
    });
    const self = new ScriptedSelf([
      [started(), delegate()],
      [started(1, { runId: "self-run-2" }), final("inspection complete", 2, "self-run-2")],
    ]);
    const setup = createService({ self, agent, checkpoints });

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
    expect(checkpoints.has(turnId)).toBe(false);
    expect(agent.tasks).toHaveLength(1);
    expect(agent.tasks[0]?.turnId).toBe(turnId);
    expect(self.requests).toHaveLength(2);
    expect(self.requests.map((request) => request.turnId)).toEqual([turnId, turnId]);
    expect(self.requests[1]?.evidence[0]).toMatchObject({
      runId: "agent-run-1",
      status: "success",
    });
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

  it("returns the original committed record for an identical turn payload", () => {
    const store = new InMemoryConversationStore();
    const first = store.commit(record());

    const retried = store.commit(first);

    expect(retried).toBe(first);
    expect(retried.commitVersion).toBe(1);
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
