/**
 * Sybil attack simulation for measuring algorithm resistance
 * Week 3: Security Analysis
 *
 * Tests how well EigenTrust and AgentRank resist sybil attacks by injecting
 * fake colluding nodes into the graph and measuring score displacement on
 * legitimate addresses.
 *
 * The simulation:
 * 1. Captures baseline scores from the clean graph
 * 2. Injects sybil nodes and collusion edges into Neo4j
 * 3. Recomputes scores on the contaminated graph
 * 4. Measures impact on legitimate addresses
 * 5. Cleans up all injected data (guaranteed via try/finally)
 */

import { getSession } from '../config/neo4j.js';
import { log } from '../utils/logger.js';
import { computeEigenTrust } from './eigentrust.js';
import { computeAgentRank } from './agentrank.js';

// ============ Constants ============

/** Prefix that identifies sybil nodes for creation and cleanup */
const SYBIL_PREFIX = '0xsybil';

// ============ Types ============

/**
 * Configuration for sybil attack simulation
 */
export interface SybilSimulationConfig {
  /** Number of fake sybil nodes to inject. Default 50 */
  numSybilNodes: number;
  /** Number of collusion edges among sybil nodes. Default 200 */
  numCollusionEdges: number;
  /** Stake amount on each sybil attestation (in ETH). Default 0.01 */
  sybilStakeAmount: number;
  /** Optional specific address to target with boosting edges */
  targetAddress?: string;
  /** Optional callback invoked at each simulation phase for progress reporting */
  onProgress?: (phase: string) => void;
}

/**
 * Impact metrics comparing baseline vs. attacked scores
 */
export interface SybilImpact {
  /** EigenTrust resistance score (0 = total compromise, 1 = no impact) */
  eigentrustResistance: number;
  /** AgentRank resistance score (0 = total compromise, 1 = no impact) */
  agentrankResistance: number;
  /** Maximum absolute score change for any legitimate address (EigenTrust) */
  maxScoreChangeEigentrust: number;
  /** Maximum absolute score change for any legitimate address (AgentRank) */
  maxScoreChangeAgentrank: number;
  /** Average absolute score change across all legitimate addresses (EigenTrust) */
  avgScoreChangeEigentrust: number;
  /** Average absolute score change across all legitimate addresses (AgentRank) */
  avgScoreChangeAgentrank: number;
  /** Score boost on target address under EigenTrust (if targetAddress was set) */
  targetBoostEigentrust?: number;
  /** Score boost on target address under AgentRank (if targetAddress was set) */
  targetBoostAgentrank?: number;
}

/**
 * Full result of a sybil simulation run
 */
export interface SybilSimulationResult {
  /** Scores from the clean graph */
  baselineScores: {
    eigentrust: Map<string, number>;
    agentrank: Map<string, number>;
  };
  /** Scores from the contaminated graph */
  attackScores: {
    eigentrust: Map<string, number>;
    agentrank: Map<string, number>;
  };
  /** Resistance and impact metrics */
  impact: SybilImpact;
  /** Number of sybil nodes actually created */
  sybilNodesCreated: number;
  /** Number of sybil edges actually created */
  sybilEdgesCreated: number;
  /** Total simulation time in milliseconds */
  computationTimeMs: number;
}

// ============ Default Configuration ============

const DEFAULT_SYBIL_CONFIG: SybilSimulationConfig = {
  numSybilNodes: 50,
  numCollusionEdges: 200,
  sybilStakeAmount: 0.01,
};

// ============ Main Simulation ============

/**
 * Run a sybil attack simulation against the current graph
 *
 * Injects fake colluding nodes, measures score displacement, then cleans up.
 * Cleanup is guaranteed via try/finally even if algorithm computation fails.
 *
 * @param config - Optional partial configuration
 * @returns SybilSimulationResult with baseline/attack scores and resistance metrics
 */
