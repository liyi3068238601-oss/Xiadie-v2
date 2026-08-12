import type { SelfEvent, SelfRuntime } from "@xiadie/self-runtime";
import type { SelfRequest } from "@xiadie/xiadie-core";
import { renderMastraSelfInput, type MastraSelfInput } from "./prompt-renderer.js";

export interface MastraTextAgent {
  stream(input: MastraSelfInput): Promise<{ readonly textStream: AsyncIterable<string> }>;
}

export interface MastraSelfRuntimeOptions {
  readonly agent: MastraTextAgent;
  readonly createRunId?: () => string;
  readonly createEventId?: (input: { readonly runId: string; readonly sequence: number }) => string;
  readonly now?: () => number;
}

export class MastraSelfRuntime implements SelfRuntime {
  constructor(private readonly options: MastraSelfRuntimeOptions) {}

  async *respond(input: SelfRequest): AsyncIterable<SelfEvent> {
    const runId = this.options.createRunId?.() ?? crypto.randomUUID();
    const now = this.options.now ?? Date.now;
    const id = (sequence: number) => this.options.createEventId?.({ runId, sequence }) ?? `${runId}:${sequence}`;
    const base = (sequence: number) => ({ id: id(sequence), turnId: input.turnId, runId, sequence, timestamp: now() });
    let sequence = 0;
    yield { ...base(sequence++), type: "self.started" };
    let response = "";
    try {
      const output = await this.options.agent.stream(renderMastraSelfInput(input));
      for await (const delta of output.textStream) {
        if (delta.length === 0) continue;
        response += delta;
        yield { ...base(sequence++), type: "self.text.delta", delta };
      }
      if (response.length === 0) {
        yield { ...base(sequence), type: "self.failed", error: "self_runtime_empty_response" };
        return;
      }
      yield { ...base(sequence), type: "self.final", response };
    } catch {
      yield { ...base(sequence), type: "self.failed", error: "self_provider_failed" };
    }
  }
}
