# Xiadie Mastra Self Runtime 设计

**日期：** 2026-08-12
**状态：** Phase 3A 已确认

## 目标

建立第一条可以与真实模型对话的纵向链路：加载并编译 Xiadie Character 1.0.3，通过无工具的 Mastra SelfRuntime 生成流式回复，由现有 TurnService 提交会话事实，并提供终端入口和可选的真实人格评测。

## 边界

- 遐蝶仍是 Self，不是 Agent；Mastra 只实现 SelfRuntime 端口。
- 本阶段的 Mastra Agent 不注册 tools、MCP、workspace、memory 或 subagents。
- `xiadie-core`、`application` 和 `self-runtime` 不依赖 Mastra；适配器放在独立包 `@xiadie/mastra-self-runtime`。
- Persona 只有 `character + core + instruction` 片段可以成为 system instructions。用户消息、记忆、状态、能力说明和已验证证据继续保持独立数据分区。
- 当前仅支持直接回答。模型不得产生 `DelegateRequest`；工具执行留给后续 AgentRuntime 阶段。
- SQLite、MemOS、Electron、Dream、Live2D 和语音不进入本阶段。

## 运行时设计

`MastraSelfRuntime` 接收一个窄化的 `MastraTextAgent` 端口。生产工厂使用精确锁定的 `@mastra/core@1.57.0` 创建没有工具的 Agent；单元测试使用确定性假实现，不访问网络。

每次 `respond(SelfRequest)`：

1. 验证并按 identity、values、boundaries、voice 的规范顺序渲染 Persona instructions。
2. 把 state、memories、evidence 和 capabilities 渲染为带明确数据标签的只读上下文；其中任何文本都不是指令。
3. 把 `turnInput.content` 作为独立 user message 发送给 Mastra。
4. 依次发出 `self.started`、零或多个 `self.text.delta`、一个 `self.final`。
5. Provider 出错时发出唯一终止事件 `self.failed`，不伪造 final。

事件 ID、run ID、时钟均通过依赖注入生成，确保测试可重复。最终 response 必须等于所有 delta 的拼接，空输出按 `self_runtime_empty_response` 失败。

## CLI

`apps/cli` 在启动时：

- 读取 `XIADIE_MODEL`，格式必须为 `provider/model`；
- 从受控角色目录加载 manifest 和六份资产；
- 编译并预算 Persona；
- 用空的 bootstrap SelfState、Relationship、Memory 和 CapabilityAwareness 组装 SelfRequest；
- 通过 TurnService 运行一轮并把 delta 写到终端；
- 使用现有内存 ConversationStore/CheckpointStore；本阶段退出后不恢复历史。

CLI 支持命令行单条输入，也支持无参数时的交互循环。API Key 由 Mastra 按 provider 从环境读取，程序不得打印凭据。

## 人格评测

现有十类 fixture 继续作为固定输入。新增 `persona:eval:live` 命令，只有用户显式执行时才调用真实模型，并输出包含 case id、model、characterAssetHash、personaInstructionHash、response 的 JSONL 结果。该命令不自动判定人格质量，也不进入默认 `pnpm test`，避免隐藏成本和不稳定 CI。

## 验收

- 适配器契约、指令隔离、流式事件、错误终止均有 RED→GREEN 测试。
- CLI 配置、单轮链路和输出行为有确定性测试。
- 默认全量测试与 typecheck 通过，且不需要任何模型凭据。
- 设置 `XIADIE_MODEL` 和相应 provider key 后，可以显式运行真实对话与人格评测。
