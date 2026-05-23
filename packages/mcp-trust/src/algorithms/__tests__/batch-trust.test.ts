import { describe, it, expect, vi, beforeEach } from 'vitest';
import { batchComputeTrust } from '../batch-trust.js';
import type { CompositeScoreResult } from '../scoring-engine.js';

vi.mock('../scoring-engine.js', () => ({
  batchCompositeScores: vi.fn(),
}));

vi.mock('../../utils/logger.js', () => ({
  log: vi.fn(),
}));

import { batchCompositeScores } from '../scoring-engine.js';
const mockBatch = vi.mocked(batchCompositeScores);

function fakeResult(target: string, score: number, confidence = 0.5): CompositeScoreResult {
  return {
    address: target,
    compositeScore: score,
    confidence,
    breakdown: {
      eigentrust: { score: 0, normalizedScore: 0, rank: 0 },
      agentrank: { score: 0, normalizedScore: 0, rank: 0 },
      transitiveTrust: { score: 0, paths: 0, maxHops: 3 },
    },
    metadata: { totalNodes: 0, computeTimeMs: 1, dataFreshness: new Date(0) },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('batchComputeTrust', () => {
  it('returns empty result when no targets supplied', async () => {
    const r = await batchComputeTrust(['0xa'], []);
    expect(r.scores).toEqual([]);
    expect(r.targetCount).toBe(0);
    expect(r.anchorCount).toBe(1);
    expect(mockBatch).not.toHaveBeenCalled();
  });

  it('with no anchors, returns baseline composite scores', async () => {
    mockBatch.mockResolvedValueOnce(new Map([
      ['0xt1', fakeResult('0xt1', 40, 0.6)],
      ['0xt2', fakeResult('0xt2', 80, 0.9)],
    ]));

    const r = await batchComputeTrust([], ['0xt1', '0xt2']);

    expect(mockBatch).toHaveBeenCalledOnce();
    expect(mockBatch).toHaveBeenCalledWith(['0xt1', '0xt2']);
    expect(r.anchorCount).toBe(0);
    expect(r.scores).toHaveLength(2);
    expect(r.scores[0]).toMatchObject({
      target: '0xt1',
      compositeScore: 40,
      confidence: 0.6,
      anchorScores: [],
    });
    expect(r.scores[1]).toMatchObject({
      target: '0xt2',
      compositeScore: 80,
      confidence: 0.9,
      anchorScores: [],
    });
  });

  it('with one anchor, returns per-anchor breakdown', async () => {
    mockBatch.mockResolvedValueOnce(new Map([
      ['0xt1', fakeResult('0xt1', 50, 0.7)],
    ]));

    const r = await batchComputeTrust(['0xa'], ['0xt1']);

    expect(mockBatch).toHaveBeenCalledOnce();
    expect(mockBatch).toHaveBeenCalledWith(['0xt1'], '0xa');
    expect(r.scores[0]).toEqual({
      target: '0xt1',
      compositeScore: 50,
      confidence: 0.7,
      anchorScores: [
        { anchor: '0xa', compositeScore: 50, confidence: 0.7 },
      ],
    });
  });

  it('averages composite scores across multiple anchors', async () => {
    mockBatch
      .mockResolvedValueOnce(new Map([
        ['0xt1', fakeResult('0xt1', 60, 0.8)],
        ['0xt2', fakeResult('0xt2', 40, 0.4)],
      ]))
      .mockResolvedValueOnce(new Map([
        ['0xt1', fakeResult('0xt1', 80, 0.6)],
        ['0xt2', fakeResult('0xt2', 20, 0.2)],
      ]));

    const r = await batchComputeTrust(['0xa', '0xb'], ['0xt1', '0xt2']);

    expect(mockBatch).toHaveBeenCalledTimes(2);
    expect(mockBatch).toHaveBeenNthCalledWith(1, ['0xt1', '0xt2'], '0xa');
    expect(mockBatch).toHaveBeenNthCalledWith(2, ['0xt1', '0xt2'], '0xb');

    expect(r.anchorCount).toBe(2);
    expect(r.targetCount).toBe(2);
    expect(r.scores[0]).toEqual({
      target: '0xt1',
      compositeScore: 70, // (60 + 80) / 2
      confidence: 0.7,    // (0.8 + 0.6) / 2
      anchorScores: [
        { anchor: '0xa', compositeScore: 60, confidence: 0.8 },
        { anchor: '0xb', compositeScore: 80, confidence: 0.6 },
      ],
    });
    expect(r.scores[1]).toEqual({
      target: '0xt2',
      compositeScore: 30, // (40 + 20) / 2
      confidence: expect.closeTo(0.3, 5),
      anchorScores: [
        { anchor: '0xa', compositeScore: 40, confidence: 0.4 },
        { anchor: '0xb', compositeScore: 20, confidence: 0.2 },
      ],
    });
  });

  it('treats a missing target in the per-anchor map as zero', async () => {
    mockBatch.mockResolvedValueOnce(new Map([
      // 0xt1 missing -- batchCompositeScores didn't return it
      ['0xt2', fakeResult('0xt2', 100, 1.0)],
    ]));

    const r = await batchComputeTrust(['0xa'], ['0xt1', '0xt2']);

    expect(r.scores[0]).toEqual({
      target: '0xt1',
      compositeScore: 0,
      confidence: 0,
      anchorScores: [{ anchor: '0xa', compositeScore: 0, confidence: 0 }],
    });
    expect(r.scores[1].compositeScore).toBe(100);
  });

  it('with no anchors, treats missing baseline target as zero (?? fallback)', async () => {
    // 0xt2 is absent from the baseline map -- `r?.compositeScore ?? 0`
    // and `r?.confidence ?? 0` fallbacks should both fire.
    mockBatch.mockResolvedValueOnce(new Map([
      ['0xt1', fakeResult('0xt1', 50, 0.5)],
    ]));

    const r = await batchComputeTrust([], ['0xt1', '0xt2']);

    expect(r.anchorCount).toBe(0);
    expect(r.scores[1]).toEqual({
      target: '0xt2',
      compositeScore: 0,
      confidence: 0,
      anchorScores: [],
    });
  });

  it('reports computationTimeMs as a non-negative number', async () => {
    mockBatch.mockResolvedValueOnce(new Map([
      ['0xt1', fakeResult('0xt1', 10)],
    ]));
    const r = await batchComputeTrust(['0xa'], ['0xt1']);
    expect(r.computationTimeMs).toBeGreaterThanOrEqual(0);
  });
});
