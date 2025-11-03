'use strict';

const DEFAULT_CHAIN_ID = '0x14a34';

const normalizeHex = (value) => (typeof value === 'string' ? value.toLowerCase() : '');

const parseCliArgs = (argv) => {
  const positionals = [];
  const flags = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (typeof arg !== 'string') {
      continue;
    }

    if (arg === '--') {
      positionals.push(...argv.slice(index + 1));
      break;
    }

    if (!arg.startsWith('--')) {
      positionals.push(arg);
      continue;
    }

    const separatorIndex = arg.indexOf('=');
    if (separatorIndex !== -1) {
      const key = arg.slice(2, separatorIndex);
      const value = arg.slice(separatorIndex + 1);
      flags[key] = value === '' ? true : value;
      continue;
    }

    const key = arg.slice(2);
    const next = argv[index + 1];

    if (typeof next === 'string' && next !== '--' && !next.startsWith('-')) {
      flags[key] = next;
      index += 1;
    } else {
      flags[key] = true;
    }
  }

  return { positionals, flags };
};

const normalizeCandidate = (value) => (value === undefined || value === null ? undefined : String(value));

const pickInput = ({
  envKey,
  flagKeys,
  flags,
  positionals,
  index,
  name,
  positionalTest,
  optional = false,
  fallback
}) => {
  const candidates = [];

  if (Array.isArray(flagKeys) && flags) {
    for (const key of flagKeys) {
      if (Object.prototype.hasOwnProperty.call(flags, key)) {
        candidates.push(flags[key]);
        break;
      }
    }
  } else if (flagKeys && flags && Object.prototype.hasOwnProperty.call(flags, flagKeys)) {
    candidates.push(flags[flagKeys]);
  }

  if (envKey && process.env[envKey]) {
    candidates.push(process.env[envKey]);
  }

  if (typeof index === 'number' && positionals && Object.prototype.hasOwnProperty.call(positionals, index)) {
    candidates.push(positionals[index]);
  }

  if (typeof positionalTest === 'function' && positionals) {
    const match = positionals.find((value, valueIndex) => {
      if (typeof index === 'number' && valueIndex === index) {
        return false;
      }
      return positionalTest(value);
    });

    if (match !== undefined) {
      candidates.push(match);
    }
  }

  if (fallback !== undefined) {
    candidates.push(fallback);
  }

  const resolved = candidates
    .map(normalizeCandidate)
    .find((candidate) => candidate && candidate !== 'true');

  if (!resolved) {
    if (optional) {
      return undefined;
    }
    throw new Error(`Missing ${name}`);
  }

  return resolved;
};

const extractErrorMessage = (error) => {
  if (!error) {
    return 'Unknown error';
  }

  if (error.info && error.info.error && error.info.error.message) {
    return error.info.error.message;
  }

  if (error.error && error.error.message) {
    return error.error.message;
  }

  let message = error.message || error.code || error.name || String(error);

  if (Array.isArray(error.errors) && error.errors.length > 0) {
    const nested = error.errors
      .map((inner) => extractErrorMessage(inner))
      .join('; ');
    message = `${message} (${nested})`;
  }

  return message;
};

const maskHex = (value) => {
  if (typeof value !== 'string') {
    return value;
  }
  return value.replace(/(0x[0-9a-fA-F]{6}).+/, '$1…');
};

const timestampForDiagnostics = () => new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);

const resolveExpectedChainId = ({ flags } = {}) => normalizeHex(
  process.env.EXPECT_CHAIN_ID || (flags && flags['expect-chain-id']) || DEFAULT_CHAIN_ID
);

const shouldAllowChainMismatch = ({ flags } = {}) => {
  const truthyValues = new Set(['1', 'true', 'yes', 'on']);

  if (process.env.ALLOW_CHAIN_MISMATCH) {
    return truthyValues.has(process.env.ALLOW_CHAIN_MISMATCH.toLowerCase());
  }

  if (!flags) {
    return false;
  }

  const flagValue = flags['allow-chain-mismatch'];

  if (flagValue === true) {
    return true;
  }

  if (typeof flagValue === 'string') {
    return truthyValues.has(flagValue.toLowerCase());
  }

  return false;
};

const ensureChainId = (actual, expected, { allowMismatch } = {}) => {
  const normalizedActual = normalizeHex(actual);
  const normalizedExpected = normalizeHex(expected);

  if (!normalizedActual) {
    throw new Error('RPC did not return a chain id');
  }

  if (!normalizedExpected || normalizedActual === normalizedExpected || allowMismatch) {
    return normalizedActual;
  }

  throw new Error(`Unexpected chain id: ${normalizedActual} (expected ${normalizedExpected})`);
};

module.exports = {
  DEFAULT_CHAIN_ID,
  ensureChainId,
  extractErrorMessage,
  maskHex,
  normalizeHex,
  parseCliArgs,
  pickInput,
  resolveExpectedChainId,
  shouldAllowChainMismatch,
  timestampForDiagnostics
};
