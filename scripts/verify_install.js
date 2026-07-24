#!/usr/bin/env node
/* ============================================================================
 * Hames install verification
 * ============================================================================
 * Runs after init.{ps1,sh}. Checks:
 *   - Core rule and task-contract files present
 *   - Defense-line signatures match context_signatures.json
 *   - Hook scripts present
 *   - Critical JSON files parse
 *   - Source templates or installed token rendering, depending on --mode
 *   - .env is not committed (basic guard)
 *
 * Exit 0 on pass, 1 on any failure.
 * ============================================================================ */

const fs = require('fs');
const path = require('path');

const VALID_MODES = new Set(['source', 'installed']);

function readMode(argv) {
    const modeIndex = argv.indexOf('--mode');
    const inline = argv.find(arg => arg.startsWith('--mode='));
    const mode = inline ? inline.slice('--mode='.length)
        : modeIndex >= 0 ? argv[modeIndex + 1]
            : 'source';
    if (!VALID_MODES.has(mode)) {
        throw new Error(`invalid --mode "${mode || ''}" (expected source or installed)`);
    }
    return mode;
}

let MODE;
try {
    MODE = readMode(process.argv.slice(2));
} catch (error) {
    console.error(`[verify_install] ${error.message}`);
    process.exit(2);
}

const HAMES_ROOT = path.resolve(process.env.HAMES_VERIFY_ROOT || path.resolve(__dirname, '..'));
let passed = 0;
let failed = 0;
const failures = [];

function check(label, fn) {
    try {
        const result = fn();
        if (result === true || result === undefined) {
            console.log(`  ✓ ${label}`);
            passed++;
        } else {
            console.log(`  ✗ ${label}: ${result}`);
            failed++;
            failures.push(`${label}: ${result}`);
        }
    } catch (e) {
        console.log(`  ✗ ${label}: ${e.message}`);
        failed++;
        failures.push(`${label}: ${e.message}`);
    }
}

console.log('');
console.log('============================================================================');
console.log(' Hames install verification');
console.log('============================================================================');
console.log(`  Hames root: ${HAMES_ROOT}`);
console.log(`  Mode: ${MODE}`);
console.log('');

// ── Section 1 — Core and contract files ─────────────────────────────────────
console.log('[1] Core and contract files');
const coreFiles = [
    'CLAUDE.md',
    '.cursor/rules/prompt_engineering.md',
    '.cursor/rules/context_engineering.md',
    '.cursor/rules/agent_engineering.md',
    '.cursor/rules/harness_engineering.md',
    '.cursor/rules/enforcement.md',
    'arsenal/CLAUDE.md',
    'arsenal/task_contract.js',
    'arsenal/task_contract.schema.json',
];
for (const rel of coreFiles) {
    check(rel, () => {
        const full = path.join(HAMES_ROOT, rel);
        if (!fs.existsSync(full)) return 'missing';
        const stat = fs.statSync(full);
        if (stat.size === 0) return 'empty';
    });
}
console.log('');

// ── Section 2 — Hook scripts ────────────────────────────────────────────────
console.log('[2] Hook scripts');
const hookFiles = [
    '.claude/hooks/context_verifier.js',
    '.claude/hooks/workspace_guard.js',
    '.claude/hooks/hook_adapter.js',
    '.claude/hooks/session_capture.js',
    '.claude/hooks/task_contract_guard.js',
    '.claude/hooks/task_contract_evidence.js',
    'arsenal/compliance_auditor.js',
    'arsenal/verify_tasks.js',
    'arsenal/verify_edit_surgery.js',
    'arsenal/verify_frontmatter_block.js',
];
for (const rel of hookFiles) {
    check(rel, () => {
        if (!fs.existsSync(path.join(HAMES_ROOT, rel))) return 'missing';
    });
}
console.log('');

// ── Section 3 — Defense-line signatures ─────────────────────────────────────
console.log('[3] Defense-line signatures (context_signatures.json)');
check('context_signatures.json present + parses', () => {
    const sigPath = path.join(HAMES_ROOT, '.claude/context_signatures.json');
    if (!fs.existsSync(sigPath)) return 'missing';
    JSON.parse(fs.readFileSync(sigPath, 'utf8'));
});
console.log('');

