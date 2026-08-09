# Xiadie：基于 Mastra 的基础架构设计

**日期：** 2026-08-09

**状态：** 架构基线已确认

**项目根目录：** `E:\Xiadie\Xiadie-next`

## 1. 架构决策

Xiadie 将作为一个全新的 TypeScript 项目开发。现有两个 Xiadie 工作区以及本地 Cyrene-Agent 副本仅作为历史资料，不作为新应用的源码基础，也不在其中继续施工。

新应用明确划分为四层：

1. **Xiadie Core（遐蝶内核）**：负责身份、语言风格、价值观、人格边界、当前自我、关系状态、记忆接口，以及每轮对话上下文的编译。
2. **应用层**：协调 Xiadie Core、Agent 运行时、持久化模块和表现层，共同完成一次交互。
3. **Mastra Runtime（Mastra 运行时）**：负责 Agent 执行、工具、MCP、子 Agent、工作流、运行时线程和执行事件。
4. **桌面表现层**：展示对话和执行状态。首个概念验证版本只实现最小桌面聊天界面；Live2D 和语音将在后续作为表现层适配器加入。

整个项目最重要的架构原则是：

> **遐蝶不是 Agent。** 遐蝶是一个持续存在的自我，她可以把行动委托给 Agent 运行时。工具轨迹、临时推理和实现细节不构成遐蝶的人格。面向用户的最终结论必须重新回到遐蝶 Self。

## 2. 项目目标

第一版必须验证以下事项：

- 现有遐蝶人格材料能够被编译为稳定的模型上下文；
- 同一套 Xiadie Core 可以独立于 Mastra 内部实现工作；
- 普通聊天和需要工具执行的工作都能保持一致的遐蝶表达；
- Mastra 能够执行一个受限工具和一个子 Agent；
- 应用重启后仍能恢复会话；
- 所有面向用户的工具执行结论都来自真实运行结果；
- 未来可以添加新的记忆 Provider 和表现层，而不必重写人格逻辑。

## 3. 第一版不做什么

第一版不包含：

- Live2D 渲染或任何从 Cyrene 继承的视觉资源；
- TTS、ASR、语音通话和口型同步；
- Herta 完整的 Narrative Completion 运行时；
- Dream、自传自动修改、关系演化和模拟离线生活；
- MemOS、Neo4j、Qdrant、Docker 或云端记忆设施；
- 主动消息、定时任务、移动端渠道和后台自治；
- 大规模内置工具集合；
- 旧 Xiadie 数据库或 Cyrene 运行时代码迁移。

这些限制用于确保概念验证只聚焦两件事：人格稳定性，以及 Self 与 Agent 的边界是否成立。

## 4. 源码结构

```text
Xiadie-next/
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
│  │     ├─ context-frame.ts
│  │     ├─ persona-compiler.ts
│  │     ├─ providers.ts
│  │     ├─ types.ts
│  │     └─ kernel.ts
│  ├─ application/
│  │  └─ src/
│  │     ├─ turn-service.ts
│  │     ├─ event-mapper.ts
│  │     └─ session-service.ts
│  ├─ mastra-runtime/
│  │  └─ src/
│  │     ├─ runtime-adapter.ts
│  │     ├─ agents/
│  │     ├─ tools/
│  │     └─ mcp/
│  └─ persistence/
│     └─ src/
│        ├─ sqlite-session-store.ts
│        └─ local-memory-provider.ts
├─ data/                 # 仅用于开发，Git 忽略
├─ docs/
└─ tests/
```

正式版本的用户数据存放在操作系统的应用数据目录中，不写入安装目录或源码仓库。

## 5. Xiadie Core（遐蝶内核）

### 5.1 不可由模型修改的角色资产

以下 Markdown 文件保存稳定且由人维护的角色材料：

