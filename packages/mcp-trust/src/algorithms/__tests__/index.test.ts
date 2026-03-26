import { describe, it, expect, vi } from 'vitest';

// Mock all underlying modules that the barrel re-exports from,
// so imports don't trigger real Neo4j connections or file reads.
vi.mock('../../config/neo4j.js', () => ({
  getSession: vi.fn(),
}));

vi.mock('../../utils/logger.js', () => ({
  log: vi.fn(),
}));

// Import everything from the barrel after mocks are in place
import * as algorithms from '../index.js';

describe('algorithms barrel exports', () => {
  // -- Constants --
  it('exports DEFAULT_DECAY_FACTOR as a number', () => {
    expect(typeof algorithms.DEFAULT_DECAY_FACTOR).toBe('number');
  });

  it('exports DEFAULT_MAX_HOPS as a number', () => {
    expect(typeof algorithms.DEFAULT_MAX_HOPS).toBe('number');
  });

  it('exports DEFAULT_CONVERGENCE_THRESHOLD as a number', () => {
    expect(typeof algorithms.DEFAULT_CONVERGENCE_THRESHOLD).toBe('number');
  });

  it('exports DEFAULT_MAX_ITERATIONS as a number', () => {
    expect(typeof algorithms.DEFAULT_MAX_ITERATIONS).toBe('number');
  });

  it('exports DEFAULT_MIN_STAKE as a number', () => {
    expect(typeof algorithms.DEFAULT_MIN_STAKE).toBe('number');
  });

  it('exports DEFAULT_PRETRUST_WEIGHT as a number', () => {
    expect(typeof algorithms.DEFAULT_PRETRUST_WEIGHT).toBe('number');
  });

  it('exports PREDICATE_WEIGHTS as an object', () => {
    expect(typeof algorithms.PREDICATE_WEIGHTS).toBe('object');
    expect(algorithms.PREDICATE_WEIGHTS).toHaveProperty('trusts');
  });

  it('exports DEFAULT_PREDICATE_WEIGHT as a number', () => {
    expect(typeof algorithms.DEFAULT_PREDICATE_WEIGHT).toBe('number');
  });

  it('exports DEFAULT_EIGENTRUST_CONFIG as an object', () => {
    expect(algorithms.DEFAULT_EIGENTRUST_CONFIG).toBeDefined();
    expect(algorithms.DEFAULT_EIGENTRUST_CONFIG).toHaveProperty('maxIterations');
  });

  it('exports DEFAULT_QUERY_CONFIG as an object', () => {
    expect(algorithms.DEFAULT_QUERY_CONFIG).toBeDefined();
    expect(algorithms.DEFAULT_QUERY_CONFIG).toHaveProperty('maxHops');
  });

  // -- Functions from constants --
  it('exports getPredicateWeight as a function', () => {
    expect(typeof algorithms.getPredicateWeight).toBe('function');
  });

  // -- Pathfinding functions --
  it('exports findTrustPaths as a function', () => {
    expect(typeof algorithms.findTrustPaths).toBe('function');
  });

  it('exports findOutgoingTrustPaths as a function', () => {
    expect(typeof algorithms.findOutgoingTrustPaths).toBe('function');
  });

  it('exports calculatePathTrust as a function', () => {
    expect(typeof algorithms.calculatePathTrust).toBe('function');
  });

  it('exports normalizeStake as a function', () => {
    expect(typeof algorithms.normalizeStake).toBe('function');
  });

  it('exports getPathsFromCypherResult as a function', () => {
    expect(typeof algorithms.getPathsFromCypherResult).toBe('function');
  });

  // -- Predicate filtering config --
  it('exports TRUST_PREDICATES as an object', () => {
    expect(typeof algorithms.TRUST_PREDICATES).toBe('object');
    expect(algorithms.TRUST_PREDICATES).toHaveProperty('trusts');
  });

  it('exports DEFAULT_WEIGHTS as an object', () => {
    expect(typeof algorithms.DEFAULT_WEIGHTS).toBe('object');
  });

  it('exports getConfiguredPredicateWeight as a function', () => {
    expect(typeof algorithms.getConfiguredPredicateWeight).toBe('function');
  });

  // -- EigenTrust functions --
  it('exports computeEigenTrust as a function', () => {
    expect(typeof algorithms.computeEigenTrust).toBe('function');
  });

  it('exports initializeTrustScores as a function', () => {
    expect(typeof algorithms.initializeTrustScores).toBe('function');
  });

  it('exports buildTransitionMatrix as a function', () => {
    expect(typeof algorithms.buildTransitionMatrix).toBe('function');
  });

  it('exports iterateOnce as a function', () => {
    expect(typeof algorithms.iterateOnce).toBe('function');
  });

  it('exports checkConvergence as a function', () => {
    expect(typeof algorithms.checkConvergence).toBe('function');
  });

  it('exports fetchGraphData as a function', () => {
    expect(typeof algorithms.fetchGraphData).toBe('function');
  });

  // -- AgentRank functions --
  it('exports computeAgentRank as a function', () => {
    expect(typeof algorithms.computeAgentRank).toBe('function');
  });

  it('exports buildWeightedAdjacency as a function', () => {
    expect(typeof algorithms.buildWeightedAdjacency).toBe('function');
  });

  it('exports iterateRank as a function', () => {
    expect(typeof algorithms.iterateRank).toBe('function');
  });

  it('exports getTopAgents as a function', () => {
    expect(typeof algorithms.getTopAgents).toBe('function');
  });

  it('exports computeInfluenceMetrics as a function', () => {
    expect(typeof algorithms.computeInfluenceMetrics).toBe('function');
  });

  // -- Sybil simulation functions --
  it('exports simulateSybilAttack as a function', () => {
    expect(typeof algorithms.simulateSybilAttack).toBe('function');
  });

  it('exports calculateResistance as a function', () => {
    expect(typeof algorithms.calculateResistance).toBe('function');
  });

  // -- Composite scoring engine --
  it('exports computeCompositeScore as a function', () => {
    expect(typeof algorithms.computeCompositeScore).toBe('function');
  });

  it('exports batchCompositeScores as a function', () => {
    expect(typeof algorithms.batchCompositeScores).toBe('function');
  });

  it('exports clearScoreCache as a function', () => {
    expect(typeof algorithms.clearScoreCache).toBe('function');
  });

  // -- Personalized trust functions --
  it('exports computePersonalizedTrust as a function', () => {
    expect(typeof algorithms.computePersonalizedTrust).toBe('function');
  });

  it('exports computePersonalizedTrustNetwork as a function', () => {
    expect(typeof algorithms.computePersonalizedTrustNetwork).toBe('function');
  });

  it('exports aggregatePathTrust as a function', () => {
    expect(typeof algorithms.aggregatePathTrust).toBe('function');
  });

  it('exports computeTrustWithDecay as a function', () => {
    expect(typeof algorithms.computeTrustWithDecay).toBe('function');
  });

  it('exports getDirectTrust as a function', () => {
    expect(typeof algorithms.getDirectTrust).toBe('function');
  });
});
