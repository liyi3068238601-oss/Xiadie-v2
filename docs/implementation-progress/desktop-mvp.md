# Xiadie Desktop MVP 施工台账

## 状态

Desktop MVP 的 12 个计划任务已实施完成。实现范围从 `33f18de` 后开始，确定性测试对象为 `6c375a4`；最终验证见 [desktop-mvp.md](../verification/desktop-mvp.md)。

| Task | 结果 | 提交 |
|---:|---|---|
| 1 | 为 SelfRequest 增加不可变、预算化的已提交会话历史 | `21f2e23` |
| 2 | 建立 Electron 43.2.0、React、Vite/Tailwind 与安全窗口骨架 | `7fa0e47` |
| 3 | SQLite schema、迁移、会话/消息仓储与软删除 | `b163907` |
| 4 | 独立持久化 VerifiedTurnRecord 审计事实 | `edf1b5e` |
| 5 | 固定 DeepSeek 模型、设置优先级、safeStorage 与 Base URL 验证 | `1e522f1` |
| 6 | DesktopChatService 多轮编排、失败恢复与单飞控制 | `e9b64e7` |
| 7 | 固定 channel、Zod schema、可信 sender 与冻结 DTO 的 IPC 防火墙 | `0a3b467` |
| 8 | assistant-ui local runtime、消息/会话适配与 Desktop client | `e5eb6cc` |
| 9 | 三栏响应式遐蝶聊天 UI、键盘与 reduced-motion 支持 | `6a9678e` |
| 10 | 应用内 API Key/Base URL 设置、测试/清除与外部主机确认 | `43820fd` |
| 11 | 两轮 SQLite 验收、崩溃恢复、Electron 启动烟测及 `ws` 可选依赖修复 | `6c375a4` |
| 12 | README、验证记录、许可证复核与最终门禁 | 本文档所在提交 |

## 关键实现边界

- Xiadie Core 继续决定人格、上下文和已验证事实；Desktop 不把遐蝶退化成带 Persona 的工具 Agent。
- Self Runtime 无工具。Desktop MVP 未暴露 Agent Runtime、Shell、文件、MCP、附件或子代理。
- Renderer 不导入 Node/Electron/Application/Core/Mastra，不读取环境变量或密钥。
- SQLite 的展示消息与 verified turn 审计事实分表保存；只有已提交 user/assistant 对进入下一轮 history。
- 应用崩溃后的 pending user row 被标记为 failed，不会生成虚假的 assistant 事实。
- 模型固定为 `deepseek/deepseek-v4-flash`；自定义项只有 Key 和 Base URL。

## UI 实施说明

UI 使用 assistant-ui 的 `ThreadPrimitive`、`MessagePrimitive`、`ComposerPrimitive` 与 `ThreadListPrimitive`。官方 `assistant-ui init` 在实施环境中因其当时的 MCP SDK/Zod 依赖组合失败，因此从 assistant-ui 官方组件 registry 获取 Thread/ThreadList 源结构后，按本项目固定能力面裁剪并接入真实 primitives。没有重新实现一套独立聊天状态机。

最终桌面布局为：

- 左栏：会话列表、新建、重命名、软删除；
- 中栏：消息、运行/错误状态、文本 Composer；
- 右栏：静态人格卡和连接状态；
- 窄屏：侧栏与人格卡折叠为按钮/抽屉式入口。

设置弹窗支持 Key、Base URL、连接测试、清除与恢复默认。保存的 Key 不回显；外部自定义主机要求显式确认数据外发。

## 已接受的 MVP 限制

- 没有 Response Guard；既有 live persona 评测中的模型随机性残余风险继续保留。
- 没有真正的长期记忆、Dream、MemOS、关系演化或 Runtime Lore retrieval。
- 没有工具执行、MCP、附件、语音、Live2D、模型切换、消息编辑/分支/重生成。
- 没有安装包签名、自动更新、云同步、自动备份或发布流水线。
- DeepSeek 实网 Desktop 验收需要单独授权数据外发，本次未执行。

## 后续建议

下一阶段优先做可分发安装包与发布流水线，然后再设计长期记忆。长期记忆必须只消费 committed conversation facts，并维持 Self/Agent 分离；不要直接把聊天全文塞进 Persona 或让 Renderer 接触 Core/Provider。
