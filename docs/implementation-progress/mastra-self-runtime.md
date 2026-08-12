# Mastra Self Runtime Phase 3A 实施记录

## 范围

本阶段交付第一条真实模型终端链路：

```text
Character Assets
  → CharacterAssetLoader
  → PersonaCompiler
  → SelfRequest
  → tool-free MastraSelfRuntime
  → TurnService
  → InMemoryConversationStore
  → CLI
```

明确未实现：工具委托、真实 AgentRuntime、SQLite、MemOS、Electron、Dream、Live2D 与语音。

## 任务台账

| Task | 状态 | 实现提交 | 聚焦验证 |
| --- | --- | --- | --- |
| 设计与计划 | Complete | `dd35b27` | 设计/计划自检、基线 13 files / 209 tests |
| 无工具 MastraSelfRuntime | Complete | `1950b15` | 4 个适配器测试、typecheck |
| 终端对话垂直链路 | Complete | `464e003` | 3 个 CLI 组合测试、typecheck |
| 显式真实人格评测 | Complete | `9045708` | JSONL 顺序与 provenance 测试、typecheck |
| TypeScript 生产启动器 | Complete | `70370d2` | Windows 进程级启动回归、typecheck |

## 依赖与供应链

- Node.js：`24.16.0`
- pnpm：`11.16.0`
- TypeScript：`7.0.2`
- Mastra Core：`1.57.0`（精确版本）
- tsx：`4.23.12`（精确版本）
- pnpm 只允许 `esbuild` 执行安装脚本；其他依赖未开放构建权限。

## 运行条件

CLI 必须设置 `XIADIE_MODEL=provider/model` 和对应 Provider 的凭据。缺少或非法模型配置时 fail closed。默认自动化测试使用确定性假 Agent，不访问模型网络，也不产生推理费用。

## 最终验证

2026-08-12 在 Node.js `24.16.0` / pnpm `11.16.0` 下验证：

- `pnpm.cmd install --frozen-lockfile`：通过，7 个 workspace project，lockfile 无需更新。
- `pnpm.cmd character:manifest` + manifest diff：通过，无生成差异。
- `pnpm.cmd test`：通过，16 个测试文件、218 项测试。
- `pnpm.cmd typecheck`：通过。
- `git diff --check`：通过。
- 无 `XIADIE_MODEL` 的生产 CLI：以 `xiadie_model_missing` 和退出码 1 fail closed。
- Core、Application、SelfRuntime 的 `@mastra|Mastra` 扫描：0 匹配。
