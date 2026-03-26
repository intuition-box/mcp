import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  computePersonalizedTrust,
  computePersonalizedTrustNetwork,
  aggregatePathTrust,
  computeTrustWithDecay,
  getDirectTrust,
} from '../personalized.js';
import type { TrustPath, PersonalizedTrustQuery } from '../types.js';

// Mock Neo4j session
const mockRun = vi.fn();
const mockClose = vi.fn();
vi.mock('../../config/neo4j.js', () => ({
  getSession: () => ({ run: mockRun, close: mockClose }),
}));

vi.mock('../../utils/logger.js', () => ({
  log: vi.fn(),
}));

// Mock pathfinding module -- personalized.ts delegates path discovery here
const mockFindTrustPaths = vi.fn();
const mockFindOutgoingTrustPaths = vi.fn();
const mockCalculatePathTrust = vi.fn();

vi.mock('../pathfinding.js', () => ({
  findTrustPaths: (...args: unknown[]) => mockFindTrustPaths(...args),
  findOutgoingTrustPaths: (...args: unknown[]) => mockFindOutgoingTrustPaths(...args),
  calculatePathTrust: (...args: unknown[]) => mockCalculatePathTrust(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  // Default: calculatePathTrust returns a plausible score based on path length
  mockCalculatePathTrust.mockImplementation((path: TrustPath) => {
    const hops = path.predicates.length;
    if (hops === 0) return 0;
    // Simulate decay: shorter paths score higher
    return Math.pow(0.6, hops - 1) * 0.8;
  });
});

// ============ Helper Factories ============

function makePath(
  addresses: string[],
  predicates?: string[],
  stakes?: number[],
): TrustPath {
  const hops = addresses.length - 1;
  return {
    addresses,
    predicates: predicates || Array(hops).fill('trusts'),
    stakes: stakes || Array(hops).fill(1e15),
    totalDecay: Math.pow(0.6, hops),
  };
}

function makeQuery(overrides?: Partial<PersonalizedTrustQuery>): PersonalizedTrustQuery {
  return {
    fromAddress: '0xAlice',
    toAddress: '0xBob',
    maxHops: 3,
    minStake: 0,
    ...overrides,
  };
}

// ============ computePersonalizedTrust ============

describe('computePersonalizedTrust', () => {
  it('returns score between 0 and 1', async () => {
    // Direct trust check returns null (no direct edge)
    mockRun.mockResolvedValueOnce({ records: [] });

    // Path finding returns one path
    const path = makePath(['0xalice', '0xcharlie', '0xbob']);
    mockFindTrustPaths.mockResolvedValueOnce({
      paths: [path],
      strongestPath: path,
      nodesVisited: 3,
    });

    const result = await computePersonalizedTrust(makeQuery());

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
  });

  it('returns 0 for unknown fromAddress (no paths)', async () => {
    // Direct trust returns null
    mockRun.mockResolvedValueOnce({ records: [] });

    // No paths found from unknown address
    mockFindTrustPaths.mockResolvedValueOnce({
      paths: [],
      strongestPath: null,
      nodesVisited: 0,
    });

    const result = await computePersonalizedTrust(
      makeQuery({ fromAddress: '0xUnknown' }),
    );

    expect(result.score).toBe(0);
    expect(result.confidence).toBe(0);
    expect(result.pathCount).toBe(0);
  });

  it('returns 0 for unknown toAddress (no paths)', async () => {
    // Direct trust returns null
    mockRun.mockResolvedValueOnce({ records: [] });

    // No paths to unknown target
    mockFindTrustPaths.mockResolvedValueOnce({
      paths: [],
      strongestPath: null,
      nodesVisited: 0,
    });

    const result = await computePersonalizedTrust(
      makeQuery({ toAddress: '0xNonexistent' }),
    );

    expect(result.score).toBe(0);
    expect(result.confidence).toBe(0);
  });

  it('direct connection returns higher score than indirect', async () => {
    // --- Direct (1-hop) query ---
    // getDirectTrust finds a direct edge
    mockRun.mockResolvedValueOnce({
      records: [{
        get: (key: string) => {
          if (key === 'stakeAmount') return 1e15;
          if (key === 'predicate') return 'trusts';
          if (key === 'timestamp') return Date.now();
          return null;
        },
      }],
    });

    const directResult = await computePersonalizedTrust(
      makeQuery({ maxHops: 1 }),
    );

    // --- Indirect (multi-hop) query ---
    // getDirectTrust returns null (we pretend no direct edge this time)
    mockRun.mockResolvedValueOnce({ records: [] });

    // Pathfinding returns a 3-hop path
    const indirectPath = makePath(['0xalice', '0xm1', '0xm2', '0xbob']);
    mockFindTrustPaths.mockResolvedValueOnce({
      paths: [indirectPath],
      strongestPath: indirectPath,
      nodesVisited: 4,
    });
    // calculatePathTrust for the 3-hop path returns decayed value
    mockCalculatePathTrust.mockReturnValueOnce(0.8 * 0.6 * 0.6);

    const indirectResult = await computePersonalizedTrust(makeQuery());

    expect(directResult.score).toBeGreaterThan(indirectResult.score);
  });

  it('maxHops parameter is respected in pathfinding call', async () => {
    // getDirectTrust returns null
    mockRun.mockResolvedValueOnce({ records: [] });

    mockFindTrustPaths.mockResolvedValueOnce({
      paths: [],
      strongestPath: null,
      nodesVisited: 0,
    });

    await computePersonalizedTrust(makeQuery({ maxHops: 2 }));

    // findTrustPaths should have been called with maxHops = 2
    expect(mockFindTrustPaths).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      2,
    );
  });

  it('decay is applied across hops via calculatePathTrust', async () => {
    // getDirectTrust returns null
    mockRun.mockResolvedValueOnce({ records: [] });

    const path1Hop = makePath(['0xalice', '0xbob']);
    const path3Hop = makePath(['0xalice', '0xm1', '0xm2', '0xbob']);

    mockFindTrustPaths.mockResolvedValueOnce({
      paths: [path1Hop, path3Hop],
      strongestPath: path1Hop,
      nodesVisited: 4,
    });

    // Verify calculatePathTrust is called for each path during aggregation
    mockCalculatePathTrust
      .mockReturnValueOnce(0.8)   // 1-hop: high trust
      .mockReturnValueOnce(0.29); // 3-hop: decayed

    const result = await computePersonalizedTrust(makeQuery());

    // Score should be between the two path scores (weighted average favoring shorter)
    expect(result.score).toBeGreaterThan(0.29);
    expect(result.score).toBeLessThanOrEqual(0.8);
  });

  it('self-trust returns max value (direct edge to self)', async () => {
    // getDirectTrust finds a self-attestation edge
    mockRun.mockResolvedValueOnce({
      records: [{
        get: (key: string) => {
          if (key === 'stakeAmount') return 1e18;
          if (key === 'predicate') return 'trusts';
          return null;
        },
      }],
    });

    const result = await computePersonalizedTrust(
      makeQuery({ fromAddress: '0xAlice', toAddress: '0xAlice', maxHops: 1 }),
    );

    // Direct trust confidence is always 1.0
    expect(result.confidence).toBe(1.0);
    // Score should be close to maximum (sigmoid of high stake * weight 1.0)
    expect(result.score).toBeGreaterThan(0.5);
    expect(result.score).toBeLessThanOrEqual(1);
  });
});

// ============ computePersonalizedTrustNetwork ============

describe('computePersonalizedTrustNetwork', () => {
  it('returns scores for multiple targets', async () => {
    const paths = [
      makePath(['0xalice', '0xbob']),
      makePath(['0xalice', '0xcharlie']),
      makePath(['0xalice', '0xdave']),
    ];

    mockFindOutgoingTrustPaths.mockResolvedValueOnce({
      paths,
      strongestPath: paths[0],
      nodesVisited: 4,
    });

    const result = await computePersonalizedTrustNetwork('0xAlice');

    // Should have entries for bob, charlie, dave (not alice)
    expect(result.size).toBe(3);
    expect(result.has('0xbob')).toBe(true);
    expect(result.has('0xcharlie')).toBe(true);
    expect(result.has('0xdave')).toBe(true);

    // All scores should be between 0 and 1
    for (const [, trustScore] of result) {
      expect(trustScore.score).toBeGreaterThanOrEqual(0);
      expect(trustScore.score).toBeLessThanOrEqual(1);
    }
  });

  it('empty network returns empty results', async () => {
    mockFindOutgoingTrustPaths.mockResolvedValueOnce({
      paths: [],
      strongestPath: null,
      nodesVisited: 0,
    });

    const result = await computePersonalizedTrustNetwork('0xAlice');

    expect(result.size).toBe(0);
  });

  it('respects maxHops parameter in outgoing path call', async () => {
    mockFindOutgoingTrustPaths.mockResolvedValueOnce({
      paths: [],
      strongestPath: null,
      nodesVisited: 0,
    });

    await computePersonalizedTrustNetwork('0xAlice', 2);

    expect(mockFindOutgoingTrustPaths).toHaveBeenCalledWith('0xalice', 2);
  });

  it('excludes source address from results', async () => {
    // Path that loops back through source
    const paths = [
      makePath(['0xalice', '0xbob', '0xalice']),
      makePath(['0xalice', '0xcharlie']),
    ];

    mockFindOutgoingTrustPaths.mockResolvedValueOnce({
      paths,
      strongestPath: paths[0],
      nodesVisited: 3,
    });

    const result = await computePersonalizedTrustNetwork('0xAlice');

    // Source address should be excluded from the result map
    expect(result.has('0xalice')).toBe(false);
  });

  it('scores include pathCount and sources fields', async () => {
    const paths = [
      makePath(['0xalice', '0xbob']),
      makePath(['0xalice', '0xcharlie', '0xbob']),
    ];

    mockFindOutgoingTrustPaths.mockResolvedValueOnce({
      paths,
      strongestPath: paths[0],
      nodesVisited: 3,
    });

    const result = await computePersonalizedTrustNetwork('0xAlice');
    const bobScore = result.get('0xbob')!;

    expect(bobScore.pathCount).toBe(2);
    expect(bobScore.sources.length).toBeGreaterThan(0);
    expect(typeof bobScore.confidence).toBe('number');
  });
});

// ============ aggregatePathTrust ============

describe('aggregatePathTrust', () => {
  it('returns zero score for empty paths', () => {
    const result = aggregatePathTrust([]);

    expect(result.score).toBe(0);
    expect(result.confidence).toBe(0);
    expect(result.pathCount).toBe(0);
  });

  it('shorter paths receive higher weight in aggregation', () => {
    const shortPath = makePath(['0xA', '0xB']);
    const longPath = makePath(['0xA', '0xM1', '0xM2', '0xB']);

    // calculatePathTrust returns 0.8 for short, 0.2 for long
    mockCalculatePathTrust
      .mockReturnValueOnce(0.8)
      .mockReturnValueOnce(0.2);

    const result = aggregatePathTrust([shortPath, longPath], 3);

    // With PATH_LENGTH_WEIGHT_BASE = 1.5, short path weight = 1.5^(3-1) = 2.25
    // Long path weight = 1.5^(3-3) = 1.0
    // Weighted avg = (0.8*2.25 + 0.2*1.0) / (2.25 + 1.0) = 2.0/3.25 ~ 0.615
    // Score should be closer to the short path's value
    expect(result.score).toBeGreaterThan(0.5);
    expect(result.score).toBeLessThan(0.8);
  });

  it('result score is clamped between 0 and 1', () => {
    const path = makePath(['0xA', '0xB']);
    mockCalculatePathTrust.mockReturnValueOnce(1.5); // Artificially high

    const result = aggregatePathTrust([path]);

    expect(result.score).toBeLessThanOrEqual(1);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });
});

// ============ getDirectTrust ============

describe('getDirectTrust', () => {
  it('returns null when no direct edge exists', async () => {
    mockRun.mockResolvedValueOnce({ records: [] });

    const result = await getDirectTrust('0xA', '0xB');

    expect(result).toBeNull();
  });

  it('returns TrustScore when direct edge exists', async () => {
    mockRun.mockResolvedValueOnce({
      records: [{
        get: (key: string) => {
          if (key === 'stakeAmount') return 1e15;
          if (key === 'predicate') return 'trusts';
          if (key === 'timestamp') return Date.now();
          return null;
        },
      }],
    });

    const result = await getDirectTrust('0xA', '0xB');

    expect(result).not.toBeNull();
    expect(result!.score).toBeGreaterThan(0);
    expect(result!.score).toBeLessThanOrEqual(1);
    expect(result!.confidence).toBe(1.0);
    expect(result!.pathCount).toBe(1);
  });

  it('lowercases addresses before querying', async () => {
    mockRun.mockResolvedValueOnce({ records: [] });

    await getDirectTrust('0xAABB', '0xCCDD');

    const params = mockRun.mock.calls[0][1] as Record<string, string>;
    expect(params.fromAddress).toBe('0xaabb');
    expect(params.toAddress).toBe('0xccdd');
  });

  it('closes session on error', async () => {
    mockRun.mockRejectedValueOnce(new Error('Connection failed'));

    const result = await getDirectTrust('0xA', '0xB');

    // Returns null on error (swallowed for resilience)
    expect(result).toBeNull();
    expect(mockClose).toHaveBeenCalledOnce();
  });

  it('closes session on success', async () => {
    mockRun.mockResolvedValueOnce({ records: [] });

    await getDirectTrust('0xA', '0xB');

    expect(mockClose).toHaveBeenCalledOnce();
  });
});
