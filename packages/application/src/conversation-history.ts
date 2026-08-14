import type { ConversationHistoryMessage } from "@xiadie/xiadie-core";

export const CONVERSATION_HISTORY_CHARACTER_BUDGET = 24_000;

const invalidHistory = (): never => {
  throw new Error("conversation_history_invalid");
};

const assertMessage = (
  message: ConversationHistoryMessage | undefined,
  role: ConversationHistoryMessage["role"],
): ConversationHistoryMessage => {
  if (
    message === undefined ||
    message.role !== role ||
    typeof message.id !== "string" ||
    message.id.length === 0 ||
    typeof message.content !== "string" ||
    message.content.length === 0
  ) {
    return invalidHistory();
  }
  return message;
};

export const selectConversationHistory = (
  messages: readonly ConversationHistoryMessage[],
): readonly ConversationHistoryMessage[] => {
  if (!Array.isArray(messages) || messages.length % 2 !== 0) invalidHistory();

  const pairs: Array<readonly [ConversationHistoryMessage, ConversationHistoryMessage]> = [];
  for (let index = 0; index < messages.length; index += 2) {
    pairs.push([
      assertMessage(messages[index], "user"),
      assertMessage(messages[index + 1], "assistant"),
    ]);
  }

  const selected: Array<readonly [ConversationHistoryMessage, ConversationHistoryMessage]> = [];
  let used = 0;
  for (let index = pairs.length - 1; index >= 0; index -= 1) {
    const current = pairs[index]!;
    const cost = current[0].content.length + current[1].content.length;
    if (used + cost > CONVERSATION_HISTORY_CHARACTER_BUDGET) break;
    used += cost;
    selected.unshift(current);
  }

  return Object.freeze(
    selected
      .flat()
      .map((message) => Object.freeze({ ...message })),
  );
};
