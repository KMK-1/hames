# Security notes for the Enterprise Personal profile

## Threat model
This profile reduces accidental agent actions that can expose data or modify systems: credential reads, common outbound command-line network access, package/program installation, external Git writes, deployment CLIs, and process termination.

## Not guaranteed
This repository cannot guarantee that company-approved Claude/Codex traffic follows a particular proxy or AI gateway. That routing is controlled by the company-provided client, authentication, endpoint configuration, network, and endpoint security stack.

The guard is not a general OS sandbox. A sufficiently broad interpreter permission can execute arbitrary code. This profile therefore removes broad automatic Python/PowerShell permissions from the upstream allowlist, but company endpoint/network controls remain the authoritative boundary.

## Public fork rule
Never commit company names, internal hostnames, proxy addresses, credentials, internal documents, source code, or security-policy details to this public repository.

## Upstream updates
Treat upstream updates as untrusted changes until reviewed. Pay special attention to `.claude/settings.json`, `.claude/hooks/`, `arsenal/`, dependency manifests, install scripts, and any new network integration.

## Pilot status
The repository includes `tests/enterprise_guard.test.js` as a local regression suite. Its presence is not evidence that it has run on your company workstation. Execute it locally and record the result before promotion.

## Current phase
This is a conservative Phase 1 profile. It intentionally prioritizes a small automatic permission surface over convenience. Add permissions only after a concrete workflow requires them and after reviewing the exact command/data path.
