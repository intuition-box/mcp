/**
 * Unified Composite Scoring Engine
 * Week 3: Phase 1 Product Module
 *
 * Combines EigenTrust (global trust), AgentRank (influence), and
 * personalized transitive trust into a single composite score.
 * This is the primary interface for downstream consumers
 * (MCP server, dashboard, API).
 *
 * Design:
 * - Global computations (EigenTrust, AgentRank) are cached with TTL
 * - Per-address lookups are O(1) against cached results
 * - Transitive trust is computed on-demand per (from, to) pair
 * - Batch API runs global algorithms once, then resolves all addresses
 */

import { log } from '../utils/logger.js';
import { computeEigenTrust } from './eigentrust.js';
import { computeAgentRank } from './agentrank.js';
import { computePersonalizedTrust } from './personalized.js';
import type { TrustComputationResult } from './types.js';
import type { AgentRankResult } from './agentrank.js';

// ============ Types ============

/**
 * Configuration for composite score computation
 */
export interface CompositeScoreConfig {
  /** Relative weights for each algorithm component (must sum to 1.0) */
  weights: {
    eigentrust: number;
    agentrank: number;
    transitiveTrust: number;
  };
  /** Whether to cache global algorithm results. Default true */
  cacheResults: boolean;
  /** Cache time-to-live in milliseconds. Default 300000 (5 min) */
  cacheTTL: number;
}

/**
 * Breakdown of an individual algorithm's contribution
 */
export interface EigentrustBreakdown {
  /** Raw score from the algorithm */
  score: number;
  /** Score normalized to [0, 1] relative to the network maximum */
  normalizedScore: number;
  /** Ordinal rank within the network (1 = highest) */
  rank: number;
}

export interface AgentrankBreakdown {
  /** Raw PageRank score */
  score: number;
  /** Score normalized to [0, 1] relative to the network maximum */
  normalizedScore: number;
  /** Ordinal rank within the network (1 = highest) */
  rank: number;
}

export interface TransitiveTrustBreakdown {
  /** Personalized trust score [0, 1] (0 if no fromAddress) */
  score: number;
  /** Number of trust paths found */
  paths: number;
  /** Maximum hops used in path search */
  maxHops: number;
}

/**
 * Full composite score result for a single address
 */
export interface CompositeScoreResult {
  /** The evaluated address */
  address: string;
  /** Final composite score on a 0-100 scale */
  compositeScore: number;
  /** Overall confidence based on data availability [0, 1] */
  confidence: number;
  /** Per-algorithm score breakdown */
  breakdown: {
    eigentrust: EigentrustBreakdown;
    agentrank: AgentrankBreakdown;
    transitiveTrust: TransitiveTrustBreakdown;
  };
  /** Computation metadata */
  metadata: {
    /** Total nodes in the graph at computation time */
    totalNodes: number;
    /** Time to compute this result in milliseconds */
    computeTimeMs: number;
    /** When the underlying data was last computed */
    dataFreshness: Date;
  };
}

// ============ Default Configuration ============

const DEFAULT_COMPOSITE_CONFIG: CompositeScoreConfig = {
  weights: {
    eigentrust: 0.4,
    agentrank: 0.3,
    transitiveTrust: 0.3,
  },
  cacheResults: true,
  cacheTTL: 300_000, // 5 minutes
};

const DEFAULT_MAX_HOPS = 3;

// ============ Cache ============

/**
 * Precomputed global data from EigenTrust and AgentRank,
 * indexed for O(1) per-address lookups
 */
interface CachedGlobalData {
  /** Raw EigenTrust result */
  eigentrust: TrustComputationResult;
  /** Raw AgentRank result */
  agentrank: AgentRankResult;
  /** EigenTrust score lookup by address */
  eigentrustScores: Map<string, number>;
  /** EigenTrust ordinal rank by address (1-indexed) */
  eigentrustRanks: Map<string, number>;
  /** AgentRank ordinal rank by address (1-indexed) */
  agentrankRanks: Map<string, number>;
  /** Maximum EigenTrust score (for normalization) */
  maxEigentrust: number;
  /** Maximum AgentRank score (for normalization) */
  maxAgentrank: number;
  /** Total nodes in the graph */
  totalNodes: number;
  /** When this cache entry was created */
  timestamp: number;
}

/** Module-level cache instance */
let globalCache: CachedGlobalData | null = null;

// ============ Main API ============

