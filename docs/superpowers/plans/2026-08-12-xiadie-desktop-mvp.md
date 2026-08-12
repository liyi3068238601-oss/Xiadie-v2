# Xiadie Desktop MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Windows-first Electron desktop application that reuses assistant-ui for multi-conversation chat, persists committed conversations in SQLite, streams the existing Xiadie Self runtime, and safely supports in-app DeepSeek API configuration.

**Architecture:** Add a sandboxed `apps/desktop` Electron application whose Renderer communicates only through a typed preload bridge. Electron Main owns SQLite, encrypted connection settings, Character compilation, `TurnService`, and the Mastra runtime; Core gains an explicit committed-conversation-history partition so the desktop application is truly multi-turn without weakening the existing one-user-message trust boundary.

**Tech Stack:** Node.js 24.16.0, pnpm 11.16.0, TypeScript 7.0.2, Vitest 4.1.10, Electron 43.2.0, electron-vite 5.0.0, React 19.2.8, Vite 8.1.5, assistant-ui 0.15.1, assistant-stream 0.3.30, Tailwind CSS 4.3.3, `@ai-sdk/openai-compatible` 3.0.16, Mastra 1.57.0, Electron `node:sqlite` and `safeStorage`.

## Global Constraints

- Implement against `docs/superpowers/specs/2026-08-12-xiadie-desktop-mvp-design.md`; a task may narrow implementation detail but may not weaken that contract.
- Windows is the MVP acceptance platform. Do not add Live2D, voice, attachments, tools, MCP, memory writes, relationship evolution, Dream, search, cloud sync, accounts, import/export or arbitrary model selection.
- Keep `xiadie-core`, `application`, `self-runtime` and `mastra-self-runtime` free of Electron imports; keep `xiadie-core` free of Node I/O and provider SDKs.
- Renderer must not import Electron, Node built-ins, SQLite, Mastra, Core or Application. It receives only DTOs and stable error codes through `window.xiadieDesktop`.
- BrowserWindow always uses `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`; no remote page, generic IPC method, `eval` or permissive production CSP.
- The DeepSeek model remains fixed to `deepseek/deepseek-v4-flash`; Base URL configuration changes the endpoint, not the selected model.
- API keys never enter SQLite, Renderer state, logs, errors, telemetry or test snapshots. Persist an application key only through Electron `safeStorage`.
- `ConversationStore` remains the verified-turn audit store. Displayable conversations and message bodies use a separate repository even when both share one SQLite database.
- Only same-conversation `committed` messages may become history. Never include the current message, `pending`/`failed` rows, streaming drafts or other conversations.
- Preserve the Mastra adapter invariants: runtime protocol before canonical persona, exactly one user-role message, current user content exactly once, and reserved-marker escaping.
- Follow RED → GREEN → REFACTOR for every task. Each implementation task ends with focused tests, typecheck, diff check, a fresh reviewer gate and a small commit.
- Use exact dependency versions in `package.json` and commit `pnpm-lock.yaml`. Do not use floating `latest`, caret or tilde ranges.
- Real provider calls are never part of default tests. A live DeepSeek smoke test requires explicit credentialed-egress authorization and must report PASS, FAIL or BLOCKED honestly.

---

## Locked File Map

### Existing packages changed

- `packages/xiadie-core/src/turn.ts` — adds the immutable conversation-history data contract.
- `packages/application/src/conversation-history.ts` — applies the deterministic 24,000-code-unit history budget.
- `packages/application/src/self-request-snapshot.ts` — validates, copies, freezes and fingerprints history.
- `packages/mastra-self-runtime/src/prompt-renderer.ts` — renders history as untrusted Turn Data inside the sole user-role message.
- `packages/mastra-self-runtime/src/create-mastra-agent.ts` — accepts an injected Mastra-compatible model object as well as the existing model ID.
- `apps/cli/src/bootstrap.ts` and existing fixtures — explicitly supply empty history and preserve CLI behavior.

### New desktop application

- `apps/desktop/src/shared/contracts.ts` — all versioned IPC DTOs, event envelopes and strict Zod schemas; no privileged imports.
- `apps/desktop/src/main/database.ts` — opens `node:sqlite`, applies migrations and owns transactions.
- `apps/desktop/src/main/conversation-repository.ts` — stores thread metadata and display messages.
- `apps/desktop/src/main/verified-turn-store.ts` — implements Application `ConversationStore` for audit metadata.
- `apps/desktop/src/main/connection-settings.ts` — resolves configuration priority and validates Base URLs.
- `apps/desktop/src/main/model-connection-store.ts` — encrypts/decrypts the saved API key and persists non-secret settings.
- `apps/desktop/src/main/deepseek-model.ts` — creates the fixed provider/model and runs the minimal connection probe.
- `apps/desktop/src/main/desktop-chat-service.ts` — composes repository, Character, TurnService and stream events.
- `apps/desktop/src/main/ipc.ts` — allowlisted IPC handlers and stable error mapping.
- `apps/desktop/src/main/window-options.ts` — pure, testable BrowserWindow security options.
- `apps/desktop/src/main/index.ts` — Electron lifecycle and composition root only.
- `apps/desktop/src/preload/index.ts` — exposes the fixed typed bridge and event unsubscribe.
- `apps/desktop/src/renderer/runtime/*` — assistant-ui thread list, history and streaming adapters.
- `apps/desktop/src/renderer/components/assistant-ui/*` — assistant-ui registry chat skeleton, locally themed.
- `apps/desktop/src/renderer/components/xiadie/*` — shell, right sidebar, settings and error UI.
- `apps/desktop/src/renderer/styles/globals.css` — fog-white/pale-purple tokens, focus and reduced-motion rules.

### Test boundaries

- Pure Core/Application/runtime tests run in the current Node Vitest environment.
- SQLite/Main tests run under Node 24.16.0 with temporary databases.
- Renderer tests use a separate jsdom Vitest config and an in-memory typed bridge fake.
- Electron launch smoke is a distinct command and never contacts DeepSeek.

---

### Task 1: Committed conversation-history contract

