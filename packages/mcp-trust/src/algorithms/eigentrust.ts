/**
 * EigenTrust algorithm for sybil-resistant global trust computation
 * Week 2: Trust Algorithm Implementation
 *
 * Based on the EigenTrust algorithm (Kamvar et al., 2003):
 * "EigenTrust: Reputation Management in P2P Networks"
 *
 * The algorithm computes global trust scores through iterative power iteration,
 * converging to the principal eigenvector of the normalized trust matrix.
 */

import { getSession } from '../config/neo4j.js';
import { log } from '../utils/logger.js';
import {
  TrustScore,
  TrustComputationResult,
  EigenTrustConfig,
} from './types.js';
import {
  DEFAULT_EIGENTRUST_CONFIG,
} from './constants.js';
import {
  getPredicateWeight,
  PredicateWeights,
} from '../config/predicates.js';

// ============ Types ============

/**
 * Edge data extracted from Neo4j for matrix construction
 */
export interface EdgeData {
  /** Source address (attester) */
  from: string;
  /** Target address (attestee) */
  to: string;
  /** Stake amount on the attestation */
  stakeAmount: number;
  /** Predicate type of the attestation */
  predicate: string;
}

/**
 * Raw graph data from Neo4j
 */
interface GraphData {
  /** All unique addresses in the graph */
  addresses: string[];
  /** All attestation edges */
  edges: EdgeData[];
}

/**
 * Transition matrix represented as nested maps
 * Outer key: source address
 * Inner key: target address
 * Value: normalized transition probability
 */
type TransitionMatrix = Map<string, Map<string, number>>;

// ============ Main Algorithm ============

/**
 * Compute global trust scores using the EigenTrust algorithm
 *
 * The algorithm:
 * 1. Fetches all nodes and edges from Neo4j
 * 2. Builds a normalized transition matrix from attestation weights
 * 3. Initializes all nodes with equal trust (1/n)
 * 4. Iteratively updates trust: t' = (1-α)p + αCt
 * 5. Stops when converged or max iterations reached
 *
 * @param config - Optional partial configuration (merged with defaults)
 * @returns TrustComputationResult with scores, iterations, and convergence status
 */
export async function computeEigenTrust(
  config?: Partial<EigenTrustConfig>,
  predicateWeights?: PredicateWeights,
): Promise<TrustComputationResult> {
  const startTime = Date.now();

  // Merge with defaults
  const fullConfig: EigenTrustConfig = {
    ...DEFAULT_EIGENTRUST_CONFIG,
    ...config,
  };

  log('info', 'Starting EigenTrust computation', {
    maxIterations: fullConfig.maxIterations,
    convergenceThreshold: fullConfig.convergenceThreshold,
    pretrustWeight: fullConfig.pretrustWeight,
  });

  try {
    // Fetch graph data
    const graphData = await fetchGraphData();

    if (graphData.addresses.length === 0) {
      log('warn', 'No addresses found in graph');
      return {
        scores: [],
        iterations: 0,
        converged: true,
        computationTimeMs: Date.now() - startTime,
      };
    }

    log('info', 'Graph data loaded', {
      addressCount: graphData.addresses.length,
      edgeCount: graphData.edges.length,
    });

    // Build transition matrix (apply predicate weights)
    const transitionMatrix = buildTransitionMatrix(graphData.edges, predicateWeights);

    // Initialize trust scores (uniform distribution)
    let currentScores = initializeTrustScores(graphData.addresses);

    // Initialize pretrust (uniform distribution for basic EigenTrust)
    const pretrust = initializeTrustScores(graphData.addresses);

    // Track incoming edge counts for confidence calculation
    const incomingCounts = countIncomingEdges(graphData.edges);

    // Iterative computation
    let iterations = 0;
    let converged = false;

    while (iterations < fullConfig.maxIterations && !converged) {
      const newScores = iterateOnce(
        currentScores,
        transitionMatrix,
        pretrust,
        fullConfig.pretrustWeight
      );

      converged = checkConvergence(
        currentScores,
        newScores,
        fullConfig.convergenceThreshold
      );

      currentScores = newScores;
      iterations++;

      if (iterations % 10 === 0) {
        log('debug', 'EigenTrust iteration', { iteration: iterations, converged });
      }
    }

    // Convert to TrustScore array
    const scores = convertToTrustScores(
      currentScores,
      incomingCounts,
      graphData.addresses.length
    );

    const computationTimeMs = Date.now() - startTime;

    log('info', 'EigenTrust computation complete', {
      iterations,
      converged,
      computationTimeMs,
      scoreCount: scores.length,
    });

    return {
      scores,
      iterations,
      converged,
      computationTimeMs,
    };
  } catch (error) {
    log('error', 'EigenTrust computation failed', { error: String(error) });
    throw error;
  }
}

// ============ Initialization Functions ============

