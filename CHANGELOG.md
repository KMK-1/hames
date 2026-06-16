# Changelog

All notable changes to Hames are recorded here. Format follows [Keep a Changelog](https://keepachangelog.com/). Versioning tracks the **distribution package** version, which is independent of the kernel/system version (currently `v5.5`).

> **Cutting a release:** bump the version badge in `README.md` and add an entry here. These two are the single source of version truth — no other file hardcodes the package version.

## [1.1] — 2026-06-16

Synced the generic distribution with downstream rule-engine improvements, and switched the project from a frozen snapshot to an actively maintained reference.

### Added

- **Prompt module:** `DESIGN_APPROVAL_GATE` (design-before-build gate for high-complexity work); behavioral principles `TONE_TO_CEO`, `CODING_DISCIPLINE` (Think Before / Simplicity First / Surgical Changes / Goal-Driven), `CRITICAL_SPARRING` (no yes-man agreement), `PLAIN_LANGUAGE`; Worklog location rule.
- **Context module:** physical `cd` move rule (a "move" instruction actually changes the shell working directory, not just context); skip-if-absent handling for missing `_Master` / `_Index.md`.
- **Agent module:** `SUBAGENT OUTPUT VERIFICATION` (identifier-hallucination guard for delegated fact collection); `DESCRIPTION` convention for agents/skills; Perplexity cost gate.
- **Harness module:** six new model-discipline sections — `[11] SCOPE DISCIPLINE`, `[12] GIT RESET PRE-FLIGHT`, `[13] DEBUGGING TRIPWIRE`, `[14] FACT GROUNDING`, `[15] SECRET HANDLING`, `[16] GIT CWD & SYNC DISCIPLINE`; two-stage oversized-edit guard; harness-integrity-over-tokens priority note.
- **Enforcement module:** `[7]` rule-file editing discipline (additive-only, no compression of loaded rules, signature protection).
- **Public overview:** `HamesSystem_Public.md` §9.4 summarizing the model-discipline rules.
- `CHANGELOG.md` (this file).

### Changed

- Project status: **frozen reference → actively maintained**. README, INSTALL, SETUP_PROMPT, 설명서, and philosophy docs reframed accordingly.
- Package version is now single-sourced (README badge + this changelog); removed hardcoded version strings from setup/install prose.
- `.cursorrules` entry version aligned to `v5.5`; kernel `CLAUDE.md` gained a `TONE_TO_CEO` pointer.

### Notes

- Kernel/system version stays `v5.5` (unchanged). The `v1.x` line tracks the distribution package only.
- All ported rules are generic: downstream private incident logs and identifiers were stripped — build your own incident history on top.

## [1.0] — 2026-05-09

Initial public release.

- Six-module kernel: prompt / context / agent / harness / enforcement + Arsenal tool registry.
- Four defense lines (text instruction → first-response confirmation → PreToolUse hook → wrapper pre-injection).
- Workspace-first routing (`Task → COO → Workspace → Agent → Harness`).
- Two-tier agent architecture (five Level-1 domain agents, each with Level-2 sub-teams).
- AI_COMM model-to-model handoff buffer.
- Hook-enforced safety (overwrite blocking, surgical-edit enforcement, workspace lock, frontmatter validation, dangerous-Bash gating).
- Installer tooling (`init.ps1` / `init.sh` / `verify_install.js`) and dual-language docs (English + 한국어).
