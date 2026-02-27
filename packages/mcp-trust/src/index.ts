/**
 * Intuition Trust Engine - Entry Point
 *
 * This module provides the main API for the trust engine,
 * including sync operations, graph queries, and trust algorithms.
 */

import 'dotenv/config';
import {
  loadConfig,
  initializeDriver,
  verifyConnection,
  closeDriver,
  getSession
} from './config/neo4j.js';
import { initializeGraphQLClient } from './graphql/client.js';
import { setupSchema } from './graph/schema.js';
import {
  getGraphStats,
  getAttestationsForAddress
} from './graph/queries.js';
import { runSync } from './indexer/sync.js';
import { log } from './utils/logger.js';
import {
  computeEigenTrust,
  computeAgentRank,
  computeCompositeScore,
  simulateSybilAttack,
  computePersonalizedTrust,
  computePersonalizedTrustNetwork,
  findTrustPaths,
  TrustScore,
} from './algorithms/index.js';

/**
 * Initialize the trust engine
 */
export async function initialize(): Promise<void> {
  const config = loadConfig();

  initializeDriver(config);
  const connected = await verifyConnection();

  if (!connected) {
    throw new Error('Failed to connect to Neo4j');
  }

  initializeGraphQLClient(config);
  await setupSchema();

  log('info', 'Trust engine initialized');
}

/**
 * Shutdown the trust engine
 */
export async function shutdown(): Promise<void> {
  await closeDriver();
  log('info', 'Trust engine shutdown complete');
}

// Export main functionality
export { runSync } from './indexer/sync.js';
export { getGraphStats, getAttestationsForAddress } from './graph/queries.js';
export { verifyConnection } from './config/neo4j.js';

// Export trust algorithms
export * from './algorithms/index.js';

// ============ CLI Command Handlers ============

/**
 * Format a trust score for display (full addresses for copy/paste)
 */
function formatTrustScore(score: TrustScore, index?: number): string {
  const prefix = index !== undefined ? `${(index + 1).toString().padStart(3)}. ` : '';
  const scoreStr = score.score.toFixed(6);
  const confStr = (score.confidence * 100).toFixed(1);
  const pathStr = score.pathCount.toString();

  return `${prefix}${score.address}\n     Score: ${scoreStr} | Confidence: ${confStr}% | Paths: ${pathStr}`;
}

/**
 * Run EigenTrust algorithm and display results
 */
async function runEigenTrustCommand(): Promise<void> {
  console.log('\nComputing global EigenTrust scores...\n');

  const result = await computeEigenTrust();

  console.log('='.repeat(80));
  console.log('EigenTrust Results');
  console.log('='.repeat(80));
  console.log(`Iterations: ${result.iterations}`);
  console.log(`Converged: ${result.converged ? 'Yes' : 'No'}`);
  console.log(`Computation time: ${result.computationTimeMs}ms`);
  console.log(`Total addresses scored: ${result.scores.length}`);
  console.log('-'.repeat(80));
  console.log('\nTop 20 Addresses by Trust Score:\n');

  const top20 = result.scores.slice(0, 20);
  for (let i = 0; i < top20.length; i++) {
    console.log(formatTrustScore(top20[i], i));
  }

  console.log('\n' + '='.repeat(80));
}

/**
 * Compute personalized trust between two addresses
 */