/**
 * Initialize trust scores with uniform distribution
 * Each address starts with equal trust: 1/n
 *
 * @param addresses - Array of all addresses in the graph
 * @returns Map of address to initial trust score
 */
export function initializeTrustScores(addresses: string[]): Map<string, number> {
  const scores = new Map<string, number>();
  const initialScore = addresses.length > 0 ? 1 / addresses.length : 0;

  for (const address of addresses) {
    scores.set(address, initialScore);
  }

  return scores;
}

// ============ Matrix Construction ============

/**
 * Build the normalized transition matrix from attestation edges
 *
 * Each edge weight is: stakeAmount * predicateWeight
 * Rows are normalized so outgoing weights sum to 1 (stochastic matrix)
 *
 * For nodes with no outgoing edges, we use a "dangling node" strategy:
 * they distribute trust uniformly (handled in iterateOnce)
 *
 * @param edges - Array of attestation edges from the graph
 * @returns Normalized transition matrix as nested Maps
 */
export function buildTransitionMatrix(
  edges: EdgeData[],
  predicateWeights?: PredicateWeights,
): TransitionMatrix {
  const matrix: TransitionMatrix = new Map();
  const outgoingSums = new Map<string, number>();

  // First pass: compute raw weights and outgoing sums
  for (const edge of edges) {
    const weight = computeEdgeWeight(edge, predicateWeights);

    if (!matrix.has(edge.from)) {
      matrix.set(edge.from, new Map());
    }

    const row = matrix.get(edge.from)!;
    const currentWeight = row.get(edge.to) || 0;
    row.set(edge.to, currentWeight + weight);

    // Track outgoing sum for normalization
    const currentSum = outgoingSums.get(edge.from) || 0;
    outgoingSums.set(edge.from, currentSum + weight);
  }

  // Second pass: normalize rows so they sum to 1
  for (const [from, row] of matrix) {
    const sum = outgoingSums.get(from) || 1;

    if (sum > 0) {
      for (const [to, weight] of row) {
        row.set(to, weight / sum);
      }
    }
  }

  return matrix;
}

/**
 * Compute the weight for a single edge
 * Weight = stakeAmount * predicateWeight
 *
 * @param edge - Edge data containing stake and predicate
 * @returns Computed edge weight
 */
function computeEdgeWeight(edge: EdgeData, predicateWeights?: PredicateWeights): number {
  const predicateWeight = getPredicateWeight(edge.predicate, predicateWeights);
  // Use stake directly (already normalized or in reasonable range)
  // For very large stakes, we could apply log normalization here
  const stakeWeight = Math.max(0, edge.stakeAmount);

  return stakeWeight * predicateWeight;
}

// ============ Iteration Functions ============

/**
 * Perform a single iteration of the EigenTrust algorithm
 *
 * Formula: t'[i] = (1 - α) * p[i] + α * Σ(C[j][i] * t[j])
 *
 * Where:
 * - t'[i] is the new trust score for node i
 * - p[i] is the pretrust value for node i
 * - α is (1 - pretrustWeight), the damping factor
 * - C[j][i] is the transition probability from j to i
 * - t[j] is the current trust score of node j
 *
 * @param currentScores - Current trust scores for all nodes
 * @param transitionMatrix - Normalized transition matrix
 * @param pretrust - Pretrust distribution (typically uniform)
 * @param pretrustWeight - Weight given to pretrust (1 - damping factor)
 * @returns New trust scores after one iteration
 */
export function iterateOnce(
  currentScores: Map<string, number>,
  transitionMatrix: TransitionMatrix,
  pretrust: Map<string, number>,
  pretrustWeight: number
): Map<string, number> {
  const newScores = new Map<string, number>();
  const dampingFactor = 1 - pretrustWeight;

  // Compute the sum of dangling node scores (nodes with no outgoing edges)
  // These nodes distribute their trust uniformly to all nodes
  let danglingSum = 0;
  for (const [address, score] of currentScores) {
    if (!transitionMatrix.has(address)) {
      danglingSum += score;
    }
  }

  const nodeCount = currentScores.size;
  const danglingContribution = nodeCount > 0 ? danglingSum / nodeCount : 0;

  // Compute new scores
  for (const [address, pretrustValue] of pretrust) {
    // Start with pretrust component
    let newScore = pretrustWeight * pretrustValue;

    // Add contribution from dangling nodes (uniform distribution)
    newScore += dampingFactor * danglingContribution;

    // Add contributions from incoming edges
    // We need to iterate through all nodes that point to this address
    for (const [fromAddress, row] of transitionMatrix) {
      const transitionProb = row.get(address);
      if (transitionProb !== undefined && transitionProb > 0) {
        const fromScore = currentScores.get(fromAddress) || 0;
        newScore += dampingFactor * transitionProb * fromScore;
      }
    }

    newScores.set(address, newScore);
  }

  // Normalize to ensure scores sum to 1 (handle numerical drift)
  normalizeScores(newScores);

  return newScores;
}

