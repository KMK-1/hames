#!/usr/bin/env node
'use strict';
const { spawnSync } = require('child_process');
const path = require('path');
const guard = path.resolve(__dirname, '../.claude/hooks/enterprise_guard.js');
function run(tool_name, tool_input) {
  const p = spawnSync(process.execPath, [guard], {input: JSON.stringify({tool_name, tool_input}), encoding:'utf8'});
  if (p.status !== 0) throw new Error(p.stderr || `guard exited ${p.status}`);
  return JSON.parse(p.stdout).hookSpecificOutput.permissionDecision;
}
const cases = [
 ['normal source read','Read',{file_path:'src/app.js'},'allow'],
 ['env read','Read',{file_path:'.env'},'deny'],
 ['ssh key read','Read',{file_path:'~/.ssh/id_rsa'},'deny'],
 ['curl','Bash',{command:'curl https://example.com'},'deny'],
 ['wget','Bash',{command:'wget https://example.com/a'},'deny'],
 ['pip install','Bash',{command:'pip install requests'},'deny'],
 ['npm install','Bash',{command:'npm install axios'},'deny'],
 ['git push','Bash',{command:'git push origin main'},'deny'],
 ['git status','Bash',{command:'git status'},'allow'],
 ['git diff','Bash',{command:'git diff'},'allow'],
 ['PowerShell web','PowerShell',{command:'Invoke-WebRequest https://example.com'},'deny'],
 ['process kill','Bash',{command:'taskkill /F /IM node.exe'},'deny']
];
let failed=0;
for (const [name,tool,input,expected] of cases) { const actual=run(tool,input); const ok=actual===expected; console.log(`${ok?'PASS':'FAIL'} ${name}: ${actual}`); if(!ok) failed++; }
if(failed) process.exit(1);
console.log(`\n${cases.length}/${cases.length} enterprise guard tests passed.`);
