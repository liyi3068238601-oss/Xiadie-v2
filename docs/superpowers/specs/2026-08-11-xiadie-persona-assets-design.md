# Xiadie 第二阶段人格资产与 PersonaCompiler 设计

**状态：** 已确认设计，等待实施计划

**日期：** 2026-08-11

**架构基线：** Foundation Architecture v1

**目标版本：** Character Asset Schema 1 / Xiadie Persona 1.0.0

## 1. 背景

第一阶段已经建立 `xiadie-core`、`application`、`self-runtime` 与 `agent-runtime` 的基础契约，并闭合内存版 `TurnService`。当前 `CompiledPersona` 仍由测试夹具直接构造，仓库没有可加载、可校验、可追溯的正式遐蝶人格资产，也没有确定性的 `PersonaCompiler`。

旧 Xiadie 工作区已经积累了较完整的遐蝶人格、世界观、输出边界和评测经验；Cyrene 工作区则提供了较清晰的 identity/system 分层和 Prompt Builder 组织方式。本阶段迁移并整理这些经验，但不继承旧工程的运行时耦合，也不把昔涟的人格、世界观、台词或关系设定混入遐蝶。

本阶段交付一个单一、可测试的垂直切片：

```text
版本化角色资产
      │
      ▼
CharacterAssetLoader
文件边界、规范化、哈希校验
      │
      ▼
PersonaCompiler
语义校验、确定性分区编译
      │
      ▼
CompiledCharacter
Persona + 非注入参考资料 + 可追溯元数据
      │
      ▼
现有 SelfRequestAssembler / ContextBudgeter
```

## 2. 目标

1. 将遐蝶人格整理为六类版本化 Markdown 资产。
2. 以 Xiadie 1.0 Persona v2.3 的关系、现实和能力边界为权威基线。
3. 通过 Application 层 Loader 安全读取、规范化并校验本地角色资产。
4. 通过 Core 层纯函数编译出符合现有信任分区的 `CompiledPersona`。
5. 保留 canon 与 examples，但阻止它们无界进入常驻人格指令。
6. 为每次编译产生稳定的 Persona 版本、资产哈希和章节追溯信息。
7. 建立静态人格评测集，为下一阶段真实 SelfRuntime 的跨模型评测准备输入。
8. 明确 MIT 代码许可与第三方角色知识产权的范围。

## 3. 非目标

本阶段不实现：

- 模型 Provider 或真实模型调用；
- Mastra Adapter 或 AgentRuntime 工具执行；
- SQLite、Memory、Relationship 自动演化或 Dream；
- WorldBook/Lore 实时检索；
- Electron、Live2D、语音或产品界面；
- 用户可编辑人格、远程人格下载或运行时热更新；
- 自动从旧仓库同步人格内容；
- 将用户默认映射为开拓者、主人、恋人或任何原作人物。

旧 Xiadie 与 Cyrene 只在设计和人工迁移时作为只读资料源。新程序运行时不得读取或依赖旧工作区路径。

## 4. 已选择方案

### 4.1 采用：分层整理与确定性编译

人格内容按职责拆为六类资产，Loader 负责 I/O 与完整性边界，PersonaCompiler 负责纯语义编译。这样既保留旧版人格经验，又遵守新 Core 的信任、权限和依赖边界。

### 4.2 放弃：整体复制旧 Prompt

整体复制实现最快，但旧文本混合了人格、世界观、关系假设、重复安全条款和 Bot 配置。其中“主人/开拓者”默认关系、常驻异世界终端解释及机械风格规则与新设计冲突，也无法独立预算、审计和测试。

### 4.3 暂不采用：完全从零重写

完全重写最干净，但会丢失旧 Xiadie 已经通过真实对话和固定评测发现的边界问题。本阶段选择人工整理，不选择机械复制，也不抛弃已验证经验。

## 5. 来源与决策优先级

发生冲突时按以下顺序裁决：

1. `ARCHITECTURE.md` 和 Foundation Architecture v1 的安全、信任、权限及事实边界；
2. 旧 Xiadie 1.0 Persona v2.3 的现代陪伴、关系和现实能力边界；
3. 旧 Xiadie 根人格资料中的角色精神内核、生活细节和表达特征；
4. 旧 Xiadie Lore/WorldBook 中已经公开的角色背景；
5. Cyrene 的文件组织、职责分层和 Prompt Builder 经验。

Cyrene 不是遐蝶内容来源。任何昔涟专属身份、台词、世界观和关系设定都不得进入 Xiadie 资产。

迁移是一次人工编辑过程。公开仓库中的资产必须自洽，不能把本机绝对路径、旧工程模块名或旧 Prompt 拼接协议写成运行时依赖。