async function runTrustCommand(fromAddress: string, toAddress: string): Promise<void> {
  console.log(`\nComputing trust: ${fromAddress} -> ${toAddress}\n`);

  const score = await computePersonalizedTrust({
    fromAddress,
    toAddress,
    maxHops: 3,
    minStake: 0,
  });

  console.log('='.repeat(80));
  console.log('Personalized Trust Result');
  console.log('='.repeat(80));
  console.log(`From:       ${fromAddress}`);
  console.log(`To:         ${toAddress}`);
  console.log('-'.repeat(80));
  console.log(`Trust Score:  ${score.score.toFixed(6)}`);
  console.log(`Confidence:   ${(score.confidence * 100).toFixed(1)}%`);
  console.log(`Path Count:   ${score.pathCount}`);

  if (score.sources.length > 0) {
    console.log(`Sources:      ${score.sources.slice(0, 5).join(', ')}${score.sources.length > 5 ? '...' : ''}`);
  }

  // Interpretation
  console.log('-'.repeat(80));
  console.log('Interpretation:');
  if (score.score === 0) {
    console.log('  No trust path exists between these addresses.');
  } else if (score.score < 0.1) {
    console.log('  Very low trust - weak or distant connection.');
  } else if (score.score < 0.3) {
    console.log('  Low trust - some indirect connections exist.');
  } else if (score.score < 0.5) {
    console.log('  Moderate trust - reasonable connection strength.');
  } else if (score.score < 0.7) {
    console.log('  Good trust - strong connections exist.');
  } else {
    console.log('  High trust - very strong direct or near-direct attestations.');
  }

  console.log('='.repeat(80));
}

/**
 * Compute trust network from an address
 */
async function runNetworkCommand(sourceAddress: string, maxHops: number): Promise<void> {
  console.log(`\nComputing trust network from: ${sourceAddress} (max ${maxHops} hops)\n`);

  const network = await computePersonalizedTrustNetwork(sourceAddress, maxHops);

  console.log('='.repeat(80));
  console.log('Trust Network Results');
  console.log('='.repeat(80));
  console.log(`Source:     ${sourceAddress}`);
  console.log(`Max Hops:   ${maxHops}`);
  console.log(`Reachable:  ${network.size} addresses`);
  console.log('-'.repeat(80));

  if (network.size === 0) {
    console.log('\nNo reachable addresses found from this source.');
  } else {
    // Sort by score and show top 20
    const sorted = Array.from(network.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);

    console.log('\nTop 20 Most Trusted Addresses:\n');
    for (let i = 0; i < sorted.length; i++) {
      console.log(formatTrustScore(sorted[i], i));
    }

    // Show score distribution
    const scores = Array.from(network.values()).map(s => s.score);
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    const maxScore = Math.max(...scores);
    const minScore = Math.min(...scores);

    console.log('\nScore Distribution:');
    console.log(`  Min:     ${minScore.toFixed(6)}`);
    console.log(`  Max:     ${maxScore.toFixed(6)}`);
    console.log(`  Average: ${avgScore.toFixed(6)}`);
  }

  console.log('\n' + '='.repeat(80));
}

/**
 * Find and display trust paths between addresses
 */
async function runPathsCommand(fromAddress: string, toAddress: string, maxHops: number): Promise<void> {
  console.log(`\nFinding trust paths: ${fromAddress} -> ${toAddress} (max ${maxHops} hops)\n`);

  const result = await findTrustPaths(fromAddress, toAddress, maxHops);

  console.log('='.repeat(80));
  console.log('Trust Paths Results');
  console.log('='.repeat(80));
  console.log(`From:         ${fromAddress}`);
  console.log(`To:           ${toAddress}`);
  console.log(`Max Hops:     ${maxHops}`);
  console.log(`Paths Found:  ${result.paths.length}`);
  console.log(`Nodes Visited: ${result.nodesVisited}`);
  console.log('-'.repeat(80));

  if (result.paths.length === 0) {
    console.log('\nNo paths found between these addresses.');
  } else {
    console.log('\nTop 10 Strongest Paths:\n');

    const topPaths = result.paths.slice(0, 10);
    for (let i = 0; i < topPaths.length; i++) {
      const path = topPaths[i];
      const hopCount = path.predicates.length;
      const totalStake = path.stakes.reduce((a, b) => a + b, 0);

      console.log(`Path ${i + 1} (${hopCount} hop${hopCount > 1 ? 's' : ''}):`);

      // Show path visualization with full addresses
      for (let j = 0; j < path.addresses.length; j++) {
        const addr = path.addresses[j];

        if (j < path.predicates.length) {
          const predicate = path.predicates[j];
          const stake = path.stakes[j];
          console.log(`  ${addr}`);
          console.log(`    --[${predicate}, stake: ${stake}]-->`);
        } else {
          console.log(`  ${addr}`);
        }
      }

      console.log(`  Total Stake: ${totalStake} | Decay: ${path.totalDecay.toFixed(4)}`);
      console.log('');
    }

    if (result.strongestPath) {
      console.log('-'.repeat(80));
      console.log('Strongest Path Summary:');
      console.log(`  Hops: ${result.strongestPath.predicates.length}`);
      console.log(`  Predicates: ${result.strongestPath.predicates.join(' -> ')}`);
      console.log(`  Total Decay: ${result.strongestPath.totalDecay.toFixed(6)}`);
    }
  }

  console.log('\n' + '='.repeat(80));
}

