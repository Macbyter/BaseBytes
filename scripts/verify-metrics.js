#!/usr/bin/env node
/**
 * Verify metrics/thresholds.json configuration
 * Validates schema, EAS addresses, and threshold values
 */

const fs = require('fs');
const path = require('path');

const THRESHOLDS_PATH = path.join(__dirname, '../metrics/thresholds.json');
const BASE_SEPOLIA_CHAIN_ID = '0x14a34';
const EAS_CONTRACT = '0x4200000000000000000000000000000000000021';
const SCHEMA_REGISTRY = '0x4200000000000000000000000000000000000020';

function main() {
  console.log('🔍 Verifying metrics/thresholds.json...\n');

  // Check file exists
  if (!fs.existsSync(THRESHOLDS_PATH)) {
    console.error('❌ ERROR: metrics/thresholds.json not found');
    process.exit(1);
  }

  // Parse JSON
  let config;
  try {
    const content = fs.readFileSync(THRESHOLDS_PATH, 'utf8');
    config = JSON.parse(content);
    console.log('✅ JSON syntax valid');
  } catch (err) {
    console.error('❌ ERROR: Invalid JSON:', err.message);
    process.exit(1);
  }

  // Validate structure
  const errors = [];
  const warnings = [];

  if (!config.thresholds) {
    errors.push('Missing required field: thresholds');
  } else {
    // Check threshold values
    if (typeof config.thresholds.require_attested !== 'boolean') {
      errors.push('thresholds.require_attested must be boolean');
    }
    if (typeof config.thresholds.min_confidence !== 'number') {
      errors.push('thresholds.min_confidence must be number');
    } else if (config.thresholds.min_confidence < 0 || config.thresholds.min_confidence > 1) {
      errors.push('thresholds.min_confidence must be between 0 and 1');
    }
    if (typeof config.thresholds.max_response_time_ms !== 'number') {
      warnings.push('thresholds.max_response_time_ms should be a number');
    }
  }

  if (!config.eas) {
    errors.push('Missing required field: eas');
  } else {
    // Validate EAS configuration
    if (config.eas.chain_id !== BASE_SEPOLIA_CHAIN_ID) {
      errors.push(`eas.chain_id must be ${BASE_SEPOLIA_CHAIN_ID} (Base Sepolia)`);
    }
    if (config.eas.contract !== EAS_CONTRACT) {
      errors.push(`eas.contract must be ${EAS_CONTRACT}`);
    }
    if (config.eas.schema_registry !== SCHEMA_REGISTRY) {
      errors.push(`eas.schema_registry must be ${SCHEMA_REGISTRY}`);
    }
    if (config.eas.enabled !== true) {
      warnings.push('eas.enabled is not true - EAS features will be disabled');
    }
  }

  if (!config.validation) {
    errors.push('Missing required field: validation');
  } else {
    if (typeof config.validation.enforce_chain_id !== 'boolean') {
      errors.push('validation.enforce_chain_id must be boolean');
    }
    if (typeof config.validation.reject_unattested !== 'boolean') {
      errors.push('validation.reject_unattested must be boolean');
    }
    if (typeof config.validation.grace_period_seconds !== 'number') {
      errors.push('validation.grace_period_seconds must be number');
    } else if (config.validation.grace_period_seconds < 0) {
      errors.push('validation.grace_period_seconds must be non-negative');
    }
  }

  // Print results
  console.log('\n📋 Configuration Summary:');
  console.log(`  require_attested: ${config.thresholds?.require_attested}`);
  console.log(`  min_confidence: ${config.thresholds?.min_confidence}`);
  console.log(`  chain_id: ${config.eas?.chain_id}`);
  console.log(`  grace_period: ${config.validation?.grace_period_seconds}s`);
  console.log(`  reject_unattested: ${config.validation?.reject_unattested}`);

  if (warnings.length > 0) {
    console.log('\n⚠️  Warnings:');
    warnings.forEach(w => console.log(`  - ${w}`));
  }

  if (errors.length > 0) {
    console.log('\n❌ Errors:');
    errors.forEach(e => console.log(`  - ${e}`));
    console.log('\n❌ Validation FAILED\n');
    process.exit(1);
  }

  console.log('\n✅ Validation PASSED\n');
  process.exit(0);
}

main();
