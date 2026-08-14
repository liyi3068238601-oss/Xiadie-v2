# Xiadie Desktop MVP 验证记录

## 结论

确定性 Desktop MVP 门禁通过。测试对象为实现提交 `6c375a411df5b6491774adb0ac3107459e0b3a04`，验证日期为 2026-08-14（Asia/Shanghai）。本记录所在提交只增加文档，不改变已测试运行时。

可选 DeepSeek 实网验收未执行：本轮没有获得“发送编译 Persona 与指定测试会话到外部端点”的单独授权，因此状态为 **BLOCKED（未授权）**，不是 PASS。

## 环境

| 项目 | 实际值 |
|---|---|
| Windows | 本地开发环境 |
| Node | `v24.16.0` |
| pnpm | `11.16.0` |
| Electron | `v43.2.0` |
| 分支 | `feat/desktop-mvp` |
| 实现提交 | `6c375a411df5b6491774adb0ac3107459e0b3a04` |

无 TTY 的 Windows 验证进程需设置 `$env:CI='true'`。Electron 二进制恢复使用用户提供的 `all_proxy=http://127.0.0.1:7993` 与 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`；仓库没有保存代理或凭据。

## 确定性门禁

以下命令均在实现提交上独立执行。pnpm 命令前均设置 `$env:CI='true'`。

| 命令 | 退出码 | 结果 |
|---|---:|---|
| `node --version` | 0 | `v24.16.0` |
| `pnpm.cmd --version` | 0 | `11.16.0` |
| `pnpm.cmd install --frozen-lockfile` | 0 | 8 个 workspace；675 个包全部复用；锁文件未变化 |
| `pnpm.cmd character:manifest` | 0 | manifest 生成成功 |
| `git diff --exit-code -- packages/xiadie-core/character/xiadie/v1/manifest.json` | 0 | 无差异 |
| `pnpm.cmd test` | 0 | 29 files；314 tests passed |
| `pnpm.cmd --filter @xiadie/desktop test:renderer` | 0 | 3 files；11 tests passed |
| `pnpm.cmd typecheck` | 0 | TypeScript 7.0.2，无错误 |
| `pnpm.cmd desktop:build` | 0 | Main、preload、renderer 全部构建成功 |
| `pnpm.cmd desktop:smoke` | 0 | 唯一标记 `XIADIE_DESKTOP_SMOKE_READY` |
| `git diff --check` | 0 | 无空白错误 |

`gray-matter` 在构建时产生其既有 `eval` 警告；它不改变退出码。本阶段没有新增运行时 `eval`。

## 端到端验收覆盖

`desktop-acceptance.test.ts` 使用真实 SQLite、真实 `DesktopChatService` 和真实 turn runner factory，覆盖：

1. 第一轮用户/助手消息提交；
2. 第二轮明确读取第一轮已提交 user/assistant 历史；
3. 关闭并重新打开数据库后的会话标题与消息恢复；
4. 启动时把遗留 pending user row 标记为单一 failed row；
5. 不为崩溃 turn 伪造 assistant 消息。

Electron 烟测以精确环境变量 `XIADIE_DESKTOP_SMOKE=1` 启动真实 `BrowserWindow`，不初始化模型调用，在 `ready-to-show` 后输出一次稳定标记并退出。

## 启动缺陷与修复证据

真实开发启动曾复现：Vite 将 `ws` 的可选 `bufferutil` / `utf-8-validate` 处理成主进程致命错误。`electron.vite.config.ts` 现将二者保持为 external，使 `ws` 自己的 guarded optional require 能正确回退。修复后开发 Main bundle 只保留 `require("bufferutil")` / `require("utf-8-validate")`，不再包含 `Could not resolve ... imported by "ws"`，标准 Electron 烟测通过。

## 静态安全与范围门禁

| 扫描 | 结果 |
|---|---|
| Renderer 中的 `node:`、`electron`、Application/Core/Mastra、`DEEPSEEK_API_KEY` | 无匹配 |
| 弱化 BrowserWindow 选项或动态 IPC channel | 无匹配 |
| Live2D、推断情绪/好感度、MCP、tool UI | 只有 `desktop-shell.test.tsx` 的负向断言包含 `Live2D` 字样；生产代码无匹配 |

窗口保持 `nodeIntegration: false`、`contextIsolation: true`、`sandbox: true`；外部导航和新窗口被拒绝。Renderer 只持有 preload 暴露的固定 schema IPC 方法。

## 许可证检查

Desktop 直接依赖的 package metadata 声明为 Apache-2.0、MIT 或 ISC。没有复制官方游戏脚本、图片、音频、模型或其他新 vendored 资产，因此本阶段不需要修改 `THIRD_PARTY_NOTICES.md`。现有第三方知识产权声明继续适用。

## 未执行门禁

DeepSeek 实网两轮对话、关闭重开与响应人工复核：**BLOCKED（缺少本轮明确数据外发授权）**。没有请求、响应、Key 或 Header 被记录。