/**
 * Normalize scores so they sum to 1
 * Handles numerical drift during iteration
 *
 * @param scores - Scores map to normalize in place
 */
function normalizeScores(scores: Map<string, number>): void {
  let sum = 0;
  for (const score of scores.values()) {
    sum += score;
  }

  if (sum > 0 && Math.abs(sum - 1) > 1e-10) {
    for (const [address, score] of scores) {
      scores.set(address, score / sum);
    }
  }
}

// ============ Convergence Detection ============

/**
 * Check if the algorithm has converged
 * Convergence occurs when the maximum absolute difference between
 * old and new scores is below the threshold
 *
 * @param oldScores - Scores from previous iteration
 * @param newScores - Scores from current iteration
 * @param threshold - Convergence threshold
 * @returns True if converged, false otherwise
 */
export function checkConvergence(
  oldScores: Map<string, number>,
  newScores: Map<string, number>,
  threshold: number
): boolean {
  let maxDiff = 0;

  for (const [address, newScore] of newScores) {
    const oldScore = oldScores.get(address) || 0;
    const diff = Math.abs(newScore - oldScore);
    maxDiff = Math.max(maxDiff, diff);
  }

  return maxDiff < threshold;
}

// ============ Data Fetching ============

/**
 * Fetch all addresses and attestation edges from Neo4j
 *
 * @returns GraphData containing addresses and edges
 */
export async function fetchGraphData(): Promise<GraphData> {
  const session = getSession();

  try {
    // Fetch all addresses
    const addressResult = await session.run(`
      MATCH (a:Address)
      RETURN a.id as id
    `);

    const addresses: string[] = addressResult.records.map(record => {
      const id = record.get('id');
      return typeof id === 'string' ? id : String(id);
    });

    // Fetch all attestation edges
    const edgeResult = await session.run(`
      MATCH (from:Address)-[r:ATTESTS]->(to:Address)
      RETURN from.id as fromId,
             to.id as toId,
             r.stakeAmount as stakeAmount,
             r.predicate as predicate
    `);

    const edges: EdgeData[] = edgeResult.records.map(record => ({
      from: String(record.get('fromId')),
      to: String(record.get('toId')),
      stakeAmount: extractNumber(record.get('stakeAmount')),
      predicate: String(record.get('predicate') || 'unknown'),
    }));

    return { addresses, edges };
  } finally {
    await session.close();
  }
}

/**
 * Extract a numeric value from a Neo4j property
 *
 * @param value - The property value to extract
 * @returns The numeric value, or 0 if extraction fails
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

// ============ Result Conversion ============

/**
 * Count incoming edges for each address (for confidence calculation)
 *
 * @param edges - All edges in the graph
 * @returns Map of address to incoming edge count
 */
function countIncomingEdges(edges: EdgeData[]): Map<string, number> {
  const counts = new Map<string, number>();

  for (const edge of edges) {
    const current = counts.get(edge.to) || 0;
    counts.set(edge.to, current + 1);
  }

  return counts;
}

/**
 * Convert raw scores map to TrustScore array
 *
 * @param scores - Map of address to raw trust score
 * @param incomingCounts - Map of address to incoming edge count
 * @param totalNodes - Total number of nodes in graph
 * @returns Array of TrustScore objects sorted by score descending
 */
function convertToTrustScores(
  scores: Map<string, number>,
  incomingCounts: Map<string, number>,
  totalNodes: number
): TrustScore[] {
  const result: TrustScore[] = [];

  for (const [address, score] of scores) {
    const incomingCount = incomingCounts.get(address) || 0;

    // Confidence based on evidence quantity (diminishing returns)
    // More incoming attestations = higher confidence
    const confidence = computeConfidence(incomingCount, totalNodes);

    // For EigenTrust, sources are implicit (all connected nodes contribute)
    // We don't track individual sources in the global computation
    const sources: string[] = [];

    result.push({
      address,
      score,
      confidence,
      pathCount: incomingCount,
      sources,
    });
  }

  // Sort by score descending
  result.sort((a, b) => b.score - a.score);

  return result;
}

/**
 * Compute confidence based on evidence quantity
 * Uses a logarithmic scale for diminishing returns
 *
 * @param incomingCount - Number of incoming attestations
 * @param totalNodes - Total nodes in graph (for normalization)
 * @returns Confidence value between 0 and 1
 */
function computeConfidence(incomingCount: number, totalNodes: number): number {
  if (incomingCount === 0) {
    return 0;
  }

  // Log scale: confidence increases with more evidence but with diminishing returns
  // ln(count + 1) / ln(totalNodes + 1) gives reasonable scaling
  const maxPossible = Math.log(totalNodes + 1);
  const actual = Math.log(incomingCount + 1);

  return Math.min(1, actual / maxPossible);
}
