# Xiadie Desktop MVP 设计

日期：2026-08-12

状态：已完成设计讨论，待用户复核本文

范围：Windows 桌面聊天应用、会话持久化、模型连接设置，以及桌面端所需的最小会话上下文接线

## 1. 背景

Xiadie 已具备 Character Compiler、Application `TurnService`、无工具的 Mastra `SelfRuntime` 和 CLI 入口，但还没有图形界面。CLI 只验证了单轮运行路径：每轮使用内存仓库，已提交会话正文不会跨进程保存，也不会成为下一轮的会话上下文。

桌面 MVP 的目标不是另造一套通用 AI 客户端，而是为“持续存在的遐蝶 Self”提供第一套可长期使用的本地界面。聊天交互应复用成熟的开源骨架；Xiadie 自己只实现运行时适配、数据所有权、安全边界、人格化侧栏和主题。

## 2. 已选方向

### 技术选型

- Electron + React + TypeScript。
- assistant-ui 作为聊天与多会话交互骨架。
- shadcn/ui 作为设置、菜单、确认框、Tooltip 等外围组件来源。
- Electron 主进程通过 SQLite 保存本地会话。
- 继续使用现有 `TurnService -> SelfRuntime -> Mastra` 路径。
- 第一版只接 DeepSeek 官方 API 兼容协议；模型固定为项目已验证的 `deepseek/deepseek-v4-flash`，不提供任意模型切换。后续模型升级必须独立验证，不能随连接设置静默变化。

### 视觉选型

- 三栏陪伴桌面：左侧会话、中间聊天、右侧遐蝶侧栏。
- 不使用 Live2D。
- 雾白淡紫主题：明亮、低饱和、适合长时间阅读，不做粉色 ChatGPT 皮肤。
- 右栏可手动折叠；窗口较窄时自动隐藏。

### 产品原则

1. 遐蝶不是聊天组件里的角色皮肤；UI 只是持续 Self 的呈现层。
2. assistant-ui 已覆盖的聊天交互不得重复实现。
3. Renderer 不拥有模型密钥、数据库、文件系统或 Mastra 对象。
4. 只展示真实存在、能够说明来源的状态，不生成情绪值、好感度或模型臆测的心理状态。
5. 首版优先形成可靠的日常对话闭环，不提前摆放尚无后端语义的空功能。

## 3. 范围

### 3.1 包含

- Windows 桌面应用。
- 新建、切换、重命名和删除会话；删除前确认。
- SQLite 跨重启保存会话和消息。
- 已提交的近期会话正文参与后续轮次上下文。
- assistant-ui 流式输出、Markdown、代码块、自动滚动、空状态与基础错误呈现。
- 单轮失败提示、复制用户消息和重新发送；重新发送创建新 `turnId`。
- DeepSeek API Key 与 Base URL 的应用内配置。
- 环境变量配置作为回退。
- 设置页显示模型名称、连接来源、连接状态，并提供主动的“测试连接”。
- 左右侧栏开关、新建会话与聚焦输入框快捷键。
- 键盘操作、可见焦点、系统缩放与减少动态效果支持。

### 3.2 暂不包含

- Live2D、语音、图片和附件。
- Agent 工具调用、MCP、文件操作及审批界面。
- 长期记忆写入、关系演化和 Dream。
- 会话搜索、云同步、账号、导入导出。
- 多模型选择。
- 消息编辑、分支、停止后续写和成功回复的重新生成。
- 自动生成的情绪、好感度或心理状态。
- macOS 和 Linux 的发行验收；代码边界不主动阻止未来支持。

## 4. 总体架构

