# Xiadie 第一阶段施工记录

## 基本信息

- 执行计划：`docs/superpowers/plans/2026-08-09-xiadie-foundation-contracts.md`
- 架构基线：`ARCHITECTURE.md`
- 施工分支：`feature/foundation-contracts`
- 开始日期：2026-08-09
- 执行方式：Subagent-Driven Development；每项任务依次经过实现、自审、任务级规格与质量审查。

## 基线

- 起点提交：`1421564 chore: prepare isolated implementation worktree`
- 工作区状态：干净。
- 测试状态：仓库尚无 `package.json` 与测试入口；测试工作区由任务 1 建立。

## 任务台账

| 任务 | 状态 | 实现提交 | 验证 | 审查 | 备注 |
| --- | --- | --- | --- | --- | --- |
| 1. TypeScript 工作区与质量门禁 | 已完成 | `46232e2` | 1/1 测试通过；typecheck exit 0 | Approved | TypeScript 7 路径映射兼容修正已审查通过 |
| 2. Core ID、上下文与 Turn 契约 | 已完成 | `1e02a3b`, `41ff80b` | 聚焦测试 1/1 通过；typecheck exit 0 | 修复后 Approved | Verified facts 增加 opaque brand |
| 3. SelfRuntime / AgentRuntime 契约与事件 | 已完成 | `c34af6f` | 4/4 测试通过；typecheck exit 0 | Approved | 运行级序列校验归 Task 6/7 |
| 4. DelegateValidator 与上下文防火墙 | 已完成 | `91ab523` | 9/9 测试通过；typecheck exit 0 | Approved | Zod 4.4.3 精确锁定 |
| 5. SelfRequestAssembler 与确定性预算 | 已完成 | `0bf0229`, `5802514` | 13/13 测试通过；typecheck exit 0 | 修复后 Approved | 可变上下文深层隔离，opaque evidence 保持 identity |
| 6. ExecutionVerifier | 已完成 | `01bce4f`, `344e0a0` | 29/29 测试通过；typecheck exit 0 | 安全修复后 Approved | 重复/冲突 operation 与 candidate 全部 fail closed |
| 7. 内存版 TurnService 垂直切片 | 已完成 | `45307eb`, `99454ce`, `4602060`, `a46e125` | 74/74 测试通过；typecheck/diff-check exit 0 | 多轮硬化后 Approved | trusted validator、single-flight、token checkpoint、provenance、bounded LRU |
| 8. 验证证据、README 与最终检查 | 进行中 | 待登记 | 待登记 | 待登记 | 当前施工项 |
| 全分支审查 | 待开始 | — | — | — | — |

## 提交与审查流水

| 日期 | 类型 | 提交/范围 | 结果 |
| --- | --- | --- | --- |
| 2026-08-09 | 隔离准备 | `1421564` | 建立并忽略 `.worktrees/`，创建 `feature/foundation-contracts` 工作树 |
| 2026-08-09 | 任务 1 实现 | `46232e2` | 建立 TypeScript/pnpm/Vitest workspace；完整测试与 typecheck 通过 |
| 2026-08-09 | 任务 1 审查 | `ad11e0f..46232e2` | 规格符合、质量 Approved；无 Critical/Important 问题 |
| 2026-08-09 | 任务 2 实现 | `1e02a3b` | 建立 Core ID、上下文分区、SelfRequest 与 Turn 事实契约 |
| 2026-08-09 | 任务 2 审查修复 | `41ff80b` | 以非导出 unique-symbol 品牌封闭 Verified facts 的普通结构化构造 |
| 2026-08-09 | 任务 2 复审 | `77946ac..41ff80b` | 规格符合、质量 Approved；无遗留问题 |
| 2026-08-09 | 任务 3 实现 | `c34af6f` | 建立 Self/Agent 分离的封闭事件与最小 AgentTask 契约 |
| 2026-08-09 | 任务 3 审查 | `31a7e76..c34af6f` | 校准任务边界后 Approved；序列不变量由 Task 6/7 实现 |
| 2026-08-09 | 任务 4 实现 | `91ab523` | 完成 strict schema、策略白名单与最小 AgentTask 转换 |
| 2026-08-09 | 任务 4 审查 | `ef8f71d..91ab523` | 安全边界 Approved；无 Critical/Important 问题 |
| 2026-08-09 | 任务 5 实现 | `0bf0229` | 完成 SelfRequest 分区组装与确定性预算 |
| 2026-08-09 | 任务 5 审查修复 | `5802514` | 隔离全部可变上下文；测试 fixture 与生产 verified 边界分离 |
| 2026-08-09 | 任务 5 复审 | `37371e2..5802514` | Approved；无 Critical/Important 问题 |
| 2026-08-09 | 任务 6 实现 | `01bce4f` | 完成确定性证据验证、唯一 terminal、顺序与全链路 ID 校验 |
| 2026-08-09 | 任务 6 安全修复 | `344e0a0` | 拒绝 operation/result/candidate 歧义并补齐 public API |
| 2026-08-09 | 任务 6 复审 | `6daa1f5..344e0a0` | Approved；唯一生产 opaque 构造边界保持成立 |
| 2026-08-09 | 任务 7 实现 | `45307eb` | 闭合直接回答与受控委托的内存 TurnService |
| 2026-08-09 | 任务 7 边界硬化 | `99454ce` | 固定真实 validator、消息来源、final ID、checkpoint owner 与 schema canonicalization |
| 2026-08-09 | 任务 7 生命周期硬化 | `4602060` | 引入 bounded LRU、Store 签发 token 与逐出后 replay guards |
| 2026-08-09 | 任务 7 缓存顺序硬化 | `a46e125` | 校验容量并将 fingerprint/cache/store guards 前置到 factory |
| 2026-08-09 | 任务 7 最终复审 | `a66cfb0..a46e125` | Approved；无 Critical/Important 遗留 |

## 遗留事项

- 本机直接执行 `node --version` 为 24.16.0，但 `pnpm.cmd` 报告其宿主 Node 为 24.14.0；当前验证通过，最终验收前继续调查并争取消除该环境警告。
- Task 1 按 TypeScript 7.0.2 兼容性要求移除了已废弃的 `baseUrl`，并将四个 `paths` 目标改为等价相对路径；任务审查确认合理。
- Codex fallback `pnpm.cmd` 未给 arbitrary command 自动注入 workspace `.bin`；聚焦验证暂通过进程级 PATH 前置执行，根 `pnpm test`/`pnpm typecheck` 不受影响。
- Task 4 Minor：`TaskContextBuilder` 的防御性复制测试目前只主动变更 `relevantFacts`，最终全分支审查时决定是否补齐 `artifacts` 与 `constraints` 的对称断言。
