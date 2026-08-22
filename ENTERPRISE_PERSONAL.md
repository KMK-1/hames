# Hames Enterprise Personal Profile

This branch is a hardened starting point for using Hames as a personal AI orchestration workspace inside an enterprise environment.

## Goal
Keep Hames orchestration, roles, workspace isolation, contracts, review, and audit while avoiding a second unapproved AI/network path.

## Security defaults
- WebSearch/WebFetch denied by default.
- curl, wget and PowerShell web requests denied.
- automatic pip/npm/npx/winget installation denied.
- git push, Git remote modification, GitHub CLI and deployment commands denied.
- common credential/secret reads blocked by `.claude/hooks/enterprise_guard.js`.
- existing workspace, context, task-contract, compliance, evidence and session logging hooks retained.

## Direct external integrations
The upstream repository contains optional third-party helper tools. They are not granted execution permission in this profile and should not be configured with company data or credentials unless specifically approved. Physical removal can be performed after compatibility testing if company policy requires it.

## Important limitation
This profile is defense-in-depth, not a substitute for company network, endpoint, identity, repository, data-classification or AI-gateway controls. Confirm the Claude/Codex route independently with company IT/security.

## Recommended deployment
1. Pin a reviewed commit.
2. Do not blindly sync upstream changes.
3. Complete company OSS/license/security review.
4. Use only company-approved Claude/Codex distributions and authentication paths.
5. Start with a non-sensitive test repository.
6. Require human approval for external communications, deployments, package installs and system changes.
7. Run `node tests/enterprise_guard.test.js` before pilot use.

See `ENTERPRISE_SECURITY_CHECKLIST.md` for the promotion checklist.
