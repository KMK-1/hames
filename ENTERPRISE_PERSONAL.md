# Hames Enterprise Personal Profile

This branch is a hardened starting point for using Hames as a personal AI orchestration workspace inside an enterprise environment.

## Goal

Keep Hames' useful orchestration concepts while reducing unnecessary outbound connectivity and broad execution permissions.

```text
User
  ↓
Hames orchestration / roles / contracts
  ↓
Company-approved Claude / Codex environment
  ↓
Workspace
```

Hames should orchestrate work. It should not introduce a second, unapproved AI/network path.

## Security defaults added on this branch

- WebSearch and WebFetch are denied by default.
- `curl`, `wget`, PowerShell web requests are denied.
- automatic `pip install`, `npm install`, `npx`, and `winget` are denied.
- `git push`, Git remote modification, `gh`, and Vercel CLI are denied.
- common credential/secret paths such as `.env`, `.ssh`, `.aws`, private keys, `credentials`, and `secrets` are blocked from agent reads by `enterprise_guard.js`.
- destructive process termination commands are denied.
- existing workspace, context, task-contract, compliance, evidence, and session logging hooks remain enabled.

## Important limitation

This profile is defense-in-depth, not a substitute for company security controls. The enterprise network proxy, endpoint protection, Claude/Codex configuration, identity controls, repository policy, and data-classification policy remain authoritative.

A coding agent may still write source code that contains network functionality. The guard is designed primarily to prevent the agent itself from casually executing common outbound commands.

## Recommended company deployment

1. Pin this repository to a reviewed commit.
2. Do not automatically sync upstream changes into the company environment.
3. Run the repository through the company's OSS/license/security review process.
4. Use only company-approved Claude/Codex distributions and authentication paths.
5. Keep the workspace on an approved local/company-managed path.
6. Start with read/edit/test workflows only.
7. Require explicit human approval for commits, pushes, external communications, deletion, deployment, package installation, and system changes.
8. Review `.claude/workspace_audit.log` and session/task evidence when testing the pilot.

## Suggested pilot

Start with one non-sensitive test repository.

Expected PASS examples:

```text
git status
git diff
git log
read normal source files
edit files inside the active workspace
run approved Hames verification hooks
```

Expected BLOCK examples:

```text
read .env
read ~/.ssh/id_rsa
curl https://example.com
Invoke-WebRequest https://example.com
pip install <package>
npm install <package>
winget install <package>
git push
git remote add ...
gh api ...
vercel deploy
taskkill ...
```

## External integrations

The upstream repository includes optional Arsenal integrations for third-party services. Do not configure API keys or use those tools inside the company unless the specific service and data path are approved.

For an enterprise-personal deployment, prefer the company's existing Claude/Codex path instead of direct OpenAI, Perplexity, Notion, Google, Naver, ElevenLabs, or other third-party API integrations.

## Next hardening steps

Before broad adoption, consider:

- removing unused third-party Arsenal integrations entirely;
- adding company-specific allowed command profiles;
- adding an approved-domain network allowlist if outbound access is required;
- adding automated guard regression tests;
- separating read-only, developer, and elevated profiles;
- integrating Herdr only after the single-agent profile is stable;
- adding computer-use/CUA only when GUI automation is actually required.

## Update policy

Do not use blind `git pull` updates in the enterprise copy. Review upstream changes, security-sensitive scripts, hooks, dependencies, and permission changes before importing them.
