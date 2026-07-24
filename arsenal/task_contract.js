#!/usr/bin/env node
/*
 * Hames workspace-local task contract engine.
 *
 * This is an audit and workflow control layer, not an OS sandbox. Approval
 * provenance is deliberately advisory: it records what the caller asserted,
 * but does not authenticate an approver or replace critical-action approval.
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SCHEMA_VERSION = 1;
const POINTER_VERSION = 1;
const STATES = new Set([
  'DRAFT', 'READY', 'ACTIVE', 'REVIEW', 'ACCEPTED', 'ARCHIVED',
  'AMENDMENT_PENDING', 'BLOCKED', 'FAILED',
]);
const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
const READ_TOOLS = new Set(['Read', 'Glob', 'Grep', 'LS', 'WebFetch', 'WebSearch', 'Task']);
const SAFE_BASH_PROGRAMS = new Set([
  'pwd', 'ls', 'rg', 'grep', 'head', 'tail', 'wc', 'stat', 'file', 'realpath',
  'dirname', 'basename', 'find', 'git', 'cd', 'test', '[',
]);
const SAFE_GIT_SUBCOMMANDS = new Set([
  'status', 'diff', 'log', 'show', 'rev-parse', 'ls-files', 'ls-tree',
  'cat-file', 'describe', 'blame', 'grep', 'merge-base',
]);

class ContractError extends Error {
  constructor(message, code = 'CONTRACT_ERROR') {
    super(message);
    this.name = 'ContractError';
    this.code = code;
  }
}

function now() {
  return new Date().toISOString();
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function atomicWrite(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`,
  );
  try {
    fs.writeFileSync(tempPath, content, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tempPath, filePath);
  } finally {
    try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch { /* best effort */ }
  }
}