/**
 * Interpret Gini coefficient for human-readable output
 */
function interpretGini(gini: number): string {
  if (gini < 0.2) return 'Very equal - influence is broadly distributed';
  if (gini < 0.4) return 'Moderately equal - some concentration emerging';
  if (gini < 0.6) return 'Moderate inequality - clear influence hierarchy';
  if (gini < 0.8) return 'High inequality - influence concentrated in few agents';
  return 'Extreme inequality - near-total concentration';
}

/**
 * Run AgentRank algorithm and display results
 *
 * @param topN - Number of top agents to display (default 20)
 */
async function runAgentRankCommand(topN: number = 20): Promise<void> {
  console.log('\nComputing global AgentRank scores...\n');

  const result = await computeAgentRank(undefined, topN);

  const displayCount = Math.min(topN, result.topAgents.length);

  console.log('='.repeat(80));
  console.log('AgentRank Results');
  console.log('='.repeat(80));
  console.log(`Iterations:             ${result.iterations}`);
  console.log(`Converged:              ${result.converged ? 'Yes' : 'No'}`);
  console.log(`Computation time:       ${result.computationTimeMs}ms`);
  console.log(`Total addresses ranked: ${result.ranks.size}`);
  console.log('-'.repeat(80));

  // Influence metrics
  const m = result.influenceMetrics;
  console.log('\nInfluence Distribution:');
  console.log(`  Gini Coefficient:  ${m.giniCoefficient.toFixed(4)}  (${interpretGini(m.giniCoefficient)})`);
  console.log(`  Shannon Entropy:   ${m.entropy.toFixed(4)} bits`);
  console.log(`  Top 10% Share:     ${(m.top10PctShare * 100).toFixed(2)}% of total rank`);
  console.log(`  Median Rank:       ${m.medianRank.toFixed(6)}`);

  // Rank distribution summary
  const rankValues = Array.from(result.ranks.values());
  const minRank = Math.min(...rankValues);
  const maxRank = Math.max(...rankValues);
  const avgRank = rankValues.reduce((a, b) => a + b, 0) / rankValues.length;

  console.log('\nRank Distribution:');
  console.log(`  Min:     ${minRank.toFixed(6)}`);
  console.log(`  Max:     ${maxRank.toFixed(6)}`);
  console.log(`  Average: ${avgRank.toFixed(6)}`);
  console.log(`  Ratio (max/min): ${minRank > 0 ? (maxRank / minRank).toFixed(2) + 'x' : 'N/A'}`);

  console.log('-'.repeat(80));
  console.log(`\nTop ${displayCount} Agents by Rank:\n`);

  for (let i = 0; i < displayCount; i++) {
    const agent = result.topAgents[i];
    console.log(formatAgentRankEntry(agent, i));
  }

  console.log('\n' + '='.repeat(80));
}

/**
 * Format a single AgentRank entry for display
 */
function formatAgentRankEntry(agent: { address: string; rank: number; inDegree: number; outDegree: number }, index: number): string {
  const prefix = `${(index + 1).toString().padStart(3)}. `;
  const rankStr = agent.rank.toFixed(6);
  const inStr = agent.inDegree.toString().padStart(4);
  const outStr = agent.outDegree.toString().padStart(4);

  return `${prefix}${agent.address}\n     Rank: ${rankStr} | In: ${inStr} | Out: ${outStr}`;
}

