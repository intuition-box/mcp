/**
 * Personalized trust computation
 * Week 2: Trust Algorithm Implementation
 *
 * Computes trust scores from the perspective of a specific address.
 * Unlike global EigenTrust, personalized trust answers:
 * "How much should address A trust address B?"
 */

import { getSession } from '../config/neo4j.js';
import { log } from '../utils/logger.js';
import {
  TrustScore,
  TrustPath,
  PersonalizedTrustQuery,
} from './types.js';
import {
  DEFAULT_MAX_HOPS,
  DEFAULT_QUERY_CONFIG,
  getPredicateWeight,
} from './constants.js';
import {
  findTrustPaths,
  findOutgoingTrustPaths,
  calculatePathTrust,
} from './pathfinding.js';

// ============ Constants ============

/**
 * Weight factor for path length in aggregation
 * Shorter paths receive higher weight: weight = PATH_LENGTH_WEIGHT_BASE ^ (maxHops - pathLength)
 */
const PATH_LENGTH_WEIGHT_BASE = 1.5;

/**
 * Minimum paths required for high confidence
 */
const HIGH_CONFIDENCE_PATH_THRESHOLD = 5;

/**
 * Damping factor for personalized PageRank
 * Probability of continuing the random walk vs teleporting back to source
 */
const PERSONALIZED_PAGERANK_DAMPING = 0.85;

/**
 * Maximum iterations for personalized PageRank
 */
const MAX_PAGERANK_ITERATIONS = 50;

/**
 * Convergence threshold for personalized PageRank
 */
const PAGERANK_CONVERGENCE_THRESHOLD = 0.0001;

// ============ Main Functions ============

/**
 * Compute personalized trust score from one address to another
 *
 * Uses path-based computation: finds all paths from source to target,
 * calculates trust for each path, and aggregates into a single score.
 *
 * @param query - Query parameters (fromAddress, toAddress, maxHops, minStake)
 * @returns TrustScore with aggregated score, confidence, and path information
 */
export async function computePersonalizedTrust(
  query: PersonalizedTrustQuery
): Promise<TrustScore> {
  const { fromAddress } = query;

  if (Array.isArray(fromAddress)) {
    if (fromAddress.length === 0) {
      return createZeroTrustScore(query.toAddress);
    }

    const perAnchorResults = await Promise.all(
      fromAddress.map(anchor =>
        computeSinglePersonalizedTrust({ ...query, fromAddress: anchor })
      )
    );

    const n = perAnchorResults.length;
    const avgScore = perAnchorResults.reduce((sum, r) => sum + r.score, 0) / n;
    const avgConfidence = perAnchorResults.reduce((sum, r) => sum + r.confidence, 0) / n;
    const totalPathCount = perAnchorResults.reduce((sum, r) => sum + r.pathCount, 0);
    const uniqueSources = Array.from(
      new Set(perAnchorResults.flatMap(r => r.sources))
    );

    return {
      address: query.toAddress,
      score: Math.max(0, Math.min(1, avgScore)),
      confidence: Math.max(0, Math.min(1, avgConfidence)),
      pathCount: totalPathCount,
      sources: uniqueSources,
    };
  }

  return computeSinglePersonalizedTrust({ ...query, fromAddress });
}

/**
 * Core single-anchor personalized trust computation.
 * Separated so the exported computePersonalizedTrust can dispatch between
 * single-string and string[] (group anchor) modes without recursion.
 */
