import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  calculatePathTrust,
  normalizeStake,
  getPathsFromCypherResult,
  findTrustPaths,
  findOutgoingTrustPaths,
} from '../pathfinding.js';
import type { TrustPath } from '../types.js';

// Mock Neo4j session
const mockRun = vi.fn();
const mockClose = vi.fn();
vi.mock('../../config/neo4j.js', () => ({
  getSession: () => ({ run: mockRun, close: mockClose }),
}));

vi.mock('../../utils/logger.js', () => ({
  log: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// ============ calculatePathTrust ============

describe('calculatePathTrust', () => {
  it('returns 0 for empty predicates', () => {
    const path: TrustPath = {
      addresses: ['0xA', '0xB'],
      predicates: [],
      stakes: [],
      totalDecay: 1,
    };

    expect(calculatePathTrust(path)).toBe(0);
  });

  it('returns 0 for empty stakes', () => {
    const path: TrustPath = {
      addresses: ['0xA', '0xB'],
      predicates: ['trusts'],
      stakes: [],
      totalDecay: 1,
    };

    expect(calculatePathTrust(path)).toBe(0);
  });

  it('computes single-hop path trust correctly', () => {
    const stake = 1e15; // Reasonable stake
    const path: TrustPath = {
      addresses: ['0xA', '0xB'],
      predicates: ['trusts'],
      stakes: [stake],
      totalDecay: 0.6,
    };

    const trust = calculatePathTrust(path);

    // trust = normalizeStake(stake) * predicateWeight('trusts') * 0.6^0
    // decay at hop 0 = 1.0, so trust = stakeWeight * 1.0 * 1.0
    const expectedStakeWeight = normalizeStake(stake);
    const expectedTrust = expectedStakeWeight * 1.0 * 1.0; // trusts weight = 1.0, decay^0 = 1
    expect(trust).toBeCloseTo(expectedTrust, 10);
  });

  it('applies exponential decay per hop (0.6^i)', () => {
    const stake = 1e15;
    const stakeWeight = normalizeStake(stake);

    // 1-hop path: decay^0 = 1
    const path1: TrustPath = {
      addresses: ['0xA', '0xB'],
      predicates: ['trusts'],
      stakes: [stake],
      totalDecay: 0.6,
    };

    // 2-hop path: hop0 decay = 1, hop1 decay = 0.6
    const path2: TrustPath = {
      addresses: ['0xA', '0xB', '0xC'],
      predicates: ['trusts', 'trusts'],
      stakes: [stake, stake],
      totalDecay: 0.36,
    };

    const trust1 = calculatePathTrust(path1, 0.6);
    const trust2 = calculatePathTrust(path2, 0.6);

    // 2-hop trust should be less than 1-hop
    expect(trust2).toBeLessThan(trust1);

    // Verify decay multiplication:
    // trust2 = (stakeWeight * 1.0 * 0.6^0) * (stakeWeight * 1.0 * 0.6^1)
    //        = stakeWeight^2 * 0.6
    const expectedTrust2 = stakeWeight * 1.0 * 1.0 * stakeWeight * 1.0 * 0.6;
    expect(trust2).toBeCloseTo(expectedTrust2, 10);
  });

  it('uses custom predicate weights when provided', () => {
    const stake = 1e15;
    const path: TrustPath = {
      addresses: ['0xA', '0xB'],
      predicates: ['trusts'],
      stakes: [stake],
      totalDecay: 0.6,
    };

    const defaultTrust = calculatePathTrust(path, 0.6);
    const customTrust = calculatePathTrust(path, 0.6, { trusts: 0.5 });

    // Custom weight 0.5 vs default 1.0 should halve the trust
    expect(customTrust).toBeCloseTo(defaultTrust * 0.5, 10);
  });

  it('falls back to constants.ts default when predicate not in custom weights', () => {
    const stake = 1e15;
    const path: TrustPath = {
      addresses: ['0xA', '0xB'],
      predicates: ['trusts'],
      stakes: [stake],
      totalDecay: 0.6,
    };

    // Pass custom weights that don't include 'trusts' -- should fall back to 1.0
    const trust = calculatePathTrust(path, 0.6, { follow: 0.9 });
    const defaultTrust = calculatePathTrust(path, 0.6);

    expect(trust).toBeCloseTo(defaultTrust, 10);
  });

  it('returns value clamped between 0 and 1', () => {
    const path: TrustPath = {
      addresses: ['0xA', '0xB'],
      predicates: ['trusts'],
      stakes: [1e30], // Enormous stake
      totalDecay: 0.6,
    };

    const trust = calculatePathTrust(path);
    expect(trust).toBeGreaterThanOrEqual(0);
    expect(trust).toBeLessThanOrEqual(1);
  });

  it('returns 0 for zero-stake path', () => {
    const path: TrustPath = {
      addresses: ['0xA', '0xB'],
      predicates: ['trusts'],
      stakes: [0],
      totalDecay: 0.6,
    };

    expect(calculatePathTrust(path)).toBe(0);
  });

  it('handles custom decay factor', () => {
    const stake = 1e15;
    const path: TrustPath = {
      addresses: ['0xA', '0xB', '0xC'],
      predicates: ['trusts', 'trusts'],
      stakes: [stake, stake],
      totalDecay: 0.81, // 0.9^2
    };

    const highDecay = calculatePathTrust(path, 0.9);
    const lowDecay = calculatePathTrust(path, 0.3);

    // Higher decay factor = more trust retained = higher value
    expect(highDecay).toBeGreaterThan(lowDecay);
  });
});

// ============ normalizeStake ============

describe('normalizeStake', () => {
  it('returns 0 for zero stake', () => {
    expect(normalizeStake(0)).toBe(0);
  });

  it('returns 0 for negative stake', () => {
    expect(normalizeStake(-100)).toBe(0);
  });

  it('returns value between 0 and 1 for positive stakes', () => {
    const testValues = [1, 100, 1e6, 1e12, 1e15, 1e18];
    for (const val of testValues) {
      const normalized = normalizeStake(val);
      expect(normalized).toBeGreaterThan(0);
      expect(normalized).toBeLessThanOrEqual(1);
    }
  });

  it('increases monotonically with stake', () => {
    const small = normalizeStake(100);
    const medium = normalizeStake(1e9);
    const large = normalizeStake(1e15);

    expect(medium).toBeGreaterThan(small);
    expect(large).toBeGreaterThan(medium);
  });

  it('approaches 1.0 near the log base (1e18)', () => {
    // log(1e18 + 1) / log(1e18) should be very close to 1
    const nearBase = normalizeStake(1e18);
    expect(nearBase).toBeCloseTo(1.0, 1);
  });
});

// ============ findTrustPaths (mocked Neo4j) ============

describe('findTrustPaths', () => {
  it('clamps maxHops between 1 and 10', async () => {
    // Pass maxHops = 0, should be clamped to 1
    mockRun.mockResolvedValueOnce({ records: [] });

    await findTrustPaths('0xA', '0xB', 0);

    const queryArg = mockRun.mock.calls[0][0] as string;
    expect(queryArg).toContain('*1..1');
  });

  it('clamps maxHops at upper bound of 10', async () => {
    mockRun.mockResolvedValueOnce({ records: [] });

    await findTrustPaths('0xA', '0xB', 50);

    const queryArg = mockRun.mock.calls[0][0] as string;
    expect(queryArg).toContain('*1..10');
  });

  it('lowercases addresses in query', async () => {
    mockRun.mockResolvedValueOnce({ records: [] });

    await findTrustPaths('0xAABB', '0xCCDD', 3);

    const params = mockRun.mock.calls[0][1] as Record<string, unknown>;
    expect(params.fromAddress).toBe('0xaabb');
    expect(params.toAddress).toBe('0xccdd');
  });

  it('returns empty result when no paths exist', async () => {
    mockRun.mockResolvedValueOnce({ records: [] });

    const result = await findTrustPaths('0xA', '0xB');

    expect(result.paths).toHaveLength(0);
    expect(result.strongestPath).toBeNull();
    expect(result.nodesVisited).toBe(0);
  });

  it('sorts paths by calculated trust descending', async () => {
    // Build mock path records with Neo4j-like structure
    const makePathRecord = (
      addresses: string[],
      predicates: string[],
      stakes: number[],
    ) => ({
      get: (key: string) => {
        if (key === 'path') {
          return {
            segments: addresses.slice(0, -1).map((addr, i) => ({
              start: { properties: { id: addr } },
              end: { properties: { id: addresses[i + 1] } },
              relationship: {
                properties: {
                  predicate: predicates[i],
                  stakeAmount: stakes[i],
                },
              },
            })),
          };
        }
        if (key === 'pathStake') return stakes.reduce((a, b) => a + b, 0);
        return null;
      },
    });

    mockRun.mockResolvedValueOnce({
      records: [
        // Low trust: small stake
        makePathRecord(['0xa', '0xb'], ['trusts'], [10]),
        // High trust: large stake
        makePathRecord(['0xa', '0xb'], ['trusts'], [1e15]),
      ],
    });

    const result = await findTrustPaths('0xA', '0xB');

    expect(result.paths.length).toBe(2);
    // Higher stake path should be first
    const trust0 = calculatePathTrust(result.paths[0]);
    const trust1 = calculatePathTrust(result.paths[1]);
    expect(trust0).toBeGreaterThanOrEqual(trust1);
  });

  it('sets strongestPath to the first sorted path', async () => {
    const makePathRecord = (stake: number) => ({
      get: (key: string) => {
        if (key === 'path') {
          return {
            segments: [{
              start: { properties: { id: '0xa' } },
              end: { properties: { id: '0xb' } },
              relationship: {
                properties: { predicate: 'trusts', stakeAmount: stake },
              },
            }],
          };
        }
        return stake;
      },
    });

    mockRun.mockResolvedValueOnce({
      records: [makePathRecord(10), makePathRecord(1e15)],
    });

    const result = await findTrustPaths('0xA', '0xB');

    expect(result.strongestPath).not.toBeNull();
    expect(result.strongestPath).toBe(result.paths[0]);
  });

  it('counts unique nodes visited', async () => {
    const makePathRecord = (addresses: string[]) => ({
      get: (key: string) => {
        if (key === 'path') {
          return {
            segments: addresses.slice(0, -1).map((addr, i) => ({
              start: { properties: { id: addr } },
              end: { properties: { id: addresses[i + 1] } },
              relationship: {
                properties: { predicate: 'trusts', stakeAmount: 100 },
              },
            })),
          };
        }
        return 100;
      },
    });

    mockRun.mockResolvedValueOnce({
      records: [
        makePathRecord(['0xa', '0xb', '0xc']),   // 3 nodes
        makePathRecord(['0xa', '0xd', '0xc']),   // shares 0xa and 0xc
      ],
    });

    const result = await findTrustPaths('0xA', '0xC');

    // Unique nodes: 0xa, 0xb, 0xc, 0xd = 4
    expect(result.nodesVisited).toBe(4);
  });

  it('passes custom predicateWeights through to trust calculation', async () => {
    const makePathRecord = (stake: number) => ({
      get: (key: string) => {
        if (key === 'path') {
          return {
            segments: [{
              start: { properties: { id: '0xa' } },
              end: { properties: { id: '0xb' } },
              relationship: {
                properties: { predicate: 'trusts', stakeAmount: stake },
              },
            }],
          };
        }
        return stake;
      },
    });

    // Default weights run
    mockRun.mockResolvedValueOnce({
      records: [makePathRecord(1e15)],
    });
    const defaultResult = await findTrustPaths('0xA', '0xB', 3);

    // Custom weights run -- halve 'trusts' weight
    mockRun.mockResolvedValueOnce({
      records: [makePathRecord(1e15)],
    });
    const customResult = await findTrustPaths('0xA', '0xB', 3, { trusts: 0.5 });

    // The paths contain the same data, but sorting used different weights
    // Both should return 1 path
    expect(defaultResult.paths).toHaveLength(1);
    expect(customResult.paths).toHaveLength(1);
  });

  it('closes session even on error', async () => {
    mockRun.mockRejectedValueOnce(new Error('Connection lost'));

    await expect(findTrustPaths('0xA', '0xB')).rejects.toThrow('Connection lost');
    expect(mockClose).toHaveBeenCalledOnce();
  });
});

// ============ getPathsFromCypherResult ============

describe('getPathsFromCypherResult', () => {
  it('returns empty array for empty records', () => {
    expect(getPathsFromCypherResult([])).toEqual([]);
  });

  it('skips records with null path', () => {
    const records = [{ get: () => null }] as any;
    expect(getPathsFromCypherResult(records)).toEqual([]);
  });

  it('skips records with missing segments', () => {
    const records = [{ get: () => ({}) }] as any;
    expect(getPathsFromCypherResult(records)).toEqual([]);
  });

  it('extracts addresses, predicates, stakes from valid path', () => {
    const records = [{
      get: (key: string) => {
        if (key === 'path') {
          return {
            segments: [{
              start: { properties: { id: '0xA' } },
              end: { properties: { id: '0xB' } },
              relationship: {
                properties: { predicate: 'trusts', stakeAmount: 500 },
              },
            }],
          };
        }
        return null;
      },
    }] as any;

    const paths = getPathsFromCypherResult(records);

    expect(paths).toHaveLength(1);
    expect(paths[0].addresses).toEqual(['0xA', '0xB']);
    expect(paths[0].predicates).toEqual(['trusts']);
    expect(paths[0].stakes).toEqual([500]);
  });

  it('defaults missing predicate to "unknown"', () => {
    const records = [{
      get: (key: string) => {
        if (key === 'path') {
          return {
            segments: [{
              start: { properties: { id: '0xA' } },
              end: { properties: { id: '0xB' } },
              relationship: { properties: { predicate: null, stakeAmount: 100 } },
            }],
          };
        }
        return null;
      },
    }] as any;

    const paths = getPathsFromCypherResult(records);
    expect(paths[0].predicates[0]).toBe('unknown');
  });

  it('handles Neo4j Integer stakeAmount via toNumber()', () => {
    const records = [{
      get: (key: string) => {
        if (key === 'path') {
          return {
            segments: [{
              start: { properties: { id: '0xA' } },
              end: { properties: { id: '0xB' } },
              relationship: {
                properties: {
                  predicate: 'trusts',
                  stakeAmount: { toNumber: () => 42 },
                },
              },
            }],
          };
        }
        return null;
      },
    }] as any;

    const paths = getPathsFromCypherResult(records);
    expect(paths[0].stakes[0]).toBe(42);
  });

  it('handles string stakeAmount by parsing to number', () => {
    const records = [{
      get: (key: string) => {
        if (key === 'path') {
          return {
            segments: [{
              start: { properties: { id: '0xA' } },
              end: { properties: { id: '0xB' } },
              relationship: {
                properties: {
                  predicate: 'trusts',
                  stakeAmount: '1500',
                },
              },
            }],
          };
        }
        return null;
      },
    }] as any;

    const paths = getPathsFromCypherResult(records);
    expect(paths[0].stakes[0]).toBe(1500);
  });

  it('returns 0 for non-parseable string stakeAmount', () => {
    const records = [{
      get: (key: string) => {
        if (key === 'path') {
          return {
            segments: [{
              start: { properties: { id: '0xA' } },
              end: { properties: { id: '0xB' } },
              relationship: {
                properties: {
                  predicate: 'trusts',
                  stakeAmount: 'not-a-number',
                },
              },
            }],
          };
        }
        return null;
      },
    }] as any;

    const paths = getPathsFromCypherResult(records);
    expect(paths[0].stakes[0]).toBe(0);
  });

  it('returns 0 for null stakeAmount', () => {
    const records = [{
      get: (key: string) => {
        if (key === 'path') {
          return {
            segments: [{
              start: { properties: { id: '0xA' } },
              end: { properties: { id: '0xB' } },
              relationship: {
                properties: { predicate: 'trusts', stakeAmount: null },
              },
            }],
          };
        }
        return null;
      },
    }] as any;

    const paths = getPathsFromCypherResult(records);
    expect(paths[0].stakes[0]).toBe(0);
  });

  it('returns 0 for boolean stakeAmount (unrecognized type fallback)', () => {
    const records = [{
      get: (key: string) => {
        if (key === 'path') {
          return {
            segments: [{
              start: { properties: { id: '0xA' } },
              end: { properties: { id: '0xB' } },
              relationship: {
                properties: { predicate: 'trusts', stakeAmount: true },
              },
            }],
          };
        }
        return null;
      },
    }] as any;

    const paths = getPathsFromCypherResult(records);
    expect(paths[0].stakes[0]).toBe(0);
  });

  it('handles multi-hop path with correct totalDecay', () => {
    const records = [{
      get: (key: string) => {
        if (key === 'path') {
          return {
            segments: [
              {
                start: { properties: { id: '0xA' } },
                end: { properties: { id: '0xB' } },
                relationship: {
                  properties: { predicate: 'trusts', stakeAmount: 100 },
                },
              },
              {
                start: { properties: { id: '0xB' } },
                end: { properties: { id: '0xC' } },
                relationship: {
                  properties: { predicate: 'follow', stakeAmount: 200 },
                },
              },
            ],
          };
        }
        return null;
      },
    }] as any;

    const paths = getPathsFromCypherResult(records);

    expect(paths).toHaveLength(1);
    expect(paths[0].addresses).toEqual(['0xA', '0xB', '0xC']);
    expect(paths[0].predicates).toEqual(['trusts', 'follow']);
    expect(paths[0].stakes).toEqual([100, 200]);
    // totalDecay = DEFAULT_DECAY_FACTOR ^ hopCount = 0.6^2 = 0.36
    expect(paths[0].totalDecay).toBeCloseTo(0.36, 10);
  });

  it('skips record that throws during parsing', () => {
    const goodRecord = {
      get: (key: string) => {
        if (key === 'path') {
          return {
            segments: [{
              start: { properties: { id: '0xA' } },
              end: { properties: { id: '0xB' } },
              relationship: {
                properties: { predicate: 'trusts', stakeAmount: 100 },
              },
            }],
          };
        }
        return null;
      },
    };

    const badRecord = {
      get: () => {
        throw new Error('Corrupt record');
      },
    };

    const paths = getPathsFromCypherResult([badRecord, goodRecord] as any);

    // Bad record skipped, good record parsed
    expect(paths).toHaveLength(1);
    expect(paths[0].addresses).toEqual(['0xA', '0xB']);
  });
});

// ============ findOutgoingTrustPaths (mocked Neo4j) ============

describe('findOutgoingTrustPaths', () => {
  const makePathRecord = (
    addresses: string[],
    predicates: string[],
    stakes: number[],
  ) => ({
    get: (key: string) => {
      if (key === 'path') {
        return {
          segments: addresses.slice(0, -1).map((addr, i) => ({
            start: { properties: { id: addr } },
            end: { properties: { id: addresses[i + 1] } },
            relationship: {
              properties: {
                predicate: predicates[i],
                stakeAmount: stakes[i],
              },
            },
          })),
        };
      }
      if (key === 'pathStake') return stakes.reduce((a, b) => a + b, 0);
      return null;
    },
  });

  it('returns empty result when no outgoing paths exist', async () => {
    mockRun.mockResolvedValueOnce({ records: [] });

    const result = await findOutgoingTrustPaths('0xA');

    expect(result.paths).toHaveLength(0);
    expect(result.strongestPath).toBeNull();
    expect(result.nodesVisited).toBe(0);
  });

  it('lowercases source address in query', async () => {
    mockRun.mockResolvedValueOnce({ records: [] });

    await findOutgoingTrustPaths('0xAABBCC');

    const params = mockRun.mock.calls[0][1] as Record<string, unknown>;
    expect(params.fromAddress).toBe('0xaabbcc');
  });

  it('clamps maxHops between 1 and 10', async () => {
    mockRun.mockResolvedValueOnce({ records: [] });

    await findOutgoingTrustPaths('0xA', 0);

    const query = mockRun.mock.calls[0][0] as string;
    expect(query).toContain('*1..1');
  });

  it('returns paths sorted by calculated trust descending', async () => {
    mockRun.mockResolvedValueOnce({
      records: [
        makePathRecord(['0xa', '0xb'], ['trusts'], [10]),
        makePathRecord(['0xa', '0xc'], ['trusts'], [1e15]),
      ],
    });

    const result = await findOutgoingTrustPaths('0xA');

    expect(result.paths.length).toBe(2);
    const trust0 = calculatePathTrust(result.paths[0]);
    const trust1 = calculatePathTrust(result.paths[1]);
    expect(trust0).toBeGreaterThanOrEqual(trust1);
  });

  it('sets strongestPath to the first sorted path', async () => {
    mockRun.mockResolvedValueOnce({
      records: [
        makePathRecord(['0xa', '0xb'], ['trusts'], [1e15]),
      ],
    });

    const result = await findOutgoingTrustPaths('0xA');

    expect(result.strongestPath).not.toBeNull();
    expect(result.strongestPath).toBe(result.paths[0]);
  });

  it('counts unique nodes visited', async () => {
    mockRun.mockResolvedValueOnce({
      records: [
        makePathRecord(['0xa', '0xb', '0xc'], ['trusts', 'trusts'], [100, 100]),
        makePathRecord(['0xa', '0xd'], ['trusts'], [100]),
      ],
    });

    const result = await findOutgoingTrustPaths('0xA');

    // Unique: 0xa, 0xb, 0xc, 0xd = 4
    expect(result.nodesVisited).toBe(4);
  });

  it('uses default maxHops of 3', async () => {
    mockRun.mockResolvedValueOnce({ records: [] });

    await findOutgoingTrustPaths('0xA');

    const query = mockRun.mock.calls[0][0] as string;
    expect(query).toContain('*1..3');
  });

  it('closes session even on error', async () => {
    mockRun.mockRejectedValueOnce(new Error('Connection lost'));

    await expect(findOutgoingTrustPaths('0xA')).rejects.toThrow('Connection lost');
    expect(mockClose).toHaveBeenCalledOnce();
  });

  it('excludes self-loops via WHERE clause', async () => {
    mockRun.mockResolvedValueOnce({ records: [] });

    await findOutgoingTrustPaths('0xA');

    const query = mockRun.mock.calls[0][0] as string;
    expect(query).toContain('source <> target');
  });
});
