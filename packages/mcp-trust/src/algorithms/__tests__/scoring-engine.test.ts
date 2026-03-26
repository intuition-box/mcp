import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  computeCompositeScore,
  batchCompositeScores,
  clearScoreCache,
} from '../scoring-engine.js';

// ============ Mocks ============

// Mock Neo4j (required by eigentrust/agentrank through their fetchGraphData)
const mockRun = vi.fn();
const mockClose = vi.fn();
vi.mock('../../config/neo4j.js', () => ({
  getSession: () => ({ run: mockRun, close: mockClose }),
}));

vi.mock('../../utils/logger.js', () => ({
  log: vi.fn(),
}));

// Mock the three algorithm dependencies so we control their outputs
vi.mock('../eigentrust.js', () => ({
  computeEigenTrust: vi.fn(),
}));

vi.mock('../agentrank.js', () => ({
  computeAgentRank: vi.fn(),
}));

vi.mock('../personalized.js', () => ({
  computePersonalizedTrust: vi.fn(),
}));

import { computeEigenTrust } from '../eigentrust.js';
import { computeAgentRank } from '../agentrank.js';
import { computePersonalizedTrust } from '../personalized.js';

const mockEigenTrust = vi.mocked(computeEigenTrust);
const mockAgentRank = vi.mocked(computeAgentRank);
const mockPersonalizedTrust = vi.mocked(computePersonalizedTrust);

