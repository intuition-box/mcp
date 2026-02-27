/**
 * AgentRank: PageRank-adapted influence scoring for Intuition's attestation graph
 * Week 3: Advanced Algorithm Implementation
 *
 * Unlike EigenTrust which requires pre-trusted peers, AgentRank computes
 * global influence scores purely from graph structure and stake weights.
 *
 * Based on PageRank (Brin & Page, 1998) with attestation-specific adaptations:
 * - Edge weights derived from stake amounts (not uniform)
 * - Predicate-aware weighting
 * - Influence concentration metrics (Gini coefficient, entropy)
 */

import { getSession } from '../config/neo4j.js';
import { log } from '../utils/logger.js';
import { getPredicateWeight } from './constants.js';

// ============ Types ============

/**
 * Configuration for AgentRank computation
 */
export interface AgentRankConfig {
  /** Damping factor (probability of following a link vs. teleporting). Default 0.85 */
  dampingFactor: number;
  /** Stop when max rank delta falls below this threshold. Default 1e-6 */
  convergenceThreshold: number;
  /** Maximum iterations before halting. Default 100 */
  maxIterations: number;
  /** Floor value to prevent zero-rank nodes. Default 0.001 */
  minRank: number;
  /** Whether to weight edges by stake amount. Default true */
  stakeWeighted: boolean;
}

/**
 * Summary entry for a high-ranking agent
 */
export interface AgentSummary {
  /** Ethereum address */
  address: string;
  /** Computed AgentRank score */
  rank: number;
  /** Number of incoming attestations */
  inDegree: number;
  /** Number of outgoing attestations */
  outDegree: number;
}

/**
 * Influence concentration metrics for the rank distribution
 */
export interface InfluenceMetrics {
  /** Gini coefficient (0 = perfect equality, 1 = one node holds all rank) */
  giniCoefficient: number;
  /** Shannon entropy of the rank distribution (higher = more uniform) */
  entropy: number;
  /** Fraction of total rank held by the top 10% of nodes */
  top10PctShare: number;
  /** Median rank value */
  medianRank: number;
}

/**
 * Full result of an AgentRank computation
 */
export interface AgentRankResult {
  /** Map of address to rank score */
  ranks: Map<string, number>;
  /** Number of iterations executed */
  iterations: number;
  /** Whether the algorithm converged within maxIterations */
  converged: boolean;
  /** Top agents sorted by rank descending */
  topAgents: AgentSummary[];
  /** Influence distribution metrics */
  influenceMetrics: InfluenceMetrics;
  /** Total computation time in milliseconds */
  computationTimeMs: number;
}

/**
 * Weighted adjacency representation for PageRank iteration
 */
interface WeightedAdjacency {
  /** inLinks[i][j] = normalized weight of j's attestation to i */
  inLinks: Map<string, Map<string, number>>;
  /** outWeights[j] = total outgoing weight from j */
  outWeights: Map<string, number>;
}

/**
 * Edge data extracted from Neo4j
 */
interface EdgeData {
  from: string;
  to: string;
  stakeAmount: number;
  predicate: string;
}

// ============ Default Configuration ============

const DEFAULT_AGENTRANK_CONFIG: AgentRankConfig = {
  dampingFactor: 0.85,
  convergenceThreshold: 1e-6,
  maxIterations: 100,
  minRank: 0.001,
  stakeWeighted: true,
};

// ============ Main Algorithm ============

/**
 * Compute global influence scores using the AgentRank algorithm
 *
 * The algorithm:
 * 1. Fetch all nodes and edges from Neo4j
 * 2. Build weighted adjacency from stake amounts
 * 3. Initialize all nodes with equal rank (1/n)
 * 4. Iteratively apply: rank[i] = (1-d)/n + d * sum(rank[j] * w[j->i] / outW[j])
 * 5. Stop on convergence or max iterations
 * 6. Apply minimum rank floor
 *
 * @param config - Optional partial configuration (merged with defaults)
 * @param topN - Number of top agents to include in result (default 20)
 * @returns AgentRankResult with ranks, convergence info, top agents, and influence metrics
 */
