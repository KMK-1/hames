'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const engine = require('../../arsenal/task_contract.js');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const GUARD = path.join(REPO_ROOT, '.claude', 'hooks', 'task_contract_guard.js');
const EVIDENCE = path.join(REPO_ROOT, '.claude', 'hooks', 'task_contract_evidence.js');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hames-contract-hooks-'));
  const workspace = path.join(root, 'workspace');
  const outside = path.join(root, 'outside');
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
  fs.mkdirSync(path.join(workspace, 'src'), { recursive: true });
  fs.mkdirSync(path.join(workspace, 'excluded'), { recursive: true });
  fs.mkdirSync(path.join(workspace, 'protected'), { recursive: true });
  fs.mkdirSync(outside, { recursive: true });
  fs.symlinkSync(outside, path.join(workspace, 'src', 'escape-link'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const input = {
    task_id: 'hook-task',
    workspace,
    request_provenance: { source: 'test', actor: 'user', reference: 'request' },
    approval_provenance: { source: 'test', actor: 'user', reference: 'approval' },
    scope: { include: ['.'], exclude: ['excluded'], protected: ['protected'] },
    outputs: ['src/result.js'],
    invariants: [],
    acceptance_criteria: [],
    required_evidence: [{ id: 'declared-test', description: 'Declared verifier', command: 'node --test tests/task_contract/state.test.js' }],
  };
  const options = { root, workspace, taskId: input.task_id };
  return { root, workspace, outside, input, options };
}

function runHook(script, f, sessionId, payload) {
  return spawnSync(process.execPath, [script], {
    cwd: REPO_ROOT,
    input: typeof payload === 'string' ? payload : JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, HAMES_TASK_CONTRACT_ROOT: f.root, HAMES_SESSION_ID: sessionId },
  });
}

function activate(f, sessionId = 'session-one') {
  engine.createContract(f.input, { root: f.root });
  engine.ready(f.options);
  engine.activate({ ...f.options, sessionId, approval: 'approval:hook-test' });
}

test('legacy pass and session isolation do not govern unrelated sessions', t => {
  const f = fixture(t);
  let result = runHook(GUARD, f, 'legacy-session', {
    tool_name: 'Write', tool_input: { file_path: path.join(f.outside, 'legacy.txt') },
  });
  assert.equal(result.status, 0, result.stderr);

  activate(f, 'session-one');
  result = runHook(GUARD, f, 'session-two', {
    tool_name: 'Write', tool_input: { file_path: path.join(f.outside, 'isolated.txt') },
  });
  assert.equal(result.status, 0, result.stderr);
});

test('write guard allows included paths and blocks traversal, symlink escape, excluded, and protected paths', t => {
  const f = fixture(t);
  activate(f);
  const cases = [
    [path.join(f.workspace, 'src', 'ok.js'), 0],
    [path.join(f.workspace, 'src', '..', '..', 'outside', 'traversal.js'), 2],
    [path.join(f.workspace, 'src', 'escape-link', 'symlink.js'), 2],
    [path.join(f.workspace, 'excluded', 'blocked.js'), 2],
    [path.join(f.workspace, 'protected', 'blocked.js'), 2],
  ];
  for (const [filePath, expected] of cases) {
    const result = runHook(GUARD, f, 'session-one', { tool_name: 'Edit', tool_input: { file_path: filePath } });
    assert.equal(result.status, expected, `${filePath}: ${result.stderr}`);
  }
});

test('Bash permits constrained reads and declared verification, blocks write-capable and unknown commands', t => {
  const f = fixture(t);
  activate(f);
  const cases = [
    ['git status --short', 0],
    ['rg task_contract arsenal', 0],
    ['node --test tests/task_contract/state.test.js', 0],
    ['rm -f src/result.js', 2],
    ['echo unknown', 2],
    ['git status > status.txt', 2],
    ['git diff --output=diff.txt', 2],
    ['git branch new-branch', 2],
    ['git remote add origin https://example.invalid/repo.git', 2],
    ['git tag release-candidate', 2],
    ["sed -n '1,5p' README.md", 2],
  ];
  for (const [command, expected] of cases) {
    const result = runHook(GUARD, f, 'session-one', { tool_name: 'Bash', tool_input: { command } });
    assert.equal(result.status, expected, `${command}: ${result.stderr}`);
  }
});

test('malformed hook payload and malformed pointer fail closed for an active session', t => {
  const f = fixture(t);
  activate(f);
  let result = runHook(GUARD, f, 'session-one', '{not-json');
  assert.equal(result.status, 2);
  assert.match(result.stderr, /malformed hook payload JSON/);

  fs.writeFileSync(path.join(f.root, '.claude', '.task_contract_state.json'), '{broken', 'utf8');
  result = runHook(GUARD, f, 'session-one', {
    tool_name: 'Write', tool_input: { file_path: path.join(f.workspace, 'src', 'ok.js') },
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /fail-closed/);
});

test('evidence hook stores digests and metadata without raw sensitive output or acceptance', t => {
  const f = fixture(t);
  activate(f);
  const secret = 'super-secret-token-value';
  const result = runHook(EVIDENCE, f, 'session-one', {
    tool_name: 'Bash',
    tool_input: { command: 'node --test tests/task_contract/state.test.js' },
    tool_response: { exit_code: 0, output: secret },
  });
  assert.equal(result.status, 0, result.stderr);
  const dir = engine.taskDir(f.workspace, f.input.task_id);
  const events = fs.readFileSync(path.join(dir, 'events.jsonl'), 'utf8');
  assert.equal(events.includes(secret), false);
  assert.match(events, /"evidence_id":"declared-test"/);
  assert.match(events, /"status":"pass"/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'contract.json'), 'utf8')).state, 'ACTIVE');
});
