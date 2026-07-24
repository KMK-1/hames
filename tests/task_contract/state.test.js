'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const engine = require('../../arsenal/task_contract.js');

function fixture(t, overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hames-contract-state-'));
  const workspace = path.join(root, 'workspace');
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
  fs.mkdirSync(path.join(workspace, 'src'), { recursive: true });
  fs.mkdirSync(path.join(workspace, 'protected'), { recursive: true });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const input = {
    task_id: overrides.task_id || 'task-001',
    workspace,
    request_provenance: { source: 'test', actor: 'user', reference: 'request-1' },
    approval_provenance: { source: 'test', actor: 'user', reference: 'approval-1' },
    scope: { include: ['src'], exclude: [], protected: ['protected'] },
    outputs: ['src/result.js'],
    invariants: ['Do not deploy'],
    acceptance_criteria: [{ id: 'criterion-1', description: 'Tests pass' }],
    required_evidence: [{ id: 'tests', description: 'Node tests pass', command: 'node --test' }],
    plan: '# Plan\n\nImplement and verify.\n',
    ...overrides,
  };
  return { root, workspace, input, options: { root, workspace, taskId: input.task_id } };
}

test('full lifecycle enforces passing evidence and archives the accepted contract', t => {
  const f = fixture(t);
  const created = engine.createContract(f.input, { root: f.root });
  assert.equal(created.contract.state, 'DRAFT');
  assert.equal(engine.ready(f.options).contract.state, 'READY');
  assert.throws(
    () => engine.activate({ ...f.options, sessionId: 'session-a' }),
    error => error.code === 'ACTIVATION_APPROVAL_REQUIRED',
  );
  assert.equal(engine.activate({ ...f.options, sessionId: 'session-a', approval: 'approval:go-1' }).contract.state, 'ACTIVE');
  const pointer = JSON.parse(fs.readFileSync(path.join(f.root, '.claude', '.task_contract_state.json'), 'utf8'));
  assert.equal(pointer.sessions['session-a'].activation_provenance.reference, 'approval:go-1');
  assert.equal(pointer.sessions['session-a'].activation_provenance.advisory, true);

  assert.throws(() => engine.review({ root: f.root, sessionId: 'session-a' }), /Missing passing evidence: tests/);
  engine.recordEvidence({ root: f.root, sessionId: 'session-a' }, {
    evidence_id: 'tests',
    status: 'pass',
    source: 'test',
    metadata: { tool_name: 'Bash', exit_code: 0, success: true, output_sha256: 'abc' },
  });
  assert.equal(engine.review({ root: f.root, sessionId: 'session-a' }).contract.state, 'REVIEW');
  assert.equal(engine.accept({ root: f.root, sessionId: 'session-a', acceptanceProvenance: { actor: 'user', reference: 'accept-1' } }).contract.state, 'ACCEPTED');
  assert.equal(engine.resolveActive({ root: f.root, sessionId: 'session-a' }), null);

  const archived = engine.archive(f.options);
  assert.equal(archived.contract.state, 'ARCHIVED');
  assert.match(archived.dir, /_Archive/);
  assert.equal(engine.validateTask(f.options).contract.state, 'ARCHIVED');
});

test('hash-chain tampering is detected', t => {
  const f = fixture(t, { task_id: 'tamper-test', required_evidence: [] });
  const created = engine.createContract(f.input, { root: f.root });
  engine.ready(f.options);
  const eventFile = path.join(created.dir, 'events.jsonl');
  const lines = fs.readFileSync(eventFile, 'utf8').trimEnd().split('\n');
  const first = JSON.parse(lines[0]);
  first.action = 'forged';
  lines[0] = JSON.stringify(first);
  fs.writeFileSync(eventFile, `${lines.join('\n')}\n`, 'utf8');
  assert.throws(() => engine.validateTask(f.options), error => error.code === 'EVIDENCE_TAMPERED');
});

test('amendment increments revision and invalidates activation and prior evidence', t => {
  const f = fixture(t);
  engine.createContract(f.input, { root: f.root });
  engine.ready(f.options);
  engine.activate({ ...f.options, sessionId: 'session-amend', approval: 'approval:amend-test' });
  engine.recordEvidence({ root: f.root, sessionId: 'session-amend' }, {
    evidence_id: 'tests', status: 'pass', metadata: { success: true },
  });

  const amended = engine.draftContract({ ...f.input, invariants: ['Do not deploy', 'Preserve user changes'] }, { root: f.root });
  assert.equal(amended.contract.revision, 2);
  assert.equal(amended.contract.state, 'AMENDMENT_PENDING');
  assert.equal(engine.resolveActive({ root: f.root, sessionId: 'session-amend' }), null);
  assert.equal(JSON.parse(fs.readFileSync(path.join(amended.dir, 'evidence.json'), 'utf8')).count, 0);
  assert.throws(() => engine.accept(f.options), /accept requires REVIEW/);
  assert.equal(engine.ready(f.options).contract.state, 'READY');
});

test('spec hash detects direct contract mutation', t => {
  const f = fixture(t, { task_id: 'spec-tamper', required_evidence: [] });
  const created = engine.createContract(f.input, { root: f.root });
  const contractPath = path.join(created.dir, 'contract.json');
  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  contract.outputs.push('src/undeclared.js');
  fs.writeFileSync(contractPath, `${JSON.stringify(contract, null, 2)}\n`, 'utf8');
  assert.throws(() => engine.validateTask(f.options), /spec_hash mismatch/);
});

test('schema additions and state-only mutation are detected', t => {
  const f = fixture(t, { task_id: 'state-tamper', required_evidence: [] });
  const created = engine.createContract(f.input, { root: f.root });
  const contractPath = path.join(created.dir, 'contract.json');
  let contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  contract.unexpected = true;
  fs.writeFileSync(contractPath, `${JSON.stringify(contract, null, 2)}\n`, 'utf8');
  assert.throws(() => engine.validateTask(f.options), /unknown property/);

  delete contract.unexpected;
  contract.state = 'READY';
  fs.writeFileSync(contractPath, `${JSON.stringify(contract, null, 2)}\n`, 'utf8');
  assert.throws(() => engine.validateTask(f.options), /does not match the lifecycle chain/);
});