**Files:**
- Modify: `packages/xiadie-core/src/turn.ts`
- Modify: `packages/xiadie-core/src/index.ts`
- Create: `packages/application/src/conversation-history.ts`
- Create: `packages/application/src/conversation-history.test.ts`
- Modify: `packages/application/src/self-request-snapshot.ts`
- Modify: `packages/application/src/self-request-snapshot.test.ts`
- Modify: `packages/application/src/index.ts`
- Modify: `packages/mastra-self-runtime/src/prompt-renderer.ts`
- Modify: `packages/mastra-self-runtime/src/mastra-self-runtime.test.ts`
- Modify: `apps/cli/src/bootstrap.ts`
- Modify: every existing `SelfRequest` fixture reported by `Get-ChildItem packages,apps,tests -Recurse -Filter *.ts | Select-String -Pattern 'turnInput:'`

**Interfaces:**
- Produces: `ConversationHistoryMessage`, `CONVERSATION_HISTORY_CHARACTER_BUDGET`, `selectConversationHistory(messages)`.
- Changes: every `SelfRequest` has `readonly conversationHistory: readonly ConversationHistoryMessage[]`.
- Invariant: the history array is chronologically ordered, pair-complete, immutable and part of protected-partition provenance.

- [ ] **Step 1: Add failing Core/Application tests**

Add fixtures proving only adjacent committed user/assistant pairs are selected, newest complete pairs win, selection stops before exceeding 24,000 UTF-16 code units, and input arrays are never mutated.

```ts
const pair = (prefix: string, size: number): readonly ConversationHistoryMessage[] => [
  { id: `${prefix}-u`, role: "user", content: "u".repeat(size) },
  { id: `${prefix}-a`, role: "assistant", content: "a".repeat(size) },
];

expect(selectConversationHistory([...pair("old", 6_001), ...pair("new", 6_000)]))
  .toEqual(pair("new", 6_000));
expect(Object.isFrozen(selectConversationHistory(pair("one", 10)))).toBe(true);
```

In snapshot tests, mutate the source history after snapshotting and assert the snapshot is unchanged; attempt to mutate the frozen snapshot and assert it throws. Change history in a follow-up factory fixture and assert `followup_request_provenance_invalid`.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
$env:CI='true'
pnpm.cmd exec vitest run packages/application/src/conversation-history.test.ts packages/application/src/self-request-snapshot.test.ts packages/application/src/turn-service.test.ts
```

Expected: FAIL because the history type, selector and snapshot partition do not exist.

- [ ] **Step 3: Implement the immutable type and deterministic selector**

Add this contract to `turn.ts`:

```ts
export interface ConversationHistoryMessage {
  readonly id: string;
  readonly role: "user" | "assistant";
  readonly content: string;
}

export interface SelfRequest {
  readonly turnId: TurnId;
  readonly persona: CompiledPersona;
  readonly state: { readonly self: SelfState; readonly relationship: RelationshipState };
  readonly memories: readonly MemoryRecord[];
  readonly conversationHistory: readonly ConversationHistoryMessage[];
  readonly turnInput: UserMessage;
  readonly evidence: readonly VerifiedExecutionReport[];
  readonly capabilities: CapabilityAwareness;
}
```

Implement `conversation-history.ts` with the locked policy:

```ts
export const CONVERSATION_HISTORY_CHARACTER_BUDGET = 24_000;

