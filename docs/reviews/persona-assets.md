# Xiadie Character 1.0.0 Review Record

## Review scope

- Requirements: `docs/superpowers/specs/2026-08-11-xiadie-persona-assets-design.md`
- Construction plan: `docs/superpowers/plans/2026-08-11-xiadie-persona-assets.md`
- Initial full-branch range: `c84ad95..67f095a`
- Remediation commit: `4f87f63` (`fix: harden persona asset trust boundaries`)
- Review date: 2026-08-11

Earlier task-level reviews were performed as read-only working-session reviews,
but their complete artifacts were not committed. Their `Clean` labels are not
used as the final merge claim. The phase-level review below re-examined the
entire implementation range and is the durable review record.

## Initial phase review

The read-only phase review inspected all 36 changed files against the design
and plan, recomputed the documented hashes, reconstructed the Manifest, and
ran the available test, typecheck, diff, and Core dependency checks.

It found no Critical issues and four Important issues:

1. `CHARACTER_ASSET_ORDER` was TypeScript-readonly but mutable at runtime.
2. the SelfRequest trust boundary accepted Persona snapshots missing required
   identity, values, boundaries, or voice sections;
3. the Loader checked byte limits only after an unbounded `readFile`;
4. PersonaCompiler trimmed leading blank lines with repeated `Array.shift()`,
   giving quadratic behavior.

It also found three Minor issues:

1. Loader and Manifest generator disagreed on double-BOM normalization;
2. Compiler canonical-contract failures used an undocumented error code;
3. reviewer outcomes lacked a persistent evidence pointer.

The initial assessment was **not ready to merge**.

## Remediation and re-review

Commit `4f87f63` closed the four Important findings and the first two Minor
findings with regression tests:

- the canonical tuple is now frozen at runtime;
- every SelfRequest Persona region must contain all Core-required sections;
- the Node Loader uses a FileHandle and reads at most `maxBytes + 1` bytes;
- section trimming uses linear start/end indexes;
- UTF-8 decoding preserves BOMs until the shared normalizer removes exactly
  one;
- Compiler canonical failures use the documented Compiler error set.

The independent read-only re-review verified each finding against
`67f095a..4f87f63`, reported no new Critical, Important, or Minor issues, and
recorded **Ready to merge: Yes**. Its verification observed 13 Vitest files and
209 passing tests, typecheck exit `0`, diff-check exit `0`, no forbidden Core
dependency matches, and a clean worktree.

This file closes the remaining review-evidence Minor by preserving the scope,
findings, remediation commit, re-review outcome, and reproducible evidence
locations in normal Git history.
