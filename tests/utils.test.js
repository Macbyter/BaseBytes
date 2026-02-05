import { describe, it, expect } from 'vitest';
import utils from '../scripts/utils.js';

const { parseCliArgs } = utils;

describe('parseCliArgs', () => {
  it('parses dashed values as flag values when provided as the next token', () => {
    const { flags } = parseCliArgs(['--amount', '-1', '--to', '0xabc']);

    expect(flags.amount).toBe('-1');
    expect(flags.to).toBe('0xabc');
  });

  it('keeps next flag token as boolean flag when no explicit value is provided', () => {
    const { flags } = parseCliArgs(['--dry', '--rpc', 'https://example-rpc']);

    expect(flags.dry).toBe(true);
    expect(flags.rpc).toBe('https://example-rpc');
  });
});
