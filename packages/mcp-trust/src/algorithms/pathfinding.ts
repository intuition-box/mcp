/**
 * Path-finding algorithms for trust computation
 * Week 2: Trust Algorithm Implementation
 *
 * Uses Neo4j Cypher queries to find trust paths through the attestation graph
 */

import { Record as Neo4jRecord, Path, Node, Relationship } from 'neo4j-driver';
import { getSession } from '../config/neo4j.js';
import { log } from '../utils/logger.js';
import { TrustPath, PathFindingResult } from './types.js';
import {
  DEFAULT_DECAY_FACTOR,
  DEFAULT_MAX_HOPS,
  getPredicateWeight,
} from './constants.js';

// ============ Constants ============

/**
 * Maximum number of paths to return from queries
 * Prevents memory issues with highly connected graphs
 */
const MAX_PATHS_LIMIT = 1000;

/**
 * Base value for log-scale stake normalization
 * Stakes are normalized as: log(stake + 1) / log(STAKE_LOG_BASE)
 */
const STAKE_LOG_BASE = 1e18;

// ============ Path Finding Functions ============

/**
 * Find all trust paths between two addresses up to maxHops
 *
 * @param fromAddress - Source address (trust originates here)
 * @param toAddress - Target address (trust is computed for this address)
 * @param maxHops - Maximum number of hops to traverse (default: 3)
 * @returns PathFindingResult containing all discovered paths sorted by trust
 */
export async function findTrustPaths(
  fromAddress: string,
  toAddress: string,
  maxHops: number = DEFAULT_MAX_HOPS,
  predicateWeights?: Record<string, number>,
): Promise<PathFindingResult> {
  const session = getSession();
  const normalizedFrom = fromAddress.toLowerCase();
  const normalizedTo = toAddress.toLowerCase();

  log('debug', 'Finding trust paths', {
    from: normalizedFrom,
    to: normalizedTo,
    maxHops,
  });

  try {
    // Build query with appropriate hop range
    // Neo4j doesn't support parameterized relationship length, so we use string interpolation
    // for maxHops only (it's a number, not user input string)
    const hopRange = Math.min(Math.max(1, maxHops), 10); // Clamp between 1-10

    const result = await session.run(
      `
      MATCH path = (source:Address {id: $fromAddress})-[:ATTESTS*1..${hopRange}]->(target:Address {id: $toAddress})
      WITH path, relationships(path) as rels
      WITH path, rels, reduce(totalStake = 0, r IN rels | totalStake + coalesce(r.stakeAmount, 0)) as pathStake
      RETURN path, pathStake
      ORDER BY pathStake DESC
      LIMIT toInteger($limit)
      `,
      {
        fromAddress: normalizedFrom,
        toAddress: normalizedTo,
        limit: MAX_PATHS_LIMIT,
      }
    );

    const paths = getPathsFromCypherResult(result.records);
    const nodesVisited = countUniqueNodes(paths);

    // Sort by calculated trust (not just stake)
    const sortedPaths = paths
      .map(path => ({
        path,
        trust: calculatePathTrust(path, DEFAULT_DECAY_FACTOR, predicateWeights),
      }))
      .sort((a, b) => b.trust - a.trust)
      .map(item => item.path);

    const strongestPath = sortedPaths.length > 0 ? sortedPaths[0] : null;

    log('debug', 'Trust paths found', {
      pathCount: sortedPaths.length,
      nodesVisited,
    });

    return {
      paths: sortedPaths,
      strongestPath,
      nodesVisited,
    };
  } catch (error) {
    log('error', 'Failed to find trust paths', {
      error: String(error),
      from: normalizedFrom,
      to: normalizedTo,
    });
    throw error;
  } finally {
    await session.close();
  }
}

/**
 * Find all reachable addresses from a starting address
 * Used for personalized trust computation (PageRank-style)
 *
 * @param fromAddress - Source address to start traversal from
 * @param maxHops - Maximum depth to traverse (default: 3)
 * @returns PathFindingResult containing all outgoing trust paths
 */
export async function findOutgoingTrustPaths(
  fromAddress: string,
  maxHops: number = DEFAULT_MAX_HOPS
): Promise<PathFindingResult> {
  const session = getSession();
  const normalizedFrom = fromAddress.toLowerCase();

  log('debug', 'Finding outgoing trust paths', {
    from: normalizedFrom,
    maxHops,
  });

  try {
    const hopRange = Math.min(Math.max(1, maxHops), 10);

    const result = await session.run(
      `
      MATCH path = (source:Address {id: $fromAddress})-[:ATTESTS*1..${hopRange}]->(target:Address)
      WHERE source <> target
      WITH path, relationships(path) as rels
      WITH path, rels, reduce(totalStake = 0, r IN rels | totalStake + coalesce(r.stakeAmount, 0)) as pathStake
      RETURN path, pathStake
      ORDER BY pathStake DESC
      LIMIT toInteger($limit)
      `,
      {
        fromAddress: normalizedFrom,
        limit: MAX_PATHS_LIMIT,
      }
    );

    const paths = getPathsFromCypherResult(result.records);
    const nodesVisited = countUniqueNodes(paths);

    // Sort by calculated trust
    const sortedPaths = paths
      .map(path => ({
        path,
        trust: calculatePathTrust(path),
      }))
      .sort((a, b) => b.trust - a.trust)
      .map(item => item.path);

    const strongestPath = sortedPaths.length > 0 ? sortedPaths[0] : null;

    log('debug', 'Outgoing trust paths found', {
      pathCount: sortedPaths.length,
      nodesVisited,
    });

    return {
      paths: sortedPaths,
      strongestPath,
      nodesVisited,
    };
  } catch (error) {
    log('error', 'Failed to find outgoing trust paths', {
      error: String(error),
      from: normalizedFrom,
    });
    throw error;
  } finally {
    await session.close();
  }
}