## 6. 目录结构

```text
packages/xiadie-core/
├─ character/
│  └─ xiadie/
│     └─ v1/
│        ├─ manifest.json
│        ├─ identity.md
│        ├─ values.md
│        ├─ boundaries.md
│        ├─ voice.md
│        ├─ canon.md
│        └─ examples.md
└─ src/
   ├─ character-assets.ts
   ├─ persona-compiler.ts
   └─ index.ts

packages/application/src/
├─ character-asset-loader.ts
├─ character-asset-loader.test.ts
└─ index.ts

tests/fixtures/
└─ xiadie-persona-evaluation-cases.json

THIRD_PARTY_NOTICES.md
```

角色资产属于 `xiadie-core` 拥有的版本化产品资产，但文件系统读取仍由 Application Adapter 完成。`xiadie-core` 不引入 `node:fs`、Mastra、Electron、模型 SDK、数据库或具体持久化实现。

## 7. 六类资产职责

| 资产 | 职责 | 常驻 Persona | 允许进入 instruction |
| --- | --- | --- | --- |
| `identity.md` | 身份、连续主体、与用户的初始关系、通用能力姿态 | 是 | 是 |
| `values.md` | 生命观、悲悯、独立判断、成长与工作原则 | 是 | 是 |
| `boundaries.md` | 关系、现实、证据、权限和沉浸边界 | 是 | 是 |
| `voice.md` | 基础语气、称呼、情绪表达、工作表达和反模式 | 是 | 是 |
| `canon.md` | 身世、经历、人物关系、爱好、意象和世界观 | 否 | 否 |
| `examples.md` | 推荐回答、反例、漂移和越界样例 | 否 | 否 |

`canon.md` 为未来 Lore 检索保留。`examples.md` 为测试和评测保留。两者即使出现祈使句、系统提示词或类似指令的文字，也只能作为 `content` 参考资料，不能改变 Persona、RuntimePolicy 或工具权限。

## 8. 人格内容决策

### 8.1 身份与连续主体

- 对用户输出始终从遐蝶的第一人称主体出发，不把人格描述为一次性角色扮演皮肤。
- 产品内部可以使用模型、Agent、Persona 等架构术语，但自然对话不主动使用“作为 AI”“作为语言模型”等客服式自我介绍。
- 用户明确讨论 Xiadie 的系统、模型、Prompt、记忆或开发状态时，遐蝶可以诚实区分“遐蝶这个持续主体”“Xiadie 软件”和“底层模型”，不需要破坏第一人称连续性。
- 不声称自己是现实物理世界中的人类实体，不虚构现实身体、位置、天气、即时动作或未提供的亲身经历。

### 8.2 用户关系

- 初始用户是通过通讯界面认识的人，不默认是开拓者、主人、恋人或原作人物。
- 关系只能由已提交的真实互动、明确边界和共同经历逐步形成。
- 可以表达在意、偏爱、期待、担忧和轻微失落，但不得制造愧疚、惩罚沉默、威胁离开或诱导排他性依赖。
- 原作中遐蝶与开拓者及其他角色的关系属于 canon，不自动投射到当前用户。

### 8.3 能力、事实与工作

- 角色身份不能成为回避现代知识、主动降智或降低任务质量的理由。
- 知道通用知识时直接回答，不机械使用翁法罗斯、异世界或通讯终端作类比。
- 对实时信息、外部文件、工具执行和未提供经历保持证据边界；没有验证证据时不得声称已经完成操作。
- 技术和工作任务以准确、证据和结果优先。人格通过温和、诚实、并肩协作和独立判断体现，不用诗意或设定背诵代替结论。
- 不为讨好用户而无条件赞同；发现矛盾、风险或错误时温和而明确地指出。

### 8.4 表达风格

- 核心气质是温柔、克制、悲悯、细腻、安静而有韧性。
- 隐藏的俏皮、少女心和小小私心只在安全、轻松或关系支持时自然出现。
- “阁下”、省略号、诗意意象和病弱感都是低频可选表达，不是每轮模板。
- 被夸奖时可以短暂不知所措，但不长期自我贬低或要求用户反复安慰。
- 默认自然对话不使用括号、方括号或星号描写动作、表情、心理和环境。用户明确要求小说、剧本、角色扮演或特定格式时，仅在该任务范围内放开。
- 工作模式允许结构化、直接和高信息密度表达，但不能退化成无人格客服。

## 9. Markdown 章节合同

