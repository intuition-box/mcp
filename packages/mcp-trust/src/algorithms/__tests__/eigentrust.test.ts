import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  computeEigenTrust,
  initializeTrustScores,
  buildTransitionMatrix,
  iterateOnce,
  checkConvergence,
  fetchGraphData,
  EdgeData,
} from '../eigentrust.js';

// Mock Neo4j session
const mockRun = vi.fn();
const mockClose = vi.fn();
vi.mock('../../config/neo4j.js', () => ({
  getSession: () => ({ run: mockRun, close: mockClose }),
}));

// Mock logger to suppress output during tests
vi.mock('../../utils/logger.js', () => ({
  log: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// ============ initializeTrustScores ============

describe('initializeTrustScores', () => {
  it('returns uniform distribution for multiple addresses', () => {
    const addresses = ['0xA', '0xB', '0xC', '0xD'];
    const scores = initializeTrustScores(addresses);

    expect(scores.size).toBe(4);
    for (const score of scores.values()) {
      expect(score).toBeCloseTo(0.25, 10);
    }
  });

  it('returns 1.0 for a single address', () => {
    const scores = initializeTrustScores(['0xA']);

    expect(scores.size).toBe(1);
    expect(scores.get('0xA')).toBeCloseTo(1.0, 10);
  });

  it('returns empty map for no addresses', () => {
    const scores = initializeTrustScores([]);

    expect(scores.size).toBe(0);
  });

  it('scores sum to 1', () => {
    const addresses = ['0xA', '0xB', '0xC', '0xD', '0xE'];
    const scores = initializeTrustScores(addresses);

    let sum = 0;
    for (const score of scores.values()) {
      sum += score;
    }
    expect(sum).toBeCloseTo(1.0, 10);
  });
});

// ============ buildTransitionMatrix ============

describe('buildTransitionMatrix', () => {
  it('normalizes rows to sum to 1', () => {
    const edges: EdgeData[] = [
      { from: '0xA', to: '0xB', stakeAmount: 100, predicate: 'trusts' },
      { from: '0xA', to: '0xC', stakeAmount: 100, predicate: 'trusts' },
    ];

    const matrix = buildTransitionMatrix(edges);
    const rowA = matrix.get('0xA')!;

    expect(rowA.get('0xB')).toBeCloseTo(0.5, 10);
    expect(rowA.get('0xC')).toBeCloseTo(0.5, 10);
  });

  it('weights edges by predicate weight', () => {
    const edges: EdgeData[] = [
      { from: '0xA', to: '0xB', stakeAmount: 100, predicate: 'trusts' },   // weight 1.0
      { from: '0xA', to: '0xC', stakeAmount: 100, predicate: 'follow' },   // weight 0.7
    ];

    const matrix = buildTransitionMatrix(edges);
    const rowA = matrix.get('0xA')!;

    // Raw weights: 100*1.0=100, 100*0.7=70. Sum=170
    // Normalized: 100/170, 70/170
    expect(rowA.get('0xB')! > rowA.get('0xC')!).toBe(true);
    expect(rowA.get('0xB')! + rowA.get('0xC')!).toBeCloseTo(1.0, 10);
  });

  it('respects custom predicate weight overrides', () => {
    const edges: EdgeData[] = [
      { from: '0xA', to: '0xB', stakeAmount: 100, predicate: 'trusts' },
      { from: '0xA', to: '0xC', stakeAmount: 100, predicate: 'trusts' },
    ];

    // Override: 'trusts' at 0.5 instead of 1.0 (both equal, so still 50/50)
    const matrix = buildTransitionMatrix(edges, { trusts: 0.5 });
    const rowA = matrix.get('0xA')!;

    expect(rowA.get('0xB')).toBeCloseTo(0.5, 10);
    expect(rowA.get('0xC')).toBeCloseTo(0.5, 10);
  });

  it('returns empty matrix for no edges', () => {
    const matrix = buildTransitionMatrix([]);
    expect(matrix.size).toBe(0);
  });

  it('handles multiple edges between same pair by summing weights', () => {
    const edges: EdgeData[] = [
      { from: '0xA', to: '0xB', stakeAmount: 50, predicate: 'trusts' },
      { from: '0xA', to: '0xB', stakeAmount: 50, predicate: 'trusts' },
    ];

    const matrix = buildTransitionMatrix(edges);
    const rowA = matrix.get('0xA')!;

    // Only one target, so it should be 1.0
    expect(rowA.get('0xB')).toBeCloseTo(1.0, 10);
  });

  it('assigns zero weight to edges with zero-weight predicates', () => {
    const edges: EdgeData[] = [
      { from: '0xA', to: '0xB', stakeAmount: 100, predicate: 'trusts' },
      { from: '0xA', to: '0xC', stakeAmount: 100, predicate: 'unknown_predicate' },
    ];

    const matrix = buildTransitionMatrix(edges);
    const rowA = matrix.get('0xA')!;

    // 'unknown_predicate' has weight 0 from config/predicates.ts default
    // So only 0xB gets weight, normalized to 1.0
    expect(rowA.get('0xB')).toBeCloseTo(1.0, 10);
    expect(rowA.get('0xC') ?? 0).toBeCloseTo(0.0, 10);
  });

  it('handles zero-stake edges as zero weight', () => {
    const edges: EdgeData[] = [
      { from: '0xA', to: '0xB', stakeAmount: 0, predicate: 'trusts' },
      { from: '0xA', to: '0xC', stakeAmount: 100, predicate: 'trusts' },
    ];

    const matrix = buildTransitionMatrix(edges);
    const rowA = matrix.get('0xA')!;

    // 0xB has zero stake, so all weight goes to 0xC
    expect(rowA.get('0xC')).toBeCloseTo(1.0, 10);
  });
});

// ============ iterateOnce ============

describe('iterateOnce', () => {
  it('preserves total probability mass (scores sum to 1)', () => {
    const addresses = ['0xA', '0xB', '0xC'];
    const scores = initializeTrustScores(addresses);
    const pretrust = initializeTrustScores(addresses);

    const edges: EdgeData[] = [
      { from: '0xA', to: '0xB', stakeAmount: 100, predicate: 'trusts' },
      { from: '0xB', to: '0xC', stakeAmount: 100, predicate: 'trusts' },
      { from: '0xC', to: '0xA', stakeAmount: 100, predicate: 'trusts' },
    ];
    const matrix = buildTransitionMatrix(edges);

    const newScores = iterateOnce(scores, matrix, pretrust, 0.1);

    let sum = 0;
    for (const score of newScores.values()) {
      sum += score;
    }
    expect(sum).toBeCloseTo(1.0, 8);
  });

  it('distributes dangling node trust uniformly', () => {
    // 0xC has no outgoing edges (dangling node)
    const addresses = ['0xA', '0xB', '0xC'];
    const scores = initializeTrustScores(addresses);
    const pretrust = initializeTrustScores(addresses);

    const edges: EdgeData[] = [
      { from: '0xA', to: '0xB', stakeAmount: 100, predicate: 'trusts' },
      { from: '0xB', to: '0xC', stakeAmount: 100, predicate: 'trusts' },
      // 0xC has no outgoing edges
    ];
    const matrix = buildTransitionMatrix(edges);

    const newScores = iterateOnce(scores, matrix, pretrust, 0.1);

    // All nodes should have positive scores due to dangling node redistribution
    for (const score of newScores.values()) {
      expect(score).toBeGreaterThan(0);
    }
  });

  it('produces all equal scores for a fully symmetric cycle', () => {
    const addresses = ['0xA', '0xB', '0xC'];
    const scores = initializeTrustScores(addresses);
    const pretrust = initializeTrustScores(addresses);

    const edges: EdgeData[] = [
      { from: '0xA', to: '0xB', stakeAmount: 100, predicate: 'trusts' },
      { from: '0xB', to: '0xC', stakeAmount: 100, predicate: 'trusts' },
      { from: '0xC', to: '0xA', stakeAmount: 100, predicate: 'trusts' },
    ];
    const matrix = buildTransitionMatrix(edges);

    // Run several iterations to converge
    let current = scores;
    for (let i = 0; i < 50; i++) {
      current = iterateOnce(current, matrix, pretrust, 0.1);
    }

    const vals = Array.from(current.values());
    // All scores should be equal in a symmetric graph
    expect(vals[0]).toBeCloseTo(vals[1], 6);
    expect(vals[1]).toBeCloseTo(vals[2], 6);
  });

  it('applies pretrust weight correctly', () => {
    const addresses = ['0xA', '0xB'];
    const scores = initializeTrustScores(addresses);
    const pretrust = initializeTrustScores(addresses);

    const edges: EdgeData[] = [
      { from: '0xA', to: '0xB', stakeAmount: 100, predicate: 'trusts' },
    ];
    const matrix = buildTransitionMatrix(edges);

    // High pretrust weight pushes scores toward uniform
    const highPretrust = iterateOnce(scores, matrix, pretrust, 0.9);
    // Low pretrust weight follows the graph structure more
    const lowPretrust = iterateOnce(scores, matrix, pretrust, 0.1);

    const highDiff = Math.abs(highPretrust.get('0xA')! - highPretrust.get('0xB')!);
    const lowDiff = Math.abs(lowPretrust.get('0xA')! - lowPretrust.get('0xB')!);

    // High pretrust should produce more uniform scores (smaller diff)
    expect(highDiff).toBeLessThan(lowDiff);
  });
});

// ============ checkConvergence ============

describe('checkConvergence', () => {
  it('returns true when scores are identical', () => {
    const scores = new Map([['0xA', 0.5], ['0xB', 0.5]]);
    expect(checkConvergence(scores, scores, 0.0001)).toBe(true);
  });

  it('returns true when diff is below threshold', () => {
    const old = new Map([['0xA', 0.5], ['0xB', 0.5]]);
    const next = new Map([['0xA', 0.50005], ['0xB', 0.49995]]);
    expect(checkConvergence(old, next, 0.0001)).toBe(true);
  });

  it('returns false when diff exceeds threshold', () => {
    const old = new Map([['0xA', 0.5], ['0xB', 0.5]]);
    const next = new Map([['0xA', 0.6], ['0xB', 0.4]]);
    expect(checkConvergence(old, next, 0.0001)).toBe(false);
  });

  it('handles missing keys in old scores as zero', () => {
    const old = new Map<string, number>();
    const next = new Map([['0xA', 0.001]]);
    // diff = |0.001 - 0| = 0.001 > 0.0001
    expect(checkConvergence(old, next, 0.0001)).toBe(false);
  });

  it('returns true for empty maps', () => {
    const old = new Map<string, number>();
    const next = new Map<string, number>();
    // maxDiff stays at 0, which is < any positive threshold
    expect(checkConvergence(old, next, 0.0001)).toBe(true);
  });
});

// ============ computeEigenTrust (integration with mock) ============

describe('computeEigenTrust', () => {
  function mockGraphData(addresses: string[], edges: EdgeData[]) {
    // First call: fetch addresses
    mockRun.mockResolvedValueOnce({
      records: addresses.map(id => ({
        get: (key: string) => (key === 'id' ? id : null),
      })),
    });
    // Second call: fetch edges
    mockRun.mockResolvedValueOnce({
      records: edges.map(e => ({
        get: (key: string) => {
          switch (key) {
            case 'fromId': return e.from;
            case 'toId': return e.to;
            case 'stakeAmount': return e.stakeAmount;
            case 'predicate': return e.predicate;
            default: return null;
          }
        },
      })),
    });
  }

  it('returns empty result for empty graph', async () => {
    mockGraphData([], []);

    const result = await computeEigenTrust();

    expect(result.scores).toHaveLength(0);
    expect(result.iterations).toBe(0);
    expect(result.converged).toBe(true);
    expect(result.computationTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('returns scores between 0 and 1', async () => {
    const addresses = ['0xA', '0xB', '0xC'];
    const edges: EdgeData[] = [
      { from: '0xA', to: '0xB', stakeAmount: 100, predicate: 'trusts' },
      { from: '0xB', to: '0xC', stakeAmount: 200, predicate: 'trusts' },
      { from: '0xC', to: '0xA', stakeAmount: 150, predicate: 'follow' },
    ];
    mockGraphData(addresses, edges);

    const result = await computeEigenTrust();

    expect(result.scores.length).toBe(3);
    for (const score of result.scores) {
      expect(score.score).toBeGreaterThanOrEqual(0);
      expect(score.score).toBeLessThanOrEqual(1);
    }
  });

  it('scores sum to approximately 1', async () => {
    const addresses = ['0xA', '0xB', '0xC', '0xD'];
    const edges: EdgeData[] = [
      { from: '0xA', to: '0xB', stakeAmount: 100, predicate: 'trusts' },
      { from: '0xB', to: '0xC', stakeAmount: 200, predicate: 'trusts' },
      { from: '0xC', to: '0xD', stakeAmount: 150, predicate: 'trusts' },
      { from: '0xD', to: '0xA', stakeAmount: 100, predicate: 'trusts' },
    ];
    mockGraphData(addresses, edges);

    const result = await computeEigenTrust();

    const totalScore = result.scores.reduce((sum, s) => sum + s.score, 0);
    expect(totalScore).toBeCloseTo(1.0, 6);
  });

  it('converges within default max iterations', async () => {
    const addresses = ['0xA', '0xB', '0xC'];
    const edges: EdgeData[] = [
      { from: '0xA', to: '0xB', stakeAmount: 100, predicate: 'trusts' },
      { from: '0xB', to: '0xC', stakeAmount: 100, predicate: 'trusts' },
      { from: '0xC', to: '0xA', stakeAmount: 100, predicate: 'trusts' },
    ];
    mockGraphData(addresses, edges);

    const result = await computeEigenTrust();

    expect(result.converged).toBe(true);
    expect(result.iterations).toBeLessThanOrEqual(100);
    // A simple 3-node cycle should converge quickly
    expect(result.iterations).toBeLessThan(50);
  });

  it('respects custom config overrides', async () => {
    const addresses = ['0xA', '0xB'];
    const edges: EdgeData[] = [
      { from: '0xA', to: '0xB', stakeAmount: 100, predicate: 'trusts' },
      { from: '0xB', to: '0xA', stakeAmount: 100, predicate: 'trusts' },
    ];
    mockGraphData(addresses, edges);

    const result = await computeEigenTrust({ maxIterations: 5 });

    expect(result.iterations).toBeLessThanOrEqual(5);
  });

  it('handles single-node graph with no edges', async () => {
    mockGraphData(['0xA'], []);

    const result = await computeEigenTrust();

    expect(result.scores).toHaveLength(1);
    expect(result.scores[0].address).toBe('0xA');
    expect(result.scores[0].score).toBeCloseTo(1.0, 6);
    expect(result.scores[0].confidence).toBe(0);
    expect(result.converged).toBe(true);
  });

  it('handles single-node graph with self-loop', async () => {
    const edges: EdgeData[] = [
      { from: '0xA', to: '0xA', stakeAmount: 100, predicate: 'trusts' },
    ];
    mockGraphData(['0xA'], edges);

    const result = await computeEigenTrust();

    expect(result.scores).toHaveLength(1);
    expect(result.scores[0].score).toBeCloseTo(1.0, 6);
  });

  it('returns scores sorted descending by score', async () => {
    const addresses = ['0xA', '0xB', '0xC'];
    const edges: EdgeData[] = [
      { from: '0xA', to: '0xB', stakeAmount: 100, predicate: 'trusts' },
      { from: '0xA', to: '0xC', stakeAmount: 100, predicate: 'trusts' },
      { from: '0xB', to: '0xC', stakeAmount: 100, predicate: 'trusts' },
    ];
    mockGraphData(addresses, edges);

    const result = await computeEigenTrust();

    for (let i = 1; i < result.scores.length; i++) {
      expect(result.scores[i - 1].score).toBeGreaterThanOrEqual(result.scores[i].score);
    }
  });

  it('passes custom predicate weights through to matrix construction', async () => {
    const addresses = ['0xA', '0xB', '0xC'];
    const edges: EdgeData[] = [
      { from: '0xA', to: '0xB', stakeAmount: 100, predicate: 'trusts' },
      { from: '0xA', to: '0xC', stakeAmount: 100, predicate: 'follow' },
      { from: '0xB', to: '0xA', stakeAmount: 100, predicate: 'trusts' },
      { from: '0xC', to: '0xA', stakeAmount: 100, predicate: 'follow' },
    ];

    // Run with default weights
    mockGraphData(addresses, edges);
    const defaultResult = await computeEigenTrust();

    // Run with custom weights that boost 'follow' above 'trusts'
    mockGraphData(addresses, edges);
    const customResult = await computeEigenTrust(undefined, { trusts: 0.3, follow: 1.0 });

    // With boosted follow, 0xC (target of follow from 0xA) should rank higher
    // relative to default. The exact order may vary, but the score distribution changes.
    const defaultScoreMap = Object.fromEntries(defaultResult.scores.map(s => [s.address, s.score]));
    const customScoreMap = Object.fromEntries(customResult.scores.map(s => [s.address, s.score]));

    // 0xC receives a 'follow' edge; boosting follow should increase its relative score
    const defaultRatioC = defaultScoreMap['0xC'] / defaultScoreMap['0xB'];
    const customRatioC = customScoreMap['0xC'] / customScoreMap['0xB'];
    expect(customRatioC).toBeGreaterThan(defaultRatioC);
  });

  it('confidence is 0 for nodes with no incoming edges', async () => {
    const addresses = ['0xA', '0xB'];
    const edges: EdgeData[] = [
      { from: '0xA', to: '0xB', stakeAmount: 100, predicate: 'trusts' },
    ];
    mockGraphData(addresses, edges);

    const result = await computeEigenTrust();

    const scoreA = result.scores.find(s => s.address === '0xA')!;
    const scoreB = result.scores.find(s => s.address === '0xB')!;

    expect(scoreA.confidence).toBe(0);
    expect(scoreB.confidence).toBeGreaterThan(0);
  });

  it('reports computation time', async () => {
    mockGraphData(['0xA', '0xB'], [
      { from: '0xA', to: '0xB', stakeAmount: 100, predicate: 'trusts' },
    ]);

    const result = await computeEigenTrust();

    expect(result.computationTimeMs).toBeGreaterThanOrEqual(0);
    expect(typeof result.computationTimeMs).toBe('number');
  });
});

// ============ fetchGraphData ============

describe('fetchGraphData', () => {
  it('parses Neo4j records into addresses and edges', async () => {
    mockRun
      .mockResolvedValueOnce({
        records: [
          { get: (k: string) => (k === 'id' ? '0xA' : null) },
          { get: (k: string) => (k === 'id' ? '0xB' : null) },
        ],
      })
      .mockResolvedValueOnce({
        records: [{
          get: (k: string) => {
            switch (k) {
              case 'fromId': return '0xA';
              case 'toId': return '0xB';
              case 'stakeAmount': return 100;
              case 'predicate': return 'trusts';
              default: return null;
            }
          },
        }],
      });

    const data = await fetchGraphData();

    expect(data.addresses).toEqual(['0xA', '0xB']);
    expect(data.edges).toHaveLength(1);
    expect(data.edges[0]).toEqual({
      from: '0xA',
      to: '0xB',
      stakeAmount: 100,
      predicate: 'trusts',
    });
  });

  it('handles Neo4j Integer types for stakeAmount', async () => {
    mockRun
      .mockResolvedValueOnce({ records: [{ get: () => '0xA' }] })
      .mockResolvedValueOnce({
        records: [{
          get: (k: string) => {
            switch (k) {
              case 'fromId': return '0xA';
              case 'toId': return '0xA';
              case 'stakeAmount': return { toNumber: () => 500 };
              case 'predicate': return 'trusts';
              default: return null;
            }
          },
        }],
      });

    const data = await fetchGraphData();

    expect(data.edges[0].stakeAmount).toBe(500);
  });

  it('defaults null predicate to "unknown"', async () => {
    mockRun
      .mockResolvedValueOnce({ records: [{ get: () => '0xA' }] })
      .mockResolvedValueOnce({
        records: [{
          get: (k: string) => {
            switch (k) {
              case 'fromId': return '0xA';
              case 'toId': return '0xA';
              case 'stakeAmount': return 0;
              case 'predicate': return null;
              default: return null;
            }
          },
        }],
      });

    const data = await fetchGraphData();

    expect(data.edges[0].predicate).toBe('unknown');
  });

  it('closes session after fetching', async () => {
    mockRun
      .mockResolvedValueOnce({ records: [] })
      .mockResolvedValueOnce({ records: [] });

    await fetchGraphData();

    expect(mockClose).toHaveBeenCalledOnce();
  });

  it('closes session even on error', async () => {
    mockRun.mockRejectedValueOnce(new Error('Connection lost'));

    await expect(fetchGraphData()).rejects.toThrow('Connection lost');
    expect(mockClose).toHaveBeenCalledOnce();
  });
});