function writeJson(filePath, value) {
  atomicWrite(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function readJsonStrict(filePath, label = filePath) {
  let raw;
  try { raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''); }
  catch (error) { throw new ContractError(`Cannot read ${label}: ${error.message}`, 'READ_FAILED'); }
  try { return JSON.parse(raw); }
  catch { throw new ContractError(`Malformed JSON in ${label}.`, 'MALFORMED_JSON'); }
}

function rootPath(options = {}) {
  return path.resolve(options.root || process.env.HAMES_TASK_CONTRACT_ROOT || path.resolve(__dirname, '..'));
}

function pointerPath(options = {}) {
  return path.join(rootPath(options), '.claude', '.task_contract_state.json');
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function resolveSessionId(payload = {}, explicit = '') {
  return firstString(
    explicit,
    process.env.HAMES_SESSION_ID,
    process.env.CODEX_THREAD_ID,
    process.env.CLAUDE_SESSION_ID,
    process.env.GEMINI_SESSION_ID,
    process.env.SESSION_ID,
    payload.hames_session_id,
    payload.hamesSessionId,
    payload.session_id,
    payload.sessionId,
    payload.conversation_id,
    payload.conversationId,
    payload.thread_id,
    payload.threadId,
  );
}

function ensureTaskId(taskId) {
  if (typeof taskId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(taskId)) {
    throw new ContractError('task_id must match ^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$.', 'INVALID_TASK_ID');
  }
  return taskId;
}

function realWorkspace(workspace) {
  if (typeof workspace !== 'string' || !workspace.trim()) {
    throw new ContractError('workspace is required.', 'INVALID_WORKSPACE');
  }
  let resolved;
  try { resolved = fs.realpathSync(path.resolve(workspace)); }
  catch { throw new ContractError(`Workspace does not exist: ${workspace}`, 'INVALID_WORKSPACE'); }
  if (!fs.statSync(resolved).isDirectory()) throw new ContractError('workspace must be a directory.', 'INVALID_WORKSPACE');
  return resolved;
}

function activeRoot(workspace) {
  return path.join(workspace, '.hames', 'contracts', '_Active');
}

function archiveRoot(workspace) {
  return path.join(workspace, '.hames', 'contracts', '_Archive');
}

function taskDir(workspace, taskId, archived = false) {
  return path.join(archived ? archiveRoot(workspace) : activeRoot(workspace), ensureTaskId(taskId));
}

function contractFile(dir) {
  return path.join(dir, 'contract.json');
}

function isUnder(candidate, base) {
  const relative = path.relative(base, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function nearestExistingRealpath(inputPath) {
  const absolute = path.resolve(inputPath);
  const missing = [];
  let cursor = absolute;
  while (!fs.existsSync(cursor)) {
    const parent = path.dirname(cursor);
    if (parent === cursor) throw new ContractError(`Cannot normalize path: ${inputPath}`, 'PATH_NORMALIZE_FAILED');
    missing.unshift(path.basename(cursor));
    cursor = parent;
  }
  let resolved;
  try { resolved = fs.realpathSync(cursor); }
  catch { throw new ContractError(`Cannot resolve path: ${inputPath}`, 'PATH_NORMALIZE_FAILED'); }
  return path.resolve(resolved, ...missing);
}

function normalizeScopedPath(workspace, value) {
  if (typeof value !== 'string' || !value.trim()) throw new ContractError('Scope paths must be non-empty strings.', 'INVALID_SCOPE');
  const candidate = path.isAbsolute(value) ? value : path.join(workspace, value);
  return nearestExistingRealpath(candidate);
}

function normalizeScopeList(workspace, values, label, allowEmpty = true) {
  if (!Array.isArray(values) || (!allowEmpty && values.length === 0)) {
    throw new ContractError(`scope.${label} must be ${allowEmpty ? 'an array' : 'a non-empty array'}.`, 'INVALID_SCOPE');
  }
  return values.map(value => {
    const normalized = normalizeScopedPath(workspace, value);
    if (!isUnder(normalized, workspace)) {
      throw new ContractError(`scope.${label} escapes the workspace: ${value}`, 'SCOPE_ESCAPE');
    }
    const relative = path.relative(workspace, normalized).replace(/\\/g, '/');
    return relative || '.';
  });
}

function normalizeProvenance(value, fallbackSource) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    source: typeof input.source === 'string' ? input.source : fallbackSource,
    actor: typeof input.actor === 'string' ? input.actor : '',
    reference: typeof input.reference === 'string' ? input.reference : '',
    recorded_at: typeof input.recorded_at === 'string' && !Number.isNaN(Date.parse(input.recorded_at))
      ? new Date(input.recorded_at).toISOString()
      : now(),
    advisory: true,
  };
}

function normalizeCriteria(values) {
  if (values === undefined) return [];
  if (!Array.isArray(values)) throw new ContractError('acceptance_criteria must be an array.', 'INVALID_SPEC');
  return values.map((value, index) => {
    if (typeof value === 'string' && value.trim()) return { id: `criterion-${index + 1}`, description: value.trim() };
    if (value && typeof value === 'object' && typeof value.id === 'string' && value.id.trim() && typeof value.description === 'string' && value.description.trim()) {
      return { id: value.id.trim(), description: value.description.trim() };
    }
    throw new ContractError('Each acceptance criterion requires id and description.', 'INVALID_SPEC');
  });
}

function normalizeEvidenceRequirements(values) {
  if (values === undefined) return [];
  if (!Array.isArray(values)) throw new ContractError('required_evidence must be an array.', 'INVALID_SPEC');
  const seen = new Set();
  return values.map((value, index) => {
    let normalized;
    if (typeof value === 'string' && value.trim()) {
      normalized = { id: value.trim(), description: value.trim(), command: null };
    } else if (value && typeof value === 'object' && typeof value.id === 'string' && value.id.trim()) {
      normalized = {
        id: value.id.trim(),
        description: typeof value.description === 'string' && value.description.trim() ? value.description.trim() : value.id.trim(),
        command: typeof value.command === 'string' && value.command.trim() ? value.command.trim() : null,
      };
    } else {
      throw new ContractError(`required_evidence[${index}] is invalid.`, 'INVALID_SPEC');
    }
    if (seen.has(normalized.id)) throw new ContractError(`Duplicate evidence id: ${normalized.id}`, 'INVALID_SPEC');
    seen.add(normalized.id);
    return normalized;
  });
}

function stringArray(value, label, fallback = []) {
  const values = value === undefined ? fallback : value;
  if (!Array.isArray(values) || values.some(item => typeof item !== 'string' || !item.trim())) {
    throw new ContractError(`${label} must be an array of non-empty strings.`, 'INVALID_SPEC');
  }
  return values.map(item => item.trim());
}

function specProjection(contract) {
  return {
    schema_version: contract.schema_version,
    task_id: contract.task_id,
    revision: contract.revision,
    workspace: contract.workspace,
    request_provenance: contract.request_provenance,
    approval_provenance: contract.approval_provenance,
    scope: contract.scope,
    outputs: contract.outputs,
    invariants: contract.invariants,
    acceptance_criteria: contract.acceptance_criteria,
    required_evidence: contract.required_evidence,
  };
}

function calculateSpecHash(contract) {
  return sha256(stableStringify(specProjection(contract)));
}

function buildContract(input, previous = null) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ContractError('Input must be a JSON object.', 'INVALID_SPEC');
  const workspace = realWorkspace(input.workspace || (previous && previous.workspace));
  const taskId = ensureTaskId(input.task_id || (previous && previous.task_id));
  if (previous && (previous.workspace !== workspace || previous.task_id !== taskId)) {
    throw new ContractError('An amendment cannot change workspace or task_id.', 'INVALID_AMENDMENT');
  }
  const scopeInput = input.scope || (previous && previous.scope) || {};
  const timestamp = now();
  const state = previous
    ? (previous.state === 'DRAFT' ? 'DRAFT' : 'AMENDMENT_PENDING')
    : 'DRAFT';
  const contract = {
    schema_version: SCHEMA_VERSION,
    task_id: taskId,
    revision: previous ? previous.revision + 1 : 1,
    state,
    workspace,
    request_provenance: normalizeProvenance(
      input.request_provenance !== undefined ? input.request_provenance : previous && previous.request_provenance,
      'user_request',
    ),
    approval_provenance: normalizeProvenance(
      input.approval_provenance !== undefined ? input.approval_provenance : previous && previous.approval_provenance,
      'asserted_approval',
    ),
    scope: {
      include: normalizeScopeList(workspace, scopeInput.include, 'include', false),
      exclude: normalizeScopeList(workspace, scopeInput.exclude || [], 'exclude'),
      protected: normalizeScopeList(workspace, scopeInput.protected || [], 'protected'),
    },
    outputs: stringArray(input.outputs, 'outputs', previous ? previous.outputs : []),
    invariants: stringArray(input.invariants, 'invariants', previous ? previous.invariants : []),
    acceptance_criteria: normalizeCriteria(
      input.acceptance_criteria !== undefined ? input.acceptance_criteria : previous && previous.acceptance_criteria,
    ),
    required_evidence: normalizeEvidenceRequirements(
      input.required_evidence !== undefined ? input.required_evidence : previous && previous.required_evidence,
    ),
    spec_hash: '',
    timestamps: {
      created_at: previous ? previous.timestamps.created_at : timestamp,
      updated_at: timestamp,
    },
  };
  contract.spec_hash = calculateSpecHash(contract);
  validateContract(contract);
  return contract;
}

function validateProvenance(value, label, errors) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return errors.push(`${label} must be an object.`);
  rejectUnknownKeys(value, ['source', 'actor', 'reference', 'recorded_at', 'advisory'], label, errors);
  const keys = ['source', 'actor', 'reference', 'recorded_at'];
  for (const key of keys) if (typeof value[key] !== 'string') errors.push(`${label}.${key} must be a string.`);
  if (value.advisory !== true) errors.push(`${label}.advisory must be true.`);
  if (typeof value.recorded_at === 'string' && Number.isNaN(Date.parse(value.recorded_at))) errors.push(`${label}.recorded_at is invalid.`);
}