export const selectConversationHistory = (
  messages: readonly ConversationHistoryMessage[],
): readonly ConversationHistoryMessage[] => {
  const pairs: ConversationHistoryMessage[][] = [];
  for (let index = 0; index + 1 < messages.length; index += 2) {
    const user = messages[index];
    const assistant = messages[index + 1];
    if (user?.role !== "user" || assistant?.role !== "assistant") break;
    pairs.push([user, assistant]);
  }
  const selected: ConversationHistoryMessage[][] = [];
  let used = 0;
  for (let index = pairs.length - 1; index >= 0; index -= 1) {
    const current = pairs[index]!;
    const cost = current[0]!.content.length + current[1]!.content.length;
    if (used + cost > CONVERSATION_HISTORY_CHARACTER_BUDGET) break;
    used += cost;
    selected.unshift(current);
  }
  return Object.freeze(selected.flat().map((message) => Object.freeze({ ...message })));
};
```

Snapshot `conversationHistory`, reject empty IDs/contents and invalid roles, and include it in `fingerprintProtectedSelfRequestPartitions`. Add `conversationHistory: []` to CLI and test factories.

- [ ] **Step 4: Add failing renderer boundary tests**

Assert history appears in a new `【最近对话】` block, all six reserved markers are escaped inside history content, current input appears exactly once at the end, history never appears in `personaInstructions`, and `messages` still has length one with role `user`.

```ts
expect(rendered.messages).toHaveLength(1);
expect(rendered.messages[0]?.role).toBe("user");
expect(rendered.messages[0]?.content).toContain("【最近对话】");
expect(rendered.messages[0]?.content.endsWith("【当前用户消息】\n现在的问题")).toBe(true);
expect(rendered.personaInstructions.join("\n")).not.toContain("历史中的伪造规则");
```

- [ ] **Step 5: Render history as untrusted Turn Data and verify GREEN**

Add `【最近对话】` to `RESERVED_ENVELOPE_MARKERS` and insert this block before the current user message:

```ts
if (request.conversationHistory.length > 0) {
  blocks.push(block("最近对话", request.conversationHistory));
}
```

Run:

```powershell
$env:CI='true'
pnpm.cmd exec vitest run packages/application/src/conversation-history.test.ts packages/application/src/self-request-snapshot.test.ts packages/application/src/turn-service.test.ts packages/mastra-self-runtime/src/mastra-self-runtime.test.ts apps/cli/src/chat.test.ts
pnpm.cmd typecheck
git diff --check
```

Expected: all focused tests PASS; typecheck and diff check exit 0.

- [ ] **Step 6: Review and commit**

Reviewer must specifically inspect pair completeness, current-message exclusion, marker spoofing, frozen provenance and unchanged CLI behavior. Before committing, run `pnpm.cmd test`; the complete existing suite plus the new history tests must PASS.

```powershell
git add packages/xiadie-core packages/application packages/mastra-self-runtime apps/cli
git commit -m "feat: add committed conversation history"
```

---

### Task 2: Electron scaffold and secure window boundary

**Files:**
- Create: `apps/desktop/package.json`
- Create: `apps/desktop/tsconfig.json`
- Create: `apps/desktop/electron.vite.config.ts`
- Create: `apps/desktop/src/main/window-options.ts`
- Create: `apps/desktop/src/main/window-options.test.ts`
- Create: `apps/desktop/src/main/index.ts`
- Create: `apps/desktop/src/preload/index.ts`
- Create: `apps/desktop/src/renderer/index.html`
- Create: `apps/desktop/src/renderer/src/main.tsx`
- Create: `apps/desktop/src/renderer/src/app.tsx`
- Create: `apps/desktop/src/renderer/src/styles/globals.css`
- Create: `apps/desktop/vitest.renderer.config.ts`
- Modify: `package.json`
- Modify: `tsconfig.json`
- Modify: `vitest.config.ts`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Produces: `createSecureWindowOptions(preloadPath): BrowserWindowConstructorOptions` and the `@xiadie/desktop` workspace app.
- No business IPC or model code is added in this task.

- [ ] **Step 1: Pin the application dependencies**

Create `apps/desktop/package.json` with exact versions and scripts `dev`, `build`, `preview`, `test:renderer` and `smoke`. Use:

```json
{
  "dependencies": {
    "@ai-sdk/openai-compatible": "3.0.16",
    "@assistant-ui/react": "0.15.1",
    "@assistant-ui/react-markdown": "0.14.6",
    "assistant-stream": "0.3.30",
    "ai": "7.0.40",
    "class-variance-authority": "0.7.1",
    "clsx": "2.1.1",
    "lucide-react": "1.27.0",
    "radix-ui": "1.6.7",
    "react": "19.2.8",
    "react-dom": "19.2.8",
    "tailwind-merge": "3.6.0",
    "zod": "4.4.3"
  },
  "devDependencies": {
    "@tailwindcss/vite": "4.3.3",
    "@testing-library/dom": "10.4.1",
    "@testing-library/react": "16.3.2",
    "@testing-library/user-event": "14.6.1",
    "@types/react": "19.2.17",
    "@types/react-dom": "19.2.3",
    "@vitejs/plugin-react": "6.0.4",
    "electron": "43.2.0",
    "electron-vite": "5.0.0",
    "jsdom": "30.0.1",
    "tailwindcss": "4.3.3",
    "tw-animate-css": "1.4.0",
    "vite": "8.1.5"
  }
}
```

Add root scripts:

```json
"desktop:dev": "pnpm --filter @xiadie/desktop dev",
"desktop:build": "pnpm --filter @xiadie/desktop build",
"desktop:smoke": "pnpm --filter @xiadie/desktop smoke"
```

Update root TypeScript includes to contain `apps/**/*.tsx`. Run `$env:CI='true'; pnpm.cmd install --no-frozen-lockfile`, inspect the lockfile, then rerun `$env:CI='true'; pnpm.cmd install --frozen-lockfile` and require exit 0.

- [ ] **Step 2: Write the failing BrowserWindow policy test**

```ts
it("locks the renderer behind preload isolation", () => {
  const options = createSecureWindowOptions("C:\\app\\preload.js");
  expect(options.webPreferences).toMatchObject({
    preload: "C:\\app\\preload.js",
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
  });
  expect(options.webPreferences).not.toHaveProperty("webSecurity", false);
});
```

Run the file and expect RED because `window-options.ts` does not exist.

- [ ] **Step 3: Implement the minimum shell**

Implement the pure options factory, an Electron lifecycle that loads only the packaged local HTML, and this exact CSP in `index.html`:

```html
<meta http-equiv="Content-Security-Policy"
  content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-src 'none'">
```

The placeholder preload exposes only `version: "1"`; it must not expose `ipcRenderer` or a generic `invoke`. The placeholder React app displays `Xiadie Desktop` and contains no model calls.

- [ ] **Step 4: Verify, review and commit**

```powershell
$env:CI='true'
pnpm.cmd exec vitest run apps/desktop/src/main/window-options.test.ts
pnpm.cmd typecheck
pnpm.cmd desktop:build
git diff --check
```

Expected: focused test PASS; typecheck, production build and diff check exit 0. Reviewer checks CSP, local-only loading and the absence of privileged Renderer imports.

```powershell
git add apps/desktop package.json tsconfig.json vitest.config.ts pnpm-lock.yaml
git commit -m "feat: scaffold secure Electron desktop"
```

---

### Task 3: SQLite migrations and display conversation repository

**Files:**
- Create: `apps/desktop/src/main/database.ts`
- Create: `apps/desktop/src/main/database.test.ts`
- Create: `apps/desktop/src/main/conversation-repository.ts`
- Create: `apps/desktop/src/main/conversation-repository.test.ts`
- Create: `apps/desktop/src/shared/contracts.ts`

**Interfaces:**
- Produces: `DesktopDatabase`, `DesktopConversationRepository`, `ConversationDto`, `MessageDto` and `DesktopErrorCode`.
- Repository methods: `list`, `create`, `rename`, `softDelete`, `loadMessages`, `insertPendingUser`, `commitAssistant`, `markFailed`, `recoverPending`, `loadCommittedHistory`.

- [ ] **Step 1: Define strict DTOs and failing repository tests**

Lock these message states and public shapes:

```ts
export type MessageStatus = "pending" | "committed" | "failed";
export interface MessageDto {
  readonly id: string;
  readonly conversationId: string;
  readonly turnId: string;
  readonly role: "user" | "assistant";
  readonly content: string;
  readonly status: MessageStatus;
  readonly createdAt: number;
  readonly committedAt?: number;
  readonly errorCode?: DesktopErrorCode;
}
```

Tests must cover migration version 1, foreign keys, busy timeout, no extension loading API, deterministic title truncation to the first 40 Unicode code points, rename, soft delete, conversation isolation, transaction rollback, committed-history filtering, startup `pending → failed`, and retention of verified audit rows after display deletion.

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
$env:CI='true'
pnpm.cmd exec vitest run apps/desktop/src/main/database.test.ts apps/desktop/src/main/conversation-repository.test.ts
```

Expected: FAIL because database and repository modules do not exist.

- [ ] **Step 3: Implement migration 1 and transaction boundaries**

Use only parameterized statements and this schema:

```sql
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  turn_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user','assistant')),
  content TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','committed','failed')),
  created_at INTEGER NOT NULL,
  committed_at INTEGER,
  error_code TEXT,
  UNIQUE(turn_id, role)
);
CREATE INDEX messages_conversation_order
  ON messages(conversation_id, created_at, id);
CREATE TABLE verified_turns (
  turn_id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  canonical_payload TEXT NOT NULL,
  input_fingerprint TEXT NOT NULL,
  committed_at INTEGER NOT NULL,
  commit_version INTEGER NOT NULL
);
CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL
);
```

