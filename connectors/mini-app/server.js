#!/usr/bin/env node
'use strict';
// BaseBytes Mini-App Connector — Fastify + Prometheus + USDC payouts

const fastify = require('fastify');
const rateLimit = require('@fastify/rate-limit');
const cors = require('@fastify/cors');
const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const prom = require('prom-client');
const { decide } = require('./sku-engine');
const { sendUsdc } = require('./payout');

// config
const MINI_PORT    = Number(process.env.MINI_PORT || 8787);
const MINI_API_KEY = process.env.MINI_API_KEY || ''; // optional x-api-key for partners
const POLICY       = (process.env.POLICY || 'standard').toLowerCase();
const POLICY_CAPS  = safeJSON(process.env.POLICY_CAPS);
const DB_URL       = process.env.DATABASE_URL || '';
const PAYOUTS_MODE = (process.env.PAYOUTS_MODE || 'simulate').toLowerCase(); // simulate|live
const RPC_URL      = process.env.RPC_URL || '';
const PAYOUT_SIGNER_PK = process.env.PAYOUT_SIGNER_PK || process.env.SPLITS_SIGNER_PK || '';
const USDC_ADDRESS = process.env.USDC_ADDRESS || ''; // e.g., Base mainnet USDC: 0x833589fcd6edb6...
const USDC_DECIMALS = process.env.USDC_DECIMALS ? Number(process.env.USDC_DECIMALS) : undefined;

// app
const app = fastify({ logger: true });
app.register(cors, { origin: true });
app.register(rateLimit, { max: Number(process.env.MINI_RPS || 20), timeWindow: '1 minute' });

// metrics
const registry = new prom.Registry();
prom.collectDefaultMetrics({ register: registry });
const cReq   = new prom.Counter({ name:'bb_mini_requests_total', help:'Mini connector requests', labelNames:['route','result']});
const hLat   = new prom.Histogram({ name:'bb_mini_latency_ms', help:'Mini connector latency', buckets:[50,100,250,500,1000,2000,5000]});
const cPayout= new prom.Counter({ name:'bb_payout_requests_total', help:'Payout requests', labelNames:['result']});
const sPayout= new prom.Summary({ name:'bb_payout_usdc_amount', help:'Payout amount (USDC base units)'});
registry.registerMetric(cReq); registry.registerMetric(hLat); registry.registerMetric(cPayout); registry.registerMetric(sPayout);

// health/metrics
app.get('/healthz', async (_, r)=> r.send({ ok:true, ts:new Date().toISOString() }));
app.get('/metrics', async (_, r)=> r.header('content-type', registry.contentType).send(await registry.metrics()));
app.get('/readyz',  async (_, r)=> {
  const db = await probeDb();
  r.send({
    ok: !DB_URL || db.ok,
    database: DB_URL ? (db.ok ? 'ok' : 'down') : 'not_configured',
    backlog: db.backlog ?? null,
    payoutsMode: PAYOUTS_MODE,
    usdcConfigured: Boolean(USDC_ADDRESS && (PAYOUTS_MODE==='simulate' || (RPC_URL && PAYOUT_SIGNER_PK))),
    ts: new Date().toISOString()
  });
});

// decision
app.post('/mini/decision', async (req, reply)=>{
  const stop = hLat.startTimer();
  try {
    if (MINI_API_KEY && req.headers['x-api-key'] !== MINI_API_KEY) {
      cReq.inc({route:'decision',result:'unauthorized'});
      return reply.code(401).send({ error:'unauthorized' });
    }
    const { sku, appId, subject, features, privacy } = req.body || {};
    if (!sku || !appId || !subject || !features) {
      cReq.inc({route:'decision',result:'bad_request'});
      return reply.code(400).send({ error:'invalid_payload', details:'require sku, appId, subject, features' });
    }
    const decision = decide(String(sku), features, POLICY, { caps: POLICY_CAPS });
    const receiptUid = 'rcpt_' + randomUUID().replace(/-/g,'').slice(0,24);
    const ts = new Date().toISOString();

    let persisted = { kind:'memory' };
    if (DB_URL) {
      try {
        await insertReceipt({
          receiptUid, ts, appId, sku: decision.sku || sku,
          decision: decision.value, confidence: decision.confidence,
          reasons: JSON.stringify(decision.reasons || []),
          subject, features: JSON.stringify(features),
          privacy: JSON.stringify(privacy || {}),
          policyVersion: process.env.POLICY_VERSION || 'v1'
        });
        persisted = { kind:'db', receiptUid };
      } catch (e) {
        app.log.error({ err:e }, 'db_insert_failed');
        persisted = { kind:'error', error: e.message };
      }
    } else {
      const dir = path.join(process.cwd(),'diagnostics'); try { fs.mkdirSync(dir,{recursive:true}); } catch {}
      const file = path.join(dir, `receipt_${receiptUid}.json`);
      fs.writeFileSync(file, JSON.stringify({ ts, appId, sku, subject, decision, features, privacy, policy: POLICY }, null, 2));
      persisted = { kind:'file', file };
    }

    cReq.inc({route:'decision',result:decision.value});
    stop();
    reply.send({
      ok:true,
      receiptUid,
      decision: decision.value,
      confidence: decision.confidence,
      reasons: decision.reasons || [],
      policyVersion: process.env.POLICY_VERSION || 'v1',
      payout: { status: 'not_requested' },
      persisted
    });
  } catch (e) {
    stop(); cReq.inc({route:'decision',result:'error'});
    app.log.error({ err:e }, 'decision_error');
    reply.code(500).send({ error:'internal_error', message: e.message });
  }
});

