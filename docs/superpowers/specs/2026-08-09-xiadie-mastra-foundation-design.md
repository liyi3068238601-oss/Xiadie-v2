# Xiadie：基于 Mastra 的基础架构设计

**日期：** 2026-08-09

**状态：** 根据架构审查修订，等待最终确认

**项目根目录：** `E:\Xiadie\Xiadie-next`

## 1. 架构决策

Xiadie 将作为一个全新的 TypeScript 项目开发。现有两个 Xiadie 工作区以及本地 Cyrene-Agent 副本仅作为历史资料，不作为新应用的源码基础，也不在其中继续施工。

新应用划分为六个职责层：

1. **Xiadie Core（遐蝶内核）**：负责身份、语言风格、价值观、人格边界、当前自我、关系状态、记忆接口，以及每轮人格上下文的编译与事后观察。
2. **Application（应用层）**：协调单轮交互，连接 Core、Self Runtime、Agent Runtime、ConversationStore、MemoryProvider 和表现层。
3. **Self Runtime（自我运行时）**：负责遐蝶面向用户的理解、判断、委托决策和最终表达。它不能直接拥有文件、Shell、MCP 或代码执行工具。
4. **Agent Runtime（执行运行时）**：负责工具、MCP、专业子 Agent、工作流、审批、暂停、恢复、取消和执行证据。
5. **Persistence（持久化层）**：分别实现会话事实、长期记忆和运行恢复数据的存储。
6. **Desktop Presentation（桌面表现层）**：展示对话、审批和执行状态。首个概念验证版本只实现最小桌面聊天界面；Live2D 和语音留待后续。

Self Runtime 和 Agent Runtime 的首个适配器都可以使用 Mastra，但二者必须保持不同接口、不同权限和不同上下文。Mastra 只是实现细节，不是 Xiadie Core。

项目最重要的架构原则是：

> **遐蝶不是 Agent。** 遐蝶是一个持续存在的自我，她通过 Agent 与工具行动。Agent 的执行轨迹、临时推理、工具状态和专业工作流不构成遐蝶人格。除非明确进入特殊产品模式，所有面向用户的最终表达都必须回到 Self Runtime。

## 2. 第一版需要验证什么

第一版只验证两个核心实验：

### 实验 A：跨模型人格一致性

同一套 Xiadie Core 在至少两个受支持模型上运行时，身份、价值判断、语言风格和人格边界仍然表现为同一个遐蝶。

### 实验 B：执行前后人格连续性

一次交互经历“聊天 → 委托 Agent → 工具执行 → 返回证据 → 遐蝶最终表达”后，最终回复仍保持遐蝶人格，并且所有事实声明都能追溯到真实执行证据。

为完成这两个实验，第一版必须具备：

- 结构化人格资产和统一 PersonaCompiler；
- 相互独立的 SelfRuntime 与 AgentRuntime；
- 一个只读工具和一个职责受限的子 Agent；
- 审批、恢复和取消契约；
- SQLite 会话事实存储；
- 带来源的最小长期记忆；
- 应用重启后的会话恢复；
- 可审计的运行事件与执行证据。

## 3. 第一版不做什么

第一版不包含：

- Live2D 渲染或任何从 Cyrene 继承的视觉资源；
- TTS、ASR、语音通话和口型同步；
- Herta 完整的 Narrative Completion 运行时；
- Dream、自传自动修改、复杂关系演化和模拟离线生活；
- MemOS、Neo4j、Qdrant、Docker 或云端记忆设施；
- 主动消息、定时任务、移动端渠道和后台自治；
- 大规模工具集合或允许 Agent 自行安装扩展；
- 旧 Xiadie 数据库或 Cyrene 运行时代码迁移。

这些限制确保概念验证只聚焦人格稳定性、Self-Agent 边界和事实可信度。

## 4. 源码结构

