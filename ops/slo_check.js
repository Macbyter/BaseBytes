#!/usr/bin/env node
/**
 * BaseBytes — SLO Guard
 * Validates service-level objectives for production readiness
 * 
 * Usage: node ops/slo_check.js [--metrics-file path/to/metrics.json]
 */

const fs = require('fs');
const path = require('path');

// SLO Thresholds
const SLO = {
  p95_latency_ms: 60000,      // Max p95 latency: 60s
  attested_rate: 0.995,        // Min attested rate: 99.5%
  worker_backlog: 100,         // Max pending receipts: 100
  error_rate: 0.05,            // Max error rate: 5%
};

function loadMetrics(filePath) {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error(`❌ Failed to load metrics from ${filePath}: ${err.message}`);
    process.exit(1);
  }
}

function checkSLO(metrics) {
  const violations = [];
  
  // Check p95 latency
  if (metrics.p95_latency_ms && metrics.p95_latency_ms > SLO.p95_latency_ms) {
    violations.push({
      metric: 'p95_latency_ms',
      value: metrics.p95_latency_ms,
      threshold: SLO.p95_latency_ms,
      message: `P95 latency ${metrics.p95_latency_ms}ms exceeds threshold ${SLO.p95_latency_ms}ms`
    });
  }
  
  // Check attested rate
  if (metrics.attested_rate !== undefined && metrics.attested_rate < SLO.attested_rate) {
    violations.push({
      metric: 'attested_rate',
      value: metrics.attested_rate,
      threshold: SLO.attested_rate,
      message: `Attested rate ${(metrics.attested_rate * 100).toFixed(2)}% below threshold ${(SLO.attested_rate * 100).toFixed(2)}%`
    });
  }
  
  // Check worker backlog
  if (metrics.worker_backlog && metrics.worker_backlog > SLO.worker_backlog) {
    violations.push({
      metric: 'worker_backlog',
      value: metrics.worker_backlog,
      threshold: SLO.worker_backlog,
      message: `Worker backlog ${metrics.worker_backlog} exceeds threshold ${SLO.worker_backlog}`
    });
  }
  
  // Check error rate
  if (metrics.error_rate !== undefined && metrics.error_rate > SLO.error_rate) {
    violations.push({
      metric: 'error_rate',
      value: metrics.error_rate,
      threshold: SLO.error_rate,
      message: `Error rate ${(metrics.error_rate * 100).toFixed(2)}% exceeds threshold ${(SLO.error_rate * 100).toFixed(2)}%`
    });
  }
  
  return violations;
}

function generateStubMetrics() {
  // Generate stub metrics for testing
  return {
    timestamp: new Date().toISOString(),
    p95_latency_ms: 15000,
    attested_rate: 1.0,
    worker_backlog: 0,
    error_rate: 0.0,
    total_receipts: 100,
    attested_receipts: 100,
    pending_receipts: 0,
    failed_receipts: 0,
    source: 'stub'
  };
}

function main() {
  const args = process.argv.slice(2);
  let metricsFile = null;
  
  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--metrics-file' && i + 1 < args.length) {
      metricsFile = args[i + 1];
      i++;
    }
  }
  
  // Load or generate metrics
  let metrics;
  if (metricsFile) {
    if (!fs.existsSync(metricsFile)) {
      console.error(`❌ Metrics file not found: ${metricsFile}`);
      process.exit(1);
    }
    metrics = loadMetrics(metricsFile);
  } else {
    // Use stub metrics if no file provided
    console.log('⚠️  No metrics file provided, using stub metrics');
    metrics = generateStubMetrics();
  }
  
  console.log('\n=== SLO Guard Check ===');
  console.log(`Timestamp: ${metrics.timestamp || new Date().toISOString()}`);
  console.log(`Source: ${metrics.source || 'unknown'}\n`);
  
  // Display current metrics
  console.log('Current Metrics:');
  console.log(`  P95 Latency: ${metrics.p95_latency_ms || 'N/A'}ms (threshold: ${SLO.p95_latency_ms}ms)`);
  console.log(`  Attested Rate: ${metrics.attested_rate !== undefined ? (metrics.attested_rate * 100).toFixed(2) : 'N/A'}% (threshold: ${(SLO.attested_rate * 100).toFixed(2)}%)`);
  console.log(`  Worker Backlog: ${metrics.worker_backlog !== undefined ? metrics.worker_backlog : 'N/A'} (threshold: ${SLO.worker_backlog})`);
  console.log(`  Error Rate: ${metrics.error_rate !== undefined ? (metrics.error_rate * 100).toFixed(2) : 'N/A'}% (threshold: ${(SLO.error_rate * 100).toFixed(2)}%)\n`);
  
  // Check SLO
  const violations = checkSLO(metrics);
  
  if (violations.length === 0) {
    console.log('✅ All SLO checks passed');
    process.exit(0);
  } else {
    console.log(`❌ ${violations.length} SLO violation(s) detected:\n`);
    violations.forEach((v, i) => {
      console.log(`${i + 1}. ${v.message}`);
      console.log(`   Metric: ${v.metric}`);
      console.log(`   Value: ${v.value}`);
      console.log(`   Threshold: ${v.threshold}\n`);
    });
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { checkSLO, SLO };