- `identity.md`：身份和自我认知；
- `values.md`：价值判断、承诺和优先级；
- `voice.md`：语言节奏、词汇习惯、情绪表达方式，以及禁止出现的助手腔；
- `canon.md`：经过确认的世界观和角色事实；
- `boundaries.md`：运行时学习不得覆盖的事实和行为边界；
- `examples.md`：经过筛选的正面与负面对话示例。

模型可以读取这些资产，但不能修改它们。任何变化都必须通过明确的源码编辑和人工复核完成。

### 5.2 运行时状态

0.1 版先定义当前自我、关系和记忆接口，但初始实现保持很小：

```ts
interface SelfState {
  currentConcerns: string[];
}

interface RelationshipState {
  userDisplayName?: string;
  sharedProjects: string[];
}

interface MemoryProvider {
  recall(query: MemoryQuery): Promise<MemoryRecord[]>;
  write(candidate: MemoryCandidate): Promise<void>;
}
```

首个本地记忆实现只保存带有来源的明确用户事实和共同项目事实，不虚构遐蝶的私人经历、情绪、日程或离线活动。

### 5.3 ContextFrame

Xiadie Core 必须先生成结构化上下文，再渲染模型指令：

```ts
interface XiadieContextFrame {
  identity: CoreIdentity;
  self: SelfState;
  relationship: RelationshipState;
  memories: MemoryRecord[];
  scene: SceneContext;
  capabilities: CapabilitySummary;
}
```

应用层和 Mastra 模块都不能自行拼接身份、记忆和场景 Prompt。`PersonaCompiler` 是唯一负责把 `XiadieContextFrame` 渲染成模型指令的组件。

### 5.4 对外接口

```ts
interface XiadieKernel {
  prepareTurn(input: TurnInput): Promise<PreparedTurn>;
  observeTurn(result: ObservedTurn): Promise<void>;
}
```

`prepareTurn` 负责读取稳定角色资产和有限的运行时状态，召回相关记忆，构建 ContextFrame，并渲染模型指令。

`observeTurn` 只接收已经验证的对话及执行结果。它可以提出记忆候选，但不能声称或伪造任何工具执行结果。

Xiadie Core 禁止依赖 Mastra、Electron、具体模型 SDK 或具体记忆数据库。

## 6. Mastra Runtime（Mastra 运行时）

Mastra 必须隐藏在应用层拥有的接口之后，从而保证将来可以替换运行时而不修改 Xiadie Core：

```ts
interface AgentRuntime {
  run(request: RuntimeRequest): AsyncIterable<RuntimeEvent>;
  cancel(runId: string): Promise<void>;
}
```

概念验证版本包含：

- 一个主要的遐蝶交互 Agent；
- 一个只读工作区检查工具；
- 一个职责明确、输入输出受限的专业子 Agent；
- 一条模型 Provider 配置路径；
- 可持久化的运行时线程标识；
- 文本、工具请求、审批、执行结果、失败和完成等结构化事件。

Mastra 负责如何执行，但不拥有遐蝶的人格文件、长期自我和最终表达规则。

## 7. 单轮交互数据流

```text
用户消息
  -> 桌面界面
  -> 应用层 TurnService
  -> XiadieKernel.prepareTurn()
  -> RuntimeRequest（上下文 + 用户消息 + 可用能力）
  -> Mastra AgentRuntime
  -> 必要时执行工具或子 Agent
  -> 结构化 RuntimeResult
  -> 生成符合遐蝶人格的最终回复
  -> XiadieKernel.observeTurn（已验证结果）
  -> 保存对话和已接受的记忆候选
  -> 桌面界面
```

工具执行过程可以通过中性的执行卡片展示，但底层工具轨迹不能伪装成遐蝶说的话。只有获得经过验证的执行结果后，才生成最终解释。

## 8. 持久化和记忆路线

### 0.1 版

- 使用 SQLite 保存会话和线程元数据；
- 保存明确的用户事实和共同项目事实；
- 每条记忆保留准确的来源消息引用；
- 通过最小开发者界面支持查看和删除。