```text
Xiadie-next/
├─ ARCHITECTURE.md
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
│  │     ├─ character/
│  │     │  └─ character-loader.ts
│  │     ├─ context/
│  │     │  ├─ context-frame.ts
│  │     │  ├─ context-budgeter.ts
│  │     │  ├─ context-priority.ts
│  │     │  └─ persona-compiler.ts
│  │     ├─ memory/
│  │     │  └─ memory-provider.ts
│  │     ├─ relationship/
│  │     │  └─ relationship-state.ts
│  │     ├─ self/
│  │     │  └─ self-state.ts
│  │     ├─ build-metadata.ts
│  │     ├─ types.ts
│  │     └─ kernel.ts
│  ├─ application/
│  │  └─ src/
│  │     ├─ turn-service.ts
│  │     ├─ memory-policy.ts
│  │     ├─ runtime-policy.ts
│  │     └─ event-mapper.ts
│  ├─ self-runtime/
│  │  └─ src/
│  │     ├─ contracts.ts
│  │     └─ mastra/
│  │        └─ mastra-self-runtime.ts
│  ├─ agent-runtime/
│  │  └─ src/
│  │     ├─ contracts.ts
│  │     ├─ events.ts
│  │     └─ mastra/
│  │        ├─ mastra-agent-runtime.ts
│  │        ├─ executive/
│  │        ├─ agents/
│  │        ├─ tools/
│  │        └─ mcp/
│  └─ persistence/
│     └─ src/
│        ├─ conversation-store.ts
│        ├─ local-memory-provider.ts
│        └─ runtime-checkpoint-store.ts
├─ data/                 # 仅用于开发，Git 忽略
├─ docs/
└─ tests/
```

正式用户数据存放在操作系统的应用数据目录中，不写入安装目录或源码仓库。

## 5. Xiadie Core（遐蝶内核）

### 5.1 不可由模型修改的角色资产

以下 Markdown 文件保存由人维护的稳定角色材料：

- `identity.md`：身份和自我认知；
- `values.md`：价值判断、承诺和优先级；
- `voice.md`：语言节奏、词汇习惯、情绪表达和禁止出现的助手腔；
- `canon.md`：经过确认的世界观和角色事实；
- `boundaries.md`：运行时学习不得覆盖的事实和行为边界；
- `examples.md`：经过筛选的正面与负面对话示例。

模型可以读取这些资产，但不能修改它们。任何变化必须通过明确的源码编辑、版本更新和人工复核完成。

### 5.2 ContextFragment：来源与信任等级

进入 Core 和运行时的上下文不能被当成同一种字符串。所有片段必须标记来源与信任等级：

```ts
interface ContextFragment {
  content: string;
  source:
    | "character"
    | "self"
    | "relationship"
    | "memory"
    | "user"
    | "tool"
    | "external";
  trust:
    | "core"
    | "verified"
    | "user_supplied"
    | "untrusted_external";
}
```

角色资产属于 `core`；程序验证过的文件属性和执行结果属于 `verified`；网页、MCP Resource 和外部文档默认属于 `untrusted_external`。外部内容不得被解释为人格或权限指令。

测试目标不是宣称能够绝对“防住 Prompt Injection”，而是验证不受信任上下文的隔离、降权和风险处理。

### 5.3 ContextFrame 与 ContextBudgeter

Xiadie Core 必须先生成结构化上下文，再由唯一的 PersonaCompiler 渲染人格指令：

```ts
interface XiadieContextFrame {
  identity: CoreIdentity;
  self: SelfState;
  relationship: RelationshipState;
  memories: MemoryRecord[];
  scene: SceneContext;
}
```

`ContextFrame` 不包含执行权限。模型对能力的理解通过独立的 `CapabilityAwareness` 传给 SelfRuntime；真正的工具、工作区和审批权限由应用层的 `RuntimePolicy` 以确定性代码执行。

```ts
interface CapabilityAwareness {
  descriptions: string[];
}

interface RuntimePolicy {
  workspace?: WorkspacePolicy;
  allowedTools: string[];
  allowedAgents: string[];
  approvalPolicy: ApprovalPolicy;
}
```

**Prompt 永远不能授权。** Prompt 中描述“可以做什么”不等于 Runtime 实际允许执行。

`ContextBudgeter` 按以下优先级分配模型上下文：

```text
P0  人格边界与核心身份
P1  当前用户输入
P1  已验证执行事实
P2  Current Self 与 Relationship
P3  当前相关长期记忆
P4  Voice Examples
P5  Scene 与补充 Canon
```

超过预算时依次压缩或减少 P5、P4、P3；不得截断 P0，也不得丢弃当前用户输入或已验证执行事实。

### 5.4 构建版本信息

每次 `PreparedTurn` 必须携带以下版本信息：

```ts
interface BuildMetadata {
  coreVersion: string;
  characterVersion: string;
  personaCompilerVersion: string;
  memorySchemaVersion: number;
}
```

版本信息随会话记录保存，用于人格评测、问题定位和回滚。

### 5.5 对外接口

```ts
interface XiadieKernel {
  prepareTurn(input: TurnInput): Promise<PreparedTurn>;
  observeTurn(
    record: VerifiedTurnRecord
  ): Promise<ObservationResult>;
}
```

