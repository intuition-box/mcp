import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  simulateSybilAttack,
  calculateResistance,
} from '../sybil-simulation.js';

// Mock Neo4j session
const mockRun = vi.fn();
const mockClose = vi.fn();
vi.mock('../../config/neo4j.js', () => ({
  getSession: () => ({ run: mockRun, close: mockClose }),
}));

vi.mock('../../utils/logger.js', () => ({
  log: vi.fn(),
}));

// Mock EigenTrust and AgentRank -- sybil simulation calls both
const mockComputeEigenTrust = vi.fn();
const mockComputeAgentRank = vi.fn();

vi.mock('../eigentrust.js', () => ({
  computeEigenTrust: (...args: unknown[]) => mockComputeEigenTrust(...args),
}));

vi.mock('../agentrank.js', () => ({
  computeAgentRank: (...args: unknown[]) => mockComputeAgentRank(...args),
}));

beforeEach(() => {
  // mockReset clears history AND queued once-values, preventing leakage between tests
  mockRun.mockReset();
  mockClose.mockReset();
  mockComputeEigenTrust.mockReset();
  mockComputeAgentRank.mockReset();
});

// ============ Helpers ============

function makeEigentrustResult(scoreMap: Record<string, number>) {
  return {
    scores: Object.entries(scoreMap).map(([address, score]) => ({
      address,
      score,
      confidence: 0.5,
      pathCount: 1,
      sources: [],
    })),
    iterations: 10,
    converged: true,
    computationTimeMs: 50,
  };
}

function makeAgentrankResult(rankMap: Record<string, number>) {
  return {
    ranks: new Map(Object.entries(rankMap)),
    iterations: 10,
    converged: true,
    topAgents: [],
    influenceMetrics: {
      giniCoefficient: 0.3,
      entropy: 2.0,
      top10PctShare: 0.2,
      medianRank: 0.1,
    },
    computationTimeMs: 50,
  };
}

/**
 * Mock Neo4j calls for sybil injection.
 * When numCollusionEdges is 0, batchCreateEdges returns early without
 * calling session.run, so we only need node-create + cleanup mocks.
 */
function mockNeo4jInjection(nodeCount: number, edgeCount: number, hasEdges: boolean = true) {
  // injectSybilNodes -> CREATE nodes
  mockRun.mockResolvedValueOnce({
    records: [{ get: () => ({ toNumber: () => nodeCount }) }],
  });
  // injectCollusionEdges -> CREATE edges (only if edges will actually be created)
  if (hasEdges) {
    mockRun.mockResolvedValueOnce({
      records: [{ get: () => ({ toNumber: () => edgeCount }) }],
    });
  }
  // cleanupSybilData -> DETACH DELETE
  mockRun.mockResolvedValueOnce({ records: [] });
}

function mockNeo4jInjectionWithTarget(nodeCount: number, collusionEdges: number, boostEdges: number) {
  // injectSybilNodes
  mockRun.mockResolvedValueOnce({
    records: [{ get: () => ({ toNumber: () => nodeCount }) }],
  });
  // injectCollusionEdges
  mockRun.mockResolvedValueOnce({
    records: [{ get: () => ({ toNumber: () => collusionEdges }) }],
  });
  // injectTargetBoostEdges
  mockRun.mockResolvedValueOnce({
    records: [{ get: () => ({ toNumber: () => boostEdges }) }],
  });
  // cleanupSybilData
  mockRun.mockResolvedValueOnce({ records: [] });
}

// ============ calculateResistance ============

