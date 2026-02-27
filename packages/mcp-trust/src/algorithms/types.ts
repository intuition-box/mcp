/**
 * Type definitions for trust algorithms
 * Week 2: Trust Algorithm Foundation
 */

// ============ Trust Score Types ============

/**
 * Represents a computed trust score for an address
 * Score is normalized between 0 (no trust) and 1 (full trust)
 */
export interface TrustScore {
  /** The address being evaluated */
  address: string;
  /** Normalized trust score between 0 and 1 */
  score: number;
  /** Confidence level based on evidence quantity (0-1) */
  confidence: number;
  /** Number of trust paths contributing to this score */
  pathCount: number;
  /** Source addresses that contributed to this score */
  sources: string[];
}

// ============ Trust Path Types ============

/**
 * Represents a single trust path through the attestation graph
 * Used for path-based trust propagation algorithms
 */
export interface TrustPath {
  /** Ordered list of addresses in the path (from source to target) */
  addresses: string[];
  /** Predicates used at each hop in the path */
  predicates: string[];
  /** Stake amounts at each hop in the path */
  stakes: number[];
  /** Cumulative decay factor applied across the entire path */
  totalDecay: number;
}

// ============ Algorithm Configuration Types ============

/**
 * Configuration for EigenTrust-style iterative trust computation
 * Based on the EigenTrust algorithm for peer-to-peer networks
 */
export interface EigenTrustConfig {
  /** Maximum number of iterations before stopping */
  maxIterations: number;
  /** Threshold for convergence detection (stop when delta < threshold) */
  convergenceThreshold: number;
  /** Decay factor applied per hop (0-1, lower = faster decay) */
  decayFactor: number;
  /** Weight given to pre-trusted nodes (0-1) */
  pretrustWeight: number;
}

// ============ Query Types ============

/**
 * Query parameters for personalized trust computation
 * Computes trust from a specific source to a specific target
 */
export interface PersonalizedTrustQuery {
  /** Source address (trust originates from here) */
  fromAddress: string;
  /** Target address (trust is computed for this address) */
  toAddress: string;
  /** Maximum number of hops to traverse in the graph */
  maxHops: number;
  /** Minimum stake threshold to consider an attestation valid */
  minStake: number;
}

// ============ Result Types ============

/**
 * Result of a trust computation operation
 */
export interface TrustComputationResult {
  /** The computed trust scores */
  scores: TrustScore[];
  /** Number of iterations performed (for iterative algorithms) */
  iterations: number;
  /** Whether the algorithm converged */
  converged: boolean;
  /** Total computation time in milliseconds */
  computationTimeMs: number;
}

/**
 * Result of a path-finding operation
 */
export interface PathFindingResult {
  /** All discovered trust paths */
  paths: TrustPath[];
  /** The strongest path (highest trust contribution) */
  strongestPath: TrustPath | null;
  /** Total nodes visited during traversal */
  nodesVisited: number;
}