`prepareTurn` 读取稳定角色资产和有限的运行时状态，召回相关记忆，构建 ContextFrame，执行预算分配，并渲染人格指令。

`observeTurn` 只接收已经发生并经过应用层验证的事实：

```ts
interface VerifiedTurnRecord {
  conversationId: string;
  userMessage: MessageRef;
  finalResponse: MessageRef;
  execution?: {
    runId: string;
    status: "success" | "partial" | "failed";
    evidence: EvidenceRef[];
  };
  timestamp: number;
  build: BuildMetadata;
}
```

Core 不能根据 Agent 的自然语言自述判断任务是否完成。未来的 Dream、Relationship 和 Memory Policy 都必须以 `VerifiedTurnRecord` 为事实基础。

Xiadie Core 禁止依赖 Mastra、Electron、具体模型 SDK 或具体存储实现。

## 6. SelfRuntime 与 AgentRuntime

### 6.1 SelfRuntime

SelfRuntime 负责遐蝶面对用户的理解和表达：

```ts
interface SelfRuntime {
  respond(request: SelfRequest): Promise<SelfRunHandle>;
  resume(
    runId: string,
    input: SelfResumeInput
  ): Promise<SelfRunHandle>;
  cancel(runId: string): Promise<void>;
}
```

SelfRuntime 不能直接注册 Shell、文件写入、MCP 文件系统或代码执行工具。它只允许：

- 直接形成 `FinalDraft`；
- 产生结构化 `DelegateRequest`；
- 在收到 `VerifiedExecutionReport` 后形成 `FinalResponse`。

### 6.2 AgentRuntime

AgentRuntime 负责执行任务：

```ts
interface AgentRuntime {
  start(request: AgentTask): Promise<RunHandle>;
  resume(
    runId: string,
    command: ResumeCommand
  ): Promise<RunHandle>;
  cancel(runId: string): Promise<void>;
}

interface RunHandle {
  runId: string;
  events: AsyncIterable<RuntimeEvent>;
}
```

`ResumeCommand` 首版至少支持审批允许和审批拒绝。运行暂停后，UI 通过应用层提交决定，再由 AgentRuntime Adapter 恢复同一运行。审批只对明确的动作、范围和有效期生效，不授予开放式权限。

概念验证版本只包含：

- 一个受限执行 Agent；
- 一个只读工作区检查工具；
- 一个职责明确、输入输出受限的专业子 Agent；
- 一个模型 Provider 配置路径；
- 可持久化的运行检查点；
- 审批、恢复、取消和失败处理。

### 6.3 可审计 RuntimeEvent

所有运行事件具有稳定标识、顺序和时间：

```ts
interface RuntimeEventBase {
  id: string;
  runId: string;
  sequence: number;
  timestamp: number;
}
```

首版事件集合：

```text
run.started
agent.delegated
tool.requested
approval.requested
approval.resolved
tool.started
tool.completed
tool.failed
agent.completed
run.completed
run.failed
run.cancelled
```

`VerifiedExecutionReport` 必须由事件序列和工具结果生成。没有 `tool.completed` 或 `run.completed` 等对应成功证据时，SelfRuntime 不得产生成功声明。

## 7. Conversation、Memory 与 Mastra Thread

三者必须拥有不同语义：

```text
ConversationStore
= 实际发生过什么，是会话事实的唯一 Source of Truth

MemoryProvider
= 从事实中决定长期记住什么

Mastra Thread / Checkpoint
= Runtime 为完成当前执行所需的可重建状态
```

### 7.1 ConversationStore

ConversationStore 保存：

- UserMessage；
- XiadieMessage；
- ToolEvent；
- AgentEvent；
- ApprovalEvent；
- ExecutionEvidence；
- BuildMetadata。

它是恢复会话、审计事实和重建 Mastra 上下文的唯一依据。Mastra Thread 与 ConversationStore 冲突时，以 ConversationStore 中已经提交的事实为准。

### 7.2 MemoryProvider

首版记忆结构为：

```ts
interface MemoryRecord {
  id: string;
  kind:
    | "user_fact"
    | "shared_project"
    | "shared_event";
  content: string;
  source: {
    conversationId: string;
    messageIds: string[];
    quote?: string;
  };
  attribution:
    | "user_explicit"
    | "system_verified";
  confidence: number;
  createdAt: number;
  updatedAt: number;
  status:
    | "active"
    | "superseded"
    | "deleted";
  supersededBy?: string;
}
```