// ============ Trust Calculation Functions ============

/**
 * Calculate the trust value for a path
 *
 * Trust is computed as the product of weighted factors at each hop:
 * - Stake weight: log-normalized stake amount
 * - Predicate weight: semantic weight of the relationship type
 * - Decay factor: exponential decay based on hop distance
 *
 * Formula per hop: stakeWeight * predicateWeight * decayFactor^hopIndex
 * Total trust: product of all hop values, clamped to [0, 1]
 *
 * @param path - The trust path to evaluate
 * @param decayFactor - Decay multiplier per hop (default: 0.6)
 * @param predicateWeights - Optional custom predicate weight overrides
 * @returns Trust value between 0 and 1
 */
export function calculatePathTrust(
  path: TrustPath,
  decayFactor: number = DEFAULT_DECAY_FACTOR,
  predicateWeights?: Record<string, number>,
): number {
  if (path.predicates.length === 0 || path.stakes.length === 0) {
    return 0;
  }

  let trust = 1.0;

  for (let i = 0; i < path.predicates.length; i++) {
    const predicate = path.predicates[i];
    const stake = path.stakes[i];

    // Normalize stake using log scale
    const stakeWeight = normalizeStake(stake);

    // Get predicate weight (custom override falls back to constants.ts default)
    const predicateWeight = predicateWeights?.[predicate] ?? getPredicateWeight(predicate);

    // Apply decay based on hop index (0-indexed)
    const hopDecay = Math.pow(decayFactor, i);

    // Multiply into total trust
    trust *= stakeWeight * predicateWeight * hopDecay;
  }

  // Clamp to [0, 1]
  return Math.max(0, Math.min(1, trust));
}

/**
 * Normalize a stake amount to [0, 1] using log scale
 * This prevents large stakes from dominating and provides
 * diminishing returns for very high stakes
 *
 * @param stake - Raw stake amount (in wei or similar unit)
 * @returns Normalized stake weight between 0 and 1
 */
export function normalizeStake(stake: number): number {
  if (stake <= 0) {
    return 0;
  }

  // Log normalization: log(stake + 1) / log(base)
  // This maps stakes to roughly [0, 1] for typical values
  const logStake = Math.log(stake + 1);
  const logBase = Math.log(STAKE_LOG_BASE);

  // Clamp to [0, 1]
  return Math.max(0, Math.min(1, logStake / logBase));
}

// ============ Helper Functions ============

/**
 * Transform Neo4j query results into TrustPath objects
 *
 * @param records - Neo4j query result records containing path data
 * @returns Array of TrustPath objects
 */
export function getPathsFromCypherResult(records: Neo4jRecord[]): TrustPath[] {
  const paths: TrustPath[] = [];

  for (const record of records) {
    try {
      const path = record.get('path') as Path;

      if (!path || !path.segments) {
        continue;
      }

      const addresses: string[] = [];
      const predicates: string[] = [];
      const stakes: number[] = [];

      // Extract nodes from path
      const nodes = path.segments.map(seg => seg.start).concat(
        path.segments.length > 0 ? [path.segments[path.segments.length - 1].end] : []
      );

      for (const node of nodes) {
        const nodeObj = node as Node;
        const id = nodeObj.properties.id as string;
        if (id) {
          addresses.push(id);
        }
      }

      // Extract relationships from path
      for (const segment of path.segments) {
        const rel = segment.relationship as Relationship;
        const predicate = (rel.properties.predicate as string) || 'unknown';
        const stakeAmount = extractNumber(rel.properties.stakeAmount);

        predicates.push(predicate);
        stakes.push(stakeAmount);
      }

      // Calculate total decay for this path
      const hopCount = predicates.length;
      const totalDecay = Math.pow(DEFAULT_DECAY_FACTOR, hopCount);

      paths.push({
        addresses,
        predicates,
        stakes,
        totalDecay,
      });
    } catch (error) {
      log('warn', 'Failed to parse path from record', {
        error: String(error),
      });
    }
  }

  return paths;
}

/**
 * Extract a numeric value from a Neo4j property
 * Handles Neo4j Integer types and string representations
 *
 * @param value - The property value to extract
 * @returns The numeric value, or 0 if extraction fails
 */
function extractNumber(value: unknown): number {
  if (value === null || value === undefined) {
    return 0;
  }

  // Neo4j Integer type
  if (typeof value === 'object' && value !== null && 'toNumber' in value) {
    return (value as { toNumber: () => number }).toNumber();
  }

  // Already a number
  if (typeof value === 'number') {
    return value;
  }

  // String representation
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? 0 : parsed;
  }

  return 0;
}

/**
 * Count unique nodes across all paths
 *
 * @param paths - Array of trust paths
 * @returns Number of unique addresses visited
 */
function countUniqueNodes(paths: TrustPath[]): number {
  const uniqueAddresses = new Set<string>();

  for (const path of paths) {
    for (const address of path.addresses) {
      uniqueAddresses.add(address);
    }
  }

  return uniqueAddresses.size;
}
