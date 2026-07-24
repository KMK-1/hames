'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..', '..');
const PRE = [
    'context_verifier.js', 'workspace_guard.js', 'compliance_auditor.js',
    'task_contract_guard.js', 'verify_frontmatter_block.js'
];
const POST = [
    'verify_edit_surgery.js', 'verify_tasks.js', 'update_arsenal_permissions.js',
    'task_contract_evidence.js', 'session_logger.js'
];
const CODEX_POST = [
    'verify_edit_surgery.js', 'verify_tasks.js', 'update_arsenal_permissions.js',
    'index_post_write_auditor.py', 'task_contract_evidence.js', 'session_logger.js'
];

function read(rel) {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function hookScripts(rel, event) {
    const config = JSON.parse(read(rel));
    return (config.hooks[event] || []).flatMap(block => block.hooks || [])
        .map(hook => hook.command || '')
        .map(command => [...command.matchAll(/([\w-]+\.(?:js|py))(?=["']|$)/g)].at(-1)?.[1])
        .filter(Boolean);
}

function assertManagedOrder(actual, expected) {
    const managed = actual.filter(script => expected.includes(script));
    assert.deepEqual(managed, expected);
}

function copyFixtureFile(root, rel) {
    const source = path.join(ROOT, rel);
    const target = path.join(root, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
}

function makeVerifierFixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hames-verify-'));
    const files = [
        'CLAUDE.md', '.cursor/rules/prompt_engineering.md',
        '.cursor/rules/context_engineering.md', '.cursor/rules/agent_engineering.md',
        '.cursor/rules/harness_engineering.md', '.cursor/rules/enforcement.md',
        'arsenal/CLAUDE.md', 'arsenal/task_contract.js',
        'arsenal/task_contract.schema.json', '.claude/context_signatures.json',
        '.claude/settings.json', '.codex/hooks.json', '.codex/config.toml',
        '.gemini/settings.json', 'arsenal/audit_exclusions.json',
        'arsenal/credentials.example.json', 'arsenal/token.example.json',
        '.devcontainer/devcontainer.json', '.vscode/settings.json', '.gitignore',
        ...[
            'context_verifier.js', 'workspace_guard.js', 'hook_adapter.js',
            'session_capture.js', 'task_contract_guard.js', 'task_contract_evidence.js'
        ].map(name => `.claude/hooks/${name}`),
        ...[
            'compliance_auditor.js', 'verify_tasks.js', 'verify_edit_surgery.js',
            'verify_frontmatter_block.js'
        ].map(name => `arsenal/${name}`)
    ];
    files.forEach(rel => copyFixtureFile(root, rel));
    return root;
}

test('managed hooks appear once and in deterministic order', () => {
    assertManagedOrder(hookScripts('.claude/settings.json', 'PreToolUse'), PRE);
    assertManagedOrder(hookScripts('.claude/settings.json', 'PostToolUse'), POST);
    assertManagedOrder(hookScripts('.codex/hooks.json', 'PreToolUse'), PRE);
    assertManagedOrder(hookScripts('.codex/hooks.json', 'PostToolUse'), CODEX_POST);
    assertManagedOrder(hookScripts('.gemini/settings.json', 'BeforeTool'), PRE);
    assertManagedOrder(hookScripts('.gemini/settings.json', 'AfterTool'), POST);

    const tomlScripts = [...read('.codex/config.toml').matchAll(/([\w-]+\.(?:js|py))(?=["'])/g)]
        .map(match => match[1]);
    assertManagedOrder(tomlScripts, [...PRE, ...CODEX_POST]);
});

test('sync uses a deterministic map and preserves unmanaged Codex config', (t) => {
    const sync = read('arsenal/sync_skills.ps1');
    assert.doesNotMatch(sync, /LastWriteTime|source hint/i);
    for (const script of ['task_contract_guard.js', 'task_contract_evidence.js']) {
        assert.match(sync, new RegExp(script.replace('.', '\\.')));
    }

    const probe = spawnSync('pwsh', ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()']);
    if (probe.error) return t.skip('pwsh is unavailable');

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hames-sync-'));
    fs.mkdirSync(path.join(root, 'arsenal'), { recursive: true });
    fs.mkdirSync(path.join(root, '.codex', 'skills', 'source-command-probe'), { recursive: true });
    copyFixtureFile(root, 'arsenal/sync_skills.ps1');
    copyFixtureFile(root, '.codex/hooks.json');
    copyFixtureFile(root, '.codex/config.toml');
    fs.writeFileSync(path.join(root, '.codex', 'skills', 'source-command-probe', 'SKILL.md'), '# probe\n');

    const configPath = path.join(root, '.codex', 'config.toml');
    fs.appendFileSync(configPath, '\n[agents.preserve_probe]\nconfig_file = "agents/probe.toml"\n');
    const result = spawnSync('pwsh', ['-NoProfile', '-File', path.join(root, 'arsenal', 'sync_skills.ps1')], {
        cwd: root, encoding: 'utf8'
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(fs.readFileSync(configPath, 'utf8'), /\[agents\.preserve_probe\]/);
});

test('source mode permits templates while installed mode requires machine state', () => {
    const fixture = makeVerifierFixture();
    const verifier = path.join(ROOT, 'scripts', 'verify_install.js');
    const env = { ...process.env, HAMES_VERIFY_ROOT: fixture };
    const source = spawnSync(process.execPath, [verifier], { env, encoding: 'utf8' });
    assert.equal(source.status, 0, source.stdout + source.stderr);
    assert.match(source.stdout, /Mode: source/);

    const installed = spawnSync(process.execPath, [verifier, '--mode', 'installed'], {
        env, encoding: 'utf8'
    });
    assert.equal(installed.status, 1, installed.stdout + installed.stderr);
    assert.match(installed.stdout, /missing — run init\.\{ps1\|sh\}/);
});

test('runtime scratch is ignored without ignoring canonical workspace contracts', () => {
    const ignore = read('.gitignore');
    assert.match(ignore, /\.claude\/\.task_contract_state\.json/);
    assert.match(ignore, /\.task-contract-\*\.tmp/);
    assert.doesNotMatch(ignore, /^\*\*\/\.hames\/contracts\/$/m);
});

test('Claude permits the canonical lifecycle CLI without widening hook permissions', () => {
    const settings = JSON.parse(read('.claude/settings.json'));
    assert.ok(settings.permissions.allow.includes('Bash(node *task_contract.js*)'));
});

test('hook adapter fails closed when its target is missing or signal-terminated', () => {
    const adapter = path.join(ROOT, '.claude', 'hooks', 'hook_adapter.js');
    const missing = spawnSync(process.execPath, [adapter], {
        input: '{}', encoding: 'utf8'
    });
    assert.equal(missing.status, 2, missing.stderr);

    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'hames-adapter-'));
    const target = path.join(fixture, 'signal.js');
    fs.writeFileSync(target, "process.kill(process.pid, 'SIGTERM');\n");
    const signaled = spawnSync(process.execPath, [adapter, target], {
        input: '{}', encoding: 'utf8'
    });
    assert.equal(signaled.status, 2, signaled.stderr);
    assert.match(signaled.stderr, /terminated without an exit code/);
});
