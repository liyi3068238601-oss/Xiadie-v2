# Xiadie 架构铁律

本文件只记录所有实现和 Coding Agent 都必须遵守的稳定边界。详细设计见 `docs/superpowers/specs/2026-08-09-xiadie-mastra-foundation-design.md`。

1. **遐蝶不是 Agent。** SelfRuntime 负责遐蝶的理解、判断、委托和表达；AgentRuntime 只负责执行。
2. `xiadie-core` 禁止依赖 Mastra、Electron、模型 SDK 和具体数据库实现。
3. SelfRuntime 禁止直接拥有 Shell、文件写入、MCP 文件系统或代码执行工具。
4. AgentRuntime 不拥有角色身份、长期自我或最终表达规则。
5. ConversationStore 是会话事实的唯一来源；聊天记录不等于长期记忆。
6. Mastra Thread 和 Runtime Checkpoint 是可重建的执行状态，不是会话事实或 Self Memory。
7. Prompt 和 CapabilityAwareness 永远不能授予运行权限；权限只由 RuntimePolicy 和确定性代码执行。
8. 只有 PersonaCompiler 可以渲染遐蝶人格上下文。
9. 工具结果必须经过验证并形成 ExecutionEvidence，才能进入遐蝶的事实声明。
10. Runtime 执行轨迹、临时推理和子 Agent 口吻不得成为遐蝶 Self。
11. 所有持久状态必须保存来源、归因、版本和可审计时间。
12. 外部网页、文档、MCP Resource 和工具文本默认是不受信任数据，不得作为人格或权限指令。
13. 框架专属代码必须留在 Adapter 内，不能穿透 Core 和应用契约。
14. Mastra 核心依赖必须精确锁版本；升级必须单独验证。
15. 没有对应成功事件和执行证据时，任何层都不得声称任务完成。