```text
┌──────────────── Electron Renderer ────────────────┐
│ React                                             │
│ assistant-ui UI + Runtime Adapter                 │
│ ThreadListSidebar | Thread | Message | Composer   │
│ XiadieRightSidebar | Settings                     │
└───────────────────────┬───────────────────────────┘
                        │ typed preload API
                        │ allowlisted IPC
┌───────────────────────▼───────────────────────────┐
│ Electron Main                                     │
│ DesktopChatService                                │
│   ├─ DesktopConversationRepository ── SQLite      │
│   ├─ SqliteVerifiedTurnStore ──────── SQLite      │
│   ├─ ModelConnectionStore ─────────── safeStorage │
│   └─ TurnService                                  │
│        └─ MastraSelfRuntime ───────── DeepSeek    │
└───────────────────────────────────────────────────┘
```

### 4.1 进程职责

Renderer 只负责渲染、短暂的输入状态和 assistant-ui 所需的视图状态。它通过 preload 提供的窄接口请求数据和订阅事件，不直接导入 Node、Electron、SQLite、Mastra、Core 或 Application 的实现。

Preload 只把固定的方法和经过校验的数据类型桥接给 Renderer。它不提供通用 `invoke(channel, payload)`、事件名字符串入口或任意路径读取。

Main 负责所有可信操作：数据库、迁移、配置解密、模型连接、人格资产加载、`TurnService` 生命周期、事件路由和错误映射。

### 4.2 现有包的边界

- `xiadie-core` 继续定义人格、SelfRequest、Turn 和可验证记录。
- `application` 继续编排一次 Turn，并保有事实提交语义。
- `mastra-self-runtime` 继续是模型适配层，不接触 Electron 或 SQLite。
- Desktop 组合上述能力，但不得把 Electron 依赖下沉到 Core/Application/SelfRuntime。

## 5. assistant-ui 复用合同

正式界面以 assistant-ui 官方 registry 组件和 primitives 为基础，而不是参照外观后自行重写：

- `ThreadListSidebar` / `ThreadListPrimitive`：新建、选择、重命名和删除会话。
- `ThreadPrimitive`：消息 viewport、空状态、流式期间自动滚动和 turn anchor。
- `MessagePrimitive`：用户消息、遐蝶消息、Markdown/代码内容和错误呈现。
- `ComposerPrimitive`：输入、发送、禁用与运行中状态。
- `AssistantRuntimeProvider`：为上述组件提供 runtime context。
- `RemoteThreadListAdapter`：把 assistant-ui 的 thread 操作映射到本地 SQLite。
- Custom/Local Runtime adapter：把 assistant-ui 的 run 映射到类型化 IPC 流。

官方 registry 组件复制进仓库后，只做 Xiadie 主题、中文文案、功能裁剪和必要的薄包装。若 assistant-ui 已有正确的交互语义，不复制其状态机、键盘逻辑或滚动实现。

本项目不使用 Assistant Cloud；thread metadata 与 history 都由本地仓库持有。

## 6. 布局与视觉

### 6.1 左栏

- 应用标识和静态头像。
- 新建会话。
- 最近会话列表。
- 当前会话高亮、重命名和删除菜单。
- 设置入口。

左栏使用 assistant-ui 的完整 thread-list/sidebar 骨架。标题首版不调用模型生成：新会话以第一条用户消息的确定性截断作为标题，用户可重命名。

### 6.2 中栏

- 顶部显示当前会话标题和少量元数据。
- 中部由 `Thread` 渲染消息和流式状态。
- 底部由 `Composer` 提供输入与发送。
- 缺少有效模型配置时仍能浏览历史，但 Composer 禁用并给出设置入口。

### 6.3 右栏

右栏是“遐蝶侧栏”，而不是角色展示台。首版内容必须能追溯到真实数据：

- 头像、姓名和静态陪伴文案来自已版本化 Character 资产或 UI 常量。
- “此刻在意的事”显示当前会话标题，明确表示当前交互焦点，不冒充内部情绪。
- “未完的话题”只显示当前会话中真实的 `failed` / 中断消息；没有时显示自然空状态。
- “共同的事”读取 Core 已有的 `relationship.sharedProjects`；没有时不显示占位标签。