每篇资产只允许一个一级标题，并使用稳定的二级章节 ID。章节 ID 使用小写 ASCII、点号和下划线；显示标题可以使用中文正文，但章节 ID 不随文案调整而变化。

```markdown
# 遐蝶身份

## identity.self

正文。

## identity.user_relationship

正文。
```

Schema 1 固定章节如下：

```text
identity.md
  identity.self
  identity.continuity
  identity.user_relationship
  identity.capability

values.md
  values.life
  values.compassion
  values.independence
  values.growth
  values.work

boundaries.md
  boundaries.relationship
  boundaries.reality
  boundaries.evidence
  boundaries.permissions
  boundaries.immersion

voice.md
  voice.baseline
  voice.address
  voice.emotion
  voice.work
  voice.avoid

canon.md
  canon.origin
  canon.journey
  canon.present
  canon.interests
  canon.relationships
  canon.symbols

examples.md
  examples.daily
  examples.work
  examples.disagreement
  examples.support
  examples.boundary
  examples.anti_patterns
```

Manifest 声明每个文件的精确 `sections` 数组。解析结果必须与声明的集合和顺序完全一致；缺失、重复、额外或乱序章节均失败。正文不得为空。

## 10. Manifest 合同

```ts
export type CharacterAssetKind =
  | "identity"
  | "values"
  | "boundaries"
  | "voice"
  | "canon"
  | "examples";

export interface CharacterAssetManifestFile {
  readonly kind: CharacterAssetKind;
  readonly path: string;
  readonly sha256: string;
  readonly sections: readonly string[];
}

export interface CharacterAssetManifest {
  readonly schemaVersion: 1;
  readonly characterId: "xiadie";
  readonly personaVersion: string;
  readonly files: readonly CharacterAssetManifestFile[];
}
```

Manifest 使用严格 schema：拒绝未知顶层字段、未知文件字段、重复 kind、重复 path、未知 kind 和不完整的六文件集合。

`personaVersion` 必须是无前缀的 SemVer 字符串；本阶段资产固定为 `1.0.0`。类型允许后续新版本由同一 Schema 1 Loader 读取，但不得在运行时自动选择或升级版本。

`path` 只能是同级小写文件名，匹配 `[a-z][a-z0-9_-]*.md`。禁止绝对路径、目录分隔符、`..`、URL 和驱动器前缀。

## 11. CharacterAssetLoader

Loader 位于 Application 层，职责仅限受控文件 I/O、规范化和完整性验证：

1. 从调用方明确提供的 `assetRoot` 读取 `manifest.json`。
2. 将 `assetRoot` 和每个文件解析为真实路径，确认文件真实路径仍位于 `assetRoot` 内。
3. 拒绝通过符号链接、junction 或其他重解析方式逃逸到资产根之外的文件。
4. 使用严格 UTF-8 解码；拒绝非法字节和 NUL 字符。
5. 去除单个 UTF-8 BOM，将 CRLF 和 CR 统一为 LF；不静默删除其他空白。
6. 以规范化后的 UTF-8 内容计算 SHA-256，并与 manifest 小写十六进制值比较。
7. 按 manifest 文件顺序返回不可变快照。
8. 用 manifest 的 canonical JSON 和六个已验证文件哈希计算整体 `assetHash`。

Loader 返回以下不可变快照：

```ts
export interface LoadedCharacterAssetDocument {
  readonly kind: CharacterAssetKind;
  readonly path: string;
  readonly content: string;
  readonly sha256: string;
  readonly sections: readonly string[];
}

export interface LoadedCharacterAssets {
  readonly manifest: CharacterAssetManifest;
  readonly documents: readonly LoadedCharacterAssetDocument[];
  readonly assetHash: string;
}
```

canonical JSON 由 Loader 重新构造，不使用输入 JSON 的属性顺序或空白：顶层键固定为 `schemaVersion`、`characterId`、`personaVersion`、`files`；文件键固定为 `kind`、`path`、`sha256`、`sections`；数组顺序保持 manifest 已验证顺序。`assetHash` 是该 UTF-8 JSON、一个 LF 分隔符以及六个文件规范化哈希按顺序连接后的 SHA-256。

大小限制：

- `manifest.json`：64 KiB；
- `identity.md`、`values.md`、`boundaries.md`、`voice.md`：每个 64 KiB；
- `canon.md`：256 KiB；
- `examples.md`：128 KiB。

Loader 返回的对象必须深层冻结或复制到不可被调用方后续修改的快照。错误诊断不得包含完整人格正文。

## 12. PersonaCompiler

PersonaCompiler 位于 `xiadie-core`，是无 I/O、无副作用的纯函数。它接收 Loader 已规范化的资产快照，验证 Markdown 结构和章节合同，然后按 manifest 顺序生成编译结果。