async function computeSinglePersonalizedTrust(
  query: PersonalizedTrustQuery & { fromAddress: string }
): Promise<TrustScore> {
  const fullQuery: PersonalizedTrustQuery & { fromAddress: string } = {
    ...DEFAULT_QUERY_CONFIG,
    ...query,
  };

  const { fromAddress, toAddress, maxHops, minStake } = fullQuery;

  log('debug', 'Computing personalized trust', {
    from: fromAddress,
    to: toAddress,
    maxHops,
    minStake,
  });

  // Fast path: check for direct trust first
  const directTrust = await getDirectTrust(fromAddress, toAddress);
  if (directTrust !== null && maxHops === 1) {
    return directTrust;
  }

  // Find all paths from source to target
  const pathResult = await findTrustPaths(fromAddress, toAddress, maxHops);

  // Filter paths by minimum stake if specified
  const filteredPaths = minStake > 0
    ? pathResult.paths.filter(path => {
        const totalStake = path.stakes.reduce((sum, s) => sum + s, 0);
        return totalStake >= minStake;
      })
    : pathResult.paths;

  // If no paths found, return zero trust
  if (filteredPaths.length === 0) {
    log('debug', 'No trust paths found', { from: fromAddress, to: toAddress });
    return createZeroTrustScore(toAddress);
  }

  // Aggregate paths into single score
  const aggregatedScore = aggregatePathTrust(filteredPaths, maxHops);

  // Include direct trust source if exists
  if (directTrust !== null) {
    aggregatedScore.sources = [fromAddress, ...aggregatedScore.sources];
  }

  log('debug', 'Personalized trust computed', {
    from: fromAddress,
    to: toAddress,
    score: aggregatedScore.score,
    pathCount: aggregatedScore.pathCount,
  });

  return aggregatedScore;
}

/**
 * Compute personalized trust scores for ALL reachable addresses from a starting point
 *
 * Uses personalized PageRank: a random walk that always teleports back to the
 * source address, ensuring scores reflect trust relative to the source.
 *
 * @param fromAddress - Source address (trust originates here)
 * @param maxHops - Maximum depth to explore (default: 3)
 * @returns Map of address to TrustScore for all reachable addresses
 */
export async function computePersonalizedTrustNetwork(
  fromAddress: string,
  maxHops: number = DEFAULT_MAX_HOPS
): Promise<Map<string, TrustScore>> {
  const normalizedFrom = fromAddress.toLowerCase();

  log('info', 'Computing personalized trust network', {
    from: normalizedFrom,
    maxHops,
  });

  // Find all outgoing paths to discover reachable addresses
  const pathResult = await findOutgoingTrustPaths(normalizedFrom, maxHops);

  if (pathResult.paths.length === 0) {
    log('debug', 'No outgoing paths found', { from: normalizedFrom });
    return new Map();
  }

  // Group paths by target address
  const pathsByTarget = groupPathsByTarget(pathResult.paths);

  // Build adjacency structure for PageRank
  const { adjacency, allAddresses } = buildAdjacencyFromPaths(pathResult.paths, normalizedFrom);

  // Run personalized PageRank
  const pageRankScores = runPersonalizedPageRank(
    allAddresses,
    adjacency,
    normalizedFrom
  );

  // Convert to TrustScore map, combining PageRank with path-based confidence
  const result = new Map<string, TrustScore>();

  for (const [address, prScore] of pageRankScores) {
    // Skip the source address
    if (address === normalizedFrom) {
      continue;
    }

    const paths = pathsByTarget.get(address) || [];
    const pathCount = paths.length;

    // Confidence based on path diversity and PageRank convergence
    const confidence = computeNetworkConfidence(pathCount, paths);

    // Collect source addresses (immediate neighbors that lead to this target)
    const sources = collectSources(paths, normalizedFrom);

    result.set(address, {
      address,
      score: prScore,
      confidence,
      pathCount,
      sources,
    });
  }

  log('info', 'Personalized trust network computed', {
    from: normalizedFrom,
    reachableCount: result.size,
  });

  return result;
}

/**
 * Aggregate multiple trust paths into a single TrustScore
 *
 * Strategy:
 * - Shorter paths receive higher weight (more direct trust)
 * - Uses weighted average of path trust values
 * - Confidence based on path count and score consistency
 *
 * @param paths - Array of trust paths to aggregate
 * @param maxHops - Maximum hops used in query (for weight calculation)
 * @returns Aggregated TrustScore
 */
