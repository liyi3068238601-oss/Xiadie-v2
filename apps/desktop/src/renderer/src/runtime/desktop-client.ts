import type {
  ConversationDto,
  MessageDto,
  SaveConnectionSettingsDto,
  SendMessageResultDto,
  SidebarDto,
  TurnEventDto,
  XiadieDesktopBridge,
} from "../../../shared/contracts.js";

type TurnCommand =
  | { readonly kind: "send"; readonly conversationId: string; readonly content: string }
  | { readonly kind: "retry"; readonly conversationId: string; readonly messageId: string };

export interface DesktopClient {
  readonly listConversations: () => Promise<readonly ConversationDto[]>;
  readonly createConversation: () => Promise<ConversationDto>;
  readonly renameConversation: (conversationId: string, title: string) => Promise<ConversationDto>;
  readonly deleteConversation: (conversationId: string) => Promise<void>;
  readonly loadMessages: (conversationId: string) => Promise<readonly MessageDto[]>;
  readonly getSidebar: (conversationId: string) => Promise<SidebarDto>;
  readonly getConnectionStatus: XiadieDesktopBridge["getConnectionStatus"];
  readonly saveConnectionSettings: (input: SaveConnectionSettingsDto) => ReturnType<XiadieDesktopBridge["saveConnectionSettings"]>;
  readonly clearSavedApiKey: XiadieDesktopBridge["clearSavedApiKey"];
  readonly resetBaseUrl: XiadieDesktopBridge["resetBaseUrl"];
  readonly testConnection: XiadieDesktopBridge["testConnection"];
  readonly runTurn: (
    input: Readonly<{ conversationId: string; content: string }>,
    signal: AbortSignal,
  ) => AsyncGenerator<TurnEventDto, void>;
  readonly retryTurn: (
    input: Readonly<{ conversationId: string; messageId: string }>,
    signal: AbortSignal,
  ) => AsyncGenerator<TurnEventDto, void>;
}

const terminalEventFromResult = (
  conversationId: string,
  result: SendMessageResultDto,
  sequence: number,
): TurnEventDto => result.status === "committed"
  ? { type: "committed", conversationId, turnId: result.turnId, sequence, message: result.message }
  : { type: "failed", conversationId, turnId: result.turnId, sequence, errorCode: result.errorCode };

async function* executeTurn(
  bridge: XiadieDesktopBridge,
  command: TurnCommand,
  signal: AbortSignal,
): AsyncGenerator<TurnEventDto, void> {
  const queued: TurnEventDto[] = [];
  let wake: (() => void) | undefined;
  let activeTurnId: string | undefined;
  let lastSequence = -1;
  let settled = false;
  let result: SendMessageResultDto | undefined;
  let requestError: unknown;

  const notify = () => {
    const current = wake;
    wake = undefined;
    current?.();
  };
  const accept = (event: TurnEventDto) => {
    if (event.conversationId !== command.conversationId) return;
    if (activeTurnId === undefined) {
      if (event.type !== "started") return;
      activeTurnId = event.turnId;
    }
    if (event.turnId !== activeTurnId || event.sequence <= lastSequence) return;
    lastSequence = event.sequence;
    queued.push(event);
    notify();
  };
  const unsubscribe = bridge.subscribeToTurnEvents(accept);
  const abort = () => notify();
  signal.addEventListener("abort", abort, { once: true });

  const request = command.kind === "send"
    ? bridge.sendMessage({ conversationId: command.conversationId, content: command.content })
    : bridge.retryMessage({ conversationId: command.conversationId, messageId: command.messageId });
  void request.then(
    (value) => { result = value; settled = true; notify(); },
    (error: unknown) => { requestError = error; settled = true; notify(); },
  );

  try {
    while (!signal.aborted) {
      const event = queued.shift();
      if (event) {
        yield event;
        if (event.type === "committed" || event.type === "failed") return;
        continue;
      }
      if (settled) {
        if (requestError) throw requestError;
        if (result) {
          if (activeTurnId !== undefined && result.turnId !== activeTurnId) {
            throw new Error("desktop_turn_identity_mismatch");
          }
          yield terminalEventFromResult(command.conversationId, result, lastSequence + 1);
        }
        return;
      }
      await new Promise<void>((resolve) => { wake = resolve; });
    }
  } finally {
    signal.removeEventListener("abort", abort);
    unsubscribe();
  }
}

export const createDesktopClient = (bridge: XiadieDesktopBridge): DesktopClient => ({
  listConversations: () => bridge.listConversations(),
  createConversation: () => bridge.createConversation(),
  renameConversation: (conversationId, title) => bridge.renameConversation({ conversationId, title }),
  deleteConversation: (conversationId) => bridge.deleteConversation({ conversationId }),
  loadMessages: (conversationId) => bridge.loadMessages({ conversationId }),
  getSidebar: (conversationId) => bridge.getSidebar({ conversationId }),
  getConnectionStatus: () => bridge.getConnectionStatus(),
  saveConnectionSettings: (input) => bridge.saveConnectionSettings(input),
  clearSavedApiKey: () => bridge.clearSavedApiKey(),
  resetBaseUrl: () => bridge.resetBaseUrl(),
  testConnection: (input) => bridge.testConnection(input),
  runTurn: (input, signal) => executeTurn(bridge, { kind: "send", ...input }, signal),
  retryTurn: (input, signal) => executeTurn(bridge, { kind: "retry", ...input }, signal),
});