/**
 * Compute a composite trust score for a single address
 *
 * Combines three signals:
 * - EigenTrust: global sybil-resistant trust (weight 0.4)
 * - AgentRank: graph-structural influence (weight 0.3)
 * - Transitive trust: personalized path-based trust (weight 0.3, requires fromAddress)
 *
 * If fromAddress is not provided, transitive trust weight is redistributed
 * proportionally to the other two components.
 *
 * @param address - The address to evaluate
 * @param fromAddress - Optional source for personalized transitive trust
 * @param config - Optional partial configuration
 * @returns CompositeScoreResult with score, breakdown, and metadata
 */
export async function computeCompositeScore(
  address: string,
  fromAddress?: string,
  config?: Partial<CompositeScoreConfig>
): Promise<CompositeScoreResult> {
  const startTime = Date.now();
  const fullConfig = mergeConfig(config);

  log('debug', 'Computing composite score', {
    address,
    fromAddress: fromAddress || 'none',
  });

  // Ensure global data is available (cached or freshly computed)
  const global = await ensureGlobalData(fullConfig);

  // Look up EigenTrust
  const etScore = global.eigentrustScores.get(address) || 0;
  const etRank = global.eigentrustRanks.get(address) || global.totalNodes;
  const etNormalized = global.maxEigentrust > 0 ? etScore / global.maxEigentrust : 0;

  // Look up AgentRank
  const arScore = global.agentrank.ranks.get(address) || 0;
  const arRank = global.agentrankRanks.get(address) || global.totalNodes;
  const arNormalized = global.maxAgentrank > 0 ? arScore / global.maxAgentrank : 0;

  // Compute transitive trust if fromAddress is provided
  let ttScore = 0;
  let ttPaths = 0;
  const ttMaxHops = DEFAULT_MAX_HOPS;

  if (fromAddress) {
    const trustResult = await computePersonalizedTrust({
      fromAddress,
      toAddress: address,
      maxHops: ttMaxHops,
      minStake: 0,
    });
    ttScore = trustResult.score;
    ttPaths = trustResult.pathCount;
  }

  // Compute weighted composite
  const weights = resolveWeights(fullConfig.weights, !!fromAddress);
  const rawComposite = weights.eigentrust * etNormalized
    + weights.agentrank * arNormalized
    + weights.transitiveTrust * ttScore;

  // Scale to 0-100
  const compositeScore = Math.max(0, Math.min(100, rawComposite * 100));

  // Confidence: based on how many signals contributed meaningful data
  const confidence = computeConfidence(etScore, arScore, ttScore, !!fromAddress);

  const computeTimeMs = Date.now() - startTime;

  return {
    address,
    compositeScore,
    confidence,
    breakdown: {
      eigentrust: {
        score: etScore,
        normalizedScore: etNormalized,
        rank: etRank,
      },
      agentrank: {
        score: arScore,
        normalizedScore: arNormalized,
        rank: arRank,
      },
      transitiveTrust: {
        score: ttScore,
        paths: ttPaths,
        maxHops: ttMaxHops,
      },
    },
    metadata: {
      totalNodes: global.totalNodes,
      computeTimeMs,
      dataFreshness: new Date(global.timestamp),
    },
  };
}

/**
 * Compute composite scores for multiple addresses in a single batch
 *
 * Runs EigenTrust and AgentRank once, then resolves each address
 * against the cached results. Significantly more efficient than
 * calling computeCompositeScore in a loop.
 *
 * @param addresses - Array of addresses to evaluate
 * @param fromAddress - Optional source for personalized transitive trust
 * @param config - Optional partial configuration
 * @returns Map of address to CompositeScoreResult
 */
