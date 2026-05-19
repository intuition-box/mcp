/**
 * Batch trust scoring over a set of (anchor, target) pairs.
 *
 * Given N anchors (trust sources) and M targets, returns one composite
 * score per target. Each target's score is the mean of the per-anchor
 * composite scores -- i.e. trust *from the perspective of the anchor set*.
 *
 * Implementation reuses batchCompositeScores so:
 *   - EigenTrust and AgentRank run once (cached after first anchor)
 *   - Per-anchor cost is dominated by transitive trust path queries
 */

import { log } from '../utils/logger.js';
import {
  batchCompositeScores,
  type CompositeScoreResult,
} from './scoring-engine.js';

export interface AnchorScore {
  anchor: string;
  compositeScore: number;
  confidence: number;
}

export interface BatchTrustEntry {
  target: string;
  /** Mean composite score across all anchors (0-100). */
  compositeScore: number;
  /** Mean confidence across all anchors (0-1). */
  confidence: number;
  /** Per-anchor breakdown -- empty when no anchors were supplied. */
  anchorScores: AnchorScore[];
}

export interface BatchComputeTrustResult {
  anchorCount: number;
  targetCount: number;
  computationTimeMs: number;
  scores: BatchTrustEntry[];
}

/**
 * Compute composite trust scores for each target from the perspective of
 * one or more anchor addresses.
 *
 * If anchors is empty, returns the un-personalized composite score for
 * each target (EigenTrust + AgentRank only, no transitive component).
 */
export async function batchComputeTrust(
  anchors: string[],
  targets: string[],
): Promise<BatchComputeTrustResult> {
  const startTime = Date.now();

  if (targets.length === 0) {
    return {
      anchorCount: anchors.length,
      targetCount: 0,
      computationTimeMs: 0,
      scores: [],
    };
  }

  log('info', 'batch_compute_trust', {
    anchors: anchors.length,
    targets: targets.length,
  });

  if (anchors.length === 0) {
    const baseline = await batchCompositeScores(targets);
    const scores: BatchTrustEntry[] = targets.map(target => {
      const r = baseline.get(target);
      return {
        target,
        compositeScore: r?.compositeScore ?? 0,
        confidence: r?.confidence ?? 0,
        anchorScores: [],
      };
    });
    return {
      anchorCount: 0,
      targetCount: targets.length,
      computationTimeMs: Date.now() - startTime,
      scores,
    };
  }

  // Sequential by anchor: the first call populates the global cache, every
  // subsequent call only pays the transitive-trust cost for that anchor.
  const perAnchor: Array<Map<string, CompositeScoreResult>> = [];
  for (const anchor of anchors) {
    perAnchor.push(await batchCompositeScores(targets, anchor));
  }

  const scores: BatchTrustEntry[] = targets.map(target => {
    const anchorScores: AnchorScore[] = anchors.map((anchor, i) => {
      const r = perAnchor[i].get(target);
      return {
        anchor,
        compositeScore: r?.compositeScore ?? 0,
        confidence: r?.confidence ?? 0,
      };
    });

    const n = anchorScores.length;
    const avgComposite = anchorScores.reduce((s, a) => s + a.compositeScore, 0) / n;
    const avgConfidence = anchorScores.reduce((s, a) => s + a.confidence, 0) / n;

    return {
      target,
      compositeScore: avgComposite,
      confidence: avgConfidence,
      anchorScores,
    };
  });

  return {
    anchorCount: anchors.length,
    targetCount: targets.length,
    computationTimeMs: Date.now() - startTime,
    scores,
  };
}
