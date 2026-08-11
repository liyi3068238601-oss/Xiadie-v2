# Xiadie Character 1.0.0 Implementation Progress

## Phase baseline

- Design: `5401793` (`docs: design xiadie persona assets`)
- Hardened design: `9e955e1` (`docs: harden persona asset contracts`)
- Construction branch: `feature/persona-assets`

## Task ledger

| Task | Status | Implementation commit | Focused verification | Reviewer outcome | Deviations |
| --- | --- | --- | --- | --- | --- |
| 1. Asset contracts | Complete | `fdf9389` | Character-asset contract tests and typecheck | Covered by final phase review | None recorded |
| 2. Persona compiler | Complete | `e6c8a1d` | Persona compiler grammar, partition, deterministic-hash, and immutability tests | Covered by final phase review | None recorded |
| 3. Verified asset loader | Complete | `8f9a1c9` | Loader path, symlink/root-escape, encoding, normalization, SHA-256, and mutation tests | Covered by final phase review | None recorded |
| 4. Policy and audit integration | Complete | `8ac9031` | Context-budget, protected Persona partition, per-turn audit-hash, and provenance tests | Covered by final phase review | None recorded |
| 5. Character assets and Manifest | Complete with documented concern | `0fb3574` | Manifest generation, exact asset-content audit, focused suite (12 files/199 tests), full suite, and typecheck | Covered by final phase review | The planned idempotence check used `git add -N` for a new Manifest; its diff compared an intent-to-add empty index entry, so final verification used a tracked/staged baseline instead. The then-default pnpm wrapper also emitted a Node `24.14.0` engine warning. |
| 6. Static evaluation and IP boundary | Complete | `22b7c62` | RED/GREEN evaluation-fixture test; focused and full suite (13 files/200 tests), typecheck, and diff checks | Covered by final phase review | None recorded |
| 7. Verification, documentation, and ledger | Complete | `3f5af07` | CI frozen install; Manifest idempotence; 13 files/200 tests; typecheck; diff check; Core scan; legacy comparison | Approved after `b824235` bookkeeping fix | Initial `998b1f6` documentation object was replaced by amend and is not a final traceability pointer. Initial non-TTY frozen install was refused; interrupted recovery made the local dependency tree incomplete. Dependencies were restored, and the final CI frozen install passed. |
| 8. Final review remediation | Complete | `4f87f63` | 13 files/209 tests; typecheck; bounded real-file read; canonical mutation; required Persona; linear parser regressions | Approved; no open technical findings | Closed four Important and two technical Minor findings from the phase review. |

## Review history

Task-level reviews were working-session checks and did not all leave committed
artifacts, so the task rows defer their merge claim to the durable
[phase review record](../reviews/persona-assets.md). That review inspected the
whole construction range, required remediation commit `4f87f63`, and approved
the corrected implementation after re-review.