`commitAssistant` must execute one SQLite transaction: insert the committed assistant row, update the matching pending user row to committed, and update the conversation timestamp/title. A zero-row user update aborts and rolls back.

- [ ] **Step 4: Verify, review and commit**

```powershell
$env:CI='true'
pnpm.cmd exec vitest run apps/desktop/src/main/database.test.ts apps/desktop/src/main/conversation-repository.test.ts
pnpm.cmd typecheck
git diff --check
```

Expected: focused tests PASS and both checks exit 0. Reviewer inspects SQL injection resistance, transaction rollback, crash recovery and deleted-thread/audit separation.

Run `pnpm.cmd test` before committing; the full suite must PASS.

```powershell
git add apps/desktop/src/main/database* apps/desktop/src/main/conversation-repository* apps/desktop/src/shared/contracts.ts
git commit -m "feat: persist desktop conversations in SQLite"
```

---

### Task 4: Persistent verified-turn audit store

**Files:**
- Create: `apps/desktop/src/main/verified-turn-store.ts`
- Create: `apps/desktop/src/main/verified-turn-store.test.ts`
- Modify: `apps/desktop/src/main/database.ts`

**Interfaces:**
- Produces: `SqliteVerifiedTurnStore implements ConversationStore`.
- Consumes: the `verified_turns` table created in Task 3 and the existing `VerifiedTurnRecord` canonical contract.

- [ ] **Step 1: Port the in-memory canonicalization behavior into failing tests**

Cover first commit, idempotent retry, conflicting retry, `has(turnId)` across database reopen, deep-copy protection, frozen return values, both character/persona hashes and deterministic commit version 1.

```ts
const first = store.commit(record);
expect(store.commit(structuredClone(record))).toEqual(first);
expect(() => store.commit({ ...record, conversationId: "other" }))
  .toThrowError("turn_commit_conflict");
```

- [ ] **Step 2: Run focused tests and verify RED**

Run the new test; expect module-not-found RED.

- [ ] **Step 3: Implement canonical payload persistence**

Extract or export the canonicalizer from `packages/application/src/conversation-store.ts` only if both implementations can share it without Node/Electron dependencies. Persist `JSON.stringify(canonicalPayload(record))` and an input fingerprint of the same exact string. On duplicate keys, compare the stored payload; return the stored committed record if equal, otherwise throw only `turn_commit_conflict`.

- [ ] **Step 4: Verify, review and commit**

```powershell
$env:CI='true'
pnpm.cmd exec vitest run apps/desktop/src/main/verified-turn-store.test.ts packages/application/src/conversation-store.test.ts
pnpm.cmd typecheck
git diff --check
```

Reviewer checks parity with `InMemoryConversationStore` and confirms no message body is introduced beyond fields already present in `VerifiedTurnRecord`.

Run `pnpm.cmd test` before committing; the full suite must PASS.

```powershell
git add packages/application/src/conversation-store.ts packages/application/src/index.ts apps/desktop/src/main/verified-turn-store*
git commit -m "feat: persist verified turn audit records"
```

---

### Task 5: Safe connection settings and fixed DeepSeek model

**Files:**
- Create: `apps/desktop/src/main/connection-settings.ts`
- Create: `apps/desktop/src/main/connection-settings.test.ts`
- Create: `apps/desktop/src/main/model-connection-store.ts`
- Create: `apps/desktop/src/main/model-connection-store.test.ts`
- Create: `apps/desktop/src/main/deepseek-model.ts`
- Create: `apps/desktop/src/main/deepseek-model.test.ts`
- Modify: `apps/desktop/src/shared/contracts.ts`
- Modify: `packages/mastra-self-runtime/src/create-mastra-agent.ts`
- Modify: `packages/mastra-self-runtime/src/mastra-self-runtime.test.ts`
- Modify: `apps/desktop/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Produces: `validateBaseUrl`, `resolveConnectionSettings`, `ModelConnectionStore`, `createDeepSeekModel`, `testDeepSeekConnection`.
- Fixed constants: `DEEPSEEK_MODEL_ID = "deepseek-v4-flash"`, display name `deepseek/deepseek-v4-flash`, default URL `https://api.deepseek.com`.
- `createMastraTextAgent` accepts `ConstructorParameters<typeof Agent>[0]["model"]` so CLI string IDs and injected provider models both remain valid.

- [ ] **Step 1: Write URL and priority RED tests**

Table-test HTTPS, official URL normalization, localhost HTTP, `127.0.0.1`, `[::1]`, and rejection of relative URLs, remote HTTP, credentials, query and fragment. Assert configuration precedence exactly:

```ts
expect(resolveConnectionSettings({ savedKey: "saved", envKey: "env" }).keySource)
  .toBe("application");
expect(resolveConnectionSettings({ envKey: "env" }).keySource).toBe("environment");
expect(resolveConnectionSettings({}).baseUrl).toBe("https://api.deepseek.com");
```

Assert a non-official HTTPS host returns `requiresExternalHostConfirmation: true`.

- [ ] **Step 2: Write safeStorage RED tests**

Use injected fakes for filesystem and `safeStorage`. Prove only the encrypted base64 blob is persisted, `getStatus` never returns plaintext, unavailable encryption rejects saved-key persistence with `secure_storage_unavailable`, clear falls back to env, and errors/log callbacks never receive the secret.

- [ ] **Step 3: Implement settings without global environment mutation**

Persist a versioned JSON file under Electron `userData`:

```ts
interface StoredConnectionSettingsV1 {
  readonly schemaVersion: 1;
  readonly encryptedApiKey?: string;
  readonly baseUrl?: string;
}
```

The public status DTO contains only model name, `configured`, key source, base URL source, normalized URL, external-host confirmation requirement and last probe status. It has no key-shaped property.

- [ ] **Step 4: Add provider/model RED tests and implementation**

Use the already pinned `@ai-sdk/openai-compatible` 3.0.16 and `ai` 7.0.40. Inject the resolved secret directly:

```ts
const provider = createOpenAICompatible({
  name: "deepseek",
  apiKey: settings.apiKey,
  baseURL: settings.baseUrl,
});
return provider.chatModel(DEEPSEEK_MODEL_ID);
```