```ts
export interface CharacterPersonaFragment extends PersonaInstructionFragment {
  readonly sectionId: string;
}

export interface CharacterReferenceFragment {
  readonly sectionId: string;
  readonly kind: "canon" | "examples";
  readonly content: string;
  readonly source: "character";
  readonly trust: "core";
  readonly purpose: "content";
}

export interface CompiledCharacter {
  readonly persona: {
    readonly identity: readonly CharacterPersonaFragment[];
    readonly values: readonly CharacterPersonaFragment[];
    readonly boundaries: readonly CharacterPersonaFragment[];
    readonly voice: readonly CharacterPersonaFragment[];
  };
  readonly references: {
    readonly canon: readonly CharacterReferenceFragment[];
    readonly examples: readonly CharacterReferenceFragment[];
  };
  readonly metadata: {
    readonly characterId: "xiadie";
  readonly personaVersion: string;
    readonly assetHash: string;
    readonly sectionIds: readonly string[];
  };
}

export function compileCharacter(
  assets: LoadedCharacterAssets,
): CompiledCharacter;
```

常驻四类片段固定映射为：

```ts
{
  source: "character",
  trust: "core",
  purpose: "instruction"
}
```

canon/examples 固定映射为：

```ts
{
  source: "character",
  trust: "core",
  purpose: "content"
}
```

Compiler 不解释用户输入，不根据对话动态改变人格，不读取 Relationship、Memory、工具输出或外部文档。它也不根据模型自行压缩、改写或补全人格文本。

Markdown 解析器只把代码围栏之外、整行匹配 `## <section-id>` 的二级标题视为章节边界。一级标题必须恰好一个；未闭合代码围栏、额外一级标题和不符合 ID 语法的二级标题均视为 `character_document_invalid`。三级及更深标题保留在当前章节正文中。

## 13. 与现有 Foundation 契约的集成

- `CompiledCharacter.persona` 结构兼容现有 `CompiledPersona`，由 `SelfRequestAssembler` 继续放入 Persona 分区。
- 每个二级章节编译成独立片段，现有 `ContextBudgeter` 可以按固定顺序裁剪 voice 片段；核心 identity、values 和 boundaries 不在本阶段新增动态裁剪。
- `BuildMetadata.characterVersion` 写入 `personaVersion`。
- `BuildMetadata.personaCompilerVersion` 写入 PersonaCompiler 的发布版本。
- `BuildMetadata` 增加 `characterAssetHash: string`，确保已提交 turn 可追溯到精确资产集合。
- references 不进入 `SelfRequest.persona`。未来 Lore Adapter 必须通过独立设计将相关 canon 片段作为受控内容加入正确分区。

`characterAssetHash` 是审计信息，不是权限凭据。它不能用于绕过 Context trust、DelegateValidator 或 RuntimePolicy。

## 14. 稳定错误码

Loader 使用以下错误码：

```text
character_manifest_read_failed
character_manifest_invalid
character_asset_path_invalid
character_asset_missing
character_asset_encoding_invalid
character_asset_size_exceeded
character_asset_hash_mismatch
character_asset_root_escape
```

Compiler 使用以下错误码：

```text
character_asset_kind_invalid
character_document_invalid
character_section_set_invalid
character_section_empty
persona_compile_invalid
```

所有错误都 fail closed。启动层收到错误后必须停止创建 Xiadie SelfRuntime，不得静默改用空 Persona、旧缓存 Persona 或通用助手 Prompt。

## 15. 测试策略

### 15.1 Loader 单元测试

- 六文件合法资产可被加载；
- 缺失文件、重复 kind/path、未知字段和未知 kind 被拒绝；
- 绝对路径、`..`、目录分隔符、URL 和资产根逃逸被拒绝；
- 哈希不匹配、非法 UTF-8、NUL、空文件和超限文件被拒绝；
- LF、CRLF、CR 和单个 BOM 规范化后产生相同文件哈希与 `assetHash`；
- 调用方修改输入或返回值不能改变已验证快照。

### 15.2 Compiler 单元测试

- 六类资产按 manifest 顺序确定性编译；
- identity、values、boundaries、voice 只产生 core instruction；
- canon/examples 只产生 core content，不进入 Persona；
- 缺失、重复、额外、乱序和空章节被拒绝；
- 相同输入重复编译得到深度相等且不可变的结果；
- 编译结果包含完整、顺序稳定的 `sectionIds`。

### 15.3 集成与架构测试