function rejectUnknownKeys(value, allowed, label, errors) {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) errors.push(`${label} has unknown property: ${key}.`);
  }
}

function validateContract(contract, options = {}) {
  const errors = [];
  if (!contract || typeof contract !== 'object' || Array.isArray(contract)) throw new ContractError('contract.json must contain an object.', 'INVALID_CONTRACT');
  rejectUnknownKeys(contract, [
    'schema_version', 'task_id', 'revision', 'state', 'workspace',
    'request_provenance', 'approval_provenance', 'scope', 'outputs',
    'invariants', 'acceptance_criteria', 'required_evidence', 'spec_hash',
    'timestamps',
  ], 'contract', errors);
  if (contract.schema_version !== SCHEMA_VERSION) errors.push(`schema_version must be ${SCHEMA_VERSION}.`);
  try { ensureTaskId(contract.task_id); } catch (error) { errors.push(error.message); }
  if (!Number.isInteger(contract.revision) || contract.revision < 1) errors.push('revision must be a positive integer.');
  if (!STATES.has(contract.state)) errors.push(`Unknown state: ${contract.state}`);
  let workspace = null;
  try { workspace = realWorkspace(contract.workspace); } catch (error) { errors.push(error.message); }
  if (workspace && workspace !== contract.workspace) errors.push('workspace must be its canonical realpath.');
  validateProvenance(contract.request_provenance, 'request_provenance', errors);
  validateProvenance(contract.approval_provenance, 'approval_provenance', errors);
  if (!contract.scope || typeof contract.scope !== 'object') {
    errors.push('scope must be an object.');
  } else if (workspace) {
    rejectUnknownKeys(contract.scope, ['include', 'exclude', 'protected'], 'scope', errors);
    for (const [label, allowEmpty] of [['include', false], ['exclude', true], ['protected', true]]) {
      try {
        const normalized = normalizeScopeList(workspace, contract.scope[label], label, allowEmpty);
        if (stableStringify(normalized) !== stableStringify(contract.scope[label])) errors.push(`scope.${label} is not canonical.`);
      } catch (error) { errors.push(error.message); }
    }
  }
  for (const label of ['outputs', 'invariants']) {
    if (!Array.isArray(contract[label]) || contract[label].some(item => typeof item !== 'string' || !item)) errors.push(`${label} must be a string array.`);
  }
  try {
    const criteria = normalizeCriteria(contract.acceptance_criteria);
    if (stableStringify(criteria) !== stableStringify(contract.acceptance_criteria)) errors.push('acceptance_criteria is not canonical.');
    for (const [index, criterion] of contract.acceptance_criteria.entries()) {
      rejectUnknownKeys(criterion, ['id', 'description'], `acceptance_criteria[${index}]`, errors);
    }
  } catch (error) { errors.push(error.message); }
  try {
    const evidence = normalizeEvidenceRequirements(contract.required_evidence);
    if (stableStringify(evidence) !== stableStringify(contract.required_evidence)) errors.push('required_evidence is not canonical.');
    for (const [index, requirement] of contract.required_evidence.entries()) {
      rejectUnknownKeys(requirement, ['id', 'description', 'command'], `required_evidence[${index}]`, errors);
    }
  } catch (error) { errors.push(error.message); }
  if (!contract.timestamps || Number.isNaN(Date.parse(contract.timestamps.created_at)) || Number.isNaN(Date.parse(contract.timestamps.updated_at))) {
    errors.push('timestamps are invalid.');
  } else {
    rejectUnknownKeys(contract.timestamps, ['created_at', 'updated_at'], 'timestamps', errors);
  }
  if (!/^[a-f0-9]{64}$/.test(contract.spec_hash || '')) errors.push('spec_hash is invalid.');
  else if (contract.spec_hash !== calculateSpecHash(contract)) errors.push('spec_hash mismatch: contract may have been amended or tampered with.');
  if (options.expectedDir && workspace) {
    const expected = taskDir(workspace, contract.task_id, contract.state === 'ARCHIVED');
    let actual;
    try { actual = fs.realpathSync(options.expectedDir); } catch { actual = path.resolve(options.expectedDir); }
    let canonicalExpected;
    try { canonicalExpected = fs.realpathSync(expected); } catch { canonicalExpected = path.resolve(expected); }
    if (actual !== canonicalExpected) errors.push('Contract directory does not match workspace/task_id/state.');
  }
  if (errors.length) throw new ContractError(errors.join(' '), 'INVALID_CONTRACT');
  return true;
}

function appendEvent(dir, data) {
  const file = path.join(dir, 'events.jsonl');
  const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const checked = verifyEventChainText(existing);
  const base = {
    sequence: checked.count + 1,
    timestamp: now(),
    ...data,
    previous_hash: checked.head,
  };
  const event = { ...base, hash: sha256(stableStringify(base)) };
  atomicWrite(file, `${existing}${JSON.stringify(event)}\n`);
  return event;
}

function verifyEventChainText(text) {
  const lines = text.split(/\r?\n/).filter(line => line.trim());
  let previous = null;
  for (let index = 0; index < lines.length; index += 1) {
    let event;
    try { event = JSON.parse(lines[index]); }
    catch { throw new ContractError(`Malformed events.jsonl line ${index + 1}.`, 'EVIDENCE_TAMPERED'); }
    if (event.sequence !== index + 1 || event.previous_hash !== previous || typeof event.hash !== 'string') {
      throw new ContractError(`Evidence chain broken at line ${index + 1}.`, 'EVIDENCE_TAMPERED');
    }
    const { hash, ...base } = event;
    if (sha256(stableStringify(base)) !== hash) throw new ContractError(`Evidence hash mismatch at line ${index + 1}.`, 'EVIDENCE_TAMPERED');
    previous = hash;
  }
  return { count: lines.length, head: previous, events: lines.map(line => JSON.parse(line)) };
}

