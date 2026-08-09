import type {
  BuildMetadata,
  CommittedTurnRecord,
  SelfRequest,
  TurnId,
  VerifiedExecutionRef,
  VerifiedTurnRecord,
} from "@xiadie/xiadie-core";
import type { AgentRuntime } from "@xiadie/agent-runtime";
import type {
  DelegateRequest,
  SelfEvent,
  SelfRuntime,
} from "@xiadie/self-runtime";
import type {
  CheckpointOwner,
  CheckpointStore,
} from "./checkpoint-store.js";
import type { ConversationStore } from "./conversation-store.js";
import { validateDelegate } from "./delegate-validator.js";
import { verifyExecution } from "./execution-verifier.js";
import type { RuntimePolicy } from "./runtime-policy.js";

type SelfDecision =
  | { kind: "final"; response: string; eventId: string }
  | { kind: "delegate"; request: DelegateRequest };

async function collectDecision(
  events: AsyncIterable<SelfEvent>,
  expectedTurnId: TurnId,
): Promise<SelfDecision> {
  let decision: SelfDecision | undefined;
  let terminalError: Error | undefined;
  let runId: string | undefined;
  let previousSequence: number | undefined;
  let terminalSeen = false;

  for await (const event of events) {
    if (event.turnId !== expectedTurnId) {
      throw new Error("self_event_identity_invalid");
    }
    if (runId === undefined) runId = event.runId;
    if (event.runId !== runId) {
      throw new Error("self_event_identity_invalid");
    }
    if (previousSequence !== undefined && event.sequence <= previousSequence) {
      throw new Error("self_event_sequence_invalid");
    }
    previousSequence = event.sequence;

    if (terminalSeen) throw new Error("self_event_after_terminal");

    switch (event.type) {
      case "self.delegate.requested":
        decision = { kind: "delegate", request: event.request };
        terminalSeen = true;
        break;
      case "self.final":
        decision = {
          kind: "final",
          response: event.response,
          eventId: event.id,
        };
        terminalSeen = true;
        break;
      case "self.failed":
        terminalError = new Error(`self_runtime_failed:${event.error}`);
        terminalSeen = true;
        break;
      case "self.cancelled":
        terminalError = new Error("self_runtime_cancelled");
        terminalSeen = true;
        break;
      default:
        break;
    }
  }

  if (terminalError !== undefined) throw terminalError;
  if (decision === undefined) throw new Error("self_terminal_event_missing");
  return decision;
}

export interface TurnServiceDependencies {
  self: SelfRuntime;
  agent: AgentRuntime;
  policy: RuntimePolicy;
  createTurnId: () => TurnId;
  createInitialRequest: (turnId: TurnId, userMessage: string) => SelfRequest;
  createFollowupRequest: (
    request: SelfRequest,
    evidence: SelfRequest["evidence"],
  ) => SelfRequest;
  build: BuildMetadata;
  conversations: ConversationStore;
  checkpoints: CheckpointStore;
}

export interface TurnRunInput {
  conversationId: string;
  userMessage: string;
}

export interface TurnRunResult {
  finalResponse: string;
  committed: CommittedTurnRecord;
}

interface TurnFlight {
  inputFingerprint: string;
  promise: Promise<TurnRunResult>;
}

export class TurnService {
  private readonly runs = new Map<TurnId, TurnFlight>();

  constructor(private readonly dependencies: TurnServiceDependencies) {}

  run(input: TurnRunInput): Promise<TurnRunResult> {
    const turnId = this.dependencies.createTurnId();
    const runInput: TurnRunInput = {
      conversationId: input.conversationId,
      userMessage: input.userMessage,
    };
    const inputFingerprint = JSON.stringify([
      runInput.conversationId,
      runInput.userMessage,
    ]);
    const existing = this.runs.get(turnId);
    if (existing !== undefined) {
      if (existing.inputFingerprint !== inputFingerprint) {
        return Promise.reject(new Error("turn_run_conflict"));
      }
      return existing.promise;
    }

    const promise = this.execute(turnId, runInput);
    this.runs.set(turnId, { inputFingerprint, promise });
    return promise;
  }

  private async execute(
    turnId: TurnId,
    input: TurnRunInput,
  ): Promise<TurnRunResult> {
    const initial = this.dependencies.createInitialRequest(
      turnId,
      input.userMessage,
    );
    if (initial.turnId !== turnId) {
      throw new Error("initial_request_turn_id_mismatch");
    }
    if (initial.turnInput.content !== input.userMessage) {
      throw new Error("initial_request_provenance_invalid");
    }

    const first = await collectDecision(
      this.dependencies.self.respond(initial),
      turnId,
    );
    let finalResponse: string;
    let finalResponseId: string;
    let checkpointOwner: CheckpointOwner | undefined;
    const executions: VerifiedExecutionRef[] = [];

    if (first.kind === "final") {
      finalResponse = first.response;
      finalResponseId = first.eventId;
    } else {
      const validated = validateDelegate(
        first.request,
        turnId,
        this.dependencies.policy,
      );
      if (!validated.ok) {
        throw new Error(`delegate_rejected:${validated.reason}`);
      }
      if (validated.task.turnId !== turnId) {
        throw new Error("delegate_turn_id_mismatch");
      }

      checkpointOwner = Symbol(`turn-attempt:${turnId}`);
      this.dependencies.checkpoints.save(turnId, checkpointOwner);

      const run = await this.dependencies.agent.start(validated.task);
      if (run.turnId !== turnId) throw new Error("agent_turn_id_mismatch");
      const report = verifyExecution(run);
      if (report.status === "failed") throw new Error("agent_execution_failed");
      executions.push({
        runId: report.runId,
        status: report.status,
        evidenceIds: report.evidence.map((item) => item.id),
      });

      const followup = this.dependencies.createFollowupRequest(initial, [report]);
      if (followup.turnId !== turnId) {
        throw new Error("followup_request_turn_id_mismatch");
      }
      if (
        followup.turnInput.id !== initial.turnInput.id ||
        followup.turnInput.content !== initial.turnInput.content ||
        followup.evidence.length !== 1 ||
        followup.evidence[0] !== report
      ) {
        throw new Error("followup_request_provenance_invalid");
      }
      const second = await collectDecision(
        this.dependencies.self.respond(followup),
        turnId,
      );
      if (second.kind !== "final") {
        throw new Error("second_top_level_delegate_denied");
      }
      finalResponse = second.response;
      finalResponseId = second.eventId;
    }

    const record: VerifiedTurnRecord = {
      turnId,
      conversationId: input.conversationId,
      userMessageId: initial.turnInput.id,
      finalResponseId,
      executions,
      timestamp: Date.now(),
      build: this.dependencies.build,
    };
    const committed = this.dependencies.conversations.commit(record);
    if (checkpointOwner !== undefined) {
      this.dependencies.checkpoints.complete(turnId, checkpointOwner);
    }
    return { finalResponse, committed };
  }
}