右栏不得根据模型自由文本推断状态。未来 SelfState、Relationship 或 Memory 有正式写入链路后，再通过版本化 ViewModel 扩展。

### 6.4 响应式与主题

- 宽窗口显示三栏。
- 中等宽度默认折叠右栏。
- 更窄时左栏改为抽屉，聊天区保持主视图。
- 主题只实现雾白淡紫一套，保留 token 结构但不同时维护深色主题。
- 正文与交互控件满足清晰对比度；装饰色不承担唯一状态信息。
- 动画只用于淡入和折叠过渡；尊重 `prefers-reduced-motion`。

## 7. 本地持久化

### 7.1 两类数据不得混用

现有 `ConversationStore` 保存的是已验证 Turn 的审计事实，不包含用户正文和最终回复正文。Desktop 不改变这一含义。

新增两种 SQLite 适配器：

1. `SqliteVerifiedTurnStore` 实现现有 `ConversationStore`，持久化审计记录及幂等指纹。
2. `DesktopConversationRepository` 保存用于恢复和展示的会话、消息及本地状态。

两者可以共享同一数据库文件和迁移系统，但使用不同表与接口。删除 UI 会话和正文时，审计记录可保留，因为其中不含对话正文。

### 7.2 最小数据模型

```text
conversations
  id, title, created_at, updated_at, deleted_at

messages
  id, conversation_id, turn_id, role, content,
  status, created_at, committed_at, error_code

verified_turns
  turn_id, conversation_id, canonical_payload,
  input_fingerprint, committed_at, commit_version

schema_migrations
  version, applied_at
```

`messages.status` 至少包含：

- `pending`：用户消息已落盘，模型轮次尚未提交。
- `committed`：用户消息和对应最终回复均已完成展示提交。
- `failed`：运行失败或应用重启时发现遗留 `pending`。

流式增量不逐 token 写入数据库；Renderer 将其作为临时消息显示。最终回复只有在 `TurnService` 返回已提交记录后才写入正式 assistant message。

### 7.3 发送与恢复顺序

```text
保存 pending 用户消息
        ↓
运行 TurnService（流式增量只发给当前订阅者）
        ↓
Verified Turn 已提交
        ↓
SQLite 事务：写最终回复 + 用户消息改 committed
        ↓
发布 committed 事件
```

如果运行失败，用户消息改为 `failed`。如果应用在 Verified Turn 提交后、展示事务完成前退出，下次启动仍把遗留 `pending` 标为 `failed`；不伪造丢失的最终正文，也不把流式草稿提升为正式回复。重新发送会生成新 `turnId`。

数据库损坏、迁移失败或写入失败时 fail closed：停止写入并显示稳定错误，不自动删除、覆盖或重建用户数据。

### 7.4 SQLite 封装

SQLite 只在 Electron Main 中打开。首版优先使用实际固定 Electron 版本所内置的 `node:sqlite`，避免额外原生模块和 Electron ABI 重编译。数据库 API 被仓库接口封装；实现不得泄漏到 Renderer 或 Core，便于未来在运行时兼容性变化时替换。

数据库文件放在 Electron `app.getPath("userData")` 下，不进入仓库目录。启用外键、事务和合理的 busy timeout；不允许加载 SQLite 扩展。

## 8. 多轮会话上下文

仅保存历史但不把历史交给模型，会让界面看似连续而实际每轮失忆。因此 Desktop MVP 同时增加一种明确的会话上下文数据类型。

### 8.1 Core 契约

`SelfRequest` 增加只读的 `conversationHistory`，元素至少包含稳定 message id、`user | assistant` 角色和正文。该字段只接收同一会话中已经 `committed` 的正文，不接收：

- 当前用户消息；
- `pending` / `failed` 消息；
- 流式草稿；
- 其他会话内容；
- 系统指令、工具结果或 Renderer 自造状态。

### 8.2 信任与渲染

历史记录属于 Turn Data，不是 Persona Instructions 或 Runtime Protocol。用户历史仍是用户提供内容；历史助手回复只证明系统过去输出过该文本，不自动证明其中陈述为事实。