function verifyEventChain(dir) {
  const file = path.join(dir, 'events.jsonl');
  if (!fs.existsSync(file)) throw new ContractError('events.jsonl is missing.', 'EVIDENCE_TAMPERED');
  return verifyEventChainText(fs.readFileSync(file, 'utf8'));
}

function verifyContractHistory(dir, contract) {
  const chain = verifyEventChain(dir);
  const lifecycle = chain.events.filter(event =>
    event.kind === 'lifecycle' &&
    event.task_id === contract.task_id &&
    event.revision === contract.revision,
  );
  if (!lifecycle.length) throw new ContractError('No lifecycle event exists for the current contract revision.', 'EVIDENCE_TAMPERED');
  const last = lifecycle[lifecycle.length - 1];
  if (last.to !== contract.state || last.spec_hash !== contract.spec_hash) {
    throw new ContractError('contract.json state/spec does not match the lifecycle chain.', 'EVIDENCE_TAMPERED');
  }
  return chain;
}

function writeEvidenceSummary(dir, contract) {
  const chain = verifyEventChain(dir);
  const evidenceEvents = chain.events.filter(event => event.kind === 'evidence' && event.revision === contract.revision);
  const summary = {
    schema_version: SCHEMA_VERSION,
    task_id: contract.task_id,
    revision: contract.revision,
    count: evidenceEvents.length,
    chain_head: chain.head,
    evidence_ids: [...new Set(evidenceEvents.map(event => event.evidence_id).filter(Boolean))],
    updated_at: now(),
  };
  writeJson(path.join(dir, 'evidence.json'), summary);
  return summary;
}

function writeLifecycle(dir, contract, from, action) {
  appendEvent(dir, {
    kind: 'lifecycle',
    task_id: contract.task_id,
    revision: contract.revision,
    action,
    from,
    to: contract.state,
    spec_hash: contract.spec_hash,
  });
  writeEvidenceSummary(dir, contract);
}

function loadContractFromDir(dir) {
  const contract = readJsonStrict(contractFile(dir), 'contract.json');
  validateContract(contract, { expectedDir: dir });
  verifyContractHistory(dir, contract);
  return contract;
}

function readPointer(options = {}) {
  const file = pointerPath(options);
  if (!fs.existsSync(file)) return null;
  const pointer = readJsonStrict(file, '.claude/.task_contract_state.json');
  if (!pointer || pointer.version !== POINTER_VERSION || !pointer.sessions || typeof pointer.sessions !== 'object' || Array.isArray(pointer.sessions)) {
    throw new ContractError('Malformed task-contract session pointer.', 'MALFORMED_POINTER');
  }
  return pointer;
}

function writePointer(pointer, options = {}) {
  writeJson(pointerPath(options), pointer);
}

function removePointersFor(options, predicate) {
  const pointer = readPointer(options);
  if (!pointer) return;
  let changed = false;
  for (const [sessionId, record] of Object.entries(pointer.sessions)) {
    if (predicate(record, sessionId)) {
      delete pointer.sessions[sessionId];
      changed = true;
    }
  }
  if (changed) writePointer(pointer, options);
}

function resolveSessionContract(options = {}, payload = {}) {
  const sessionId = resolveSessionId(payload, options.sessionId);
  if (!sessionId) return null;
  const pointer = readPointer(options);
  if (!pointer || !Object.prototype.hasOwnProperty.call(pointer.sessions, sessionId)) return null;
  const record = pointer.sessions[sessionId];
  if (!record || typeof record !== 'object' || typeof record.contract_dir !== 'string' || typeof record.task_id !== 'string' || !Number.isInteger(record.revision) || typeof record.spec_hash !== 'string' || typeof record.workspace !== 'string' || !record.activation_provenance || record.activation_provenance.advisory !== true || typeof record.activation_provenance.reference !== 'string' || !record.activation_provenance.reference.trim()) {
    throw new ContractError(`Malformed active pointer for session ${sessionId}.`, 'MALFORMED_POINTER');
  }
  const workspace = realWorkspace(record.workspace);
  const expectedDir = taskDir(workspace, record.task_id);
  const normalizedRecordDir = nearestExistingRealpath(record.contract_dir);
  const normalizedExpectedDir = nearestExistingRealpath(expectedDir);
  if (normalizedRecordDir !== normalizedExpectedDir || !isUnder(normalizedRecordDir, activeRoot(workspace))) {
    throw new ContractError('Active pointer path is outside the canonical contract directory.', 'TAMPERED_POINTER');
  }
  const contract = loadContractFromDir(normalizedRecordDir);
  if (!['ACTIVE', 'REVIEW'].includes(contract.state) || contract.task_id !== record.task_id || contract.revision !== record.revision || contract.spec_hash !== record.spec_hash || contract.workspace !== workspace) {
    throw new ContractError('Active pointer does not match the governed contract.', 'TAMPERED_POINTER');
  }
  return { sessionId, pointer, record, contract, dir: normalizedRecordDir };
}

function resolveActive(options = {}, payload = {}) {
  const loaded = resolveSessionContract(options, payload);
  if (!loaded || loaded.contract.state !== 'ACTIVE') return null;
  return loaded;
}