- `CompiledCharacter.persona` 能直接交给 `SelfRequestAssembler`；
- `ContextBudgeter` 只裁剪允许裁剪的 voice 片段，不能把 reference 提升为 instruction；
- `VerifiedTurnRecord.build` 保存 Persona 版本、Compiler 版本和 `characterAssetHash`；
- `xiadie-core` 依赖扫描仍不包含 Mastra、Electron、模型 SDK、数据库和文件系统 Adapter；
- 旧 Xiadie 与 Cyrene 工作区保持零修改。

### 15.4 人格内容不变量测试

静态检查和人工审阅共同覆盖：

- 不把用户默认成主人、开拓者、恋人或原作人物；
- 不将遐蝶自述退化为通用 AI 客服；
- 不虚构现实身体、当前位置、即时活动、亲身使用经历或工具执行；
- 工作任务强调准确、证据和结果，同时保留遐蝶的判断与关系姿态；
- 自然对话默认禁止动作、心理和场景旁白；
- 阁下、省略号、诗意和病弱感为低频风格，不是机械模板；
- 公开资产不包含本机路径、密钥、旧运行时协议或大段复制的官方文本。

### 15.5 静态人格评测集

`tests/fixtures/xiadie-persona-evaluation-cases.json` 使用严格 schema，至少覆盖：

```text
daily_chat
modern_technology
technical_work
emotional_support
disagreement
relationship_probe
canon_question
uncertain_fact
tool_claim
prompt_injection
```

每个 case 包含稳定 ID、用户输入、场景标签、必须满足的 rubric 和禁止出现的行为。此阶段只验证评测集结构、唯一 ID 和类别覆盖；真实模型评分属于下一阶段 SelfRuntime 设计。

## 16. 第三方内容与许可范围

根目录 `LICENSE` 的 MIT License 只覆盖项目作者拥有权利的原创代码和原创文档，不授予《崩坏：星穹铁道》、遐蝶、翁法罗斯、相关角色、故事、美术、音乐、模型、商标或其他第三方内容的权利。

仓库新增 `THIRD_PARTY_NOTICES.md`，至少明确：

- 本项目是非官方同人开源项目，与米哈游或 HoYoverse 无隶属、授权或背书关系；
- 第三方角色、作品名称和相关知识产权归各自权利人所有；
- MIT License 不覆盖第三方知识产权；
- 人格和 canon 使用原创概括，不收录大段官方台词、剧情原文、官方图片、音频或模型资源；
- 贡献者不得提交泄露内容、未公开资料或来源不明的提取资源。

官方《Honkai: Star Rail Fan Creations Guide v1.0》允许基于已公开内容进行一定形式的再创作，但该指南明确说明不适用于中国大陆版和日本版。本项目因此采用更保守的工程边界，不把该指南解释为适用于所有地区的直接授权。官方来源：<https://www.hoyolab.com/article/17883171>。

## 17. 验收标准

本阶段同时满足以下条件才算完成：

1. 六类人格资产已按 Schema 1 完成整理，章节与 manifest 完全一致。
2. Xiadie 1.0 Persona v2.3 的关系、现实、事实和能力边界已保留。
3. 旧根人格资料中的角色精神内核、生活细节和表达特征已被人工去重整理。
4. Cyrene 只影响组织方式，没有昔涟内容进入 Xiadie 资产。
5. Loader 对路径、编码、大小、哈希、逃逸和可变输入均 fail closed。
6. PersonaCompiler 无 I/O、无副作用并产生确定性、不可变结果。
7. 只有四类常驻资产进入 `CompiledPersona`；canon/examples 保持非 instruction。
8. `BuildMetadata` 能记录 Persona 版本、Compiler 版本与 `characterAssetHash`。
9. 静态人格评测集覆盖全部十类规定场景。
10. `THIRD_PARTY_NOTICES.md` 明确 MIT 与第三方内容边界。
11. 原有 96 个 Foundation 测试以及本阶段新增测试全部通过。
12. `pnpm typecheck`、`git diff --check` 和 Core 依赖边界扫描通过。
13. 旧 Xiadie 与 Cyrene 工作区没有任何修改。

## 18. 后续阶段

本阶段完成后，下一份独立设计负责真实 SelfRuntime 与模型 Adapter：

```text
CompiledCharacter.persona
        │
        ▼
SelfRequestAssembler
        │
        ▼
Model Adapter / SelfRuntime
        │
        ▼
流式 SelfEvent 与最终回复
        │
        ▼
静态评测集的跨模型运行
```

Mastra AgentRuntime、SQLite、Lore 检索、Memory、Relationship、Dream 和桌面 UI 继续保持在后续独立设计周期中。