export function aggregatePathTrust(
  paths: TrustPath[],
  maxHops: number = DEFAULT_MAX_HOPS
): TrustScore {
  if (paths.length === 0) {
    return createZeroTrustScore('');
  }

  // Get target address from first path
  const targetAddress = paths[0].addresses[paths[0].addresses.length - 1];

  // Calculate trust and weight for each path
  const pathData = paths.map(path => {
    const trust = calculatePathTrust(path);
    const pathLength = path.predicates.length;
    // Shorter paths get higher weight
    const weight = Math.pow(PATH_LENGTH_WEIGHT_BASE, maxHops - pathLength);
    return { path, trust, weight };
  });

  // Weighted average of trust values
  let totalWeight = 0;
  let weightedSum = 0;

  for (const { trust, weight } of pathData) {
    weightedSum += trust * weight;
    totalWeight += weight;
  }

  const score = totalWeight > 0 ? weightedSum / totalWeight : 0;

  // Calculate confidence based on:
  // 1. Number of paths (more paths = higher confidence)
  // 2. Consistency of trust values (similar values = higher confidence)
  const confidence = computeAggregationConfidence(pathData.map(d => d.trust));

  // Collect unique source addresses (second node in each path, if exists)
  const sources = collectPathSources(paths);

  return {
    address: targetAddress,
    score: Math.max(0, Math.min(1, score)),
    confidence,
    pathCount: paths.length,
    sources,
  };
}

/**
 * Compute trust using direct path-based calculation with decay
 *
 * @param fromAddress - Source address
 * @param toAddress - Target address
 * @param maxHops - Maximum number of hops (default: 3)
 * @returns TrustScore based on path analysis
 */
export async function computeTrustWithDecay(
  fromAddress: string,
  toAddress: string,
  maxHops: number = DEFAULT_MAX_HOPS
): Promise<TrustScore> {
  const pathResult = await findTrustPaths(fromAddress, toAddress, maxHops);

  if (pathResult.paths.length === 0) {
    return createZeroTrustScore(toAddress);
  }

  // Use the strongest path as primary score
  const strongestPath = pathResult.strongestPath;
  const primaryScore = strongestPath ? calculatePathTrust(strongestPath) : 0;

  // Aggregate all paths for confidence and supplementary score
  const aggregated = aggregatePathTrust(pathResult.paths, maxHops);

  // Blend strongest path with aggregate (70% strongest, 30% aggregate)
  const blendedScore = 0.7 * primaryScore + 0.3 * aggregated.score;

  return {
    address: toAddress,
    score: Math.max(0, Math.min(1, blendedScore)),
    confidence: aggregated.confidence,
    pathCount: pathResult.paths.length,
    sources: aggregated.sources,
  };
}

/**
 * Check for direct attestation (single hop) between two addresses
 * Used as fast path before full computation
 *
 * @param fromAddress - Source address (attester)
 * @param toAddress - Target address (attestee)
 * @returns TrustScore if direct edge exists, null otherwise
 */
export async function getDirectTrust(
  fromAddress: string,
  toAddress: string
): Promise<TrustScore | null> {
  const session = getSession();
  const normalizedFrom = fromAddress.toLowerCase();
  const normalizedTo = toAddress.toLowerCase();

  try {
    const result = await session.run(
      `
      MATCH (from:Address {id: $fromAddress})-[r:ATTESTS]->(to:Address {id: $toAddress})
      RETURN r.stakeAmount as stakeAmount,
             r.predicate as predicate,
             r.timestamp as timestamp
      LIMIT 1
      `,
      {
        fromAddress: normalizedFrom,
        toAddress: normalizedTo,
      }
    );

    if (result.records.length === 0) {
      return null;
    }

    const record = result.records[0];
    const stakeAmount = extractNumber(record.get('stakeAmount'));
    const predicate = String(record.get('predicate') || 'unknown');

    // Calculate direct trust score
    const predicateWeight = getPredicateWeight(predicate);
    const stakeWeight = normalizeStakeForDirect(stakeAmount);
    const score = stakeWeight * predicateWeight;

    return {
      address: normalizedTo,
      score: Math.max(0, Math.min(1, score)),
      confidence: 1.0, // Direct attestation = maximum confidence
      pathCount: 1,
      sources: [normalizedFrom],
    };
  } catch (error) {
    log('error', 'Failed to get direct trust', {
      error: String(error),
      from: normalizedFrom,
      to: normalizedTo,
    });
    return null;
  } finally {
    await session.close();
  }
}