function createContract(input, options = {}) {
  const contract = buildContract(input);
  const dir = taskDir(contract.workspace, contract.task_id);
  if (fs.existsSync(dir) || fs.existsSync(taskDir(contract.workspace, contract.task_id, true))) {
    throw new ContractError(`Task contract already exists: ${contract.task_id}`, 'ALREADY_EXISTS');
  }
  fs.mkdirSync(dir, { recursive: true });
  writeJson(contractFile(dir), contract);
  atomicWrite(path.join(dir, 'plan.md'), typeof input.plan === 'string' ? input.plan : `# ${contract.task_id}\n\nPlan pending.\n`);
  atomicWrite(path.join(dir, 'events.jsonl'), '');
  writeJson(path.join(dir, 'evidence.json'), {
    schema_version: SCHEMA_VERSION,
    task_id: contract.task_id,
    revision: contract.revision,
    count: 0,
    chain_head: null,
    evidence_ids: [],
    updated_at: now(),
  });
  writeJson(path.join(dir, 'result.json'), {
    schema_version: SCHEMA_VERSION,
    task_id: contract.task_id,
    revision: contract.revision,
    status: 'pending',
    updated_at: now(),
  });
  writeLifecycle(dir, contract, null, 'create');
  return { contract, dir };
}

function draftContract(input, options = {}) {
  const workspace = realWorkspace(input.workspace);
  const id = ensureTaskId(input.task_id);
  const dir = taskDir(workspace, id);
  if (!fs.existsSync(dir)) return createContract(input, options);
  const previous = loadContractFromDir(dir);
  const contract = buildContract(input, previous);
  writeJson(contractFile(dir), contract);
  if (typeof input.plan === 'string') atomicWrite(path.join(dir, 'plan.md'), input.plan);
  atomicWrite(path.join(dir, 'events.jsonl'), '');
  writeJson(path.join(dir, 'result.json'), {
    schema_version: SCHEMA_VERSION,
    task_id: contract.task_id,
    revision: contract.revision,
    status: 'invalidated_by_revision',
    updated_at: now(),
  });
  writeLifecycle(dir, contract, previous.state, 'revise');
  removePointersFor(options, record => record && record.workspace === workspace && record.task_id === id);
  return { contract, dir };
}

function directTask(options) {
  if (options.dir) {
    const dir = nearestExistingRealpath(options.dir);
    return { dir, contract: loadContractFromDir(dir) };
  }
  if (options.workspace && options.taskId) {
    const workspace = realWorkspace(options.workspace);
    let dir = taskDir(workspace, options.taskId, options.archived === true);
    if (!fs.existsSync(dir) && options.archived !== false) {
      const archivedDir = taskDir(workspace, options.taskId, true);
      if (fs.existsSync(archivedDir)) dir = archivedDir;
    }
    return { dir, contract: loadContractFromDir(dir) };
  }
  const active = resolveSessionContract(options, options.payload || {});
  if (!active) throw new ContractError('No task specified and no active contract for this session.', 'NO_ACTIVE_CONTRACT');
  return active;
}

function transition(options, allowed, target, action) {
  const loaded = directTask(options);
  const { contract, dir } = loaded;
  if (!allowed.includes(contract.state)) throw new ContractError(`${action} requires ${allowed.join(' or ')}, got ${contract.state}.`, 'INVALID_TRANSITION');
  const from = contract.state;
  contract.state = target;
  contract.timestamps.updated_at = now();
  validateContract(contract);
  writeJson(contractFile(dir), contract);
  writeLifecycle(dir, contract, from, action);
  return { contract, dir };
}

function ready(options) {
  return transition(options, ['DRAFT', 'AMENDMENT_PENDING'], 'READY', 'ready');
}

function activate(options = {}) {
  const sessionId = resolveSessionId(options.payload || {}, options.sessionId);
  if (!sessionId) throw new ContractError('A session id is required to activate a contract.', 'NO_SESSION');
  const approvalReference = firstString(
    options.approval,
    options.activationProvenance && options.activationProvenance.reference,
  );
  if (!approvalReference) throw new ContractError('--approval <reference> is required to activate a contract.', 'ACTIVATION_APPROVAL_REQUIRED');
  const activationProvenance = normalizeProvenance({
    ...(options.activationProvenance || {}),
    reference: approvalReference,
    source: (options.activationProvenance && options.activationProvenance.source) || 'asserted_activation_approval',
  }, 'asserted_activation_approval');
  let pointer = readPointer(options) || { version: POINTER_VERSION, sessions: {} };
  if (pointer.sessions[sessionId]) throw new ContractError(`Session ${sessionId} already has an active pointer.`, 'SESSION_ALREADY_ACTIVE');
  const result = transition(options, ['READY'], 'ACTIVE', 'activate');
  pointer.sessions[sessionId] = {
    task_id: result.contract.task_id,
    revision: result.contract.revision,
    spec_hash: result.contract.spec_hash,
    workspace: result.contract.workspace,
    contract_dir: result.dir,
    activated_at: now(),
    activation_provenance: activationProvenance,
  };
  writePointer(pointer, options);
  appendEvent(result.dir, {
    kind: 'approval',
    task_id: result.contract.task_id,
    revision: result.contract.revision,
    action: 'activate',
    provenance: activationProvenance,
  });
  writeEvidenceSummary(result.dir, result.contract);
  return result;
}

function safeEvidenceMetadata(input) {
  const source = input && typeof input === 'object' ? input : {};
  const allowed = [
    'tool_name', 'success', 'exit_code', 'duration_ms', 'artifact_sha256',
    'command_sha256', 'output_sha256', 'path_sha256', 'result_type',
  ];
  const metadata = {};
  for (const key of allowed) {
    const value = source[key];
    if (typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) metadata[key] = value;
  }
  return metadata;
}

function recordEvidence(options = {}, input = {}) {
  const loaded = directTask(options);
  const { contract, dir } = loaded;
  if (!['ACTIVE', 'REVIEW'].includes(contract.state)) throw new ContractError(`Evidence can only be recorded in ACTIVE or REVIEW, got ${contract.state}.`, 'INVALID_TRANSITION');
  verifyEventChain(dir);
  const evidenceId = typeof input.evidence_id === 'string' && input.evidence_id.trim()
    ? input.evidence_id.trim()
    : (typeof input.criterion === 'string' ? input.criterion.trim() : 'observed');
  const status = ['pass', 'fail', 'observed'].includes(input.status) ? input.status : 'observed';
  const rawDigestSource = Object.prototype.hasOwnProperty.call(input, '_raw_digest_source')
    ? input._raw_digest_source
    : input;
  const event = appendEvent(dir, {
    kind: 'evidence',
    task_id: contract.task_id,
    revision: contract.revision,
    evidence_id: evidenceId,
    status,
    source: typeof input.source === 'string' && input.source.trim() ? input.source.trim() : 'manual',
    metadata: safeEvidenceMetadata(input.metadata),
    payload_sha256: sha256(typeof rawDigestSource === 'string' ? rawDigestSource : stableStringify(rawDigestSource)),
  });
  writeEvidenceSummary(dir, contract);
  return { contract, dir, event };
}

