/**
 * Constants and default values for trust algorithms
 * Week 2: Trust Algorithm Foundation
 */

// ============ Decay and Propagation Constants ============

/**
 * Default decay factor applied per hop in trust propagation
 * A value of 0.6 means trust retains 60% of its value at each hop
 * After 3 hops: 0.6^3 = 0.216 (21.6% of original trust)
 */
export const DEFAULT_DECAY_FACTOR = 0.6;

/**
 * Default maximum number of hops for path-based algorithms
 * Limits graph traversal depth to prevent infinite loops and
 * focuses on meaningful trust relationships (direct/near-direct)
 */
export const DEFAULT_MAX_HOPS = 3;

// ============ Convergence Constants ============

/**
 * Default threshold for determining algorithm convergence
 * Algorithm stops when maximum score change is below this value
 */
export const DEFAULT_CONVERGENCE_THRESHOLD = 0.0001;

/**
 * Default maximum iterations for iterative algorithms
 * Provides upper bound to prevent infinite loops
 */
export const DEFAULT_MAX_ITERATIONS = 100;

// ============ Stake Constants ============

/**
 * Default minimum stake threshold in wei
 * Attestations below this value may be filtered out
 */
export const DEFAULT_MIN_STAKE = 0;

/**
 * Default pre-trust weight for EigenTrust algorithm
 * Controls influence of pre-trusted nodes on final scores
 */
export const DEFAULT_PRETRUST_WEIGHT = 0.1;

// ============ Predicate Weights ============

/**
 * Trust multipliers for different predicate types
 * Higher values indicate stronger trust signal
 *
 * - "trusts": Explicit trust declaration (highest weight)
 * - "vouches": Strong endorsement
 * - "follow": Social connection (weaker trust signal)
 * - "has tag": Categorical association (weakest explicit signal)
 * - "Intuition": Platform-specific predicate
 * - default: Fallback for unknown predicates
 */
export const PREDICATE_WEIGHTS: Record<string, number> = {
  'trusts': 1.0,
  'vouches': 0.9,
  'follow': 0.7,
  'has tag': 0.3,
  'Intuition': 0.5,
};

/**
 * Default weight for predicates not found in PREDICATE_WEIGHTS
 */
export const DEFAULT_PREDICATE_WEIGHT = 0.5;

/**
 * Get the weight for a given predicate
 * Returns the mapped weight or default if not found
 * @param predicate - The predicate string to look up
 * @returns The weight multiplier for this predicate
 */
export function getPredicateWeight(predicate: string): number {
  return PREDICATE_WEIGHTS[predicate] ?? DEFAULT_PREDICATE_WEIGHT;
}

// ============ Default Configurations ============

/**
 * Default configuration for EigenTrust algorithm
 */
export const DEFAULT_EIGENTRUST_CONFIG = {
  maxIterations: DEFAULT_MAX_ITERATIONS,
  convergenceThreshold: DEFAULT_CONVERGENCE_THRESHOLD,
  decayFactor: DEFAULT_DECAY_FACTOR,
  pretrustWeight: DEFAULT_PRETRUST_WEIGHT,
} as const;

/**
 * Default configuration for personalized trust queries
 */
export const DEFAULT_QUERY_CONFIG = {
  maxHops: DEFAULT_MAX_HOPS,
  minStake: DEFAULT_MIN_STAKE,
} as const;
