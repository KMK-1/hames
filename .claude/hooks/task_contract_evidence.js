#!/usr/bin/env node
/* PostToolUse evidence observer. Stores digests/metadata, never raw tool output. */

'use strict';

const { observedResult } = require('../../arsenal/task_contract.js');

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { raw += chunk; });
process.stdin.on('end', () => {
  let payload;
  try { payload = JSON.parse(raw); }
  catch {
    process.stderr.write('[TASK CONTRACT EVIDENCE] malformed hook payload JSON\n');
    process.exit(2);
    return;
  }
  try {
    observedResult(payload);
    process.exit(0);
  } catch (error) {
    process.stderr.write(`[TASK CONTRACT EVIDENCE] fail-closed: ${error.message}\n`);
    process.exit(2);
  }
});