function evidenceCoverage(dir, contract) {
  const chain = verifyEventChain(dir);
  const passed = new Set(chain.events
    .filter(event => event.kind === 'evidence' && event.revision === contract.revision && event.status === 'pass')
    .map(event => event.evidence_id));
  return contract.required_evidence.filter(requirement => !passed.has(requirement.id));
}

function review(options = {}) {
  const loaded = directTask(options);
  if (loaded.contract.state !== 'ACTIVE') throw new ContractError(`review requires ACTIVE, got ${loaded.contract.state}.`, 'INVALID_TRANSITION');
  const missing = evidenceCoverage(loaded.dir, loaded.contract);
  if (missing.length) throw new ContractError(`Missing passing evidence: ${missing.map(item => item.id).join(', ')}`, 'MISSING_EVIDENCE');
  return transition({ ...options, dir: loaded.dir }, ['ACTIVE'], 'REVIEW', 'review');
}

function accept(options = {}) {
  const loaded = directTask(options);
  if (loaded.contract.state !== 'REVIEW') throw new ContractError(`accept requires REVIEW, got ${loaded.contract.state}.`, 'INVALID_TRANSITION');
  const missing = evidenceCoverage(loaded.dir, loaded.contract);
  if (missing.length) throw new ContractError(`Missing passing evidence: ${missing.map(item => item.id).join(', ')}`, 'MISSING_EVIDENCE');
  const result = transition({ ...options, dir: loaded.dir }, ['REVIEW'], 'ACCEPTED', 'accept');
  writeJson(path.join(result.dir, 'result.json'), {
    schema_version: SCHEMA_VERSION,
    task_id: result.contract.task_id,
    revision: result.contract.revision,
    status: 'accepted',
    acceptance_provenance: normalizeProvenance(options.acceptanceProvenance, 'asserted_acceptance'),
    spec_hash: result.contract.spec_hash,
    evidence_chain_head: verifyEventChain(result.dir).head,
    updated_at: now(),
  });
  removePointersFor(options, record => record && record.workspace === result.contract.workspace && record.task_id === result.contract.task_id);
  return result;
}

function archive(options = {}) {
  const loaded = directTask(options);
  if (loaded.contract.state !== 'ACCEPTED') throw new ContractError(`archive requires ACCEPTED, got ${loaded.contract.state}.`, 'INVALID_TRANSITION');
  const destination = taskDir(loaded.contract.workspace, loaded.contract.task_id, true);
  if (fs.existsSync(destination)) throw new ContractError(`Archive destination already exists: ${destination}`, 'ALREADY_EXISTS');
  const from = loaded.contract.state;
  loaded.contract.state = 'ARCHIVED';
  loaded.contract.timestamps.updated_at = now();
  validateContract(loaded.contract);
  writeJson(contractFile(loaded.dir), loaded.contract);
  writeLifecycle(loaded.dir, loaded.contract, from, 'archive');
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.renameSync(loaded.dir, destination);
  removePointersFor(options, record => record && record.workspace === loaded.contract.workspace && record.task_id === loaded.contract.task_id);
  return { contract: loaded.contract, dir: destination };
}

function validateTask(options = {}) {
  const loaded = directTask(options);
  validateContract(loaded.contract, { expectedDir: loaded.dir });
  const chain = verifyContractHistory(loaded.dir, loaded.contract);
  const evidence = readJsonStrict(path.join(loaded.dir, 'evidence.json'), 'evidence.json');
  const evidenceEvents = chain.events.filter(event => event.kind === 'evidence' && event.revision === loaded.contract.revision);
  const expectedIds = [...new Set(evidenceEvents.map(event => event.evidence_id).filter(Boolean))];
  if (evidence.task_id !== loaded.contract.task_id || evidence.revision !== loaded.contract.revision || evidence.chain_head !== chain.head || evidence.count !== evidenceEvents.length || stableStringify(evidence.evidence_ids) !== stableStringify(expectedIds)) {
    throw new ContractError('evidence.json does not match the event chain.', 'EVIDENCE_TAMPERED');
  }
  return { contract: loaded.contract, dir: loaded.dir, chain: { count: chain.count, head: chain.head } };
}

function scopePaths(contract, label) {
  return contract.scope[label].map(value => normalizeScopedPath(contract.workspace, value));
}

function guardFilePath(contract, inputPath) {
  const candidate = normalizeScopedPath(contract.workspace, inputPath);
  if (!isUnder(candidate, contract.workspace)) return { allowed: false, reason: 'path escapes the workspace through traversal or symlink resolution' };
  const included = scopePaths(contract, 'include').some(base => isUnder(candidate, base));
  if (!included) return { allowed: false, reason: 'path is outside scope.include' };
  if (scopePaths(contract, 'exclude').some(base => isUnder(candidate, base))) return { allowed: false, reason: 'path is inside scope.exclude' };
  if (scopePaths(contract, 'protected').some(base => isUnder(candidate, base))) return { allowed: false, reason: 'path is inside scope.protected' };
  return { allowed: true, normalized: candidate };
}

function normalizeCommand(command) {
  return command.trim().replace(/\s+/g, ' ');
}