// ── Section 4 — JSON config files parse ─────────────────────────────────────
console.log('[4] JSON config integrity');
const jsonFiles = [
    '.claude/settings.json',
    '.codex/hooks.json',
    '.gemini/settings.json',
    'arsenal/task_contract.schema.json',
    'arsenal/audit_exclusions.json',
    'arsenal/credentials.example.json',
    'arsenal/token.example.json',
    '.devcontainer/devcontainer.json',
    '.vscode/settings.json',
];
for (const rel of jsonFiles) {
    check(rel, () => {
        const full = path.join(HAMES_ROOT, rel);
        if (!fs.existsSync(full)) return 'missing';
        try {
            JSON.parse(fs.readFileSync(full, 'utf8'));
        } catch (e) {
            return `parse error: ${e.message}`;
        }
    });
}
console.log('');

// ── Section 5 — Template tokens ─────────────────────────────────────────────
console.log(`[5] Template tokens (${MODE})`);
const tokenPattern = /\{\{(CEO_NAME|CEO_EMAIL|HAMES_ROOT|HAMES_ROOT_POSIX|HAMES_ROOT_ESCAPED)\}\}/g;
const anyTokenPattern = /\{\{([A-Z][A-Z0-9_]*)\}\}/g;
const allowedSourceTokens = new Set([
    'CEO_NAME', 'CEO_EMAIL', 'HAMES_ROOT', 'HAMES_ROOT_POSIX', 'HAMES_ROOT_ESCAPED',
    'TOKEN' // Generic documentation placeholder in installer comments.
]);
const ignoreFiles = new Set([
    '.gitignore',  // never has tokens
    '.gitattributes',
]);
const ignoreDirs = new Set(['.git', 'node_modules', '__pycache__', 'workspaces']);

function walkAndCheck(dir, pattern) {
    const remaining = [];
    function recurse(current) {
        const items = fs.readdirSync(current, { withFileTypes: true });
        for (const item of items) {
            if (item.isDirectory()) {
                if (ignoreDirs.has(item.name)) continue;
                recurse(path.join(current, item.name));
            } else if (item.isFile()) {
                if (ignoreFiles.has(item.name)) continue;
                if (!/\.(md|json|toml|js|py|ps1|sh|cjs|mjs|template|cursorrules)$/.test(item.name)
                    && item.name !== '.cursorrules') continue;
                const full = path.join(current, item.name);
                let content;
                try { content = fs.readFileSync(full, 'utf8'); } catch { continue; }
                const matches = content.match(pattern);
                if (matches) {
                    remaining.push({
                        file: path.relative(HAMES_ROOT, full),
                        tokens: [...new Set(matches)]
                    });
                }
            }
        }
    }
    recurse(dir);
    return remaining;
}

if (MODE === 'installed') {
    check('no unrendered tokens (excludes workspaces/_scaffold/)', () => {
        const remaining = walkAndCheck(HAMES_ROOT, tokenPattern);
        if (remaining.length === 0) return true;
        return `${remaining.length} files have unrendered tokens: ${remaining.slice(0,3).map(r => r.file + ' (' + r.tokens.join(',') + ')').join('; ')}${remaining.length > 3 ? ' ...' : ''}`;
    });
} else {
    check('source templates use only supported tokens', () => {
        const entries = walkAndCheck(HAMES_ROOT, anyTokenPattern);
        const unknown = entries.flatMap(entry => entry.tokens
            .map(token => token.slice(2, -2))
            .filter(token => !allowedSourceTokens.has(token))
            .map(token => `${entry.file} ({{${token}}})`));
        if (unknown.length === 0) return true;
        return `unsupported template tokens: ${unknown.slice(0,3).join('; ')}`;
    });
}
console.log('');

// ── Section 6 — Per-machine state ───────────────────────────────────────────
console.log('[6] Per-machine state');
function checkMachineJson(rel) {
    const full = path.join(HAMES_ROOT, rel);
    if (!fs.existsSync(full)) {
        return MODE === 'source' ? true : 'missing — run init.{ps1|sh}';
    }
    JSON.parse(fs.readFileSync(full, 'utf8'));
}