### 后续版本

- 关系状态；
- 自传和稳定的自我状态；
- Dream 的价值判断、强化、再巩固、容量限制和遗忘；
- 只有当真实使用证明本地 Provider 在规模或召回质量上不足时，才实现 `MemOSProvider`。

MemOS 始终只是 `MemoryProvider` 的一种适配器，不能成为 Xiadie Core 本身。

## 9. 失败处理与安全边界

- 如果角色资产验证失败，应用必须停止启动并显示明确诊断，不能静默退化为无关的通用助手。
- 如果记忆召回失败，本轮可以在无召回记忆的情况下继续；降级信息写入诊断系统，不写成角色台词。
- 如果 Mastra 或模型 Provider 在执行前失败，不得产生任何工具成功声明。
- 如果工具需要修改数据或扩大访问范围，运行时必须先发出审批请求。
- 用户取消操作时，取消信号必须从界面经过应用层传递到运行时。
- 不完整的工具输出可以保留为诊断证据，但不能当成已完成成果。
- 密钥应尽可能使用操作系统提供的凭据保护机制，不得写入 Prompt、会话正文或普通日志。
- 工作区工具只能访问用户明确选择的目录。路径验证和权限判断必须由确定性代码负责，不能依赖人格指令。

## 10. 测试策略

### Core 测试

- 角色资产结构和必需章节验证；
- `ContextFrame` 的确定性组装；
- Prompt 快照测试、秘密信息隔离和提示词注入防护；
- Token 预算和上下文优先级；
- 记忆来源引用不丢失；
- 证明 Core 不依赖 Mastra、Electron 或具体存储实现。

### Runtime 测试

- 不使用工具的普通聊天；
- 只读工具执行；
- 子 Agent 委托和结构化返回；
- 取消、Provider 失败、工具失败和审批拒绝；
- 没有对应成功事件时，最终回复不得声称任务成功。

### 产品测试

- 新建、恢复、重命名和删除会话；
- 重启后的数据恢复；
- 遐蝶台词与执行事件在界面上明确分离；
- Provider 配置和无效凭据处理；
- Windows 打包冒烟测试。

### 人格评测

建立一套固定的小型评测集，覆盖日常聊天、意见分歧、不确定性、情绪支持、技术工作、工具失败和长篇解释，并至少在两个受支持模型上运行。

评测重点是身份一致性、语言风格一致性、事实诚实，以及是否会退化成通用助手口吻。

## 11. 概念验证验收标准

满足以下全部条件后，基础概念验证才算通过：

1. 全新安装能够启动并显示最小聊天界面；
2. 角色资产能够编译为通过验证的 ContextFrame；
3. 用户能够完成一轮不使用工具的普通对话；
4. 用户能够请求受限的工作区检查，并看到真实执行证据；
5. 主 Agent 能够把一个受限任务委托给子 Agent；
6. 工具细节与遐蝶最终表达保持分离；
7. 应用重启后能够恢复会话；
8. 取消运行后不再继续执行，也不产生虚假的完成声明；
9. 自动化测试和生产构建全部通过；
10. 两个旧 Xiadie 工作区和 Cyrene 工作区没有发生任何变化。

## 12. 交付顺序

1. 初始化 TypeScript Monorepo 和质量门禁。
2. 将现有人格文字工程化拆分为不可由模型修改的角色资产。
3. 实现 Xiadie Core、`ContextFrame` 和 `PersonaCompiler`。
4. 实现 Mastra Runtime 适配器，以及一个工具和一个子 Agent。
5. 实现应用层 TurnService 和 SQLite 会话持久化。
6. 实现最小桌面聊天界面和执行事件界面。
7. 运行跨模型人格评测并修正 Prompt 或人格边界缺陷。
8. 打包并冒烟测试 Windows 概念验证版本。

只有在以上基础通过验收后，才开始 Dream、关系演化、MemOS、Live2D 和语音功能。
