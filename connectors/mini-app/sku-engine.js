// connectors/mini-app/sku-engine.js
// Minimal JS policy engine for BaseBytes Mini-App Connector (USDC payouts)

function clamp01(x){ return Math.max(0, Math.min(1, Number.isFinite(x)?x:0)); }
function num(v,d=0){ const n=Number(v); return Number.isFinite(n)?n:d; }

function decide(rawSku, features, policy='standard', cfg={}) {
  const strict = String(policy).toLowerCase()==='strict' || String(policy).toLowerCase()==='storm';
  const sku = String(rawSku).endsWith(':v1') ? String(rawSku) : `${rawSku}:v1`;
  const deny  = (why, conf=0.9)=>({ value: strict?'block':'warn', reasons:[].concat(why), confidence:conf, sku });
  const allow = (conf=0.92, reasons=[])=>({ value:'allow', reasons, confidence:conf, sku });

  const F = features||{};
  const caps = (cfg.caps||{});
  const cap = (k, d)=> (k in caps ? caps[k] : d);

  switch (sku){
    case 'defi:preTradeRisk:v1': {
      const w = num(F.walletAgeDays), n = num(F.notionalUsd), s = num(F.slippageBps), e = clamp01(F.pathEntropy);
      if ((w < 3 && n > 5000) || (e < 0.2 && s > 80)) return deny('new_wallet_or_low_entropy_high_notional');
      if (n > 10000 || s > 50) return deny('elevated_slippage_or_size', 0.8);
      return allow(0.93);
    }
    case 'bridge:provenance:v1': {
      if (F.mixerAdjacency || F.exploitAdjacency || F.sanctionedCluster) return deny('provenance_block');
      if (num(F.freshBridgeRisk) > 0.6) return deny('fresh_bridge_risk', 0.8);
      return allow(0.93);
    }
    case 'market:claimGuard:v1': {
      const b = num(F.claimBurst), max = cap('claimBurstMax', 20);
      if (b > max || !!F.disputeFlag) return deny(`claim_burst_or_dispute:${b}`, 0.9);
      if (num(F.freshFundsMins, Infinity) < 5) return deny('fresh_funds_low_delay', 0.8);
      return allow(0.94);
    }
    default:
      return allow(0.9, ['default']);
  }
}

module.exports = { decide };