/**
 * Compute and display composite trust score for an address
 *
 * @param address - The address to evaluate
 * @param fromAddress - Optional source for personalized transitive trust
 */
async function runScoreCommand(address: string, fromAddress?: string): Promise<void> {
  console.log(`\nComputing composite trust score for: ${address}`);
  if (fromAddress) {
    console.log(`From perspective of: ${fromAddress}`);
  }
  console.log('');

  const result = await computeCompositeScore(address, fromAddress);

  const b = result.breakdown;

  // Derive effective weights (same logic as scoring engine)
  const baseWeights = { eigentrust: 0.4, agentrank: 0.3, transitiveTrust: 0.3 };
  let weights: { eigentrust: number; agentrank: number; transitiveTrust: number };

  if (fromAddress) {
    weights = { ...baseWeights };
  } else {
    const globalTotal = baseWeights.eigentrust + baseWeights.agentrank;
    weights = {
      eigentrust: baseWeights.eigentrust / globalTotal,
      agentrank: baseWeights.agentrank / globalTotal,
      transitiveTrust: 0,
    };
  }

  // Compute per-component contribution (weight * normalized * 100)
  const etContribution = weights.eigentrust * b.eigentrust.normalizedScore * 100;
  const arContribution = weights.agentrank * b.agentrank.normalizedScore * 100;
  const ttContribution = weights.transitiveTrust * b.transitiveTrust.score * 100;

  console.log('='.repeat(80));
  console.log('Composite Trust Score');
  console.log('='.repeat(80));
  console.log(`Address:    ${result.address}`);
  console.log(`Score:      ${result.compositeScore.toFixed(2)} / 100`);
  console.log(`Confidence: ${(result.confidence * 100).toFixed(1)}%`);
  console.log('-'.repeat(80));

  // Breakdown table with Weight and Contribution columns
  console.log('\n  Score Breakdown:\n');

  const col1 = 20;
  const col2 = 12;
  const col3 = 12;
  const col4 = 8;
  const col5 = 10;

  const pad = (s: string, w: number) => s.padEnd(w);
  const divider = '  +-'
    + '-'.repeat(col1) + '-+-'
    + '-'.repeat(col2) + '-+-'
    + '-'.repeat(col3) + '-+-'
    + '-'.repeat(col4) + '-+-'
    + '-'.repeat(col5) + '-+';

  console.log(divider);
  console.log(
    `  | ${pad('Component', col1)} | ${pad('Raw Score', col2)} | ${pad('Normalized', col3)} | ${pad('Weight', col4)} | ${pad('Contrib.', col5)} |`
  );
  console.log(divider);

  const row = (label: string, raw: string, norm: string, weight: string, contrib: string) => {
    console.log(
      `  | ${pad(label, col1)} | ${pad(raw, col2)} | ${pad(norm, col3)} | ${pad(weight, col4)} | ${pad(contrib, col5)} |`
    );
  };

  row(
    'EigenTrust',
    b.eigentrust.score.toFixed(6),
    b.eigentrust.normalizedScore.toFixed(4),
    `${(weights.eigentrust * 100).toFixed(0)}%`,
    etContribution.toFixed(2)
  );
  row(
    'AgentRank',
    b.agentrank.score.toFixed(6),
    b.agentrank.normalizedScore.toFixed(4),
    `${(weights.agentrank * 100).toFixed(0)}%`,
    arContribution.toFixed(2)
  );
  row(
    'Transitive Trust',
    b.transitiveTrust.score.toFixed(6),
    b.transitiveTrust.score.toFixed(4),
    `${(weights.transitiveTrust * 100).toFixed(0)}%`,
    ttContribution.toFixed(2)
  );

  console.log(divider);
  console.log(
    `  | ${pad('TOTAL', col1)} | ${pad('', col2)} | ${pad('', col3)} | ${pad('100%', col4)} | ${pad(result.compositeScore.toFixed(2), col5)} |`
  );
  console.log(divider);

  // Metadata
  console.log(`\n  Network:  ${result.metadata.totalNodes} nodes`);
  console.log(`  Compute:  ${result.metadata.computeTimeMs}ms`);
  console.log(`  Data age: ${result.metadata.dataFreshness.toISOString()}`);

  // Interpretation
  console.log('-'.repeat(80));
  console.log('\nInterpretation:');
  const cs = result.compositeScore;
  if (cs >= 80) {
    console.log('  Highly trusted — strong global reputation and influence.');
  } else if (cs >= 60) {
    console.log('  Well trusted — solid reputation across multiple signals.');
  } else if (cs >= 40) {
    console.log('  Moderately trusted — some presence in the network.');
  } else if (cs >= 20) {
    console.log('  Low trust — limited network activity or reputation.');
  } else {
    console.log('  Minimal trust — very little network presence or new address.');
  }

  console.log('\n' + '='.repeat(80));
}

