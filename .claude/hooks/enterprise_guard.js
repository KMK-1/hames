#!/usr/bin/env node
'use strict';

/**
 * Hames Enterprise Personal guard.
 * Blocks common credential reads, arbitrary outbound-network commands,
 * package installation, external git writes, and destructive process actions.
 * This is defense-in-depth; company endpoint/network policy remains authoritative.
 */

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', c => input += c);
process.stdin.on('end', () => {
  let event = {};
  try { event = JSON.parse(input || '{}'); } catch (_) { return allow(); }

  const tool = String(event.tool_name || event.tool || '');
  const args = event.tool_input || event.input || {};
  const target = String(args.file_path || args.path || args.command || args.query || '');
  const normalized = target.replace(/\\/g, '/').toLowerCase();

  const credentialPatterns = [
    /(^|\/)\.env($|\.|\/)/,
    /(^|\/)\.ssh(\/|$)/,
    /(^|\/)\.aws(\/|$)/,
    /(^|\/)id_rsa($|\.)/,
    /(^|\/)id_ed25519($|\.)/,
    /\.pem$/,
    /\.key$/,
    /(^|\/)credentials?(\/|$|\.)/,
    /(^|\/)secrets?(\/|$)/
  ];

  if (/read/i.test(tool) && credentialPatterns.some(r => r.test(normalized))) {
    return block('Credential Guard: reading credential/secret material is blocked.');
  }

  if (/bash|powershell/i.test(tool)) {
    const cmd = normalized;
    const blocked = [
      /(^|\s)(curl|wget)(\s|$)/,
      /invoke-webrequest/,
      /invoke-restmethod/,
      /(^|\s)(pip|pip3)\s+install(\s|$)/,
      /(^|\s)npm\s+(install|i)(\s|$)/,
      /(^|\s)npx(\s|$)/,
      /(^|\s)winget(\s|$)/,
      /(^|\s)git\s+push(\s|$)/,
      /(^|\s)git\s+remote\s+(add|set-url)(\s|$)/,
      /(^|\s)gh(\s|$)/,
      /(^|\s)vercel(\s|$)/,
      /(^|\s)(scp|sftp|ftp)(\s|$)/,
      /(^|\s)taskkill(\s|$)/,
      /stop-process/
    ];
    if (blocked.some(r => r.test(cmd))) {
      return block('Enterprise Guard: outbound, installation, external Git, or destructive command blocked.');
    }
  }

  allow();
});

function block(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason
    }
  }));
}

function allow() {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow'
    }
  }));
}