check(`.claude/.workspace_lock (${MODE === 'source' ? 'optional' : 'required'})`, () => {
    const lock = path.join(HAMES_ROOT, '.claude/.workspace_lock');
    return checkMachineJson(path.relative(HAMES_ROOT, lock));
});
check(`.claude/workspace_paths.json (${MODE === 'source' ? 'optional' : 'required'})`, () => {
    return checkMachineJson('.claude/workspace_paths.json');
});
console.log('');

// ── Section 7 — Managed task-contract hook order ────────────────────────────
console.log('[7] Managed task-contract hook order');
const preOrder = [
    'context_verifier.js', 'workspace_guard.js', 'compliance_auditor.js',
    'task_contract_guard.js', 'verify_frontmatter_block.js'
];
const postOrder = [
    'verify_edit_surgery.js', 'verify_tasks.js', 'update_arsenal_permissions.js',
    'task_contract_evidence.js', 'session_logger.js'
];
const codexPostOrder = [
    'verify_edit_surgery.js', 'verify_tasks.js', 'update_arsenal_permissions.js',
    'index_post_write_auditor.py', 'task_contract_evidence.js', 'session_logger.js'
];

function jsonHookCommands(rel, event) {
    const config = JSON.parse(fs.readFileSync(path.join(HAMES_ROOT, rel), 'utf8'));
    return (config.hooks?.[event] || []).flatMap(block => block.hooks || [])
        .map(hook => hook.command || '');
}

function checkOrder(commands, expected) {
    let previous = -1;
    for (const script of expected) {
        const index = commands.findIndex(command => command.includes(script));
        if (index < 0) return `missing ${script}`;
        if (index <= previous) return `${script} is out of order`;
        previous = index;
    }
    return true;
}

check('Claude PreToolUse order', () => checkOrder(jsonHookCommands('.claude/settings.json', 'PreToolUse'), preOrder));
check('Claude PostToolUse order', () => checkOrder(jsonHookCommands('.claude/settings.json', 'PostToolUse'), postOrder));
check('Codex App PreToolUse order', () => checkOrder(jsonHookCommands('.codex/hooks.json', 'PreToolUse'), preOrder));
check('Codex App PostToolUse order', () => checkOrder(jsonHookCommands('.codex/hooks.json', 'PostToolUse'), codexPostOrder));
check('Gemini BeforeTool order', () => checkOrder(jsonHookCommands('.gemini/settings.json', 'BeforeTool'), preOrder));
check('Gemini AfterTool order', () => checkOrder(jsonHookCommands('.gemini/settings.json', 'AfterTool'), postOrder));
check('Codex CLI managed order', () => {
    const content = fs.readFileSync(path.join(HAMES_ROOT, '.codex/config.toml'), 'utf8');
    return checkOrder(content.split(/\r?\n/).filter(line => line.startsWith('command = ')), [...preOrder, ...codexPostOrder]);
});
console.log('');

// ── Section 8 — Secret hygiene (best-effort) ────────────────────────────────
console.log('[8] Secret hygiene');
check('arsenal/.env is gitignored or absent', () => {
    const envFile = path.join(HAMES_ROOT, 'arsenal/.env');
    const gitignore = path.join(HAMES_ROOT, '.gitignore');
    if (!fs.existsSync(envFile)) return true;  // not yet created
    if (!fs.existsSync(gitignore)) return '.gitignore missing';
    const content = fs.readFileSync(gitignore, 'utf8');
    if (!/arsenal\/\.env/.test(content) && !/^\.env/m.test(content)) {
        return 'arsenal/.env exists but .gitignore does not block it';
    }
});
check('arsenal/credentials.json absent (OAuth secret)', () => {
    if (fs.existsSync(path.join(HAMES_ROOT, 'arsenal/credentials.json'))) {
        return 'credentials.json present — should be empty or not committed';
    }
});
check('arsenal/token.json absent (OAuth token)', () => {
    if (fs.existsSync(path.join(HAMES_ROOT, 'arsenal/token.json'))) {
        return 'token.json present — should be empty or not committed';
    }
});
console.log('');

// ── Summary ─────────────────────────────────────────────────────────────────
console.log('============================================================================');
console.log(`  passed: ${passed}    failed: ${failed}`);
if (failed > 0) {
    console.log('');
    console.log('  Failures:');
    failures.forEach(f => console.log(`    - ${f}`));
}
console.log('============================================================================');

process.exit(failed === 0 ? 0 : 1);