describe('calculateResistance', () => {
  it('returns resistance of 1 when scores are identical', () => {
    const baseline = new Map([['0xA', 0.5], ['0xB', 0.5]]);
    const attacked = new Map([['0xA', 0.5], ['0xB', 0.5]]);

    const result = calculateResistance(baseline, attacked);

    expect(result.resistance).toBe(1);
    expect(result.maxChange).toBe(0);
    expect(result.avgChange).toBe(0);
  });

  it('returns resistance between 0 and 1', () => {
    const baseline = new Map([['0xA', 0.6], ['0xB', 0.4]]);
    const attacked = new Map([['0xA', 0.55], ['0xB', 0.35]]);

    const result = calculateResistance(baseline, attacked);

    expect(result.resistance).toBeGreaterThanOrEqual(0);
    expect(result.resistance).toBeLessThanOrEqual(1);
  });

  it('returns resistance of 1 for empty baseline (nothing to attack)', () => {
    const result = calculateResistance(new Map(), new Map());

    expect(result.resistance).toBe(1);
    expect(result.maxChange).toBe(0);
    expect(result.avgChange).toBe(0);
  });

  it('excludes sybil-prefixed addresses from resistance calculation', () => {
    const baseline = new Map([
      ['0xA', 0.5],
      ['0xsybil000100000000000000000000000000000000', 0.3],
    ]);
    const attacked = new Map([
      ['0xA', 0.5],
      ['0xsybil000100000000000000000000000000000000', 0.9],
    ]);

    const result = calculateResistance(baseline, attacked);

    // Only legitimate address 0xA is compared, and it's unchanged
    expect(result.resistance).toBe(1);
  });

  it('lower resistance when scores change significantly', () => {
    const baseline = new Map([['0xA', 0.5], ['0xB', 0.5]]);
    const smallChange = new Map([['0xA', 0.49], ['0xB', 0.49]]);
    const bigChange = new Map([['0xA', 0.3], ['0xB', 0.3]]);

    const smallResult = calculateResistance(baseline, smallChange);
    const bigResult = calculateResistance(baseline, bigChange);

    expect(bigResult.resistance).toBeLessThan(smallResult.resistance);
  });

  it('reports maxChange and avgChange correctly', () => {
    const baseline = new Map([['0xA', 0.6], ['0xB', 0.4]]);
    const attacked = new Map([['0xA', 0.5], ['0xB', 0.35]]);

    const result = calculateResistance(baseline, attacked);

    expect(result.maxChange).toBeCloseTo(0.1, 10);
    expect(result.avgChange).toBeCloseTo(0.075, 10);
  });
});

// ============ simulateSybilAttack ============

