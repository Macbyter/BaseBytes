#!/usr/bin/env bash
# BaseBytes — Simulation Report: EAS Worker + Receipt Anchoring (DB-free, pg-mem)
set -euo pipefail
REPO="$PWD"
DIRO="$REPO/diagnostics"; mkdir -p "$DIRO"
STAMP=$(date +%Y%m%dT%H%M%S)
REPORT_JSON="$DIRO/eas-sim-report_${STAMP}.json"
REPORT_MD="$DIRO/eas-sim-report_${STAMP}.md"

echo "== Install deps =="
[ -f package.json ] || { echo "No package.json in $REPO"; exit 1; }
[ -f package-lock.json ] && npm ci || npm i

echo "== Run EAS worker simulation tests (db-free) =="
# Use vitest in CI mode with JSON output
npx --yes vitest run --reporter=default --reporter=json --outputFile "$REPORT_JSON"

echo "== Build simulation report =="
node - <<'JS' "$REPORT_JSON" "$REPORT_MD"
const fs = require('fs');

const [reportPath, outPath] = process.argv.slice(2);
let data;
try { data = JSON.parse(fs.readFileSync(reportPath,'utf8')); }
catch(e){ console.error("Failed to read vitest JSON:", e.message); process.exit(1); }

const suites = (data.testResults||[]).map(s => ({
  file: s.name,
  tests: (s.assertionResults||[]).map(t => ({
    title: t.title || t.fullName || 'test',
    status: t.status || 'unknown',
    durationMs: t.duration || 0
  }))
}));

const flat = suites.flatMap(s => s.tests);
const pass = flat.filter(t=>t.status==='passed').length;
const fail = flat.filter(t=>t.status==='failed').length;
const total = flat.length;
const dur = (data.startTime && data.numTotalTests)
  ? Math.round(((data.endTime||Date.now()) - data.startTime))
  : flat.reduce((a,t)=>a+(t.durationMs||0),0);

const liveTx = process.env.LIVE_TX || '0x9f9fa10545300e66636b75612f9b86b37652712c1c1c06118af6a6277bc280f4';
const chainIdHex = '0x14a34'; // Base Sepolia
const easContract = '0x4200000000000000000000000000000000000021';
const schemaReg   = '0x4200000000000000000000000000000000000020';

const md = []
md.push(`# EAS Worker Simulation Report`);
md.push('');
md.push(`**Run:** ${new Date().toISOString()}`);
md.push(`**Test Suites:** ${suites.length}`);
md.push(`**Tests:** ${total}  ·  **Passed:** ${pass}  ·  **Failed:** ${fail}  ·  **Duration:** ~${dur} ms`);
md.push('');
md.push(`## Scope & Goal`);
md.push(`- Validate the EAS attestation worker logic in a DB-free environment (pg-mem)`);
md.push(`- Prove the state machine: \`pending → attesting → onchain\``);
md.push(`- Verify transition effects on \`receipts\` row: \`attestation_status\`, \`attestation_uid\`, \`attestation_tx\`, \`proof_ref\``);
md.push('');
md.push(`## Live Tx Reference (for real-world anchoring)`);
md.push(`- **Network:** Base Sepolia (\`${chainIdHex}\`)`);
md.push(`- **Example tx hash:** \`${liveTx}\``);
md.push(`- Explorer: https://sepolia.basescan.org/tx/${liveTx}`);
md.push('');
md.push(`In a real run, the worker will embed the tx hash in \`proof_ref\` and call EAS at:`);
md.push(`- **EAS contract:** \`${easContract}\``);
md.push(`- **Schema registry:** \`${schemaReg}\``);
md.push(`The worker signs & submits an EIP-712 attestation, awaits 1 confirmation, then updates the DB row to \`onchain\` with \`attestation_uid\` and \`attestation_tx\`.`);
md.push('');
md.push(`## Test Suite Results`);
suites.forEach(s=>{
  md.push(`### ${s.file}`);
  s.tests.forEach(t=>{
    const badge = t.status==='passed' ? '🟢' : (t.status==='failed' ? '🔴' : '⚪');
    md.push(`- ${badge} **${t.title}**  _( ${t.durationMs || 0} ms )_`);
  });
  md.push('');
});

md.push(`## Expected Real-Env Outcome (when infra is available)`);
md.push(`1. **Self-Tx**: a 0-ETH self transfer confirms on Base Sepolia; the helper prints the tx hash & BaseScan link.`);
md.push(`2. **DB + Worker**: Postgres (migrated) and worker are up; a \`pending\` receipt is inserted with \`proof_ref: ${liveTx}\`.`);
md.push(`3. **EAS Call**: worker posts attestation to \`${easContract}\` (schema in \`${schemaReg}\`), waits 1 conf → gets \`attestation_tx\` and \`attestation_uid\`.`);
md.push(`4. **Receipt On-Chain**: row is updated: \`attestation_status='onchain'\`, \`attestation_uid=0x…\`, \`attestation_tx=0x…\`.`);
md.push(`5. **Quality Gate**: with \`require_attested:true\`, metrics gate remains green (grace 300s, min confidence ≥0.85).`);

fs.writeFileSync(outPath, md.join('\n')+'\n','utf8');
console.log(`Report written: ${outPath}`);
JS

echo "== done =="
echo "JSON: $REPORT_JSON"
echo "MD  : $REPORT_MD"
