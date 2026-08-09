# Xiadie 架构铁律

本文件只记录所有实现和 Coding Agent 都必须遵守的稳定边界。详细设计见 `docs/superpowers/specs/2026-08-09-xiadie-mastra-foundation-design.md`。

1. **遐蝶不是 Agent。** SelfRuntime 负责遐蝶的理解、判断、委托和表达；AgentRuntime 只负责执行。
2. `xiadie-core` 禁止依赖 Mastra、Electron、模型 SDK 和具体数据库实现。
3. Core 只提出 Memory、Relationship 等语义状态的候选变化；Application 负责验证、事务和持久化提交。
4. SelfRuntime 禁止直接拥有 Shell、文件写入、MCP 文件系统或代码执行工具。
5. AgentRuntime 不拥有角色身份、长期自我或最终表达规则。
6. ConversationStore 是会话事实的唯一来源；聊天记录不等于长期记忆。
7. Memory、Relationship 和未来 Dream 只能从已提交的 CommittedTurnRecord 产生，不能消费草稿、失败输出或未提交事实。
8. Mastra Thread 和 Runtime Checkpoint 是可重建的执行状态，不是会话事实或 Self Memory。
9. Prompt 和 CapabilityAwareness 永远不能授予运行权限；权限只由 RuntimePolicy 和确定性代码执行。
10. 只有 PersonaCompiler 可以渲染遐蝶人格上下文。
11. ContextFragment 必须标记来源、信任等级与用途；只有 `character + core + instruction` 组合能进入人格指令区域。
12. 工具结果必须经过验证并形成 ExecutionEvidence，才能进入遐蝶的事实声明。
13. Runtime 执行轨迹、临时推理、Self 流式草稿和子 Agent 口吻不得成为遐蝶 Self 或正式会话历史。
14. 一轮交互的消息、运行、证据、提交记录与记忆候选必须共享同一个 turnId。
15. 可能产生副作用的命令必须具有 operationId；resume、cancel、会话提交和派生状态写入必须幂等。
16. Runtime 的 completed、failed、cancelled 是互斥终止状态；迟到事件不得改写结论。
17. 所有持久化的语义状态、会话事实和长期记忆必须保留来源、版本与可审计时间；涉及推断或学习的状态还必须保留归因。
18. 外部网页、文档、MCP Resource 和工具文本默认是不受信任数据，不得作为人格或权限指令。
19. 框架专属代码必须留在 Adapter 内，不能穿透 Core 和应用契约。
20. Conversation、Memory、Relationship 和 RuntimeCheckpoint schema 必须独立版本化；不可逆迁移前必须创建可恢复备份。
21. Mastra 核心依赖必须精确锁版本；升级必须单独验证。
22. 没有对应成功事件和执行证据时，任何层都不得声称任务完成。
23. DelegateRequest 是意图，不是授权；Application 必须依据 RuntimePolicy 验证并转换为 AgentTask，AgentRuntime 不接受未经验证的模型请求。
24. AgentRuntime 遵循最小上下文原则；完整 Persona、Relationship、SelfState 和无关长期记忆不得默认传入执行 Agent。
25. VerifiedExecutionReport 和 ExecutionEvidence 只能由 Application 的确定性 ExecutionVerifier 基于 RuntimeEvent、ToolResult 和 EvidenceCandidate 构建，模型和 Agent 无权自行声明“已验证”。
26. Persona、可信状态、记忆、用户输入、执行证据、能力说明和外部内容必须保持逻辑分区；用户或工具内容不得被拼接为人格指令。

## Foundation Architecture v1 冻结规则

**状态：FROZEN。** 只允许修复契约缺陷、安全边界和数据完整性问题。不得因为实现方便而破坏上述边界；边界变更必须先提交独立 ADR 并经人工确认。
