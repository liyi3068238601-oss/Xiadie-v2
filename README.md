# Xiadie

Xiadie 是一个以“持续存在的 Self 使用 Agent 能力”为边界设计的遐蝶人格应用。仓库目前包含 Foundation Contracts、终端垂直切片，以及可运行的 Windows Electron Desktop MVP。

## Desktop MVP

Desktop MVP 提供三栏聊天界面、会话创建/重命名/软删除、多轮上下文、SQLite 恢复、连接设置和固定模型的 DeepSeek 对话。Renderer 只通过类型化 preload IPC 调用主进程；它不能直接访问 Node、Electron、Core、Mastra 或密钥。

### 环境与运行

- Node.js `24.16.0`
- pnpm `11.16.0`
- Electron `43.2.0`

```powershell
$env:CI='true'
pnpm.cmd install --frozen-lockfile
pnpm.cmd desktop:dev
```

如果 Electron 二进制下载受网络环境影响，可以在安装前设置镜像和代理：

```powershell
$env:all_proxy='http://127.0.0.1:7993'
$env:ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/'
$env:CI='true'
pnpm.cmd install --frozen-lockfile
```

生产构建与无模型调用的启动烟测：

```powershell
$env:CI='true'
pnpm.cmd desktop:build
pnpm.cmd desktop:smoke
```

### DeepSeek 连接

模型固定为 `deepseek/deepseek-v4-flash`，MVP 不提供模型选择器。可以在应用“连接设置”中输入 API Key 和 Base URL；Key 保存后不会回显。也可以在启动应用前设置：

```powershell
$env:DEEPSEEK_API_KEY='<your-key>'
$env:DEEPSEEK_BASE_URL='https://api.deepseek.com'
pnpm.cmd desktop:dev
```

解析优先级为“应用内保存值 > 环境变量 > 默认 Base URL”。应用内 Key 仅在 Electron `safeStorage` 可用时保存为加密文本；不可用时拒绝落盘。环境变量 Key 不会写入设置文件。非官方外部主机必须在界面中确认数据将发送到该主机；HTTP 仅允许 loopback 地址。

### 本地数据与备份

下列文件位于 Electron `app.getPath("userData")`：

- `xiadie-desktop.sqlite`：会话、消息状态和已验证 turn 审计事实；
- `connection-settings.json`：Base URL 与 `safeStorage` 加密后的应用内 Key。

备份前应先完全退出应用，再复制整个 `userData` 目录，避免复制到正在写入的 SQLite 文件。加密 Key 可能绑定当前 Windows 用户/设备；跨设备恢复时应重新输入 Key。当前 MVP 没有自动备份、云同步或迁移 UI。

### MVP 明确不包含

- Agent 工具、MCP、文件/终端操作和工具进度 UI；
- 附件、语音、Live2D、模型选择器、消息编辑、分支与重新生成；
- Dream、MemOS、长期记忆、关系演化、情绪分数或好感度；
- 安装包签名、自动更新、云同步和发布渠道。

## Implemented

- Frozen `xiadie-core` contracts for IDs, partitioned `SelfRequest`, turn facts, and opaque verified execution facts.
- Separate `self-runtime` and `agent-runtime` event/task contracts.
- Application-level delegate validation, policy-constrained minimal `AgentTask` creation, partitioned Self request assembly, deterministic context budgeting, and deterministic execution verification.
- An in-memory `TurnService`, conversation store, and checkpoint store that exercise the direct-answer and one-delegation paths.
- Contract and orchestration tests for authorization, context, evidence, committed turns, and checkpoint lifecycle behavior.
- Versioned Xiadie Character 1.0.3 assets with canonical Manifest validation.
- A deterministic PersonaCompiler with immutable instruction/reference partitions and full/per-turn SHA-256 audit hashes.
- Policy-aware whole-fragment Persona budgeting and a ten-category static evaluation set.
- A tool-free `@xiadie/mastra-self-runtime` adapter and terminal chat entry point.
- A secure Electron Desktop MVP with typed IPC, SQLite conversation/audit persistence, assistant-ui primitives, and in-app DeepSeek connection settings.

## Terminal chat (Phase 3A)

Set a Mastra model-router ID and the matching provider credential, then run a one-shot message:

```powershell
$env:XIADIE_MODEL='openai/gpt-5-mini'
$env:OPENAI_API_KEY='...'
pnpm.cmd chat -- '你好，遐蝶'
```

Run `pnpm.cmd chat` without a message for an interactive loop. The Self runtime has no Shell, filesystem, MCP, memory, tools, or subagents. API keys are read from environment variables and are never written to character assets or conversation content.

The ten-case live persona evaluation is opt-in because it makes paid provider calls:

```powershell
pnpm.cmd persona:eval:live
```

It emits JSONL containing the case ID, model, character asset hash, effective persona instruction hash, and response. Default tests never contact a model provider.

## Run checks

```powershell
$env:CI='true'
pnpm.cmd test
pnpm.cmd --filter @xiadie/desktop test:renderer
pnpm.cmd typecheck
pnpm.cmd desktop:build
pnpm.cmd desktop:smoke
```

Desktop MVP 的完整可复现验证记录见 [docs/verification/desktop-mvp.md](docs/verification/desktop-mvp.md)，施工台账见 [docs/implementation-progress/desktop-mvp.md](docs/implementation-progress/desktop-mvp.md)。Phase 1 记录仍保留在 [docs/verification/foundation-contracts.md](docs/verification/foundation-contracts.md)。

## Not implemented

The following remain outside the implemented product scope:

- Dream
- MemOS
- Live2D
- Voice
- Runtime Lore retrieval
- Agent tools and MCP
- Distribution packaging and auto-update

Future adapters and persistence must preserve the frozen architecture boundaries in [ARCHITECTURE.md](ARCHITECTURE.md).