Mastra adapter 在现有单一 user-role 消息内部增加“最近对话”数据区，保留以下不变量：

- 模型输入仍恰好只有一条 user-role message。
- 当前用户输入仍恰好出现一次，并位于最后的当前消息区。
- 历史区中的保留 marker 必须转义，不能伪造 adapter 结构。
- 历史不会进入任何 trusted instructions 数组。

### 8.3 预算

历史按最近优先、完整消息成对优先的确定性策略裁剪，使用独立字符预算；不截断成可能改变含义的半条消息。第一版不做摘要，不调用模型压缩历史。最终预算常量在实施计划中固定，并由边界测试锁定。

## 9. 模型连接设置

### 9.1 可配置项

设置页允许输入：

- API Key：密码框。
- Base URL：默认 `https://api.deepseek.com`。

模型名称首版固定为 `deepseek/deepseek-v4-flash`，只读展示，不开放任意输入。

### 9.2 配置优先级

```text
API Key:  应用内安全保存值 > DEEPSEEK_API_KEY
Base URL: 应用内保存值 > DEEPSEEK_BASE_URL > https://api.deepseek.com
```

清除应用内配置后立即回退到环境变量；环境变量正文不得显示在 UI 中。

### 9.3 Key 存储

- Key 由 Electron Main 使用 `safeStorage` 异步加密后写入应用配置文件。
- Key 不写入 SQLite、日志、错误、遥测或 Renderer 状态。
- UI 只接收 `configured`、`source` 和最近一次测试结果，不能读取密钥正文。
- 如果安全加密不可用，则拒绝在应用内持久化 Key，并引导用户使用环境变量。
- 提供替换和清除，不提供显示、复制或导出 Key。

### 9.4 Base URL 校验

- 必须是绝对 URL。
- 允许 HTTPS。
- HTTP 只允许字面量 `localhost`、`127.0.0.1` 和 `[::1]`。
- 禁止 URL 中包含用户名、密码、查询参数或 fragment。
- 规范化尾部斜杠后存储和显示。
- 非 DeepSeek 官方 host 必须显示明确确认：API Key、当前用户消息、近期已提交会话上下文和编译后 Persona 将发送给该服务。

URL 校验只能防止明显误配，不把自定义服务视为可信。连接设置只是 provider awareness，不授予任何 Agent 工具能力。

### 9.5 测试连接

只有用户点击“测试连接”才发出请求。测试通过与正式聊天相同的 provider 构造路径，使用固定无敏感内容的最小探测消息，不携带 Character、历史或用户正文；设置超时，不保存响应正文。401、余额不足、限流、服务不可用和 URL 错误分别映射成稳定且不泄密的 UI 状态。

`createMastraTextAgent` 的模型构造边界需要从只接受字符串扩展为可注入的 provider/model 对象或工厂，使 API Key 和 Base URL 仅在 Main/adapter 初始化时存在，不回写全局环境变量。

## 10. IPC 与安全

BrowserWindow 固定使用：

```text
contextIsolation: true
sandbox: true
nodeIntegration: false
```

生产构建使用严格 CSP，禁止任意远程脚本和 `eval`。应用不加载远程页面。

Preload 只暴露版本化、类型化方法，至少覆盖：

```text
listConversations
createConversation
renameConversation
deleteConversation
loadMessages
sendMessage
retryMessage
getConnectionStatus
saveConnectionSettings
clearSavedApiKey
resetBaseUrl
testConnection
subscribeToTurnEvents
```

所有命令 payload 在 Main 边界做严格 schema 校验。流式事件必须携带 conversation id、turn id 和单调 sequence；Renderer 只把事件交给匹配的活动运行，防止切换会话后串流。订阅返回显式 unsubscribe，窗口销毁时清理。

IPC 不返回本地路径、原始 SQL 错误、provider 请求体、内部 prompt、API Key 或通用 Error stack。