export async function simulateSybilAttack(
  config?: Partial<SybilSimulationConfig>
): Promise<SybilSimulationResult> {
  const startTime = Date.now();

  const fullConfig: SybilSimulationConfig = {
    ...DEFAULT_SYBIL_CONFIG,
    ...config,
  };

  const progress = fullConfig.onProgress || (() => {});

  log('info', 'Starting sybil attack simulation', {
    numSybilNodes: fullConfig.numSybilNodes,
    numCollusionEdges: fullConfig.numCollusionEdges,
    sybilStakeAmount: fullConfig.sybilStakeAmount,
    targetAddress: fullConfig.targetAddress || 'none',
  });

  // Step 1: Compute baseline scores on clean graph
  progress('baseline');
  log('info', 'Computing baseline scores on clean graph');

  const [eigentrustBaseline, agentrankBaseline] = await Promise.all([
    computeEigenTrust(),
    computeAgentRank(),
  ]);

  const baselineEigentrust = extractEigentrustScores(eigentrustBaseline.scores);
  const baselineAgentrank = agentrankBaseline.ranks;

  log('info', 'Baseline scores captured', {
    eigentrustNodes: baselineEigentrust.size,
    agentrankNodes: baselineAgentrank.size,
  });

  // Steps 2-6 wrapped in try/finally to guarantee cleanup
  let sybilNodesCreated = 0;
  let sybilEdgesCreated = 0;
  let attackEigentrust = new Map<string, number>();
  let attackAgentrank = new Map<string, number>();

  try {
    // Step 2: Inject sybil nodes
    progress('injecting');
    const sybilAddresses = generateSybilAddresses(fullConfig.numSybilNodes);
    sybilNodesCreated = await injectSybilNodes(sybilAddresses);

    log('info', 'Sybil nodes injected', { count: sybilNodesCreated });

    // Step 3: Create collusion edges (sybil nodes attest to each other)
    const collusionCount = await injectCollusionEdges(
      sybilAddresses,
      fullConfig.numCollusionEdges,
      fullConfig.sybilStakeAmount
    );
    sybilEdgesCreated += collusionCount;

    log('info', 'Collusion edges created', { count: collusionCount });

    // Step 4: If targeting a specific address, add boosting edges
    if (fullConfig.targetAddress) {
      const boostCount = await injectTargetBoostEdges(
        sybilAddresses,
        fullConfig.targetAddress,
        fullConfig.sybilStakeAmount
      );
      sybilEdgesCreated += boostCount;

      log('info', 'Target boost edges created', {
        target: fullConfig.targetAddress,
        count: boostCount,
      });
    }

    // Step 5: Recompute scores on contaminated graph
    progress('computing');
    log('info', 'Computing attack scores on contaminated graph');

    const [eigentrustAttack, agentrankAttack] = await Promise.all([
      computeEigenTrust(),
      computeAgentRank(),
    ]);

    attackEigentrust = extractEigentrustScores(eigentrustAttack.scores);
    attackAgentrank = agentrankAttack.ranks;

    log('info', 'Attack scores computed', {
      eigentrustNodes: attackEigentrust.size,
      agentrankNodes: attackAgentrank.size,
    });
  } finally {
    // Step 7: Guaranteed cleanup — remove all sybil data
    progress('cleanup');
    await cleanupSybilData();
    log('info', 'Sybil data cleaned up');
  }

  // Step 6: Compute impact metrics (only on legitimate addresses)
  const impact = computeImpact(
    baselineEigentrust,
    attackEigentrust,
    baselineAgentrank,
    attackAgentrank,
    fullConfig.targetAddress
  );

  const computationTimeMs = Date.now() - startTime;

  progress('done');

  log('info', 'Sybil simulation complete', {
    eigentrustResistance: impact.eigentrustResistance.toFixed(4),
    agentrankResistance: impact.agentrankResistance.toFixed(4),
    computationTimeMs,
  });

  return {
    baselineScores: {
      eigentrust: baselineEigentrust,
      agentrank: baselineAgentrank,
    },
    attackScores: {
      eigentrust: attackEigentrust,
      agentrank: attackAgentrank,
    },
    impact,
    sybilNodesCreated,
    sybilEdgesCreated,
    computationTimeMs,
  };
}

// ============ Sybil Injection ============

/**
 * Generate deterministic sybil addresses with identifiable prefix
 *
 * @param count - Number of sybil addresses to generate
 * @returns Array of sybil address strings
 */