export async function computeAgentRank(
  config?: Partial<AgentRankConfig>,
  topN: number = 20
): Promise<AgentRankResult> {
  const startTime = Date.now();

  const fullConfig: AgentRankConfig = {
    ...DEFAULT_AGENTRANK_CONFIG,
    ...config,
  };

  log('info', 'Starting AgentRank computation', {
    dampingFactor: fullConfig.dampingFactor,
    convergenceThreshold: fullConfig.convergenceThreshold,
    maxIterations: fullConfig.maxIterations,
    stakeWeighted: fullConfig.stakeWeighted,
  });

  try {
    const { addresses, edges } = await fetchGraphData();

    if (addresses.length === 0) {
      log('warn', 'No addresses found in graph');
      return {
        ranks: new Map(),
        iterations: 0,
        converged: true,
        topAgents: [],
        influenceMetrics: { giniCoefficient: 0, entropy: 0, top10PctShare: 0, medianRank: 0 },
        computationTimeMs: Date.now() - startTime,
      };
    }

    log('info', 'Graph data loaded for AgentRank', {
      addressCount: addresses.length,
      edgeCount: edges.length,
    });

    // Build weighted adjacency
    const adjacency = buildWeightedAdjacency(edges, fullConfig.stakeWeighted);

    // Initialize ranks: uniform 1/n
    const n = addresses.length;
    let currentRanks = new Map<string, number>();
    const initialRank = 1 / n;
    for (const addr of addresses) {
      currentRanks.set(addr, initialRank);
    }

    // Iterative computation
    let iterations = 0;
    let converged = false;

    while (iterations < fullConfig.maxIterations && !converged) {
      const newRanks = iterateRank(
        currentRanks,
        adjacency.inLinks,
        adjacency.outWeights,
        fullConfig.dampingFactor,
        n
      );

      // Check convergence: max absolute delta
      let maxDelta = 0;
      for (const [addr, newVal] of newRanks) {
        const oldVal = currentRanks.get(addr) || 0;
        const delta = Math.abs(newVal - oldVal);
        if (delta > maxDelta) {
          maxDelta = delta;
        }
      }

      converged = maxDelta < fullConfig.convergenceThreshold;
      currentRanks = newRanks;
      iterations++;

      if (iterations % 10 === 0) {
        log('debug', 'AgentRank iteration', { iteration: iterations, maxDelta, converged });
      }
    }

    // Apply minimum rank floor
    if (fullConfig.minRank > 0) {
      for (const [addr, rank] of currentRanks) {
        if (rank < fullConfig.minRank) {
          currentRanks.set(addr, fullConfig.minRank);
        }
      }
    }

    // Compute degree maps for summaries
    const { inDegree, outDegree } = computeDegreeMaps(edges);

    // Build top agents list
    const topAgents = getTopAgents(currentRanks, inDegree, outDegree, topN);

    // Compute influence metrics
    const influenceMetrics = computeInfluenceMetrics(currentRanks);

    const computationTimeMs = Date.now() - startTime;

    log('info', 'AgentRank computation complete', {
      iterations,
      converged,
      computationTimeMs,
      nodeCount: currentRanks.size,
      gini: influenceMetrics.giniCoefficient.toFixed(4),
    });

    return {
      ranks: currentRanks,
      iterations,
      converged,
      topAgents,
      influenceMetrics,
      computationTimeMs,
    };
  } catch (error) {
    log('error', 'AgentRank computation failed', { error: String(error) });
    throw error;
  }
}

// ============ Adjacency Construction ============

/**
 * Build weighted adjacency structure from attestation edges
 *
 * For each edge j->i with weight w:
 * - inLinks[i][j] = w (normalized by j's total outgoing weight)
 * - outWeights[j] += w
 *
 * When stakeWeighted is true, w = stakeAmount * predicateWeight.
 * When false, w = predicateWeight (unweighted by stake).
 *
 * @param edges - Attestation edges from the graph
 * @param stakeWeighted - Whether to incorporate stake amounts
 * @returns Weighted adjacency with inLinks and outWeights
 */