## 11. 错误与恢复

- 启动时检查数据库 schema、Character 资产和连接状态。
- 缺 Key 时允许浏览历史，Composer 禁用并提示进入设置。
- 流式失败时可以显示临时草稿，但必须明确标为未完成，且不作为正式 assistant message 保存。
- 失败消息提供复制和重新发送。
- 进程启动时把遗留 `pending` 恢复为 `failed`。
- 同一 conversation 同时只允许一个运行；其他会话是否并行留待后续，不在首版开放。
- 删除会话前确认；删除展示正文，不把审计元数据误当作可恢复的聊天记录。
- 设置变更不影响已经开始的运行，新配置从下一轮起生效。
- Renderer 崩溃或刷新后通过 SQLite 重新获取正式历史；未提交的流式文本不会冒充已恢复内容。

## 12. 测试策略

### 12.1 确定性单元与集成测试

- SQLite：schema 迁移、约束、事务、幂等、重启恢复、pending 恢复和删除语义。
- Verified Turn store：canonical payload、冲突检测和跨重启 `has(turnId)`。
- 会话历史：仅 committed、同 conversation、固定顺序、预算边界、marker 注入和单一 user-role message 不变量。
- 模型设置：优先级、safeStorage 可用/不可用、Key 不回显、URL 校验、非官方 host 确认和稳定错误映射。
- IPC：channel allowlist、payload schema、事件身份/顺序、跨会话隔离和 unsubscribe。
- assistant-ui adapter：thread list 映射、history hydrate、流式 delta、完成、失败和 retry。
- React：三栏响应式、侧栏折叠、会话操作、缺 Key、空状态、键盘焦点与减少动态效果。
- 安全静态门禁：Renderer 不导入 Node/Electron/SQLite/Mastra；BrowserWindow 安全选项和 CSP 固定。

### 12.2 Electron 验收

- 使用固定 Electron 版本在 Windows 真实启动。
- 创建会话并完成至少两轮有上下文依赖的对话。
- 关闭应用并重启，标题和已提交消息完整恢复。
- 发送期间模拟退出，重启后 pending 显示为 failed，不出现伪造助手回复。
- 应用内 Key 和自定义 Base URL 能保存、替换、清除并按优先级回退。
- Renderer 无法读取 Key、环境变量、数据库路径或 Node API。

### 12.3 回归门禁

- 现有 Core、Application、SelfRuntime、Mastra runtime 与 CLI 测试全部继续通过。
- Character manifest 幂等，Character 资产无非预期变化。
- typecheck、测试、构建、`git diff --check` 全部通过。
- 不用真实模型测试代替确定性测试；真实 DeepSeek 冒烟测试仅在明确授权与凭据可用时执行，并如实记录。

## 13. 完成标准

Desktop MVP 只有同时满足以下条件才算完成：

1. Windows 上可从仓库启动 Electron 应用。
2. 正式界面确实复用 assistant-ui 的 ThreadList、Thread、Message、Composer 与 runtime primitives。
3. 可以新建、切换、重命名、删除会话并完成流式对话。
4. 至少两轮对话能正确使用同一会话中已提交的近期上下文。
5. 关闭并重启后，已提交历史完整恢复，遗留 pending 被安全标记为 failed。
6. API Key 与 Base URL 可在应用内配置；Key 安全落盘且永不回显；环境变量回退有效。
7. 右栏只呈现可追溯状态，没有 Live2D、好感度或推测心理状态。
8. Renderer 保持 sandbox、context isolation 和无 Node 集成。
9. 所有新增测试、现有全量测试、typecheck、构建与差异检查通过。

## 14. 后续方向

以下内容必须在独立设计后才能加入：

- 长期 Memory 与 Relationship 状态写入。
- AgentRuntime、工具进度和审批 UI。
- 消息分支、重新生成与取消协议。
- 搜索、导入导出、云同步。
- 多 provider / 多模型配置。
- 语音或其他角色表现形式。
