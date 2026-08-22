# Enterprise Personal Security Checklist

## Repository
- [ ] Pin a reviewed commit SHA.
- [ ] Do not automatically pull upstream changes.
- [ ] Do not commit company secrets, endpoints, credentials, internal source, or internal policy documents to this public fork.

## Agent permissions
- [ ] WebSearch/WebFetch denied unless approved.
- [ ] curl/wget/PowerShell web requests denied.
- [ ] automatic package installation denied.
- [ ] git push/GitHub CLI/deployment commands denied.
- [ ] credential reads blocked.
- [ ] workspace guard and task contract hooks active.

## Company environment
- [ ] Claude/Codex executable and authentication path are company-approved.
- [ ] Corporate proxy/network routing is independently confirmed with IT/security.
- [ ] Endpoint protection remains enabled.
- [ ] Pilot workspace contains no sensitive production data.

## Pilot verification
Clone/check out the `enterprise-personal` branch on a non-sensitive test PC/workspace and run from the repository root:

```bash
node tests/enterprise_guard.test.js
```

Expected result: all guard cases PASS. Then manually verify normal source read/edit plus existing Hames workspace/task-contract hooks.

Record the tested commit SHA and result in your local/company-approved evidence location; do not publish internal environment details to this public fork.

## Promotion criteria
Promote beyond a test workspace only when guard tests pass, normal Hames workflows still work, company requirements are satisfied, and any extra permission has a narrow approved allowlist.