export function buildWeightedAdjacency(
  edges: EdgeData[],
  stakeWeighted: boolean = true
): WeightedAdjacency {
  const rawInLinks = new Map<string, Map<string, number>>();
  const outWeights = new Map<string, number>();

  // First pass: accumulate raw weights
  for (const edge of edges) {
    const predicateWeight = getPredicateWeight(edge.predicate);
    const weight = stakeWeighted
      ? Math.max(0, edge.stakeAmount) * predicateWeight
      : predicateWeight;

    if (weight <= 0) {
      continue;
    }

    // Accumulate into inLinks[to][from]
    if (!rawInLinks.has(edge.to)) {
      rawInLinks.set(edge.to, new Map());
    }
    const inMap = rawInLinks.get(edge.to)!;
    inMap.set(edge.from, (inMap.get(edge.from) || 0) + weight);

    // Accumulate outgoing weight for the source
    outWeights.set(edge.from, (outWeights.get(edge.from) || 0) + weight);
  }

  // Second pass: normalize inLinks by outWeights so that
  // sum over i of inLinks[i][j] / outWeights[j] = 1 for each j
  // We store the raw weights; normalization happens during iteration
  // (dividing by outWeights[j]) to keep the structure simple.

  return { inLinks: rawInLinks, outWeights };
}

// ============ PageRank Iteration ============

/**
 * Perform a single PageRank iteration
 *
 * Formula:
 *   rank'[i] = (1 - d) / n + d * sum_j(rank[j] * inLinks[i][j] / outWeights[j])
 *
 * Dangling nodes (no outgoing edges) distribute their rank uniformly.
 *
 * @param currentRanks - Current rank values for all nodes
 * @param inLinks - Incoming link weights: inLinks[i][j] = raw weight of j->i
 * @param outWeights - Total outgoing weight per node
 * @param dampingFactor - Probability of following a link (typically 0.85)
 * @param n - Total number of nodes
 * @returns New rank values after one iteration
 */
export function iterateRank(
  currentRanks: Map<string, number>,
  inLinks: Map<string, Map<string, number>>,
  outWeights: Map<string, number>,
  dampingFactor: number,
  n: number
): Map<string, number> {
  const newRanks = new Map<string, number>();

  // Compute dangling node contribution (nodes with no outgoing edges)
  let danglingRankSum = 0;
  for (const [addr, rank] of currentRanks) {
    if (!outWeights.has(addr) || outWeights.get(addr)! <= 0) {
      danglingRankSum += rank;
    }
  }
  const danglingContribution = danglingRankSum / n;

  // Base rank from teleportation
  const teleportRank = (1 - dampingFactor) / n;

  for (const [addr] of currentRanks) {
    let incomingRank = 0;

    // Sum contributions from all nodes that attest to this one
    const incoming = inLinks.get(addr);
    if (incoming) {
      for (const [fromAddr, weight] of incoming) {
        const fromRank = currentRanks.get(fromAddr) || 0;
        const fromOutWeight = outWeights.get(fromAddr) || 1;
        incomingRank += fromRank * (weight / fromOutWeight);
      }
    }

    // rank'[i] = teleport + damping * (incoming + dangling)
    const newRank = teleportRank + dampingFactor * (incomingRank + danglingContribution);
    newRanks.set(addr, newRank);
  }

  return newRanks;
}

// ============ Top Agents ============

/**
 * Return the top n agents sorted by rank descending
 *
 * @param ranks - Map of address to rank score
 * @param inDegree - Map of address to incoming edge count
 * @param outDegree - Map of address to outgoing edge count
 * @param n - Number of top agents to return
 * @returns Array of AgentSummary sorted by rank descending
 */
