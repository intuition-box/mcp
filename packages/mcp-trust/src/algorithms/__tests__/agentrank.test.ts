import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  computeAgentRank,
  buildWeightedAdjacency,
  iterateRank,
  getTopAgents,
  computeInfluenceMetrics,
} from '../agentrank.js';

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

// Helper: set up mockRun to return addresses then edges
function mockGraphData(
  addresses: string[],
  edges: { from: string; to: string; stakeAmount: number; predicate: string }[],
) {
  mockRun
    .mockResolvedValueOnce({
      records: addresses.map(id => ({
        get: (key: string) => (key === 'id' ? id : null),
      })),
    })
    .mockResolvedValueOnce({
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

// ============ computeAgentRank ============

describe('computeAgentRank', () => {
  it('returns empty result for empty graph', async () => {
    mockGraphData([], []);

    const result = await computeAgentRank();

    expect(result.ranks.size).toBe(0);
    expect(result.iterations).toBe(0);
    expect(result.converged).toBe(true);
    expect(result.topAgents).toHaveLength(0);
    expect(result.computationTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('returns ranks between 0 and 1 for all nodes', async () => {
    const addresses = ['0xA', '0xB', '0xC'];
    const edges = [
      { from: '0xA', to: '0xB', stakeAmount: 100, predicate: 'trusts' },
      { from: '0xB', to: '0xC', stakeAmount: 200, predicate: 'trusts' },
      { from: '0xC', to: '0xA', stakeAmount: 150, predicate: 'follow' },
    ];
    mockGraphData(addresses, edges);

    const result = await computeAgentRank();

    for (const [, rank] of result.ranks) {
      expect(rank).toBeGreaterThan(0);
      expect(rank).toBeLessThanOrEqual(1);
    }
  });

  it('converges within default max iterations', async () => {
    const addresses = ['0xA', '0xB', '0xC'];
    const edges = [
      { from: '0xA', to: '0xB', stakeAmount: 100, predicate: 'trusts' },
      { from: '0xB', to: '0xC', stakeAmount: 100, predicate: 'trusts' },
      { from: '0xC', to: '0xA', stakeAmount: 100, predicate: 'trusts' },
    ];
    mockGraphData(addresses, edges);

    const result = await computeAgentRank();

    expect(result.converged).toBe(true);
    expect(result.iterations).toBeLessThanOrEqual(100);
    expect(result.iterations).toBeGreaterThan(0);
  });

  it('handles dangling nodes (no outgoing edges)', async () => {
    // 0xC is a dangling node -- receives edges but has none outgoing
    const addresses = ['0xA', '0xB', '0xC'];
    const edges = [
      { from: '0xA', to: '0xB', stakeAmount: 100, predicate: 'trusts' },
      { from: '0xB', to: '0xC', stakeAmount: 100, predicate: 'trusts' },
    ];
    mockGraphData(addresses, edges);

    const result = await computeAgentRank();

    // All nodes should still get positive rank due to teleportation + dangling redistribution
    for (const [, rank] of result.ranks) {
      expect(rank).toBeGreaterThan(0);
    }

    // 0xC should accumulate high rank (receives from 0xB, dangling distributes uniformly)
    const rankC = result.ranks.get('0xC')!;
    const rankA = result.ranks.get('0xA')!;
    expect(rankC).toBeGreaterThanOrEqual(rankA);
  });

  it('respects custom damping factor', async () => {
    const addresses = ['0xA', '0xB', '0xC'];
    const edges = [
      { from: '0xA', to: '0xB', stakeAmount: 100, predicate: 'trusts' },
      { from: '0xB', to: '0xC', stakeAmount: 100, predicate: 'trusts' },
      { from: '0xC', to: '0xA', stakeAmount: 100, predicate: 'trusts' },
    ];

    // Low damping: more teleportation, ranks closer to uniform
    mockGraphData(addresses, edges);
    const lowDamping = await computeAgentRank({ dampingFactor: 0.5 });

    // High damping: more following links, ranks more differentiated by structure
    mockGraphData(addresses, edges);
    const highDamping = await computeAgentRank({ dampingFactor: 0.95 });

    // With a symmetric graph both should converge to roughly equal ranks,
    // but verify both completed without error and all nodes are present
    expect(lowDamping.ranks.size).toBe(3);
    expect(highDamping.ranks.size).toBe(3);
    expect(lowDamping.converged).toBe(true);
    expect(highDamping.converged).toBe(true);
  });

  it('sorts topAgents by rank descending', async () => {
    const addresses = ['0xA', '0xB', '0xC', '0xD'];
    const edges = [
      { from: '0xA', to: '0xB', stakeAmount: 100, predicate: 'trusts' },
      { from: '0xA', to: '0xC', stakeAmount: 200, predicate: 'trusts' },
      { from: '0xB', to: '0xC', stakeAmount: 150, predicate: 'trusts' },
      { from: '0xC', to: '0xD', stakeAmount: 300, predicate: 'trusts' },
      { from: '0xD', to: '0xA', stakeAmount: 100, predicate: 'trusts' },
    ];
    mockGraphData(addresses, edges);

    const result = await computeAgentRank(undefined, 10);

    for (let i = 1; i < result.topAgents.length; i++) {
      expect(result.topAgents[i - 1].rank).toBeGreaterThanOrEqual(result.topAgents[i].rank);
    }
  });

  it('handles single node graph', async () => {
    mockGraphData(['0xA'], []);

    const result = await computeAgentRank();

    expect(result.ranks.size).toBe(1);
    expect(result.ranks.get('0xA')).toBeGreaterThan(0);
    expect(result.converged).toBe(true);
  });

  it('handles self-loop edge', async () => {
    const edges = [
      { from: '0xA', to: '0xA', stakeAmount: 100, predicate: 'trusts' },
    ];
    mockGraphData(['0xA'], edges);

    const result = await computeAgentRank();

    expect(result.ranks.size).toBe(1);
    expect(result.ranks.get('0xA')).toBeGreaterThan(0);
    expect(result.converged).toBe(true);
  });

  it('applies minRank floor', async () => {
    const addresses = ['0xA', '0xB', '0xC'];
    // 0xC has no incoming or outgoing -- would have very low rank
    const edges = [
      { from: '0xA', to: '0xB', stakeAmount: 100, predicate: 'trusts' },
      { from: '0xB', to: '0xA', stakeAmount: 100, predicate: 'trusts' },
    ];
    mockGraphData(addresses, edges);

    const result = await computeAgentRank({ minRank: 0.001 });

    for (const [, rank] of result.ranks) {
      expect(rank).toBeGreaterThanOrEqual(0.001);
    }
  });

  it('limits topAgents to requested topN', async () => {
    const addresses = ['0xA', '0xB', '0xC', '0xD', '0xE'];
    const edges = [
      { from: '0xA', to: '0xB', stakeAmount: 100, predicate: 'trusts' },
      { from: '0xB', to: '0xC', stakeAmount: 100, predicate: 'trusts' },
      { from: '0xC', to: '0xD', stakeAmount: 100, predicate: 'trusts' },
      { from: '0xD', to: '0xE', stakeAmount: 100, predicate: 'trusts' },
      { from: '0xE', to: '0xA', stakeAmount: 100, predicate: 'trusts' },
    ];
    mockGraphData(addresses, edges);

    const result = await computeAgentRank(undefined, 2);

    expect(result.topAgents).toHaveLength(2);
  });

  it('reports computation time', async () => {
    mockGraphData(['0xA'], []);

    const result = await computeAgentRank();

    expect(result.computationTimeMs).toBeGreaterThanOrEqual(0);
    expect(typeof result.computationTimeMs).toBe('number');
  });
});

// ============ buildWeightedAdjacency ============

describe('buildWeightedAdjacency', () => {
  it('builds inLinks and outWeights from edges', () => {
    const edges = [
      { from: '0xA', to: '0xB', stakeAmount: 100, predicate: 'trusts' },
      { from: '0xA', to: '0xC', stakeAmount: 200, predicate: 'trusts' },
    ];

    const adj = buildWeightedAdjacency(edges);

    // 0xB and 0xC should have inLinks from 0xA
    expect(adj.inLinks.get('0xB')?.has('0xA')).toBe(true);
    expect(adj.inLinks.get('0xC')?.has('0xA')).toBe(true);

    // 0xA should have outgoing weight
    expect(adj.outWeights.get('0xA')).toBeGreaterThan(0);
  });

  it('skips zero-weight edges', () => {
    const edges = [
      { from: '0xA', to: '0xB', stakeAmount: 0, predicate: 'trusts' },
    ];

    const adj = buildWeightedAdjacency(edges);

    // Zero stake * predicate weight = 0, should be skipped
    expect(adj.inLinks.size).toBe(0);
    expect(adj.outWeights.size).toBe(0);
  });

  it('uses unweighted mode when stakeWeighted is false', () => {
    const edges = [
      { from: '0xA', to: '0xB', stakeAmount: 999, predicate: 'trusts' },
      { from: '0xA', to: '0xC', stakeAmount: 1, predicate: 'trusts' },
    ];

    const adj = buildWeightedAdjacency(edges, false);

    // When unweighted, both edges should have equal weight (predicateWeight only)
    const weightToB = adj.inLinks.get('0xB')?.get('0xA') ?? 0;
    const weightToC = adj.inLinks.get('0xC')?.get('0xA') ?? 0;
    expect(weightToB).toBe(weightToC);
  });
});

// ============ iterateRank ============

describe('iterateRank', () => {
  it('preserves total rank mass approximately', () => {
    const currentRanks = new Map([['0xA', 0.5], ['0xB', 0.5]]);
    const inLinks = new Map<string, Map<string, number>>([
      ['0xB', new Map([['0xA', 100]])],
    ]);
    const outWeights = new Map([['0xA', 100]]);

    const newRanks = iterateRank(currentRanks, inLinks, outWeights, 0.85, 2);

    let sum = 0;
    for (const rank of newRanks.values()) {
      sum += rank;
    }
    // Total rank should be approximately 1.0
    expect(sum).toBeCloseTo(1.0, 4);
  });

  it('gives all nodes positive rank via teleportation', () => {
    // Disconnected node 0xC should still get rank from teleportation
    const currentRanks = new Map([
      ['0xA', 1 / 3], ['0xB', 1 / 3], ['0xC', 1 / 3],
    ]);
    const inLinks = new Map<string, Map<string, number>>([
      ['0xB', new Map([['0xA', 100]])],
    ]);
    const outWeights = new Map([['0xA', 100]]);

    const newRanks = iterateRank(currentRanks, inLinks, outWeights, 0.85, 3);

    for (const rank of newRanks.values()) {
      expect(rank).toBeGreaterThan(0);
    }
  });
});

// ============ getTopAgents ============

describe('getTopAgents', () => {
  it('returns agents sorted by rank descending', () => {
    const ranks = new Map([['0xA', 0.1], ['0xB', 0.5], ['0xC', 0.3]]);
    const inDegree = new Map([['0xA', 1], ['0xB', 3], ['0xC', 2]]);
    const outDegree = new Map([['0xA', 2], ['0xB', 1], ['0xC', 1]]);

    const top = getTopAgents(ranks, inDegree, outDegree, 3);

    expect(top[0].address).toBe('0xB');
    expect(top[1].address).toBe('0xC');
    expect(top[2].address).toBe('0xA');
  });

  it('limits result to n entries', () => {
    const ranks = new Map([['0xA', 0.1], ['0xB', 0.5], ['0xC', 0.3]]);
    const top = getTopAgents(ranks, new Map(), new Map(), 1);

    expect(top).toHaveLength(1);
    expect(top[0].address).toBe('0xB');
  });

  it('defaults degree to 0 for unknown addresses', () => {
    const ranks = new Map([['0xA', 0.5]]);
    const top = getTopAgents(ranks, new Map(), new Map(), 1);

    expect(top[0].inDegree).toBe(0);
    expect(top[0].outDegree).toBe(0);
  });
});

// ============ computeInfluenceMetrics ============

describe('computeInfluenceMetrics', () => {
  it('returns zeroes for empty ranks', () => {
    const metrics = computeInfluenceMetrics(new Map());

    expect(metrics.giniCoefficient).toBe(0);
    expect(metrics.entropy).toBe(0);
    expect(metrics.top10PctShare).toBe(0);
    expect(metrics.medianRank).toBe(0);
  });

  it('returns zero gini for uniform distribution', () => {
    const ranks = new Map([
      ['0xA', 0.25], ['0xB', 0.25], ['0xC', 0.25], ['0xD', 0.25],
    ]);

    const metrics = computeInfluenceMetrics(ranks);

    expect(metrics.giniCoefficient).toBeCloseTo(0, 5);
  });

  it('returns high gini for concentrated distribution', () => {
    const ranks = new Map([
      ['0xA', 0.97], ['0xB', 0.01], ['0xC', 0.01], ['0xD', 0.01],
    ]);

    const metrics = computeInfluenceMetrics(ranks);

    expect(metrics.giniCoefficient).toBeGreaterThan(0.5);
  });

  it('computes median correctly for odd count', () => {
    const ranks = new Map([['0xA', 0.1], ['0xB', 0.3], ['0xC', 0.6]]);

    const metrics = computeInfluenceMetrics(ranks);

    expect(metrics.medianRank).toBeCloseTo(0.3, 10);
  });

  it('computes median correctly for even count', () => {
    const ranks = new Map([
      ['0xA', 0.1], ['0xB', 0.2], ['0xC', 0.3], ['0xD', 0.4],
    ]);

    const metrics = computeInfluenceMetrics(ranks);

    expect(metrics.medianRank).toBeCloseTo(0.25, 10);
  });

  it('returns maximum entropy for uniform distribution', () => {
    const n = 4;
    const uniformRank = 1 / n;
    const ranks = new Map([
      ['0xA', uniformRank], ['0xB', uniformRank],
      ['0xC', uniformRank], ['0xD', uniformRank],
    ]);

    const metrics = computeInfluenceMetrics(ranks);

    // Max entropy for 4 items = log2(4) = 2
    expect(metrics.entropy).toBeCloseTo(Math.log2(n), 5);
  });
});