/**
 * Run sybil attack simulation and display results
 *
 * @param numNodes - Number of sybil nodes to inject
 * @param targetAddress - Optional target address to boost
 */
async function runSybilCommand(numNodes: number, targetAddress?: string): Promise<void> {
  // Collusion edges scale with node count: ~4 edges per sybil node
  const numCollusionEdges = numNodes * 4;

  console.log('\n' + '='.repeat(80));
  console.log('Sybil Attack Simulation');
  console.log('='.repeat(80));
  console.log(`Sybil nodes:      ${numNodes}`);
  console.log(`Collusion edges:  ${numCollusionEdges}`);
  console.log(`Stake per edge:   0.01 ETH`);
  if (targetAddress) {
    console.log(`Target address:   ${targetAddress}`);
  }
  console.log('-'.repeat(80));

  const phaseMessages: Record<string, string> = {
    baseline:  'Computing baseline scores on clean graph...',
    injecting: `Creating ${numNodes} sybil nodes with ${numCollusionEdges} collusion edges...`,
    computing: 'Running algorithms on contaminated graph...',
    cleanup:   'Cleaning up sybil nodes...',
    done:      'Comparing results...',
  };

  const result = await simulateSybilAttack({
    numSybilNodes: numNodes,
    numCollusionEdges,
    targetAddress,
    onProgress: (phase: string) => {
      const msg = phaseMessages[phase];
      if (msg) {
        console.log(`\n  [*] ${msg}`);
      }
    },
  });

  const im = result.impact;

  // ---- Summary ----
  console.log('\n' + '-'.repeat(80));
  console.log(`Sybil nodes created:  ${result.sybilNodesCreated}`);
  console.log(`Sybil edges created:  ${result.sybilEdgesCreated}`);
  console.log(`Computation time:     ${result.computationTimeMs}ms`);

  // ---- Results Table ----
  const hasTarget = targetAddress && im.targetBoostEigentrust !== undefined;

  console.log('\n' + '-'.repeat(80));
  console.log('\n  Results:\n');

  // Column widths
  const col1 = 22; // Metric name
  const col2 = 14; // EigenTrust value
  const col3 = 14; // AgentRank value

  const hdr = (s: string, w: number) => s.padEnd(w);
  const divider = '  +-' + '-'.repeat(col1) + '-+-' + '-'.repeat(col2) + '-+-' + '-'.repeat(col3) + '-+';

  console.log(divider);
  console.log(`  | ${hdr('Metric', col1)} | ${hdr('EigenTrust', col2)} | ${hdr('AgentRank', col3)} |`);
  console.log(divider);

  // Row helper
  const row = (label: string, etVal: string, arVal: string) => {
    console.log(`  | ${hdr(label, col1)} | ${hdr(etVal, col2)} | ${hdr(arVal, col3)} |`);
  };

  row(
    'Resistance Score',
    im.eigentrustResistance.toFixed(4),
    im.agentrankResistance.toFixed(4)
  );
  row(
    'Max Score Change',
    im.maxScoreChangeEigentrust.toFixed(6),
    im.maxScoreChangeAgentrank.toFixed(6)
  );
  row(
    'Avg Score Change',
    im.avgScoreChangeEigentrust.toFixed(6),
    im.avgScoreChangeAgentrank.toFixed(6)
  );

  if (hasTarget) {
    const etBoost = im.targetBoostEigentrust!;
    const arBoost = im.targetBoostAgentrank!;
    row(
      'Target Boost',
      (etBoost >= 0 ? '+' : '') + etBoost.toFixed(6),
      (arBoost >= 0 ? '+' : '') + arBoost.toFixed(6)
    );
  }

  console.log(divider);

  // ---- Resistance Bars ----
  console.log('\n  Resistance:');
  console.log(`    EigenTrust:  ${resistanceBar(im.eigentrustResistance)}  ${(im.eigentrustResistance * 100).toFixed(0)}%`);
  console.log(`    AgentRank:   ${resistanceBar(im.agentrankResistance)}  ${(im.agentrankResistance * 100).toFixed(0)}%`);

  // ---- Target Detail ----
  if (hasTarget) {
    const etBase = result.baselineScores.eigentrust.get(targetAddress!) || 0;
    const arBase = result.baselineScores.agentrank.get(targetAddress!) || 0;
    const etBoost = im.targetBoostEigentrust!;
    const arBoost = im.targetBoostAgentrank!;

    console.log(`\n  Target Score Change (${targetAddress}):`);
    console.log(`    EigenTrust:  ${etBase.toFixed(6)} -> ${(etBase + etBoost).toFixed(6)}`);
    console.log(`    AgentRank:   ${arBase.toFixed(6)} -> ${(arBase + arBoost).toFixed(6)}`);
  }

  // ---- Verdict ----
  console.log('\n' + '-'.repeat(80));
  const etPct = Math.round(im.eigentrustResistance * 100);
  const arPct = Math.round(im.agentrankResistance * 100);

  console.log(
    `\n  Verdict: EigenTrust showed ${classifyResistance(im.eigentrustResistance)} sybil resistance (${etPct}%).` +
    `\n           AgentRank showed ${classifyResistance(im.agentrankResistance)} sybil resistance (${arPct}%).`
  );

  console.log('\n' + '='.repeat(80));
}

