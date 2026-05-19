import { describe, it, expect } from 'vitest';
import {
  getLensRegistry,
  getLens,
  applyLens,
  LENS_FULL,
  LENS_TRUST_ONLY,
  LENS_HIGH_CONVICTION,
  LENS_RECENT,
  LENS_SOCIAL,
  LENS_PROFESSIONAL,
} from '../lenses/index.js';
import type { AttestationEdge } from '../types/index.js';

function makeEdge(overrides?: Partial<AttestationEdge>): AttestationEdge {
  return {
    from: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    to: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    predicate: 'trusts',
    stake_amount: 10,
    triple_id: 'triple-x',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe('getLensRegistry', () => {
  it('includes all six built-in lenses', () => {
    const ids = getLensRegistry().map(l => l.id).sort();
    expect(ids).toEqual([
      'full',
      'high-conviction',
      'professional',
      'recent',
      'social',
      'trust-only',
    ]);
  });

  it('returns a defensive copy (callers cannot mutate the registry)', () => {
    const first = getLensRegistry();
    first.push({ id: 'evil', name: 'x', description: 'x' });
    const second = getLensRegistry();
    expect(second.map(l => l.id)).not.toContain('evil');
  });
});

describe('getLens', () => {
  it('returns the lens by id', () => {
    expect(getLens('full')).toBe(LENS_FULL);
    expect(getLens('social')).toBe(LENS_SOCIAL);
    expect(getLens('professional')).toBe(LENS_PROFESSIONAL);
  });

  it('throws with helpful message on unknown id', () => {
    expect(() => getLens('nope')).toThrow(/Unknown lens "nope"/);
    expect(() => getLens('nope')).toThrow(/social/);
    expect(() => getLens('nope')).toThrow(/professional/);
  });
});

describe('LENS_SOCIAL predicate weights', () => {
  it('weights trusts and follow above professional predicates', () => {
    const w = LENS_SOCIAL.predicateWeights;
    expect(w).toBeDefined();
    expect(w!['trusts']).toBeGreaterThan(w!['collaborates with']);
    expect(w!['follow']).toBeGreaterThan(w!['visits for work']);
  });
});

describe('LENS_PROFESSIONAL predicate weights', () => {
  it('weights collaborates with and visits for work above social predicates', () => {
    const w = LENS_PROFESSIONAL.predicateWeights;
    expect(w).toBeDefined();
    expect(w!['collaborates with']).toBeGreaterThan(w!['follow']);
    expect(w!['visits for work']).toBeGreaterThan(w!['visits for fun']);
  });
});

describe('applyLens (regression -- ensures predicateWeights does not change filtering)', () => {
  it('LENS_SOCIAL does not filter edges by predicate (no predicateFilter set)', () => {
    const edges = [
      makeEdge({ predicate: 'trusts' }),
      makeEdge({ predicate: 'follow' }),
      makeEdge({ predicate: 'visits for work' }),
    ];
    expect(applyLens(LENS_SOCIAL, edges)).toHaveLength(3);
  });

  it('LENS_TRUST_ONLY still filters by predicate', () => {
    const edges = [
      makeEdge({ predicate: 'trusts' }),
      makeEdge({ predicate: 'follow' }),
    ];
    const filtered = applyLens(LENS_TRUST_ONLY, edges);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].predicate).toBe('trusts');
  });

  it('LENS_HIGH_CONVICTION still applies stake threshold', () => {
    const edges = [
      makeEdge({ predicate: 'trusts', stake_amount: 50 }),
      makeEdge({ predicate: 'trusts', stake_amount: 500 }),
    ];
    const filtered = applyLens(LENS_HIGH_CONVICTION, edges);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].stake_amount).toBe(500);
  });

  it('LENS_RECENT excludes edges older than maxAgeDays', () => {
    const old = new Date(Date.now() - 200 * 86400 * 1000).toISOString();
    const fresh = new Date().toISOString();
    const filtered = applyLens(LENS_RECENT, [
      makeEdge({ timestamp: old }),
      makeEdge({ timestamp: fresh }),
    ]);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].timestamp).toBe(fresh);
  });
});
