/**
 * Trust algorithms module
 * Week 2: Trust Algorithm Foundation
 *
 * Exports all algorithm types, constants, and implementations
 */

// Type definitions
export type {
  TrustScore,
  TrustPath,
  EigenTrustConfig,
  PersonalizedTrustQuery,
  TrustComputationResult,
  PathFindingResult,
} from './types.js';

// Constants and defaults
export {
  DEFAULT_DECAY_FACTOR,
  DEFAULT_MAX_HOPS,
  DEFAULT_CONVERGENCE_THRESHOLD,
  DEFAULT_MAX_ITERATIONS,
  DEFAULT_MIN_STAKE,
  DEFAULT_PRETRUST_WEIGHT,
  PREDICATE_WEIGHTS,
  DEFAULT_PREDICATE_WEIGHT,
  DEFAULT_EIGENTRUST_CONFIG,
  DEFAULT_QUERY_CONFIG,
  getPredicateWeight,
} from './constants.js';

// Path-finding algorithms
export {
  findTrustPaths,
  findOutgoingTrustPaths,
  calculatePathTrust,
  normalizeStake,
  getPathsFromCypherResult,
} from './pathfinding.js';

// EigenTrust algorithm
export type { EdgeData } from './eigentrust.js';
export {
  computeEigenTrust,
  initializeTrustScores,
  buildTransitionMatrix,
  iterateOnce,
  checkConvergence,
  fetchGraphData,
} from './eigentrust.js';

// AgentRank algorithm
export type {
  AgentRankConfig,
  AgentSummary,
  InfluenceMetrics,
  AgentRankResult,
} from './agentrank.js';
export {
  computeAgentRank,
  buildWeightedAdjacency,
  iterateRank,
  getTopAgents,
  computeInfluenceMetrics,
} from './agentrank.js';

// Sybil attack simulation
export type {
  SybilSimulationConfig,
  SybilImpact,
  SybilSimulationResult,
} from './sybil-simulation.js';
export {
  simulateSybilAttack,
  calculateResistance,
} from './sybil-simulation.js';

// Composite scoring engine
export type {
  CompositeScoreConfig,
  EigentrustBreakdown,
  AgentrankBreakdown,
  TransitiveTrustBreakdown,
  CompositeScoreResult,
} from './scoring-engine.js';
export {
  computeCompositeScore,
  batchCompositeScores,
  clearScoreCache,
} from './scoring-engine.js';

// Personalized trust algorithms
export {
  computePersonalizedTrust,
  computePersonalizedTrustNetwork,
  aggregatePathTrust,
  computeTrustWithDecay,
  getDirectTrust,
} from './personalized.js';