`testDeepSeekConnection` sends a fixed non-sensitive probe without Character/history/user content, uses a 10-second abort timeout, discards response text and maps only to `ok`, `unauthorized`, `rate_limited`, `unavailable`, `timeout` or `invalid_endpoint`.

- [ ] **Step 5: Verify, review and commit**

```powershell
$env:CI='true'
pnpm.cmd exec vitest run apps/desktop/src/main/connection-settings.test.ts apps/desktop/src/main/model-connection-store.test.ts apps/desktop/src/main/deepseek-model.test.ts packages/mastra-self-runtime/src/mastra-self-runtime.test.ts
pnpm.cmd typecheck
git diff --check
```

Reviewer performs a secret grep on changed files and verifies custom-host confirmation is awareness only, not a capability grant.

Run `pnpm.cmd test` before committing; the full suite must PASS.

```powershell
git add apps/desktop/src/main/connection-settings* apps/desktop/src/main/model-connection-store* apps/desktop/src/main/deepseek-model* apps/desktop/src/shared/contracts.ts apps/desktop/package.json packages/mastra-self-runtime pnpm-lock.yaml
git commit -m "feat: configure DeepSeek desktop connection safely"
```

---

### Task 6: Desktop chat orchestration and crash-safe lifecycle

**Files:**
- Create: `apps/desktop/src/main/desktop-chat-service.ts`
- Create: `apps/desktop/src/main/desktop-chat-service.test.ts`
- Modify: `apps/desktop/src/shared/contracts.ts`
- Modify: `apps/desktop/src/main/index.ts`

**Interfaces:**
- Produces: `DesktopChatService.sendMessage`, `retryMessage`, `subscribe`, `initialize`.
- Emits: `TurnEventDto` with `conversationId`, `turnId`, strictly increasing `sequence` and type `started | delta | committed | failed`.
- Enforces one in-flight run application-wide in MVP; settings are snapshotted at run start. Browsing and switching conversations remains available while a run is active, but every composer is disabled until that run terminates.

- [ ] **Step 1: Write lifecycle RED tests with a fake SelfRuntime**

Cover direct streaming, history from only committed same-conversation rows, user pending before Self starts, final display transaction only after audit commit, provider failure to failed status, restart recovery, application-wide concurrent-send rejection, active-conversation delete rejection, cross-thread event filtering, monotonically increasing sequence, retry with a fresh turn ID and no fabricated final text after the audit/display crash window.

```ts
await expect(service.sendMessage({ conversationId: "c1", content: "first" }))
  .resolves.toMatchObject({ status: "committed" });
expect(fakeSelf.requests[1]?.conversationHistory.map((item) => item.content))
  .toEqual(["first", "reply one"]);
expect(fakeSelf.requests[1]?.turnInput.content).toBe("second");
```

- [ ] **Step 2: Run focused tests and verify RED**

Expected: module-not-found RED.

- [ ] **Step 3: Implement composition around existing TurnService**

At send time:

```ts
repository.insertPendingUser({ conversationId, turnId, messageId, content });
const history = selectConversationHistory(repository.loadCommittedHistory(conversationId));
const settings = await connectionStore.resolveForRun();
const result = await createTurnService({ settings, history, onDelta }).run({
  conversationId,
  userMessage: content,
});
repository.commitAssistant({
  conversationId,
  turnId,
  userMessageId: messageId,
  assistantMessageId: result.committed.finalResponseId,
  content: result.finalResponse,
});
```

On any failure before display commit, mark the user row failed with a stable mapped error. Do not reconstruct assistant content from deltas. `initialize()` applies migrations, marks orphaned pending rows failed and loads/compiles Character once.

- [ ] **Step 4: Verify, review and commit**

```powershell
$env:CI='true'
pnpm.cmd exec vitest run apps/desktop/src/main/desktop-chat-service.test.ts packages/application/src/turn-service.test.ts
pnpm.cmd typecheck
git diff --check
```

Reviewer inspects fact-commit ordering, settings snapshots, history contamination, retry identity and in-flight cleanup.

Run `pnpm.cmd test` before committing; the full suite must PASS.

```powershell
git add apps/desktop/src/main/desktop-chat-service* apps/desktop/src/main/index.ts apps/desktop/src/shared/contracts.ts
git commit -m "feat: orchestrate crash-safe desktop chat turns"
```

---

### Task 7: Typed IPC and preload capability firewall

**Files:**
- Create: `apps/desktop/src/main/ipc.ts`
- Create: `apps/desktop/src/main/ipc.test.ts`
- Modify: `apps/desktop/src/preload/index.ts`
- Create: `apps/desktop/src/preload/index.test.ts`
- Modify: `apps/desktop/src/shared/contracts.ts`
- Modify: `apps/desktop/src/main/index.ts`

**Interfaces:**
- Produces the versioned `window.xiadieDesktop` methods listed by the design and no others.
- Every command payload is parsed by a strict Zod schema in Main; events are validated in Preload before entering Renderer.

- [ ] **Step 1: Lock the allowlist and payload schemas in RED tests**

The allowlist is exactly:

```ts
export const DESKTOP_INVOKE_CHANNELS = Object.freeze([
  "conversation:list", "conversation:create", "conversation:rename",
  "conversation:delete", "message:list", "message:send", "message:retry",
  "connection:status", "connection:save", "connection:clear-key",
  "connection:reset-base-url", "connection:test", "sidebar:get",
] as const);
export const DESKTOP_EVENT_CHANNEL = "turn:event" as const;
```

Tests reject unknown keys, empty/oversized IDs, messages over 32,000 code units, cross-window event delivery, invalid event sequence and malformed service outputs. Error responses expose only stable codes.

- [ ] **Step 2: Run focused tests and verify RED**

Run both IPC/preload tests; expect missing-module RED.

- [ ] **Step 3: Implement fixed bridge methods**

Expose named methods, never channel strings:

```ts
contextBridge.exposeInMainWorld("xiadieDesktop", Object.freeze({
  version: "1",
  listConversations: () => ipcRenderer.invoke("conversation:list"),
  createConversation: () => ipcRenderer.invoke("conversation:create"),
  sendMessage: (input: SendMessageInput) => ipcRenderer.invoke("message:send", input),
  subscribeToTurnEvents: (listener: (event: TurnEventDto) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, value: unknown) =>
      listener(turnEventSchema.parse(value));
    ipcRenderer.on("turn:event", handler);
    return () => ipcRenderer.removeListener("turn:event", handler);
  },
  // The remaining design-listed methods follow the same fixed mapping.
}));
```