// ============ Personalized PageRank ============

/**
 * Run personalized PageRank starting from a specific source
 *
 * @param addresses - All addresses in the subgraph
 * @param adjacency - Adjacency map with edge weights
 * @param sourceAddress - Personalization source (teleport destination)
 * @returns Map of address to PageRank score
 */
function runPersonalizedPageRank(
  addresses: string[],
  adjacency: Map<string, Map<string, number>>,
  sourceAddress: string
): Map<string, number> {
  const n = addresses.length;
  if (n === 0) {
    return new Map();
  }

  // Initialize scores: source gets 1, others get 0
  let scores = new Map<string, number>();
  for (const addr of addresses) {
    scores.set(addr, addr === sourceAddress ? 1.0 : 0.0);
  }

  // Precompute outgoing sums for normalization
  const outgoingSums = new Map<string, number>();
  for (const [from, edges] of adjacency) {
    let sum = 0;
    for (const weight of edges.values()) {
      sum += weight;
    }
    outgoingSums.set(from, sum);
  }

  // Iterate until convergence
  for (let iteration = 0; iteration < MAX_PAGERANK_ITERATIONS; iteration++) {
    const newScores = new Map<string, number>();
    let maxDiff = 0;

    for (const addr of addresses) {
      // Teleport component: always teleport back to source
      let newScore = (1 - PERSONALIZED_PAGERANK_DAMPING) * (addr === sourceAddress ? 1.0 : 0.0);

      // Random walk component: sum contributions from incoming edges
      for (const [from, edges] of adjacency) {
        const edgeWeight = edges.get(addr);
        if (edgeWeight !== undefined && edgeWeight > 0) {
          const fromScore = scores.get(from) || 0;
          const outSum = outgoingSums.get(from) || 1;
          newScore += PERSONALIZED_PAGERANK_DAMPING * fromScore * (edgeWeight / outSum);
        }
      }

      newScores.set(addr, newScore);

      const oldScore = scores.get(addr) || 0;
      maxDiff = Math.max(maxDiff, Math.abs(newScore - oldScore));
    }

    scores = newScores;

    if (maxDiff < PAGERANK_CONVERGENCE_THRESHOLD) {
      log('debug', 'Personalized PageRank converged', { iteration: iteration + 1 });
      break;
    }
  }

  // Normalize scores so they sum to 1
  let sum = 0;
  for (const score of scores.values()) {
    sum += score;
  }
  if (sum > 0) {
    for (const [addr, score] of scores) {
      scores.set(addr, score / sum);
    }
  }

  return scores;
}

// ============ Helper Functions ============

/**
 * Create a zero trust score for an address
 */
function createZeroTrustScore(address: string): TrustScore {
  return {
    address,
    score: 0,
    confidence: 0,
    pathCount: 0,
    sources: [],
  };
}

/**
 * Group paths by their target address
 */
function groupPathsByTarget(paths: TrustPath[]): Map<string, TrustPath[]> {
  const groups = new Map<string, TrustPath[]>();

  for (const path of paths) {
    const target = path.addresses[path.addresses.length - 1];
    const existing = groups.get(target) || [];
    existing.push(path);
    groups.set(target, existing);
  }

  return groups;
}

/**
 * Build adjacency structure from paths for PageRank
 */