function generateSybilAddresses(count: number): string[] {
  const addresses: string[] = [];
  for (let i = 0; i < count; i++) {
    // Pad index to 4 hex digits, fill remaining 34 chars with zeros
    // Result: 0xsybil0001000000000000000000000000000000 (42 chars total)
    const idx = i.toString(16).padStart(4, '0');
    addresses.push(`${SYBIL_PREFIX}${idx}${'0'.repeat(34)}`);
  }
  return addresses;
}

/**
 * Inject sybil nodes into Neo4j
 *
 * @param addresses - Sybil addresses to create as Address nodes
 * @returns Number of nodes created
 */
async function injectSybilNodes(addresses: string[]): Promise<number> {
  const session = getSession();

  try {
    const nodes = addresses.map(addr => ({
      id: addr,
      label: 'sybil-node',
      total_stake: 0,
      attestation_count: 0,
      last_updated: new Date().toISOString(),
    }));

    const result = await session.run(
      `
      UNWIND $nodes AS node
      CREATE (a:Address {
        id: node.id,
        label: node.label,
        totalStake: node.total_stake,
        attestationCount: node.attestation_count,
        lastUpdated: node.last_updated
      })
      RETURN count(a) as count
      `,
      { nodes }
    );

    return result.records[0].get('count').toNumber();
  } finally {
    await session.close();
  }
}

/**
 * Create collusion edges between sybil nodes
 *
 * Randomly selects pairs from the sybil set. Each edge represents
 * a sybil node attesting to another sybil node with minimal stake.
 *
 * @param addresses - Sybil addresses to connect
 * @param numEdges - Number of collusion edges to create
 * @param stakeAmount - Stake amount per edge
 * @returns Number of edges created
 */
async function injectCollusionEdges(
  addresses: string[],
  numEdges: number,
  stakeAmount: number
): Promise<number> {
  if (addresses.length < 2) return 0;

  const edges: Array<{ from: string; to: string; tripleId: string; stake: number }> = [];
  const seen = new Set<string>();
  let attempts = 0;
  const maxAttempts = numEdges * 10;

  // Generate random directed edges, avoiding duplicates and self-loops
  while (edges.length < numEdges && attempts < maxAttempts) {
    const fromIdx = Math.floor(Math.random() * addresses.length);
    let toIdx = Math.floor(Math.random() * addresses.length);

    // Avoid self-loops
    if (fromIdx === toIdx) {
      attempts++;
      continue;
    }

    const key = `${fromIdx}-${toIdx}`;
    if (seen.has(key)) {
      attempts++;
      continue;
    }

    seen.add(key);
    edges.push({
      from: addresses[fromIdx],
      to: addresses[toIdx],
      tripleId: `sybil-collusion-${edges.length}`,
      stake: stakeAmount,
    });
    attempts++;
  }

  return await batchCreateEdges(edges);
}

/**
 * Create edges from all sybil nodes to a target legitimate address
 *
 * @param sybilAddresses - Sybil nodes that will attest to the target
 * @param targetAddress - Legitimate address to boost
 * @param stakeAmount - Stake amount per edge
 * @returns Number of edges created
 */
async function injectTargetBoostEdges(
  sybilAddresses: string[],
  targetAddress: string,
  stakeAmount: number
): Promise<number> {
  const edges = sybilAddresses.map((addr, i) => ({
    from: addr,
    to: targetAddress,
    tripleId: `sybil-boost-${i}`,
    stake: stakeAmount,
  }));

  return await batchCreateEdges(edges);
}

/**
 * Batch-create ATTESTS edges in Neo4j
 *
 * @param edges - Edge data with from, to, tripleId, and stake
 * @returns Number of edges created
 */
async function batchCreateEdges(
  edges: Array<{ from: string; to: string; tripleId: string; stake: number }>
): Promise<number> {
  if (edges.length === 0) return 0;

  const session = getSession();

  try {
    const result = await session.run(
      `
      UNWIND $edges AS edge
      MATCH (from:Address {id: edge.from})
      MATCH (to:Address {id: edge.to})
      CREATE (from)-[r:ATTESTS {
        tripleId: edge.tripleId,
        predicate: 'trusts',
        stakeAmount: edge.stake,
        timestamp: datetime().epochMillis
      }]->(to)
      RETURN count(r) as count
      `,
      { edges }
    );

    return result.records[0].get('count').toNumber();
  } finally {
    await session.close();
  }
}