function gitSubcommand(tokens) {
  let index = 1;
  while (index < tokens.length && tokens[index].startsWith('-')) {
    if (['-C', '--git-dir', '--work-tree', '-c'].includes(tokens[index])) index += 2;
    else index += 1;
  }
  return tokens[index] || '';
}

function readOnlyBash(command) {
  if (typeof command !== 'string' || !command.trim()) return false;
  if (/[\n\r<>`]/.test(command) || /(^|[^&])&([^&]|$)/.test(command) || /\$\(|\$\{|\b(?:sudo|rm|mv|cp|mkdir|rmdir|touch|tee|chmod|chown|install|truncate|dd|curl|wget|ssh|scp|rsync|npm|pnpm|yarn|node|python|perl|ruby|make)\b/.test(command)) return false;
  const segments = command.split(/\s*(?:&&|\|\||;|\|)\s*/);
  if (!segments.length || segments.some(segment => !segment.trim())) return false;
  for (const segment of segments) {
    const tokens = segment.trim().split(/\s+/);
    const program = path.basename(tokens[0]);
    if (!SAFE_BASH_PROGRAMS.has(program)) return false;
    if (program === 'git' && !SAFE_GIT_SUBCOMMANDS.has(gitSubcommand(tokens))) return false;
    if (program === 'git' && tokens.some(token => token === '--output' || token.startsWith('--output='))) return false;
    if (program === 'find' && tokens.some(token => /^-(delete|exec|execdir|ok|okdir|fprint|fprintf|fls)$/.test(token))) return false;
    if (program === 'sed' && tokens.some(token => token === '-i' || token.startsWith('--in-place'))) return false;
  }
  return true;
}

function verificationRequirement(contract, command) {
  const normalized = normalizeCommand(command);
  return contract.required_evidence.find(item => item.command && normalizeCommand(item.command) === normalized) || null;
}

function extractWritePaths(toolName, toolInput) {
  const paths = [];
  for (const key of ['file_path', 'path', 'absolute_path', 'notebook_path']) {
    if (typeof toolInput[key] === 'string' && toolInput[key].trim()) paths.push(toolInput[key]);
  }
  if (toolName === 'MultiEdit' && Array.isArray(toolInput.edits)) {
    for (const edit of toolInput.edits) {
      if (edit && typeof edit.file_path === 'string') paths.push(edit.file_path);
    }
  }
  return [...new Set(paths)];
}

function guardPayload(payload = {}, options = {}) {
  const active = resolveActive(options, payload);
  if (!active) return { allowed: true, governed: false, reason: 'legacy-pass: no active contract for this session' };
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { allowed: false, governed: true, reason: 'malformed hook payload' };
  const toolName = firstString(payload.tool_name, payload.toolName, payload.tool, payload.name);
  const toolInput = payload.tool_input || payload.toolInput || payload.input || payload.arguments || {};
  if (!toolName || !toolInput || typeof toolInput !== 'object' || Array.isArray(toolInput)) return { allowed: false, governed: true, reason: 'malformed hook payload' };
  if (READ_TOOLS.has(toolName)) return { allowed: true, governed: true, reason: 'read-only tool' };
  if (WRITE_TOOLS.has(toolName)) {
    const paths = extractWritePaths(toolName, toolInput);
    if (!paths.length) return { allowed: false, governed: true, reason: `${toolName} has no usable path` };
    for (const filePath of paths) {
      const result = guardFilePath(active.contract, filePath);
      if (!result.allowed) return { allowed: false, governed: true, reason: `${toolName} blocked: ${result.reason}`, path: filePath };
    }
    return { allowed: true, governed: true, reason: 'all write paths are within approved scope' };
  }
  if (toolName === 'Bash') {
    const command = firstString(toolInput.command, toolInput.shell_command);
    if (!command) return { allowed: false, governed: true, reason: 'Bash command is missing' };
    const requirement = verificationRequirement(active.contract, command);
    if (requirement) return { allowed: true, governed: true, reason: `declared verification command: ${requirement.id}`, evidence_id: requirement.id };
    if (readOnlyBash(command)) return { allowed: true, governed: true, reason: 'best-effort read-only Bash command' };
    return { allowed: false, governed: true, reason: 'Bash is write-capable or unknown; only read-only or declared verification commands are allowed while ACTIVE' };
  }
  return { allowed: false, governed: true, reason: `unknown substantive tool while ACTIVE: ${toolName}` };
}

function observedResult(payload, options = {}) {
  const active = resolveSessionContract(options, payload);
  if (!active) return { recorded: false, reason: 'legacy-pass' };
  const toolName = firstString(payload.tool_name, payload.toolName, payload.tool, payload.name) || 'unknown';
  const toolInput = payload.tool_input || payload.toolInput || payload.input || payload.arguments || {};
  if (toolName === 'unknown' || !toolInput || typeof toolInput !== 'object' || Array.isArray(toolInput)) {
    throw new ContractError('Malformed evidence-hook payload.', 'MALFORMED_HOOK_PAYLOAD');
  }
  const resultValue = payload.tool_response !== undefined ? payload.tool_response
    : payload.tool_result !== undefined ? payload.tool_result
      : payload.result !== undefined ? payload.result
        : payload.output;
  const command = toolName === 'Bash' ? firstString(toolInput.command, toolInput.shell_command) : '';
  const requirement = command ? verificationRequirement(active.contract, command) : null;
  const exitCode = resultValue && typeof resultValue === 'object'
    ? (Number.isInteger(resultValue.exit_code) ? resultValue.exit_code : Number.isInteger(resultValue.exitCode) ? resultValue.exitCode : null)
    : null;
  const explicitError = Boolean(
    payload.is_error || payload.isError ||
    (resultValue && typeof resultValue === 'object' && (resultValue.is_error || resultValue.isError || resultValue.error)),
  );
  const success = !explicitError && (exitCode === null || exitCode === 0);
  const metadata = {
    tool_name: toolName,
    success,
    result_type: resultValue === null ? 'null' : Array.isArray(resultValue) ? 'array' : typeof resultValue,
    output_sha256: sha256(stableStringify(resultValue === undefined ? null : resultValue)),
  };
  if (exitCode !== null) metadata.exit_code = exitCode;
  if (command) metadata.command_sha256 = sha256(command);
  const writePaths = extractWritePaths(toolName, toolInput);
  if (writePaths.length) metadata.path_sha256 = sha256(stableStringify(writePaths));
  const recorded = recordEvidence({ ...options, dir: active.dir }, {
    evidence_id: requirement ? requirement.id : `observed:${toolName}`,
    status: requirement ? (success ? 'pass' : 'fail') : 'observed',
    source: 'post_tool_hook',
    metadata,
    _raw_digest_source: stableStringify({ toolName, toolInput, resultValue }),
  });
  return { recorded: true, event: recorded.event };
}

function parseArgs(argv) {
  const options = { positional: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith('--')) {
      options.positional.push(value);
      continue;
    }
    const key = value.slice(2);
    if (key === 'help') { options.help = true; continue; }
    const next = argv[index + 1];
    if (next === undefined || next.startsWith('--')) throw new ContractError(`Missing value for --${key}.`, 'INVALID_ARGUMENT');
    index += 1;
    const mapped = {
      input: 'input', workspace: 'workspace', task: 'taskId', 'task-id': 'taskId',
      session: 'sessionId', root: 'root', dir: 'dir', approval: 'approval',
    }[key];
    if (!mapped) throw new ContractError(`Unknown option --${key}.`, 'INVALID_ARGUMENT');
    options[mapped] = next;
  }
  return options;
}

const HELP = `Hames task contract engine

Usage:
  node arsenal/task_contract.js create --input <spec.json> [--root <hames-root>]
  node arsenal/task_contract.js draft --input <spec.json> [--root <hames-root>]
  node arsenal/task_contract.js ready --workspace <path> --task-id <id>
  node arsenal/task_contract.js activate --workspace <path> --task-id <id> --session <id> --approval <reference>
  node arsenal/task_contract.js record-evidence [--workspace <path> --task-id <id> | --session <id>] --input <evidence.json>
  node arsenal/task_contract.js review [--workspace <path> --task-id <id> | --session <id>]
  node arsenal/task_contract.js accept [--workspace <path> --task-id <id> | --session <id>] [--approval <reference>]
  node arsenal/task_contract.js archive --workspace <path> --task-id <id>
  node arsenal/task_contract.js status [--workspace <path> --task-id <id> | --session <id>]
  node arsenal/task_contract.js validate [--workspace <path> --task-id <id> | --session <id>]
  node arsenal/task_contract.js guard [--session <id>]   # reads a hook payload from stdin

Notes:
  - Contracts live under <workspace>/.hames/contracts/_Active/<task-id>/.
  - Approval fields are provenance only, never cryptographic authentication.
  - The guard is a tool-level, best-effort control and is not an OS sandbox.
  - This command never creates branches, commits, pushes, deploys, or uses the network.
`;

function readStdin() {
  return new Promise((resolve, reject) => {
    let raw = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { raw += chunk; });
    process.stdin.on('end', () => resolve(raw));
    process.stdin.on('error', reject);
  });
}

async function main(argv = process.argv.slice(2)) {
  const command = argv[0];
  if (command === '--help' || command === '-h') {
    process.stdout.write(HELP);
    return 0;
  }
  const options = parseArgs(argv.slice(1));
  if (!command || command === 'help' || options.help) {
    process.stdout.write(HELP);
    return 0;
  }
  let result;
  if (command === 'create' || command === 'draft') {
    if (!options.input) throw new ContractError('--input is required.', 'INVALID_ARGUMENT');
    const input = readJsonStrict(path.resolve(options.input), 'input JSON');
    result = command === 'create' ? createContract(input, options) : draftContract(input, options);
  } else if (command === 'ready') result = ready(options);
  else if (command === 'activate') result = activate(options);
  else if (command === 'record-evidence') {
    if (!options.input) throw new ContractError('--input is required.', 'INVALID_ARGUMENT');
    result = recordEvidence(options, readJsonStrict(path.resolve(options.input), 'evidence input'));
  } else if (command === 'review') result = review(options);
  else if (command === 'accept') {
    result = accept({
      ...options,
      acceptanceProvenance: options.approval ? { reference: options.approval, source: 'cli_argument' } : undefined,
    });
  } else if (command === 'archive') result = archive(options);
  else if (command === 'status') result = directTask(options);
  else if (command === 'validate') result = validateTask(options);
  else if (command === 'guard') {
    const raw = await readStdin();
    let payload;
    try { payload = JSON.parse(raw); }
    catch {
      process.stderr.write('[TASK CONTRACT] malformed hook payload JSON\n');
      return 2;
    }
    const decision = guardPayload(payload, options);
    if (!decision.allowed) {
      process.stderr.write(`[TASK CONTRACT] ${decision.reason}\n`);
      return 2;
    }
    result = decision;
  } else throw new ContractError(`Unknown command: ${command}`, 'INVALID_ARGUMENT');
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return 0;
}

if (require.main === module) {
  main().then(code => { process.exitCode = code; }).catch(error => {
    process.stderr.write(`[TASK CONTRACT:${error.code || 'ERROR'}] ${error.message}\n`);
    process.exitCode = 2;
  });
}

module.exports = {
  ContractError,
  HELP,
  accept,
  activate,
  archive,
  atomicWrite,
  buildContract,
  calculateSpecHash,
  createContract,
  draftContract,
  guardPayload,
  nearestExistingRealpath,
  observedResult,
  readOnlyBash,
  ready,
  recordEvidence,
  resolveActive,
  resolveSessionContract,
  resolveSessionId,
  review,
  taskDir,
  validateContract,
  validateTask,
  verifyContractHistory,
  verifyEventChain,
};