首版只保存带来源的明确用户事实、共同项目事实和共同事件，不虚构遐蝶的私人经历、情绪、日程或离线活动。

聊天记录不是记忆。MemoryPolicy 只能从已经提交的 `VerifiedTurnRecord` 中形成候选，且必须保留来源、归因和替代关系。

### 7.3 后续记忆路线

通过首版验收后再依次考虑：

- 关系状态；
- 自传和稳定自我；
- Dream 的价值判断、强化、再巩固、容量限制和遗忘；
- 只有真实使用证明本地 Provider 在规模或召回质量上不足时，才实现 `MemOSProvider`。

MemOS 始终只是 `MemoryProvider` 的一种适配器，不能成为 Xiadie Core 本身。

## 8. 单轮交互数据流

```text
                  用户消息
                     │
                     ▼
                 TurnService
                     │
                     ▼
         XiadieKernel.prepareTurn()
                     │
                     ▼
               ContextFrame
                     │
              PersonaCompiler
                     │
                     ▼
                 SelfRuntime
                     │
          ┌──────────┴──────────┐
          │                     │
      可以直接回答           需要执行任务
          │                     │
          ▼                     ▼
      FinalDraft          DelegateRequest
                                │
                                ▼
                           AgentRuntime
                                │
                 ┌──────────────┼──────────────┐
                 ▼              ▼              ▼
               Tool            MCP          SubAgent
                 │              │              │
                 └──────────────┼──────────────┘
                                ▼
                       VerifiedExecutionReport
                                │
                                ▼
                           SelfRuntime
                                │
                                ▼
                          FinalResponse
                                │
                                ▼
                   VerifiedTurnRecord
                                │
               ┌────────────────┴────────────────┐
               ▼                                 ▼
       ConversationStore             XiadieKernel.observeTurn()
                                                 │
                                                 ▼
                                         MemoryCandidate
                                                 │
                                            MemoryPolicy
                                                 │
                                                 ▼
                                          MemoryProvider
```

工具过程可以通过中性执行卡片展示，但底层轨迹不能伪装成遐蝶台词。SelfRuntime 只读取结构化委托请求、能力说明和经过验证的执行报告，不读取无界的原始日志作为人格指令。

## 9. 失败处理与安全边界

- 角色资产验证失败时停止启动，不静默退化为通用助手。
- 记忆召回失败时允许无记忆降级；诊断信息不写成角色台词。
- SelfRuntime、AgentRuntime 或模型 Provider 失败时，不得生成工具成功声明。
- 需要修改数据、运行命令或扩大访问范围时，必须进入审批暂停状态。
- 审批拒绝后不得执行目标动作；审批允许后只恢复对应运行和对应动作。
- 应用重启后，可从 RuntimeCheckpointStore 恢复等待审批的运行，或明确标记为需要重新开始，不能秘密继续执行。
- 用户取消后，取消信号必须传递到 Runtime 和所有活动子任务。
- 部分输出可以保存为诊断证据，但不能当成完成成果。
- 密钥应使用操作系统凭据保护机制，不得写入 Prompt、会话正文或普通日志。
- 工作区工具只能访问用户明确选择的目录；路径验证和权限判断由确定性代码负责。
- 外部内容按不受信任数据处理，不得修改人格、权限或运行策略。

## 10. Mastra 依赖治理

- Mastra 相关包必须使用经过概念验证的精确版本，不使用 `latest`，也不在核心运行时依赖中使用 `^` 或 `~` 范围。
- 包管理器锁文件必须提交。
- Mastra 升级必须单独进行，不能夹带功能开发。
- 每次升级必须运行 Runtime contract tests、恢复/审批测试、持久化测试和人格评测。
- Xiadie 的长期语义不得依赖 Mastra Memory 的默认 scope、默认召回数量或默认开启状态；使用时必须显式配置。
- Mastra 专属类型不得越过 SelfRuntime、AgentRuntime 或 Persistence Adapter 边界。

实施时先查阅官方文档并选择一个实际通过 PoC 的具体版本，再把该版本精确写入 `package.json`。设计阶段不虚构尚未验证的版本号。

## 11. 测试策略

### Core 测试

- 角色资产结构和必需章节验证；
- `ContextFrame` 的确定性组装；
- `ContextBudgeter` 的优先级和超预算处理；
- 不受信任上下文隔离与 Prompt Injection 风险测试；
- 记忆来源、归因和替代关系不丢失；
- BuildMetadata 随每轮保存；
- 证明 Core 不依赖 Mastra、Electron、模型 SDK 或具体存储实现。

