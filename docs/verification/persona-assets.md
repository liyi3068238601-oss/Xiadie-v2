# Xiadie Character Assets Verification

## Scope

- Verification date: 2026-08-11
- Commit under test: `22b7c62e90888579f95546c1e38fc32603840714`
  (`test: add persona evaluation and IP boundaries`)
- Construction branch: `feature/persona-assets`
- Documentation commit: recorded in
  [the implementation ledger](../implementation-progress/persona-assets.md).

This record covers the Xiadie Character 1.0.0 asset, Loader, PersonaCompiler,
budgeting, static-evaluation, and IP-notice slice. It does not claim a model
runtime, Lore retrieval, persistence, or UI implementation.

## Environment and audit identifiers

| Item | Observed value |
| --- | --- |
| Node.js | `v24.16.0` |
| pnpm | `11.16.0` |
| Test runner | Vitest `v4.1.10` |
| Character version | `1.0.0` |
| Character asset hash | `4adf45a442d364caab734a8851ac97bd12f533403bd47b460173d5a1dbb5eaf1` |
| Full instruction hash | `6227a0048098f2014267b78821e5a8e1a4b69d1c3ff0cf8d763c9a93d992b33e` |
| Budgeted persona instruction hash | `3b1fb04eb33410e2f17e61a0a7100bdb604e75fd3d516bae94b4ffad385d0796` |

The budgeted hash uses the production canonical SHA-256 serialization with
`voice: 3` and `contextualPersonaSections: ["voice.work"]`: 17 instruction
fragments rather than the unbudgeted Persona's 19 fragments.

## Reproducible Windows PowerShell commands

The initial no-environment frozen install was correctly refused by pnpm in this
non-interactive shell because it would have removed `node_modules`. Set
`CI=true` before the final frozen install so pnpm can perform that normal
dependency-management operation without a TTY.

```powershell
$env:CI = 'true'

node --version
pnpm.cmd --version
pnpm.cmd install --frozen-lockfile
pnpm.cmd character:manifest
git diff --exit-code -- packages/xiadie-core/character/xiadie/v1/manifest.json
pnpm.cmd test
pnpm.cmd typecheck
git diff --check
git grep -ni -e '@mastra' -e 'electron' -e 'model SDK' -e 'database' -e 'node:fs' -- packages/xiadie-core
git -C 'E:\Xiadie\Xiadie1.0' status --short
git -C 'E:\Xiadie\Xiadie-experiment' status --short
git -C 'E:\Cyrene agent\Cyrene-Agent' status --short
```

## Final verification results

| Check | Result |
| --- | --- |
| Node version | exit `0`; `v24.16.0` |
| pnpm version | exit `0`; `11.16.0` |
| CI frozen install | exit `0`; all five workspace projects already up to date in 259 ms |
| Manifest generation | exit `0` |
| Manifest idempotence diff | exit `0`; no diff for `manifest.json` |
| Test suite | exit `0`; 13 test files and 200 tests passed |
| Typecheck | exit `0` |
| Working-tree diff check | exit `0` |
| Core dependency scan | exit `1`; no output (the expected no-match result) |

A prior recovery attempt was interrupted after the original non-TTY install
refusal; its offline mode then reported a missing cached tarball. Dependencies
were subsequently restored with a successful networked
`$env:CI='true'; pnpm.cmd install --frozen-lockfile` (50 packages reused,
0 downloaded, completed in 902 ms). The final matrix above was run only after
that recovery and is the certification evidence.

## Legacy worktree comparison

| Worktree | Before | After | Comparison |
| --- | --- | --- | --- |
| `E:\Xiadie\Xiadie1.0` | empty | empty | unchanged |
| `E:\Xiadie\Xiadie-experiment` | empty | empty | unchanged |
| `E:\Cyrene agent\Cyrene-Agent` | ` M dist/renderer/react/index.html`; `?? dist/renderer/novelai/` | same two entries | unchanged pre-existing dirt |

## Known scope exclusions

Model runtime and real model execution, runtime Lore retrieval, persistence, and
UI remain excluded. Mastra Adapter, SQLite, Electron, Dream, MemOS, Live2D, and
Voice are not implemented by this phase.