// ============ Cleanup ============

/**
 * Remove all sybil nodes and their relationships from Neo4j
 *
 * Deletes any Address node whose id starts with the sybil prefix.
 * Relationships are deleted first (Neo4j requires this before node deletion).
 */
async function cleanupSybilData(): Promise<void> {
  const session = getSession();

  try {
    // Delete all relationships connected to sybil nodes, then the nodes themselves
    await session.run(
      `
      MATCH (a:Address)
      WHERE a.id STARTS WITH $prefix
      DETACH DELETE a
      `,
      { prefix: SYBIL_PREFIX }
    );
  } finally {
    await session.close();
  }
}

// ============ Score Extraction ============

/**
 * Convert EigenTrust TrustScore[] to a Map<address, score>
 */
function extractEigentrustScores(
  scores: Array<{ address: string; score: number }>
): Map<string, number> {
  const map = new Map<string, number>();
  for (const s of scores) {
    map.set(s.address, s.score);
  }
  return map;
}

// ============ Resistance Calculation ============

/**
 * Compute resistance score for a single algorithm
 *
 * Compares only legitimate addresses (excludes sybil-prefixed ones).
 * resistance = 1 - (avgAbsoluteChange / avgBaselineScore)
 * Clamped to [0, 1]: 1.0 = no impact, 0.0 = complete compromise.
 *
 * @param baseline - Baseline scores from clean graph
 * @param attacked - Scores from contaminated graph
 * @returns Object with resistance, maxChange, and avgChange
 */
export function calculateResistance(
  baseline: Map<string, number>,
  attacked: Map<string, number>
): { resistance: number; maxChange: number; avgChange: number } {
  let totalBaseline = 0;
  let totalChange = 0;
  let maxChange = 0;
  let count = 0;

  for (const [address, baselineScore] of baseline) {
    // Skip sybil nodes — only measure impact on legitimate addresses
    if (address.startsWith(SYBIL_PREFIX)) {
      continue;
    }

    const attackScore = attacked.get(address) || 0;
    const change = Math.abs(attackScore - baselineScore);

    totalBaseline += baselineScore;
    totalChange += change;
    maxChange = Math.max(maxChange, change);
    count++;
  }

  if (count === 0 || totalBaseline === 0) {
    return { resistance: 1, maxChange: 0, avgChange: 0 };
  }

  const avgBaseline = totalBaseline / count;
  const avgChange = totalChange / count;

  // resistance = 1 - (avgChange / avgBaseline), clamped to [0, 1]
  const resistance = Math.max(0, Math.min(1, 1 - (avgChange / avgBaseline)));

  return { resistance, maxChange, avgChange };
}

/**
 * Compute full impact metrics comparing baseline and attack scores
 * across both algorithms, including optional target boost measurement
 */
function computeImpact(
  baselineEigentrust: Map<string, number>,
  attackEigentrust: Map<string, number>,
  baselineAgentrank: Map<string, number>,
  attackAgentrank: Map<string, number>,
  targetAddress?: string
): SybilImpact {
  const etRes = calculateResistance(baselineEigentrust, attackEigentrust);
  const arRes = calculateResistance(baselineAgentrank, attackAgentrank);

  const impact: SybilImpact = {
    eigentrustResistance: etRes.resistance,
    agentrankResistance: arRes.resistance,
    maxScoreChangeEigentrust: etRes.maxChange,
    maxScoreChangeAgentrank: arRes.maxChange,
    avgScoreChangeEigentrust: etRes.avgChange,
    avgScoreChangeAgentrank: arRes.avgChange,
  };

  // Compute target boost if a target was specified
  if (targetAddress) {
    const etBaseline = baselineEigentrust.get(targetAddress) || 0;
    const etAttack = attackEigentrust.get(targetAddress) || 0;
    impact.targetBoostEigentrust = etAttack - etBaseline;

    const arBaseline = baselineAgentrank.get(targetAddress) || 0;
    const arAttack = attackAgentrank.get(targetAddress) || 0;
    impact.targetBoostAgentrank = arAttack - arBaseline;
  }

  return impact;
}
