import { describe, it, expect } from 'vitest';
import { parseAddressList } from '../utils/parse-addresses.js';

describe('parseAddressList', () => {
  it('returns an array as-is, trimmed and filtered', () => {
    expect(parseAddressList(['  0xa  ', '0xb', '', '0xc'])).toEqual(['0xa', '0xb', '0xc']);
  });

  it('drops non-string entries from an array', () => {
    expect(parseAddressList(['0xa', 123, null, '0xb'])).toEqual(['0xa', '0xb']);
  });

  it('parses a JSON-array string', () => {
    expect(parseAddressList('["0xa", "0xb", "0xc"]')).toEqual(['0xa', '0xb', '0xc']);
  });

  it('falls back to delimiter parsing on malformed JSON-array string', () => {
    // Starts with '[' so we try JSON.parse, that throws, then we split.
    expect(parseAddressList('[not, valid')).toEqual(['[not', 'valid']);
  });

  it('returns delimiter-split when input does not start with [', () => {
    expect(parseAddressList('true')).toEqual(['true']);
  });

  it('parses comma-separated string', () => {
    expect(parseAddressList('0xa, 0xb, 0xc')).toEqual(['0xa', '0xb', '0xc']);
  });

  it('parses space-separated string', () => {
    expect(parseAddressList('0xa 0xb 0xc')).toEqual(['0xa', '0xb', '0xc']);
  });

  it('parses mixed space/comma separators', () => {
    expect(parseAddressList('0xa,0xb 0xc,  0xd')).toEqual(['0xa', '0xb', '0xc', '0xd']);
  });

  it('returns [] for empty string', () => {
    expect(parseAddressList('')).toEqual([]);
    expect(parseAddressList('   ')).toEqual([]);
  });

  it('returns [] for non-string/non-array', () => {
    expect(parseAddressList(undefined)).toEqual([]);
    expect(parseAddressList(null)).toEqual([]);
    expect(parseAddressList(42)).toEqual([]);
    expect(parseAddressList({})).toEqual([]);
  });

  it('handles a single address with no delimiters', () => {
    expect(parseAddressList('0xabc')).toEqual(['0xabc']);
  });
});