export async function batchCompositeScores(
  addresses: string[],
  fromAddress?: string,
  config?: Partial<CompositeScoreConfig>
): Promise<Map<string, CompositeScoreResult>> {
  const startTime = Date.now();
  const fullConfig = mergeConfig(config);

  log('info', 'Computing batch composite scores', {
    count: addresses.length,
    fromAddress: fromAddress || 'none',
  });

  // Ensure global data (single computation for entire batch)
  const global = await ensureGlobalData(fullConfig);

  const weights = resolveWeights(fullConfig.weights, !!fromAddress);
  const results = new Map<string, CompositeScoreResult>();

  // Batch personalized trust if fromAddress is provided
  let transitiveScores = new Map<string, { score: number; paths: number }>();
  if (fromAddress) {
    transitiveScores = await batchTransitiveTrust(fromAddress, addresses);
  }

  for (const address of addresses) {
    const perAddressStart = Date.now();

    // EigenTrust lookup
    const etScore = global.eigentrustScores.get(address) || 0;
    const etRank = global.eigentrustRanks.get(address) || global.totalNodes;
    const etNormalized = global.maxEigentrust > 0 ? etScore / global.maxEigentrust : 0;

    // AgentRank lookup
    const arScore = global.agentrank.ranks.get(address) || 0;
    const arRank = global.agentrankRanks.get(address) || global.totalNodes;
    const arNormalized = global.maxAgentrank > 0 ? arScore / global.maxAgentrank : 0;

    // Transitive trust lookup
    const tt = transitiveScores.get(address) || { score: 0, paths: 0 };

    const rawComposite = weights.eigentrust * etNormalized
      + weights.agentrank * arNormalized
      + weights.transitiveTrust * tt.score;

    const compositeScore = Math.max(0, Math.min(100, rawComposite * 100));
    const confidence = computeConfidence(etScore, arScore, tt.score, !!fromAddress);

    results.set(address, {
      address,
      compositeScore,
      confidence,
      breakdown: {
        eigentrust: { score: etScore, normalizedScore: etNormalized, rank: etRank },
        agentrank: { score: arScore, normalizedScore: arNormalized, rank: arRank },
        transitiveTrust: { score: tt.score, paths: tt.paths, maxHops: DEFAULT_MAX_HOPS },
      },
      metadata: {
        totalNodes: global.totalNodes,
        computeTimeMs: Date.now() - perAddressStart,
        dataFreshness: new Date(global.timestamp),
      },
    });
  }

  log('info', 'Batch composite scores complete', {
    count: results.size,
    totalTimeMs: Date.now() - startTime,
  });

  return results;
}

/**
 * Clear the global score cache
 *
 * Forces the next computation to rerun EigenTrust and AgentRank.
 * Useful after graph data changes (sync, attestation updates).
 */
export function clearScoreCache(): void {
  globalCache = null;
  log('debug', 'Score cache cleared');
}

// ============ Cache Management ============

/**
 * Ensure fresh global data is available, computing if necessary
 *
 * Checks cache validity (exists + within TTL), and if stale or missing,
 * runs EigenTrust and AgentRank in parallel, then builds lookup indexes.
 */
async function ensureGlobalData(config: CompositeScoreConfig): Promise<CachedGlobalData> {
  const now = Date.now();

  // Return cached data if fresh
  if (config.cacheResults && globalCache && (now - globalCache.timestamp) < config.cacheTTL) {
    log('debug', 'Using cached global scores', {
      ageMs: now - globalCache.timestamp,
      ttlMs: config.cacheTTL,
    });
    return globalCache;
  }

  log('info', 'Computing fresh global scores (EigenTrust + AgentRank)');

  // Run both algorithms in parallel
  const [eigentrustResult, agentrankResult] = await Promise.all([
    computeEigenTrust(),
    computeAgentRank(),
  ]);

  // Build EigenTrust lookup indexes
  const eigentrustScores = new Map<string, number>();
  const eigentrustRanks = new Map<string, number>();
  let maxEigentrust = 0;

  // Scores are already sorted descending
  for (let i = 0; i < eigentrustResult.scores.length; i++) {
    const s = eigentrustResult.scores[i];
    eigentrustScores.set(s.address, s.score);
    eigentrustRanks.set(s.address, i + 1); // 1-indexed
    if (s.score > maxEigentrust) {
      maxEigentrust = s.score;
    }
  }

  // Build AgentRank lookup indexes
  const agentrankRanks = new Map<string, number>();
  let maxAgentrank = 0;

  // Sort ranks descending to assign ordinal positions
  const sortedRanks = Array.from(agentrankResult.ranks.entries())
    .sort((a, b) => b[1] - a[1]);

  for (let i = 0; i < sortedRanks.length; i++) {
    const [addr, score] = sortedRanks[i];
    agentrankRanks.set(addr, i + 1); // 1-indexed
    if (score > maxAgentrank) {
      maxAgentrank = score;
    }
  }

  const totalNodes = Math.max(eigentrustResult.scores.length, agentrankResult.ranks.size);

  const cached: CachedGlobalData = {
    eigentrust: eigentrustResult,
    agentrank: agentrankResult,
    eigentrustScores,
    eigentrustRanks,
    agentrankRanks,
    maxEigentrust,
    maxAgentrank,
    totalNodes,
    timestamp: now,
  };

  if (config.cacheResults) {
    globalCache = cached;
  }

  log('info', 'Global scores computed and indexed', {
    eigentrustNodes: eigentrustScores.size,
    agentrankNodes: agentrankResult.ranks.size,
    maxEigentrust: maxEigentrust.toFixed(6),
    maxAgentrank: maxAgentrank.toFixed(6),
  });

  return cached;
}