describe('simulateSybilAttack', () => {
  it('returns resistanceScore between 0 and 100 (normalized impact)', async () => {
    const scores = { '0xA': 0.5, '0xB': 0.3, '0xC': 0.2 };

    // Baseline computation
    mockComputeEigenTrust.mockResolvedValueOnce(makeEigentrustResult(scores));
    mockComputeAgentRank.mockResolvedValueOnce(makeAgentrankResult(scores));

    // Neo4j injection (5 nodes >= 2, so collusion edges will be created)
    mockNeo4jInjection(5, 10);

    // Attack computation (scores shift slightly)
    const attackScores = { '0xA': 0.48, '0xB': 0.29, '0xC': 0.19 };
    mockComputeEigenTrust.mockResolvedValueOnce(makeEigentrustResult(attackScores));
    mockComputeAgentRank.mockResolvedValueOnce(makeAgentrankResult(attackScores));

    const result = await simulateSybilAttack({
      numSybilNodes: 5,
      numCollusionEdges: 10,
    });

    // Resistance is between 0 and 1 in the raw impact struct
    expect(result.impact.eigentrustResistance).toBeGreaterThanOrEqual(0);
    expect(result.impact.eigentrustResistance).toBeLessThanOrEqual(1);
    expect(result.impact.agentrankResistance).toBeGreaterThanOrEqual(0);
    expect(result.impact.agentrankResistance).toBeLessThanOrEqual(1);

    // Scaled to 0-100: resistance * 100
    const resistancePercent = result.impact.eigentrustResistance * 100;
    expect(resistancePercent).toBeGreaterThanOrEqual(0);
    expect(resistancePercent).toBeLessThanOrEqual(100);
  });

  it('single sybil node has minimal impact', async () => {
    const scores = { '0xA': 0.5, '0xB': 0.3, '0xC': 0.2 };

    // Baseline
    mockComputeEigenTrust.mockResolvedValueOnce(makeEigentrustResult(scores));
    mockComputeAgentRank.mockResolvedValueOnce(makeAgentrankResult(scores));

    // 1 sybil node -> injectCollusionEdges returns 0 early (addresses.length < 2)
    // So no edge-create mockRun call is consumed
    mockNeo4jInjection(1, 0, false);

    // Attack scores nearly identical (single node barely moves scores)
    mockComputeEigenTrust.mockResolvedValueOnce(makeEigentrustResult({
      '0xA': 0.499, '0xB': 0.3, '0xC': 0.2,
    }));
    mockComputeAgentRank.mockResolvedValueOnce(makeAgentrankResult({
      '0xA': 0.499, '0xB': 0.3, '0xC': 0.2,
    }));

    const result = await simulateSybilAttack({
      numSybilNodes: 1,
      numCollusionEdges: 0,
    });

    // High resistance -- single node barely affects anything
    expect(result.impact.eigentrustResistance).toBeGreaterThan(0.95);
    expect(result.impact.agentrankResistance).toBeGreaterThan(0.95);
  });

  it('large coordinated sybil cluster reduces resistance', async () => {
    const scores = { '0xA': 0.5, '0xB': 0.3, '0xC': 0.2 };

    // Baseline
    mockComputeEigenTrust.mockResolvedValueOnce(makeEigentrustResult(scores));
    mockComputeAgentRank.mockResolvedValueOnce(makeAgentrankResult(scores));

    // Large cluster: 50 nodes, 200 edges
    mockNeo4jInjection(50, 200);

    // Attack significantly shifts scores
    mockComputeEigenTrust.mockResolvedValueOnce(makeEigentrustResult({
      '0xA': 0.35, '0xB': 0.2, '0xC': 0.12,
    }));
    mockComputeAgentRank.mockResolvedValueOnce(makeAgentrankResult({
      '0xA': 0.35, '0xB': 0.2, '0xC': 0.12,
    }));

    const result = await simulateSybilAttack({
      numSybilNodes: 50,
      numCollusionEdges: 200,
    });

    // Resistance should be notably lower than the single-node scenario
    expect(result.impact.eigentrustResistance).toBeLessThan(0.95);
    expect(result.impact.agentrankResistance).toBeLessThan(0.95);
  });

  it('results include attackerCount field (sybilNodesCreated)', async () => {
    const scores = { '0xA': 0.5 };

    mockComputeEigenTrust.mockResolvedValueOnce(makeEigentrustResult(scores));
    mockComputeAgentRank.mockResolvedValueOnce(makeAgentrankResult(scores));

    mockNeo4jInjection(10, 20);

    mockComputeEigenTrust.mockResolvedValueOnce(makeEigentrustResult(scores));
    mockComputeAgentRank.mockResolvedValueOnce(makeAgentrankResult(scores));

    const result = await simulateSybilAttack({
      numSybilNodes: 10,
      numCollusionEdges: 20,
    });

    expect(result.sybilNodesCreated).toBe(10);
    expect(typeof result.sybilNodesCreated).toBe('number');
  });

  it('results include impactedAddresses data (baselineScores + attackScores)', async () => {
    const baseline = { '0xA': 0.5, '0xB': 0.3 };
    const attacked = { '0xA': 0.45, '0xB': 0.28 };

    mockComputeEigenTrust.mockResolvedValueOnce(makeEigentrustResult(baseline));
    mockComputeAgentRank.mockResolvedValueOnce(makeAgentrankResult(baseline));

    mockNeo4jInjection(5, 10);

    mockComputeEigenTrust.mockResolvedValueOnce(makeEigentrustResult(attacked));
    mockComputeAgentRank.mockResolvedValueOnce(makeAgentrankResult(attacked));

    const result = await simulateSybilAttack({
      numSybilNodes: 5,
      numCollusionEdges: 10,
    });

    // Baseline and attack scores both recorded per address
    expect(result.baselineScores.eigentrust.get('0xA')).toBe(0.5);
    expect(result.attackScores.eigentrust.get('0xA')).toBe(0.45);
    expect(result.baselineScores.agentrank.get('0xB')).toBe(0.3);
    expect(result.attackScores.agentrank.get('0xB')).toBe(0.28);
  });

  it('empty graph returns high resistance (nothing to attack)', async () => {
    // Empty graph: no addresses, no edges
    mockComputeEigenTrust.mockResolvedValueOnce(makeEigentrustResult({}));
    mockComputeAgentRank.mockResolvedValueOnce(makeAgentrankResult({}));

    mockNeo4jInjection(5, 10);

    mockComputeEigenTrust.mockResolvedValueOnce(makeEigentrustResult({}));
    mockComputeAgentRank.mockResolvedValueOnce(makeAgentrankResult({}));

    const result = await simulateSybilAttack({
      numSybilNodes: 5,
      numCollusionEdges: 10,
    });

    // No legitimate nodes to measure impact on -> resistance = 1
    expect(result.impact.eigentrustResistance).toBe(1);
    expect(result.impact.agentrankResistance).toBe(1);
  });

  it('sybil nodes with no connections have zero influence on legit scores', async () => {
    const scores = { '0xA': 0.5, '0xB': 0.5 };

    // Baseline
    mockComputeEigenTrust.mockResolvedValueOnce(makeEigentrustResult(scores));
    mockComputeAgentRank.mockResolvedValueOnce(makeAgentrankResult(scores));

    // 10 nodes but 0 edges: batchCreateEdges([]) returns early, no edge mockRun consumed
    mockNeo4jInjection(10, 0, false);

    // Attack scores are identical (isolated sybils have no influence)
    mockComputeEigenTrust.mockResolvedValueOnce(makeEigentrustResult(scores));
    mockComputeAgentRank.mockResolvedValueOnce(makeAgentrankResult(scores));

    const result = await simulateSybilAttack({
      numSybilNodes: 10,
      numCollusionEdges: 0,
    });

    expect(result.impact.eigentrustResistance).toBe(1);
    expect(result.impact.agentrankResistance).toBe(1);
    expect(result.impact.maxScoreChangeEigentrust).toBe(0);
    expect(result.impact.maxScoreChangeAgentrank).toBe(0);
  });

  it('report includes summary statistics (max/avg change)', async () => {
    const baseline = { '0xA': 0.6, '0xB': 0.4 };
    const attacked = { '0xA': 0.5, '0xB': 0.35 };

    mockComputeEigenTrust.mockResolvedValueOnce(makeEigentrustResult(baseline));
    mockComputeAgentRank.mockResolvedValueOnce(makeAgentrankResult(baseline));

    mockNeo4jInjection(5, 10);

    mockComputeEigenTrust.mockResolvedValueOnce(makeEigentrustResult(attacked));
    mockComputeAgentRank.mockResolvedValueOnce(makeAgentrankResult(attacked));

    const result = await simulateSybilAttack({
      numSybilNodes: 5,
      numCollusionEdges: 10,
    });

    // Summary statistics present and sensible
    expect(result.impact.maxScoreChangeEigentrust).toBeCloseTo(0.1, 5);
    expect(result.impact.avgScoreChangeEigentrust).toBeCloseTo(0.075, 5);
    expect(result.impact.maxScoreChangeAgentrank).toBeCloseTo(0.1, 5);
    expect(result.impact.avgScoreChangeAgentrank).toBeCloseTo(0.075, 5);
    expect(result.sybilEdgesCreated).toBe(10);
    expect(result.computationTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('includes target boost metrics when targetAddress is set', async () => {
    const baseline = { '0xA': 0.3, '0xB': 0.7 };

    mockComputeEigenTrust.mockResolvedValueOnce(makeEigentrustResult(baseline));
    mockComputeAgentRank.mockResolvedValueOnce(makeAgentrankResult(baseline));

    // With target: node creation + collusion edges + boost edges + cleanup
    mockNeo4jInjectionWithTarget(5, 10, 5);

    // Attack: target 0xA gets boosted
    const attacked = { '0xA': 0.45, '0xB': 0.55 };
    mockComputeEigenTrust.mockResolvedValueOnce(makeEigentrustResult(attacked));
    mockComputeAgentRank.mockResolvedValueOnce(makeAgentrankResult(attacked));

    const result = await simulateSybilAttack({
      numSybilNodes: 5,
      numCollusionEdges: 10,
      targetAddress: '0xA',
    });

    expect(result.impact.targetBoostEigentrust).toBeCloseTo(0.15, 5);
    expect(result.impact.targetBoostAgentrank).toBeCloseTo(0.15, 5);
  });

  it('guarantees cleanup even when attack computation fails', async () => {
    const scores = { '0xA': 0.5 };

    // Baseline succeeds
    mockComputeEigenTrust.mockResolvedValueOnce(makeEigentrustResult(scores));
    mockComputeAgentRank.mockResolvedValueOnce(makeAgentrankResult(scores));

    // Node injection succeeds
    mockRun.mockResolvedValueOnce({
      records: [{ get: () => ({ toNumber: () => 5 }) }],
    });
    // Edge injection succeeds
    mockRun.mockResolvedValueOnce({
      records: [{ get: () => ({ toNumber: () => 10 }) }],
    });

    // Attack computation fails -- both must fail since Promise.all runs both
    mockComputeEigenTrust.mockRejectedValueOnce(new Error('Computation failed'));
    mockComputeAgentRank.mockRejectedValueOnce(new Error('Computation failed'));

    // Cleanup should still be called
    mockRun.mockResolvedValueOnce({ records: [] });

    await expect(simulateSybilAttack({
      numSybilNodes: 5,
      numCollusionEdges: 10,
    })).rejects.toThrow('Computation failed');

    // Verify cleanup ran (the 3rd mockRun call is the DETACH DELETE)
    expect(mockRun).toHaveBeenCalledTimes(3);
    const lastQuery = mockRun.mock.calls[2][0] as string;
    expect(lastQuery).toContain('DETACH DELETE');
  });
});
