#!/usr/bin/env node
/* PreToolUse adapter for the workspace-local Hames task contract. */

'use strict';

const { guardPayload } = require('../../arsenal/task_contract.js');

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { raw += chunk; });
process.stdin.on('end', () => {
  let payload;
  try { payload = JSON.parse(raw); }
  catch {
    process.stderr.write('[TASK CONTRACT GUARD] malformed hook payload JSON\n');
    process.exit(2);
    return;
  }
  try {
    const decision = guardPayload(payload);
    if (!decision.allowed) {
      process.stderr.write(`[TASK CONTRACT GUARD] ${decision.reason}\n`);
      process.exit(2);
    }
    process.exit(0);
  } catch (error) {
    process.stderr.write(`[TASK CONTRACT GUARD] fail-closed: ${error.message}\n`);
    process.exit(2);
  }
});