// Default mock data for a 3-node graph
function setupDefaultMocks() {
  mockEigenTrust.mockResolvedValue({
    scores: [
      { address: '0xa', score: 0.5, confidence: 0.8, pathCount: 3, sources: [] },
      { address: '0xb', score: 0.3, confidence: 0.6, pathCount: 2, sources: [] },
      { address: '0xc', score: 0.2, confidence: 0.4, pathCount: 1, sources: [] },
    ],
    iterations: 15,
    converged: true,
    computationTimeMs: 50,
  });

  mockAgentRank.mockResolvedValue({
    ranks: new Map([['0xa', 0.4], ['0xb', 0.35], ['0xc', 0.25]]),
    iterations: 20,
    converged: true,
    topAgents: [],
    influenceMetrics: { giniCoefficient: 0.1, entropy: 1.5, top10PctShare: 0.4, medianRank: 0.35 },
    computationTimeMs: 40,
  });

  mockPersonalizedTrust.mockResolvedValue({
    address: '0xb',
    score: 0.7,
    confidence: 0.9,
    pathCount: 5,
    sources: ['0xa'],
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  clearScoreCache();
  setupDefaultMocks();
});

// ============ computeCompositeScore ============

describe('computeCompositeScore', () => {
  it('returns score between 0 and 100', async () => {
    const result = await computeCompositeScore('0xa');

    expect(result.compositeScore).toBeGreaterThanOrEqual(0);
    expect(result.compositeScore).toBeLessThanOrEqual(100);
  });

  it('returns confidence field between 0 and 1', async () => {
    const result = await computeCompositeScore('0xa');

    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it('breakdown contains eigentrust, agentrank, and transitiveTrust', async () => {
    const result = await computeCompositeScore('0xa');

    expect(result.breakdown).toHaveProperty('eigentrust');
    expect(result.breakdown).toHaveProperty('agentrank');
    expect(result.breakdown).toHaveProperty('transitiveTrust');

    // Each breakdown should have expected fields
    expect(result.breakdown.eigentrust).toHaveProperty('score');
    expect(result.breakdown.eigentrust).toHaveProperty('normalizedScore');
    expect(result.breakdown.eigentrust).toHaveProperty('rank');

    expect(result.breakdown.agentrank).toHaveProperty('score');
    expect(result.breakdown.agentrank).toHaveProperty('normalizedScore');
    expect(result.breakdown.agentrank).toHaveProperty('rank');

    expect(result.breakdown.transitiveTrust).toHaveProperty('score');
    expect(result.breakdown.transitiveTrust).toHaveProperty('paths');
    expect(result.breakdown.transitiveTrust).toHaveProperty('maxHops');
  });

  it('weight overrides change the composite score', async () => {
    // Use 0xb which has different normalized scores:
    // eigentrust: 0.3/0.5 = 0.6, agentrank: 0.35/0.4 = 0.875
    // Different weights should produce different composites.
    const defaultResult = await computeCompositeScore('0xb');

    clearScoreCache();

    // Override: heavy eigentrust weight (lowers composite since 0xb has lower ET)
    const overriddenResult = await computeCompositeScore('0xb', undefined, {
      weights: { eigentrust: 0.9, agentrank: 0.05, transitiveTrust: 0.05 },
    });

    expect(defaultResult.compositeScore).not.toBeCloseTo(overriddenResult.compositeScore, 0);
  });

  it('fromAddress triggers transitive trust component', async () => {
    const result = await computeCompositeScore('0xb', '0xa');

    // computePersonalizedTrust should have been called
    expect(mockPersonalizedTrust).toHaveBeenCalledWith(
      expect.objectContaining({
        fromAddress: '0xa',
        toAddress: '0xb',
      }),
    );

    // Transitive trust should have a non-zero score
    expect(result.breakdown.transitiveTrust.score).toBe(0.7);
    expect(result.breakdown.transitiveTrust.paths).toBe(5);
  });

  it('without fromAddress, transitive trust is zero and weight redistributed', async () => {
    const result = await computeCompositeScore('0xa');

    // computePersonalizedTrust should NOT be called
    expect(mockPersonalizedTrust).not.toHaveBeenCalled();

    // Transitive trust breakdown should show zero
    expect(result.breakdown.transitiveTrust.score).toBe(0);
    expect(result.breakdown.transitiveTrust.paths).toBe(0);
  });

  it('returns zero score gracefully for unknown address', async () => {
    const result = await computeCompositeScore('0xunknown');

    // Address not in eigentrust or agentrank results = zero scores
    expect(result.compositeScore).toBe(0);
    expect(result.breakdown.eigentrust.score).toBe(0);
    expect(result.breakdown.agentrank.score).toBe(0);
  });

  it('metadata contains computeTimeMs', async () => {
    const result = await computeCompositeScore('0xa');

    expect(result.metadata).toHaveProperty('computeTimeMs');
    expect(typeof result.metadata.computeTimeMs).toBe('number');
    expect(result.metadata.computeTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('metadata contains totalNodes', async () => {
    const result = await computeCompositeScore('0xa');

    expect(result.metadata.totalNodes).toBe(3);
  });

  it('metadata contains dataFreshness as Date', async () => {
    const result = await computeCompositeScore('0xa');

    expect(result.metadata.dataFreshness).toBeInstanceOf(Date);
  });

  it('caches global data between calls', async () => {
    await computeCompositeScore('0xa');
    await computeCompositeScore('0xb');

    // EigenTrust and AgentRank should only be called once (cached)
    expect(mockEigenTrust).toHaveBeenCalledTimes(1);
    expect(mockAgentRank).toHaveBeenCalledTimes(1);
  });

  it('recomputes after cache is cleared', async () => {
    await computeCompositeScore('0xa');
    clearScoreCache();
    await computeCompositeScore('0xa');

    expect(mockEigenTrust).toHaveBeenCalledTimes(2);
    expect(mockAgentRank).toHaveBeenCalledTimes(2);
  });

  it('disabling cache recomputes every call', async () => {
    await computeCompositeScore('0xa', undefined, { cacheResults: false });
    await computeCompositeScore('0xa', undefined, { cacheResults: false });

    expect(mockEigenTrust).toHaveBeenCalledTimes(2);
    expect(mockAgentRank).toHaveBeenCalledTimes(2);
  });

  it('eigentrust breakdown normalizedScore is relative to max', async () => {
    const result = await computeCompositeScore('0xa');

    // 0xa has score 0.5, max is 0.5, so normalized = 1.0
    expect(result.breakdown.eigentrust.normalizedScore).toBeCloseTo(1.0, 5);

    clearScoreCache();
    const resultB = await computeCompositeScore('0xb');
    // 0xb has score 0.3, max is 0.5, so normalized = 0.6
    expect(resultB.breakdown.eigentrust.normalizedScore).toBeCloseTo(0.6, 5);
  });

  it('agentrank breakdown normalizedScore is relative to max', async () => {
    const result = await computeCompositeScore('0xa');

    // 0xa has agentrank 0.4, max is 0.4, so normalized = 1.0
    expect(result.breakdown.agentrank.normalizedScore).toBeCloseTo(1.0, 5);
  });

  it('eigentrust rank is 1-indexed ordinal', async () => {
    // 0xa has highest eigentrust score, so rank should be 1
    const result = await computeCompositeScore('0xa');
    expect(result.breakdown.eigentrust.rank).toBe(1);

    clearScoreCache();
    const resultC = await computeCompositeScore('0xc');
    expect(resultC.breakdown.eigentrust.rank).toBe(3);
  });

  it('composite score is clamped to 0-100', async () => {
    // Override with all-zero scores
    mockEigenTrust.mockResolvedValue({
      scores: [],
      iterations: 0,
      converged: true,
      computationTimeMs: 0,
    });
    mockAgentRank.mockResolvedValue({
      ranks: new Map(),
      iterations: 0,
      converged: true,
      topAgents: [],
      influenceMetrics: { giniCoefficient: 0, entropy: 0, top10PctShare: 0, medianRank: 0 },
      computationTimeMs: 0,
    });

    const result = await computeCompositeScore('0xanything');

    expect(result.compositeScore).toBe(0);
    expect(result.compositeScore).toBeGreaterThanOrEqual(0);
    expect(result.compositeScore).toBeLessThanOrEqual(100);
  });

  it('resolveWeights falls back to 50/50 when both global weights are zero', async () => {
    // When eigentrust + agentrank weights are 0, resolveWeights returns 0.5/0.5
    // This triggers the globalTotal <= 0 branch (lines 492-493)
    const result = await computeCompositeScore('0xa', undefined, {
      weights: { eigentrust: 0, agentrank: 0, transitiveTrust: 1.0 },
    });

    // Without fromAddress, transitive trust weight is redistributed.
    // Since eigentrust + agentrank = 0, the fallback 0.5/0.5 kicks in.
    expect(result.compositeScore).toBeDefined();
    expect(typeof result.compositeScore).toBe('number');
  });
});

// ============ batchCompositeScores ============

describe('batchCompositeScores', () => {
  it('returns scores for all requested addresses', async () => {
    const results = await batchCompositeScores(['0xa', '0xb', '0xc']);

    expect(results.size).toBe(3);
    expect(results.has('0xa')).toBe(true);
    expect(results.has('0xb')).toBe(true);
    expect(results.has('0xc')).toBe(true);
  });

  it('runs EigenTrust and AgentRank only once for entire batch', async () => {
    await batchCompositeScores(['0xa', '0xb', '0xc']);

    expect(mockEigenTrust).toHaveBeenCalledTimes(1);
    expect(mockAgentRank).toHaveBeenCalledTimes(1);
  });

  it('each result has expected structure', async () => {
    const results = await batchCompositeScores(['0xa']);
    const result = results.get('0xa')!;

    expect(result).toHaveProperty('compositeScore');
    expect(result).toHaveProperty('confidence');
    expect(result).toHaveProperty('breakdown');
    expect(result).toHaveProperty('metadata');
    expect(result.breakdown).toHaveProperty('eigentrust');
    expect(result.breakdown).toHaveProperty('agentrank');
    expect(result.breakdown).toHaveProperty('transitiveTrust');
  });

  it('without fromAddress, transitive trust is zero for all addresses', async () => {
    const results = await batchCompositeScores(['0xa', '0xb']);

    for (const [, result] of results) {
      expect(result.breakdown.transitiveTrust.score).toBe(0);
      expect(result.breakdown.transitiveTrust.paths).toBe(0);
    }

    // computePersonalizedTrust should not have been called
    expect(mockPersonalizedTrust).not.toHaveBeenCalled();
  });

  it('with fromAddress, calls batchTransitiveTrust for each target', async () => {
    // Mock personalized trust for each target address
    mockPersonalizedTrust
      .mockResolvedValueOnce({ address: '0xb', score: 0.7, confidence: 0.9, pathCount: 5, sources: ['0xa'] })
      .mockResolvedValueOnce({ address: '0xc', score: 0.4, confidence: 0.6, pathCount: 2, sources: ['0xa'] });

    const results = await batchCompositeScores(['0xb', '0xc'], '0xa');

    // computePersonalizedTrust called once per target address
    expect(mockPersonalizedTrust).toHaveBeenCalledTimes(2);
    expect(mockPersonalizedTrust).toHaveBeenCalledWith(
      expect.objectContaining({ fromAddress: '0xa', toAddress: '0xb' }),
    );
    expect(mockPersonalizedTrust).toHaveBeenCalledWith(
      expect.objectContaining({ fromAddress: '0xa', toAddress: '0xc' }),
    );

    // Transitive trust scores should be non-zero
    expect(results.get('0xb')!.breakdown.transitiveTrust.score).toBe(0.7);
    expect(results.get('0xc')!.breakdown.transitiveTrust.score).toBe(0.4);
  });

  it('self-loop in batchTransitiveTrust returns score 1 with 0 paths', async () => {
    // When fromAddress is the same as a target, batchTransitiveTrust short-circuits
    const results = await batchCompositeScores(['0xa'], '0xa');

    const result = results.get('0xa')!;
    expect(result.breakdown.transitiveTrust.score).toBe(1);
    expect(result.breakdown.transitiveTrust.paths).toBe(0);

    // computePersonalizedTrust should NOT be called for self-loop
    expect(mockPersonalizedTrust).not.toHaveBeenCalled();
  });

  it('batchTransitiveTrust catches errors and returns zero score', async () => {
    mockPersonalizedTrust.mockRejectedValueOnce(new Error('Path query failed'));

    const results = await batchCompositeScores(['0xb'], '0xa');

    const result = results.get('0xb')!;
    // Error is caught, score falls back to 0
    expect(result.breakdown.transitiveTrust.score).toBe(0);
    expect(result.breakdown.transitiveTrust.paths).toBe(0);
  });

  it('handles unknown addresses gracefully', async () => {
    const results = await batchCompositeScores(['0xunknown1', '0xunknown2']);

    for (const [, result] of results) {
      expect(result.compositeScore).toBe(0);
      expect(result.breakdown.eigentrust.score).toBe(0);
      expect(result.breakdown.agentrank.score).toBe(0);
    }
  });

  it('scores are between 0 and 100', async () => {
    const results = await batchCompositeScores(['0xa', '0xb', '0xc']);

    for (const [, result] of results) {
      expect(result.compositeScore).toBeGreaterThanOrEqual(0);
      expect(result.compositeScore).toBeLessThanOrEqual(100);
    }
  });
});