// payout (USDC)
app.post('/mini/payout', async (req, reply)=>{
  const stop = hLat.startTimer();
  try {
    if (MINI_API_KEY && req.headers['x-api-key'] !== MINI_API_KEY) {
      cReq.inc({route:'payout',result:'unauthorized'});
      return reply.code(401).send({ error:'unauthorized' });
    }
    const { appId, receiptUid, to, amountUsd, amountUSDC, idempotencyKey } = req.body || {};
    if (!appId || !to || (!amountUsd && !amountUSDC)) {
      cReq.inc({route:'payout',result:'bad_request'});
      return reply.code(400).send({ error:'invalid_payload', details:'require appId,to and amountUsd|amountUSDC' });
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(String(to))) {
      cReq.inc({route:'payout',result:'bad_address'});
      return reply.code(400).send({ error:'invalid_address' });
    }

    // idempotency
    const idemId = idempotencyKey || `idem_${receiptUid || randomUUID()}`;
    const idemFile = path.join(process.cwd(),'diagnostics',`payout_${idemId}.json`);
    if (fs.existsSync(idemFile)) {
      const prior = safeJSON(fs.readFileSync(idemFile,'utf8'));
      cReq.inc({route:'payout',result: prior.status || 'repeat'});
      stop();
      return reply.send({ ok:true, idempotencyKey: idemId, ...prior });
    }

    let res;
    if (PAYOUTS_MODE === 'live') {
      res = await sendUsdc({
        mode: 'live',
        rpcUrl: RPC_URL,
        signerKey: PAYOUT_SIGNER_PK,
        usdcAddress: USDC_ADDRESS,
        to,
        amountUsd: amountUSDC ? (Number(amountUSDC) / 1e6) : Number(amountUsd),
        usdcDecimals: USDC_DECIMALS
      });
    } else {
      // simulate = produce JSON artifact only
      const simulated = String(amountUSDC ?? Math.round(Number(amountUsd) * 1e6));
      res = { status:'queued', amountUSDC: simulated, note:'simulate' };
    }

    const out = {
      ts: new Date().toISOString(),
      appId, receiptUid: receiptUid || null,
      to, mode: PAYOUTS_MODE,
      amountUSDC: res.amountUSDC || String(amountUSDC ?? Math.round(Number(amountUsd)*1e6)),
      status: res.status, txHash: res.txHash || null, chainId: res.chainId || null, note: res.note || null
    };
    try { fs.mkdirSync(path.dirname(idemFile), { recursive:true }); } catch {}
    fs.writeFileSync(idemFile, JSON.stringify(out, null, 2));

    cPayout.inc({ result: out.status });
    const asNum = Number(out.amountUSDC || 0);
    if (Number.isFinite(asNum)) sPayout.observe(asNum);

    stop();
    reply.send({ ok: out.status==='sent' || out.status==='queued', idempotencyKey: idemId, payout: out });
  } catch (e) {
    stop(); cReq.inc({route:'payout',result:'error'});
    app.log.error({ err:e }, 'payout_error');
    reply.code(500).send({ error:'internal_error', message: e.message });
  }
});

// helpers
function safeJSON(s){ try { return JSON.parse(typeof s==='string'?s:JSON.stringify(s)); } catch { return {}; } }
async function probeDb(){
  if (!DB_URL) return { ok:false, reason:'no_db' };
  const c = new Client({ connectionString: DB_URL, ssl: DB_URL.includes('sslmode=require') ? { rejectUnauthorized:false } : undefined });
  try {
    await c.connect();
    const r = await c.query(`select count(*)::int as c from receipts where coalesce(attestation_status,'pending') not in ('onchain','skipped')`);
    return { ok:true, backlog: Number(r.rows?.[0]?.c || 0) };
  } catch (e) {
    return { ok:false, reason: String(e && e.message || e) };
  } finally {
    try { await c.end(); } catch {}
  }
}
async function insertReceipt(row){
  const c = new Client({ connectionString: DB_URL, ssl: DB_URL.includes('sslmode=require') ? { rejectUnauthorized:false } : undefined });
  await c.connect();
  try {
    await c.query(`
      insert into receipts (
        receipt_uid, ts, app_id, sku, decision, confidence, reasons,
        feature_commitment, features_hash, privacy_mode, zk_scheme, proof_ref, evidence_set, policy_version, attestation_status
      ) values (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'pending'
      ) on conflict (receipt_uid) do nothing
    `, [
      row.receiptUid, row.ts, row.appId, row.sku,
      row.decision, row.confidence, row.reasons,
      '0x' + 'a'.repeat(64), '0x' + 'b'.repeat(64),
      (safeJSON(row.privacy).mode || 'public'),
      (safeJSON(row.privacy).zkScheme || ''),
      (safeJSON(row.privacy).proof_ref || null),
      JSON.stringify((safeJSON(row.privacy).evidence_set || [])),
      row.policyVersion
    ]);
  } finally {
    await c.end();
  }
}

app.listen({ port: MINI_PORT, host: '0.0.0.0' })
  .then(addr => app.log.info({ addr }, 'mini-app connector up'))
  .catch(err => { app.log.error(err); process.exit(1); });