function buildAdjacencyFromPaths(
  paths: TrustPath[],
  sourceAddress: string
): { adjacency: Map<string, Map<string, number>>; allAddresses: string[] } {
  const adjacency = new Map<string, Map<string, number>>();
  const addressSet = new Set<string>([sourceAddress]);

  for (const path of paths) {
    for (let i = 0; i < path.addresses.length - 1; i++) {
      const from = path.addresses[i];
      const to = path.addresses[i + 1];
      const stake = path.stakes[i] || 0;
      const predicate = path.predicates[i] || 'unknown';
      const weight = stake * getPredicateWeight(predicate);

      addressSet.add(from);
      addressSet.add(to);

      if (!adjacency.has(from)) {
        adjacency.set(from, new Map());
      }

      const edges = adjacency.get(from)!;
      const currentWeight = edges.get(to) || 0;
      edges.set(to, Math.max(currentWeight, weight)); // Use max weight if multiple paths
    }
  }

  return {
    adjacency,
    allAddresses: Array.from(addressSet),
  };
}

/**
 * Compute confidence for aggregated trust score
 * Based on path count and score consistency
 */
function computeAggregationConfidence(trustValues: number[]): number {
  if (trustValues.length === 0) {
    return 0;
  }

  // Path count factor (diminishing returns)
  const countFactor = Math.min(1, Math.log(trustValues.length + 1) / Math.log(HIGH_CONFIDENCE_PATH_THRESHOLD + 1));

  // Consistency factor (lower variance = higher confidence)
  if (trustValues.length === 1) {
    return countFactor;
  }

  const mean = trustValues.reduce((a, b) => a + b, 0) / trustValues.length;
  const variance = trustValues.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / trustValues.length;
  const stdDev = Math.sqrt(variance);

  // Consistency: 1 - normalized std dev (max std dev for [0,1] is 0.5)
  const consistencyFactor = Math.max(0, 1 - stdDev / 0.5);

  // Combine factors
  return 0.6 * countFactor + 0.4 * consistencyFactor;
}

/**
 * Compute confidence for network trust scores
 */
function computeNetworkConfidence(pathCount: number, paths: TrustPath[]): number {
  if (pathCount === 0) {
    return 0;
  }

  // Path diversity: unique intermediate addresses
  const intermediates = new Set<string>();
  for (const path of paths) {
    // Skip first (source) and last (target)
    for (let i = 1; i < path.addresses.length - 1; i++) {
      intermediates.add(path.addresses[i]);
    }
  }

  const diversityFactor = Math.min(1, intermediates.size / 5);
  const countFactor = Math.min(1, Math.log(pathCount + 1) / Math.log(10));

  return 0.5 * countFactor + 0.5 * diversityFactor;
}

/**
 * Collect source addresses from paths
 */
function collectSources(paths: TrustPath[], sourceAddress: string): string[] {
  const sources = new Set<string>();

  for (const path of paths) {
    // The immediate neighbor (second address in path)
    if (path.addresses.length >= 2 && path.addresses[0] === sourceAddress) {
      sources.add(path.addresses[1]);
    }
  }

  return Array.from(sources);
}

/**
 * Collect unique source addresses from path array
 */
function collectPathSources(paths: TrustPath[]): string[] {
  const sources = new Set<string>();

  for (const path of paths) {
    // Add the first address as a source
    if (path.addresses.length >= 2) {
      sources.add(path.addresses[1]); // Second node is first intermediary
    }
  }

  return Array.from(sources);
}

/**
 * Normalize stake for direct trust calculation
 * Uses sigmoid-like function for smoother scaling
 */
function normalizeStakeForDirect(stake: number): number {
  if (stake <= 0) {
    return 0;
  }

  // Sigmoid normalization: 2 / (1 + e^(-stake/scale)) - 1
  // This maps [0, ∞) to [0, 1) with smooth transition
  const scale = 1e15; // Adjust based on typical stake amounts
  const normalized = 2 / (1 + Math.exp(-stake / scale)) - 1;

  return Math.max(0, Math.min(1, normalized));
}

/**
 * Extract a numeric value from a Neo4j property
 */
function extractNumber(value: unknown): number {
  if (value === null || value === undefined) {
    return 0;
  }

  if (typeof value === 'object' && value !== null && 'toNumber' in value) {
    return (value as { toNumber: () => number }).toNumber();
  }

  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? 0 : parsed;
  }

  return 0;
}