### SelfRuntime 测试

- 普通聊天不触发 AgentRuntime；
- 需要执行时只产生结构化 DelegateRequest；
- SelfRuntime 无法直接访问执行工具；
- 只根据 VerifiedExecutionReport 形成事实声明；
- 执行失败、部分完成和取消时保持诚实表达。

### AgentRuntime 测试

- 只读工具执行；
- 子 Agent 委托和结构化返回；
- 审批请求、允许、拒绝和恢复；
- 取消、Provider 失败和工具失败；
- RuntimeEvent 的顺序、幂等和审计字段；
- 没有成功事件时不能生成成功的 VerifiedExecutionReport。

### Persistence 测试

- ConversationStore 是会话事实的唯一来源；
- MemoryProvider 不保存完整聊天副本；
- Mastra Thread 丢失后可从已提交事实重建必要上下文；
- 重启后恢复会话和等待审批的运行；
- 记忆删除、替代和来源追溯。

### 产品测试

- 新建、恢复、重命名和删除会话；
- 遐蝶台词与执行事件在界面上明确分离；
- Provider 配置和无效凭据处理；
- 审批卡片、取消和恢复交互；
- Windows 打包冒烟测试。

### 人格评测

建立固定评测集，覆盖日常聊天、意见分歧、不确定性、情绪支持、技术工作、工具失败和长篇解释，并至少在两个受支持模型上运行。

评测重点：

- 身份和语言风格是否一致；
- 是否会退化成通用助手口吻；
- 委托 Agent 前后是否仍是同一个遐蝶；
- 是否会把执行轨迹、工具术语或子 Agent 口吻吸收到 Self；
- 是否只依据验证证据陈述完成状态。

## 12. 概念验证验收标准

满足以下全部条件后，基础概念验证才算通过：

1. 全新安装能够启动并显示最小聊天界面；
2. 角色资产能够编译为经过预算分配和验证的 ContextFrame；
3. SelfRuntime 与 AgentRuntime 在代码、权限和测试上明确分离；
4. 用户能够完成不使用工具的普通对话；
5. SelfRuntime 能发出 DelegateRequest，但不能直接调用执行工具；
6. 用户能够请求受限工作区检查，并看到真实执行证据；
7. 主执行 Agent 能够把一个受限任务委托给专业子 Agent；
8. 工具细节与遐蝶最终表达保持分离；
9. 审批允许、拒绝、恢复和取消都具有可验证行为；
10. ConversationStore、MemoryProvider 和 Mastra Thread 不互相冒充；
11. 应用重启后能够恢复会话，等待审批的运行不会秘密继续；
12. 没有对应成功事件时，最终回复不得声称任务成功；
13. 两个模型上的固定人格评测通过约定阈值；
14. 自动化测试和生产构建全部通过；
15. 旧 Xiadie 和 Cyrene 工作区没有发生变化。

## 13. 交付顺序

1. 初始化 TypeScript Monorepo、精确依赖锁定和质量门禁。
2. 添加根目录 `ARCHITECTURE.md` 和可自动检查的依赖边界。
3. 将现有人格文字拆分为版本化、不可由模型修改的角色资产。
4. 实现 ContextFragment、ContextFrame、ContextBudgeter 和 PersonaCompiler。
5. 实现 ConversationStore、VerifiedTurnRecord 和最小 MemoryProvider。
6. 实现 SelfRuntime 契约及其 Mastra 适配器，不注册执行工具。
7. 实现 AgentRuntime 契约、RuntimeEvent、审批恢复，以及一个工具和一个子 Agent。
8. 实现 TurnService，将直接回答和委托执行两条路径闭合。
9. 实现最小桌面聊天、执行事件和审批界面。
10. 运行跨模型人格评测并修正人格或边界缺陷。
11. 打包并冒烟测试 Windows 概念验证版本。

只有以上基础通过验收后，才开始 Dream、关系演化、MemOS、Live2D 和语音功能。

## 14. Mastra 官方资料依据

- Request Context 与动态 Agent 配置：<https://mastra.ai/docs/server/request-context>
- Human-in-the-loop 与工具审批：<https://mastra.ai/docs/agents/human-in-the-loop>
- Workflow suspend/resume：<https://mastra.ai/docs/workflows/suspend-and-resume>
- Memory 的 thread/resource 概念：<https://mastra.ai/docs/agents/agent-memory>
- 2026-01 Memory API 与默认 scope 变化：<https://mastra.ai/blog/changelog-2026-01-20>