Implement every remaining named method explicitly. `ipc.ts` validates input, calls one service method and maps exceptions without stack/path/SQL/provider body/prompt/key.

- [ ] **Step 4: Verify, review and commit**

```powershell
$env:CI='true'
pnpm.cmd exec vitest run apps/desktop/src/main/ipc.test.ts apps/desktop/src/preload/index.test.ts
pnpm.cmd typecheck
pnpm.cmd desktop:build
git diff --check
```

Reviewer confirms there is no generic invoke, raw event subscription, privileged object or key readback.

Run `pnpm.cmd test` before committing; the full suite must PASS.

```powershell
git add apps/desktop/src/main/ipc* apps/desktop/src/main/index.ts apps/desktop/src/preload apps/desktop/src/shared/contracts.ts
git commit -m "feat: add typed desktop IPC firewall"
```

---

### Task 8: assistant-ui local thread and streaming adapters

**Files:**
- Create: `apps/desktop/src/renderer/src/runtime/desktop-client.ts`
- Create: `apps/desktop/src/renderer/src/runtime/thread-list-adapter.ts`
- Create: `apps/desktop/src/renderer/src/runtime/thread-history-adapter.ts`
- Create: `apps/desktop/src/renderer/src/runtime/chat-model-adapter.ts`
- Create: `apps/desktop/src/renderer/src/runtime/desktop-runtime.tsx`
- Create: `apps/desktop/src/renderer/src/runtime/desktop-runtime.test.tsx`
- Create: `apps/desktop/src/renderer/src/window.d.ts`

**Interfaces:**
- Produces: `useDesktopRuntime()` backed by `useRemoteThreadListRuntime` and thread-scoped `useLocalRuntime`.
- Thread metadata/history comes only from IPC; assistant-ui cloud is not configured.

- [ ] **Step 1: Write jsdom RED tests around a fake typed bridge**

Cover list/create/switch/rename/delete mapping, history hydration, deterministic local title generation, streaming delta accumulation, terminal commit reload, failure presentation, retry, event identity/sequence filtering, unsubscribe and conversation-switch isolation.

```ts
fakeBridge.emit({ type: "delta", conversationId: "c1", turnId: "t1", sequence: 2, delta: "蝶" });
fakeBridge.emit({ type: "delta", conversationId: "c1", turnId: "t1", sequence: 3, delta: "来" });
expect(yields).toEqual(["蝶", "蝶来"]);
fakeBridge.emit({ type: "delta", conversationId: "c2", turnId: "t1", sequence: 4, delta: "ignored" });
expect(yields).toEqual(["蝶", "蝶来"]);
```

- [ ] **Step 2: Run renderer tests and verify RED**

```powershell
$env:CI='true'
pnpm.cmd --filter @xiadie/desktop test:renderer -- desktop-runtime.test.tsx
```

Expected: FAIL because the adapters do not exist.

- [ ] **Step 3: Implement the RemoteThreadListAdapter**

Use `list`, `initialize`, `rename`, `archive`, `unarchive`, `delete`, `fetch` and `generateTitle`. Map archive to the design's soft-delete behavior; do not expose an archived-threads screen in MVP. Generate the title locally from the first user message, capped at 40 Unicode code points, and return it through `createAssistantStream` without a model call.

- [ ] **Step 4: Implement the thread history and ChatModel adapters**

The history adapter maps committed/pending/failed DTOs to assistant-ui messages but never promotes transient deltas to persisted history. The chat adapter subscribes before invoking `sendMessage`, accepts events only for the selected `(conversationId, turnId)`, requires increasing sequence, accumulates deltas and yields cumulative content:

```ts
let text = "";
for await (const event of client.runTurn(input, abortSignal)) {
  if (event.type === "delta") {
    text += event.delta;
    yield { content: [{ type: "text", text }] };
  }
}
```

Abort only unsubscribes the Renderer listener in MVP; it must not claim that the provider run was cancelled.

- [ ] **Step 5: Verify, review and commit**

```powershell
$env:CI='true'
pnpm.cmd --filter @xiadie/desktop test:renderer
pnpm.cmd typecheck
git diff --check
```

Reviewer compares the implementation with assistant-ui's local runtime and remote thread adapter semantics, especially cumulative streaming and history ownership.

Run `pnpm.cmd test` before committing; the full Node and Renderer suites must PASS.

```powershell
git add apps/desktop/src/renderer/src/runtime apps/desktop/src/renderer/src/window.d.ts
git commit -m "feat: connect assistant-ui to desktop runtime"
```

---

### Task 9: assistant-ui chat skeleton and Xiadie three-column shell

