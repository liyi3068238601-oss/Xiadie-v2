import type { CommittedTurnRecord } from "@xiadie/xiadie-core";
import type { TurnRunInput, TurnRunResult } from "@xiadie/application";

export interface ChatTurnRunner {
  run(input: TurnRunInput, onDelta: (delta: string) => void): Promise<TurnRunResult>;
}

export const runChatTurn = async (
  userMessage: string,
  runner: ChatTurnRunner,
  write: (text: string) => void,
): Promise<CommittedTurnRecord> => {
  let streamed = false;
  const result = await runner.run(
    { conversationId: "cli", userMessage },
    (delta) => {
      streamed = true;
      write(delta);
    },
  );
  if (!streamed) write(result.finalResponse);
  write("\n");
  return result.committed;
};