/**
 * Visual bar for resistance score (20-char width)
 */
function resistanceBar(resistance: number): string {
  const filled = Math.round(resistance * 20);
  const empty = 20 - filled;
  return '[' + '#'.repeat(filled) + '-'.repeat(empty) + ']';
}

/**
 * Classify resistance for the verdict line
 */
function classifyResistance(resistance: number): string {
  if (resistance >= 0.95) return 'excellent';
  if (resistance >= 0.85) return 'strong';
  if (resistance >= 0.70) return 'moderate';
  if (resistance >= 0.50) return 'weak';
  return 'poor';
}

/**
 * Run debug diagnostics to find addresses with connections
 */
async function runDebugCommand(): Promise<void> {
  console.log('\nRunning graph diagnostics...\n');

  const session = getSession();

  try {
    console.log('='.repeat(80));
    console.log('Graph Diagnostics');
    console.log('='.repeat(80));

    // Top 10 addresses by OUTGOING attestation count
    console.log('\nTop 10 Addresses by OUTGOING Attestations:\n');
    const outgoingResult = await session.run(`
      MATCH (a:Address)-[r:ATTESTS]->(b:Address)
      RETURN a.id as address, count(r) as outgoing
      ORDER BY outgoing DESC
      LIMIT 10
    `);

    for (const record of outgoingResult.records) {
      const addr = record.get('address');
      const count = record.get('outgoing').toNumber();
      console.log(`  ${addr}`);
      console.log(`    Outgoing: ${count}`);
    }

    // Top 10 addresses by INCOMING attestation count
    console.log('\n' + '-'.repeat(80));
    console.log('\nTop 10 Addresses by INCOMING Attestations:\n');
    const incomingResult = await session.run(`
      MATCH (a:Address)-[r:ATTESTS]->(b:Address)
      RETURN b.id as address, count(r) as incoming
      ORDER BY incoming DESC
      LIMIT 10
    `);

    for (const record of incomingResult.records) {
      const addr = record.get('address');
      const count = record.get('incoming').toNumber();
      console.log(`  ${addr}`);
      console.log(`    Incoming: ${count}`);
    }

    // Sample edges
    console.log('\n' + '-'.repeat(80));
    console.log('\nSample Edges (first 20):\n');
    const edgesResult = await session.run(`
      MATCH (a:Address)-[r:ATTESTS]->(b:Address)
      RETURN a.id as fromAddr, b.id as toAddr, r.predicate as predicate, r.stakeAmount as stake
      LIMIT 20
    `);

    for (let i = 0; i < edgesResult.records.length; i++) {
      const record = edgesResult.records[i];
      const from = record.get('fromAddr');
      const to = record.get('toAddr');
      const predicate = record.get('predicate') || 'unknown';
      const stake = record.get('stake');
      const stakeNum = stake && stake.toNumber ? stake.toNumber() : stake;

      console.log(`${(i + 1).toString().padStart(2)}. FROM: ${from}`);
      console.log(`    TO:   ${to}`);
      console.log(`    Predicate: ${predicate} | Stake: ${stakeNum}`);
      console.log('');
    }

    // Find addresses that both give AND receive attestations (good for path testing)
    console.log('-'.repeat(80));
    console.log('\nAddresses with BOTH Outgoing AND Incoming (best for path testing):\n');
    const bothResult = await session.run(`
      MATCH (a:Address)-[r1:ATTESTS]->(b:Address)
      WITH a, count(r1) as outgoing
      WHERE outgoing > 0
      MATCH (c:Address)-[r2:ATTESTS]->(a)
      WITH a, outgoing, count(r2) as incoming
      WHERE incoming > 0
      RETURN a.id as address, outgoing, incoming
      ORDER BY outgoing + incoming DESC
      LIMIT 10
    `);

    if (bothResult.records.length === 0) {
      console.log('  No addresses found with both incoming and outgoing attestations.');
    } else {
      for (const record of bothResult.records) {
        const addr = record.get('address');
        const outgoing = record.get('outgoing').toNumber();
        const incoming = record.get('incoming').toNumber();
        console.log(`  ${addr}`);
        console.log(`    Outgoing: ${outgoing} | Incoming: ${incoming}`);
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('\nTip: Use addresses from "OUTGOING" list as source, "INCOMING" as target for path queries.');
    console.log('Example: npm run dev paths <outgoing-addr> <incoming-addr>');
    console.log('='.repeat(80));

  } finally {
    await session.close();
  }
}

// CLI interface when run directly
async function main(): Promise<void> {
  const command = process.argv[2];

  try {
    await initialize();

    switch (command) {
      case 'sync':
        const maxPages = process.argv[3] ? parseInt(process.argv[3], 10) : undefined;
        await runSync({ maxPages });
        break;

      case 'stats':
        const stats = await getGraphStats();
        console.log('\nGraph Statistics:');
        console.log(JSON.stringify(stats, null, 2));
        break;

      case 'query':
        const address = process.argv[3];
        if (!address) {
          console.error('Usage: npm run dev query <address>');
          process.exit(1);
        }
        const attestations = await getAttestationsForAddress(address);
        console.log('\nAttestations for', address);
        console.log(JSON.stringify(attestations, null, 2));
        break;

      case 'verify':
        const isConnected = await verifyConnection();
        console.log('Connection status:', isConnected ? 'OK' : 'FAILED');
        break;

      case 'eigentrust':
        await runEigenTrustCommand();
        break;

      case 'agentrank': {
        const topIdx = process.argv.indexOf('--top');
        const agentRankTopN = topIdx !== -1 && process.argv[topIdx + 1]
          ? parseInt(process.argv[topIdx + 1], 10)
          : 20;
        await runAgentRankCommand(agentRankTopN);
        break;
      }

      case 'score': {
        const scoreAddr = process.argv[3];
        if (!scoreAddr) {
          console.error('Usage: npm run dev score <address> [--from <address>]');
          process.exit(1);
        }
        const fromIdx = process.argv.indexOf('--from');
        const scoreFrom = fromIdx !== -1 && process.argv[fromIdx + 1]
          ? process.argv[fromIdx + 1]
          : undefined;
        await runScoreCommand(scoreAddr, scoreFrom);
        break;
      }

      case 'trust':
        const fromAddr = process.argv[3];
        const toAddr = process.argv[4];
        if (!fromAddr || !toAddr) {
          console.error('Usage: npm run dev trust <fromAddress> <toAddress>');
          process.exit(1);
        }
        await runTrustCommand(fromAddr, toAddr);
        break;

      case 'network':
        const sourceAddr = process.argv[3];
        const hops = process.argv[4] ? parseInt(process.argv[4], 10) : 3;
        if (!sourceAddr) {
          console.error('Usage: npm run dev network <address> [maxHops]');
          process.exit(1);
        }
        await runNetworkCommand(sourceAddr, hops);
        break;

      case 'paths':
        const pathFrom = process.argv[3];
        const pathTo = process.argv[4];
        const pathHops = process.argv[5] ? parseInt(process.argv[5], 10) : 3;
        if (!pathFrom || !pathTo) {
          console.error('Usage: npm run dev paths <fromAddress> <toAddress> [maxHops]');
          process.exit(1);
        }
        await runPathsCommand(pathFrom, pathTo, pathHops);
        break;

      case 'sybil': {
        const nodesIdx = process.argv.indexOf('--nodes');
        const sybilNodes = nodesIdx !== -1 && process.argv[nodesIdx + 1]
          ? parseInt(process.argv[nodesIdx + 1], 10)
          : 50;
        const targetIdx = process.argv.indexOf('--target');
        const sybilTarget = targetIdx !== -1 && process.argv[targetIdx + 1]
          ? process.argv[targetIdx + 1]
          : undefined;
        await runSybilCommand(sybilNodes, sybilTarget);
        break;
      }

      case 'debug':
        await runDebugCommand();
        break;

      default:
        console.log(`
Intuition Trust Engine CLI

Usage:
  npm run dev sync [maxPages]  - Sync data from Intuition API
  npm run dev stats            - Show graph statistics
  npm run dev query <address>  - Query attestations for an address
  npm run dev verify           - Verify database connection

Trust Algorithms:
  npm run dev eigentrust                      - Compute global EigenTrust scores
  npm run dev agentrank [--top N]              - Compute global AgentRank (PageRank) scores
  npm run dev score <addr> [--from <addr>]    - Composite trust score (main API)
  npm run dev trust <from> <to>               - Compute trust from one address to another
  npm run dev network <address> [maxHops]     - Compute trust network from an address
  npm run dev paths <from> <to> [maxHops]     - Find trust paths between addresses

Security Analysis:
  npm run dev sybil [--nodes N] [--target addr] - Run sybil attack simulation

Diagnostics:
  npm run dev debug                           - Show graph connection diagnostics

Examples:
  npm run dev sync 5                          - Sync first 5 pages
  npm run dev query 0x1234...                 - Get attestations for address
  npm run dev score 0xabc... --from 0xdef...   - Composite score from a perspective
  npm run dev trust 0xabc... 0xdef...         - How much should 0xabc trust 0xdef?
  npm run dev agentrank --top 50              - Show top 50 agents by PageRank
  npm run dev sybil --nodes 100 --target 0xabc - Sybil test with 100 nodes targeting 0xabc
  npm run dev network 0xabc... 2              - Trust network within 2 hops
        `);
        break;
    }
  } catch (error) {
    log('error', 'Command failed', { error: String(error) });
    process.exit(1);
  } finally {
    await shutdown();
  }
}

main();