// ============ Transitive Trust Batch ============

/**
 * Compute personalized transitive trust for multiple target addresses
 *
 * Runs personalized trust queries sequentially to avoid overloading Neo4j
 * with concurrent path queries. Each query is independent but shares
 * the same source address.
 */
async function batchTransitiveTrust(
  fromAddress: string,
  toAddresses: string[]
): Promise<Map<string, { score: number; paths: number }>> {
  const results = new Map<string, { score: number; paths: number }>();

  for (const toAddress of toAddresses) {
    // Skip self-loops
    if (toAddress === fromAddress) {
      results.set(toAddress, { score: 1, paths: 0 });
      continue;
    }

    try {
      const trust = await computePersonalizedTrust({
        fromAddress,
        toAddress,
        maxHops: DEFAULT_MAX_HOPS,
        minStake: 0,
      });
      results.set(toAddress, { score: trust.score, paths: trust.pathCount });
    } catch (error) {
      log('warn', 'Transitive trust failed for address', {
        from: fromAddress,
        to: toAddress,
        error: String(error),
      });
      results.set(toAddress, { score: 0, paths: 0 });
    }
  }

  return results;
}

// ============ Weight Resolution ============

/**
 * Resolve final weights, redistributing transitive trust weight
 * when no fromAddress is provided
 *
 * When transitive trust is unavailable, its weight is distributed
 * proportionally to the remaining components.
 */
function resolveWeights(
  weights: CompositeScoreConfig['weights'],
  hasTransitive: boolean
): { eigentrust: number; agentrank: number; transitiveTrust: number } {
  if (hasTransitive) {
    return { ...weights };
  }

  // Redistribute transitive weight proportionally
  const globalTotal = weights.eigentrust + weights.agentrank;
  if (globalTotal <= 0) {
    return { eigentrust: 0.5, agentrank: 0.5, transitiveTrust: 0 };
  }

  return {
    eigentrust: weights.eigentrust / globalTotal,
    agentrank: weights.agentrank / globalTotal,
    transitiveTrust: 0,
  };
}

// ============ Confidence ============

/**
 * Compute overall confidence based on data availability
 *
 * Factors:
 * - EigenTrust signal present (has nonzero score)
 * - AgentRank signal present (has nonzero score)
 * - Transitive trust signal present (if expected)
 * - Strength of each signal
 */
function computeConfidence(
  etScore: number,
  arScore: number,
  ttScore: number,
  hasTransitive: boolean
): number {
  let signals = 0;
  let totalSignals = 2; // ET + AR always expected

  if (etScore > 0) signals++;
  if (arScore > 0) signals++;

  if (hasTransitive) {
    totalSignals = 3;
    if (ttScore > 0) signals++;
  }

  // Base confidence from signal availability
  const availabilityFactor = signals / totalSignals;

  // Strength factor: diminishing returns on higher scores
  const strengths: number[] = [];
  if (etScore > 0) strengths.push(Math.min(1, etScore * 1000)); // Scale up tiny ET scores
  if (arScore > 0) strengths.push(Math.min(1, arScore * 1000));
  if (hasTransitive && ttScore > 0) strengths.push(ttScore);

  const strengthFactor = strengths.length > 0
    ? strengths.reduce((a, b) => a + b, 0) / strengths.length
    : 0;

  // 60% availability, 40% strength
  return Math.max(0, Math.min(1, 0.6 * availabilityFactor + 0.4 * strengthFactor));
}

// ============ Config Helpers ============

/**
 * Merge partial config with defaults
 */
function mergeConfig(config?: Partial<CompositeScoreConfig>): CompositeScoreConfig {
  if (!config) {
    return { ...DEFAULT_COMPOSITE_CONFIG };
  }

  return {
    weights: config.weights
      ? { ...DEFAULT_COMPOSITE_CONFIG.weights, ...config.weights }
      : { ...DEFAULT_COMPOSITE_CONFIG.weights },
    cacheResults: config.cacheResults ?? DEFAULT_COMPOSITE_CONFIG.cacheResults,
    cacheTTL: config.cacheTTL ?? DEFAULT_COMPOSITE_CONFIG.cacheTTL,
  };
}