export function getTopAgents(
  ranks: Map<string, number>,
  inDegree: Map<string, number>,
  outDegree: Map<string, number>,
  n: number
): AgentSummary[] {
  const entries: AgentSummary[] = [];

  for (const [address, rank] of ranks) {
    entries.push({
      address,
      rank,
      inDegree: inDegree.get(address) || 0,
      outDegree: outDegree.get(address) || 0,
    });
  }

  entries.sort((a, b) => b.rank - a.rank);

  return entries.slice(0, n);
}

// ============ Influence Metrics ============

/**
 * Compute influence concentration metrics for the rank distribution
 *
 * - Gini coefficient: measures inequality (0 = equal, 1 = maximally concentrated)
 * - Shannon entropy: information-theoretic measure (higher = more uniform)
 * - Top 10% share: fraction of total rank held by the top 10% of nodes
 * - Median rank: middle value of the sorted rank distribution
 *
 * @param ranks - Map of address to rank score
 * @returns InfluenceMetrics describing the distribution
 */
export function computeInfluenceMetrics(ranks: Map<string, number>): InfluenceMetrics {
  const values = Array.from(ranks.values());
  const n = values.length;

  if (n === 0) {
    return { giniCoefficient: 0, entropy: 0, top10PctShare: 0, medianRank: 0 };
  }

  // Sort ascending for Gini and median
  values.sort((a, b) => a - b);

  const totalRank = values.reduce((sum, v) => sum + v, 0);

  // --- Gini coefficient ---
  // G = (2 * sum_i(i * x_i)) / (n * sum_i(x_i)) - (n + 1) / n
  // where values are sorted ascending and i is 1-indexed
  let weightedSum = 0;
  for (let i = 0; i < n; i++) {
    weightedSum += (i + 1) * values[i];
  }
  const giniCoefficient = totalRank > 0
    ? (2 * weightedSum) / (n * totalRank) - (n + 1) / n
    : 0;

  // --- Shannon entropy ---
  // H = -sum(p_i * log2(p_i)) where p_i = rank_i / totalRank
  let entropy = 0;
  if (totalRank > 0) {
    for (const v of values) {
      if (v > 0) {
        const p = v / totalRank;
        entropy -= p * Math.log2(p);
      }
    }
  }

  // --- Top 10% share ---
  const top10Count = Math.max(1, Math.ceil(n * 0.1));
  let top10Sum = 0;
  for (let i = n - top10Count; i < n; i++) {
    top10Sum += values[i];
  }
  const top10PctShare = totalRank > 0 ? top10Sum / totalRank : 0;

  // --- Median rank ---
  const medianRank = n % 2 === 1
    ? values[Math.floor(n / 2)]
    : (values[n / 2 - 1] + values[n / 2]) / 2;

  return {
    giniCoefficient: Math.max(0, giniCoefficient),
    entropy,
    top10PctShare,
    medianRank,
  };
}

// ============ Data Fetching ============

/**
 * Fetch all addresses and attestation edges from Neo4j
 *
 * @returns Object with addresses array and edges array
 */
async function fetchGraphData(): Promise<{ addresses: string[]; edges: EdgeData[] }> {
  const session = getSession();

  try {
    const addressResult = await session.run(`
      MATCH (a:Address)
      RETURN a.id as id
    `);

    const addresses: string[] = addressResult.records.map(record => {
      const id = record.get('id');
      return typeof id === 'string' ? id : String(id);
    });

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
 * Handles Neo4j Integer objects, native numbers, and string representations
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

// ============ Helper Functions ============

/**
 * Compute in-degree and out-degree maps from edges
 */
function computeDegreeMaps(edges: EdgeData[]): {
  inDegree: Map<string, number>;
  outDegree: Map<string, number>;
} {
  const inDegree = new Map<string, number>();
  const outDegree = new Map<string, number>();

  for (const edge of edges) {
    inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
    outDegree.set(edge.from, (outDegree.get(edge.from) || 0) + 1);
  }

  return { inDegree, outDegree };
}