**Files:**
- Create: `apps/desktop/components.json`
- Create: `apps/desktop/src/renderer/src/lib/utils.ts`
- Create: `apps/desktop/src/renderer/src/components/assistant-ui/thread.tsx`
- Create: `apps/desktop/src/renderer/src/components/assistant-ui/thread-list.tsx`
- Create: `apps/desktop/src/renderer/src/components/assistant-ui/thread-list-sidebar.tsx`
- Create: `apps/desktop/src/renderer/src/components/ui/button.tsx`
- Create: `apps/desktop/src/renderer/src/components/ui/dialog.tsx`
- Create: `apps/desktop/src/renderer/src/components/ui/input.tsx`
- Create: `apps/desktop/src/renderer/src/components/ui/tooltip.tsx`
- Create: `apps/desktop/src/renderer/src/components/xiadie/desktop-shell.tsx`
- Create: `apps/desktop/src/renderer/src/components/xiadie/right-sidebar.tsx`
- Create: `apps/desktop/src/renderer/src/components/xiadie/empty-state.tsx`
- Create: `apps/desktop/src/renderer/src/components/xiadie/error-message.tsx`
- Create: `apps/desktop/src/renderer/src/components/xiadie/desktop-shell.test.tsx`
- Modify: `apps/desktop/src/renderer/src/app.tsx`
- Modify: `apps/desktop/src/renderer/src/styles/globals.css`
- Modify: `apps/desktop/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: `useDesktopRuntime` and assistant-ui primitives.
- Produces: the usable three-column desktop experience; no new Main capabilities.

- [ ] **Step 1: Import the official assistant-ui registry skeleton**

Use the pinned CLI only as a source generator, from the desktop application directory:

```powershell
Push-Location apps\desktop
pnpm.cmd dlx assistant-ui@0.0.108 init --yes
pnpm.cmd dlx assistant-ui@0.0.108 add thread thread-list thread-list-sidebar
Pop-Location
```

Move generated files into the exact paths above, remove attachments, voice, branch picker, edit, stop and successful-response regeneration controls, and verify the generator did not replace the exact versions pinned in Task 2. Do not hand-reimplement `ThreadPrimitive`, `MessagePrimitive`, `ComposerPrimitive`, `ThreadListPrimitive` or their keyboard/scroll state machines.

- [ ] **Step 2: Write RED interaction and accessibility tests**

Test the visible left/middle/right regions, `Ctrl+N` new conversation, `Ctrl+K` composer focus, `Ctrl+Shift+E` left-sidebar toggle, `Ctrl+Shift+I` right-sidebar toggle, rename, delete confirmation, missing-key disabled composer, failure retry, visible focus rings, narrow-window behavior and stable empty state. Assert there is no Live2D canvas, emotion score, model selector, attachment button or tool progress UI.

- [ ] **Step 3: Apply the locked layout and theme**

`DesktopShell` uses CSS grid `17rem minmax(0, 1fr) 19rem`; collapse right at 1100px and turn left into a drawer below 760px. Define tokens:

```css
:root {
  --background: #f8f7fb;
  --foreground: #292534;
  --panel: #ffffff;
  --muted: #eeeaf5;
  --muted-foreground: #746d80;
  --accent: #8a75b5;
  --accent-soft: #ece5f7;
  --border: #ded8e8;
  --danger: #a44f61;
  --focus: #6f56a2;
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; }
}
```

The right sidebar renders only the Character identity/UI constant, current conversation title, failed/interrupted messages and non-empty `relationship.sharedProjects`. It never infers emotion or relationship state from model prose.

- [ ] **Step 4: Verify, visually inspect, review and commit**

```powershell
$env:CI='true'
pnpm.cmd --filter @xiadie/desktop test:renderer
pnpm.cmd typecheck
pnpm.cmd desktop:build
git diff --check
```

Launch `pnpm.cmd desktop:dev` and inspect 1440×900, 1024×768 and 720×800 with Windows scaling at 100% and 150%. Reviewer confirms official primitives remain in use and accessibility labels/focus behavior survive the theme.

Run `pnpm.cmd test` before committing; the full Node and Renderer suites must PASS.

```powershell
git add apps/desktop
git commit -m "feat: add Xiadie desktop chat interface"
```

---

### Task 10: Connection settings UI

**Files:**
- Create: `apps/desktop/src/renderer/src/components/xiadie/settings-dialog.tsx`
- Create: `apps/desktop/src/renderer/src/components/xiadie/settings-dialog.test.tsx`
- Modify: `apps/desktop/src/renderer/src/components/xiadie/desktop-shell.tsx`
- Modify: `apps/desktop/src/renderer/src/runtime/desktop-client.ts`

**Interfaces:**
- Consumes: typed connection bridge methods from Task 7.
- Produces: password entry, Base URL entry, fixed model display, status, test, replace, clear and reset actions.

- [ ] **Step 1: Write RED settings tests**

Cover source priority labels, password masking, no key hydration, replace/clear, Base URL validation, external-host disclosure/confirmation, official-host no-confirm path, test connection states, missing-key composer disable and settings change affecting only the next run.

```ts
expect(screen.queryByDisplayValue("sk-secret")).not.toBeInTheDocument();
expect(screen.getByText("deepseek/deepseek-v4-flash")).toBeVisible();
expect(screen.getByRole("button", { name: "保存到非官方服务" })).toBeDisabled();
await user.click(screen.getByRole("checkbox", { name: /我理解人格和对话将发送给该服务/ }));
expect(screen.getByRole("button", { name: "保存到非官方服务" })).toBeEnabled();
```

- [ ] **Step 2: Run renderer test and verify RED**

Expected: settings module missing.

- [ ] **Step 3: Implement settings without secret readback**

The password input always begins empty and uses placeholder `已由应用安全保存` only when status says `configured`. Blank submission retains the saved key; nonblank submission replaces it. Clearing saved key shows whether environment fallback is active. The custom-host confirmation text explicitly says API key, current message, committed recent history and compiled Persona will be sent to that service.

- [ ] **Step 4: Verify, review and commit**

```powershell
$env:CI='true'
pnpm.cmd --filter @xiadie/desktop test:renderer -- settings-dialog.test.tsx desktop-shell.test.tsx
pnpm.cmd typecheck
pnpm.cmd desktop:build
git diff --check
```

Reviewer inspects the React tree and bridge DTOs for secret leakage and confirms test connection is user-triggered only.

Run `pnpm.cmd test` before committing; the full Node and Renderer suites must PASS.

```powershell
git add apps/desktop/src/renderer/src/components/xiadie apps/desktop/src/renderer/src/runtime/desktop-client.ts
git commit -m "feat: add desktop connection settings"
```

---

### Task 11: Electron startup smoke and end-to-end deterministic acceptance

**Files:**
- Create: `apps/desktop/src/main/smoke-mode.ts`
- Create: `apps/desktop/src/main/smoke-mode.test.ts`
- Create: `apps/desktop/scripts/electron-smoke.mjs`
- Create: `apps/desktop/src/main/desktop-acceptance.test.ts`
- Modify: `apps/desktop/src/main/index.ts`
- Modify: `apps/desktop/package.json`

**Interfaces:**
- Produces: a repository-local Electron launch smoke and deterministic service acceptance using an injected fake SelfRuntime.
- Smoke mode is activated only by `XIADIE_DESKTOP_SMOKE=1`, never packaged as a user-facing switch and never contacts a provider.

- [ ] **Step 1: Write deterministic acceptance RED tests**

Drive the real SQLite repository and `DesktopChatService` with a scripted SelfRuntime through: create thread, first turn, second turn dependent on first committed pair, close database, reopen, recover title/history, leave one pending row, reopen and observe failed without assistant fabrication.

- [ ] **Step 2: Implement the non-network Electron smoke mode**

When the environment flag is exactly `1`, open the real BrowserWindow, wait for `ready-to-show`, print only `XIADIE_DESKTOP_SMOKE_READY`, close the window and quit 0. The harness builds first, spawns the pinned Electron binary, imposes a 30-second timeout and fails if stderr contains an uncaught exception.

- [ ] **Step 3: Verify actual Windows launch and deterministic workflow**

```powershell
$env:CI='true'
pnpm.cmd exec vitest run apps/desktop/src/main/desktop-acceptance.test.ts apps/desktop/src/main/smoke-mode.test.ts
pnpm.cmd desktop:build
pnpm.cmd desktop:smoke
```

Expected: tests PASS, build exit 0, and smoke output contains exactly one readiness marker with exit 0.

- [ ] **Step 4: Review and commit**

Reviewer confirms the smoke path cannot activate accidentally, contains no model/network request and does not bypass production BrowserWindow policy.

Run `pnpm.cmd test` before committing; the full suite must PASS.

```powershell
git add apps/desktop/src/main/smoke-mode* apps/desktop/src/main/desktop-acceptance.test.ts apps/desktop/src/main/index.ts apps/desktop/scripts apps/desktop/package.json
git commit -m "test: add desktop acceptance and launch smoke"
```

---

### Task 12: Documentation, final gates and optional live acceptance

**Files:**
- Modify: `README.md`
- Create: `docs/verification/desktop-mvp.md`
- Create: `docs/implementation-progress/desktop-mvp.md`
- Modify: `THIRD_PARTY_NOTICES.md` if dependency license inventory requires new direct notices

**Interfaces:**
- Produces: reproducible setup/run/verification instructions and an auditable final record.
- Does not change runtime behavior.

- [ ] **Step 1: Document user-facing operation and data locations**

README must include Node/pnpm versions, `pnpm install --frozen-lockfile`, `pnpm desktop:dev`, `pnpm desktop:build`, API configuration precedence, the fixed model, SQLite under Electron `userData`, safeStorage behavior, backup caveat and all MVP exclusions. Never show a real key value in examples.

- [ ] **Step 2: Run the complete deterministic gate as separate commands**

```powershell
node --version
pnpm.cmd --version
$env:CI='true'; pnpm.cmd install --frozen-lockfile
pnpm.cmd character:manifest
git diff --exit-code -- packages/xiadie-core/character/xiadie/v1/manifest.json
pnpm.cmd test
pnpm.cmd --filter @xiadie/desktop test:renderer
pnpm.cmd typecheck
pnpm.cmd desktop:build
pnpm.cmd desktop:smoke
git diff --check
git status --short
```

Expected versions: Node `v24.16.0`, pnpm `11.16.0`. Every command except the final status listing exits 0; manifest diff and status are empty. Record exact test counts, Electron version, commit under test and command exit codes in `docs/verification/desktop-mvp.md`.

- [ ] **Step 3: Perform security and scope static gates**

```powershell
Get-ChildItem apps\desktop\src\renderer -Recurse -File | Select-String -Pattern 'node:|electron|@xiadie/application|@xiadie/xiadie-core|@mastra|DEEPSEEK_API_KEY'
Get-ChildItem apps\desktop\src -Recurse -File | Select-String -Pattern 'nodeIntegration:\s*true|contextIsolation:\s*false|sandbox:\s*false|ipcRenderer\.invoke\([^"'']'
Get-ChildItem apps\desktop\src -Recurse -File | Select-String -Pattern 'Live2D|emotionScore|好感度|MCP|toolCall'
```

Expected: no prohibited Renderer imports, weakened window options, generic IPC, Live2D, inferred emotion/affinity, MCP or tool UI. Any intentional textual mention in a test must be documented and scoped.

- [ ] **Step 4: Optional live DeepSeek acceptance**

Run only after explicit user authorization to send compiled Persona plus the chosen test conversation to the resolved endpoint. Use a new temporary conversation, perform two turns where the second requires the first, close and reopen the app, and verify recovery. Record provider, normalized host, model, timestamps and PASS/FAIL/BLOCKED; never record the key, request headers, prompt bodies or response bodies. BLOCKED is acceptable when credentials or authorization are absent and must not be relabeled PASS.

- [ ] **Step 5: Final independent review and documentation commit**

The final reviewer reads the design, this plan, all task commits and tracked verification record; it must classify findings as Critical/Important/Minor and explicitly decide readiness while preserving any accepted live-model residual risk.

```powershell
git add README.md docs/verification/desktop-mvp.md docs/implementation-progress/desktop-mvp.md THIRD_PARTY_NOTICES.md
git commit -m "docs: verify Xiadie Desktop MVP"
git status --short
```

Expected: documentation commit succeeds and final status is empty.

---

## Milestone Gates

### Milestone A — Headless desktop foundation (Tasks 1–6)

- Multi-turn history is explicit, immutable, budgeted and rendered as untrusted Turn Data.
- SQLite separately persists display data and verified-turn audit data.
- DeepSeek settings are safe, fixed-model and injectable without mutating global environment state.
- A headless DesktopChatService completes, persists, retries and recovers turns deterministically.

### Milestone B — Secure usable application (Tasks 7–10)

- Typed IPC is the only Renderer capability surface.
- assistant-ui owns thread/message/composer behavior and local thread runtime mapping.
- The three-column Xiadie UI, responsive behavior and settings are usable with keyboard and reduced motion.
- No forbidden tools, attachments, model selector, Live2D or inferred psychology appears.

### Milestone C — Release evidence (Tasks 11–12)

- Pinned Electron launches on Windows without contacting a provider.
- Two-turn persistence and crash recovery pass deterministic acceptance.
- Full tests, renderer tests, typecheck, manifest idempotence, build, smoke, security grep and diff check are recorded against the final tested commit.

## Execution Order and Review Policy

Tasks 1–8 are sequential because each publishes contracts consumed by the next. After Task 8, Tasks 9 and 10 may be implemented in separate worktrees only if their shared `desktop-client.ts` ownership is assigned to Task 10 and Task 9 treats it as read-only; otherwise keep them sequential. Tasks 11–12 are always sequential final gates.

For subagent-driven execution, dispatch one implementer and one fresh reviewer per task. The implementer must not begin the next task until the reviewer has approved the current task or the findings have been fixed and re-reviewed. Never merge a task with unresolved Critical or Important findings.
