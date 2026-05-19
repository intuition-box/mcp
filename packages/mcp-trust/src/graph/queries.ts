/**
 * Cypher queries for graph operations
 */

import { getSession } from '../config/neo4j.js';
import { AddressNode, AttestationEdge } from '../types/index.js';
import { log } from '../utils/logger.js';

/**
 * Upsert address nodes in batch
 */
export async function upsertAddresses(nodes: AddressNode[]): Promise<number> {
  if (nodes.length === 0) return 0;

  const session = getSession();

  try {
    const result = await session.run(
      `
      UNWIND $nodes AS node
      MERGE (a:Address {id: node.id})
      ON CREATE SET
        a.label = node.label,
        a.totalStake = node.total_stake,
        a.attestationCount = node.attestation_count,
        a.lastUpdated = node.last_updated,
        a.createdAt = node.last_updated
      ON MATCH SET
        a.label = COALESCE(node.label, a.label),
        a.totalStake = a.totalStake + node.total_stake,
        a.attestationCount = a.attestationCount + node.attestation_count,
        a.lastUpdated = node.last_updated
      RETURN count(a) as count
      `,
      { nodes }
    );

    const count = result.records[0].get('count').toNumber();
    return count;
  } finally {
    await session.close();
  }
}

/**
 * Upsert attestation edges in batch
 */
export async function upsertAttestations(edges: AttestationEdge[]): Promise<number> {
  if (edges.length === 0) return 0;

  const session = getSession();

  try {
    const result = await session.run(
      `
      UNWIND $edges AS edge
      MATCH (from:Address {id: edge.from})
      MATCH (to:Address {id: edge.to})
      MERGE (from)-[r:ATTESTS {tripleId: edge.triple_id}]->(to)
      ON CREATE SET
        r.predicate = edge.predicate,
        r.stakeAmount = edge.stake_amount,
        r.timestamp = edge.timestamp,
        r.createdAt = edge.timestamp
      ON MATCH SET
        r.stakeAmount = edge.stake_amount,
        r.timestamp = edge.timestamp
      RETURN count(r) as count
      `,
      { edges }
    );

    const count = result.records[0].get('count').toNumber();
    return count;
  } finally {
    await session.close();
  }
}

/**
 * Get all attestations for a specific address
 */
export async function getAttestationsForAddress(
  address: string
): Promise<{ incoming: unknown[]; outgoing: unknown[] }> {
  const session = getSession();
  const normalizedAddress = address.toLowerCase();

  try {
    // Incoming attestations (others attesting about this address)
    const incomingResult = await session.run(
      `
      MATCH (attester:Address)-[r:ATTESTS]->(target:Address {id: $address})
      RETURN attester.id AS attesterId,
             attester.label AS attesterLabel,
             r.predicate AS predicate,
             r.stakeAmount AS stake,
             r.timestamp AS timestamp
      ORDER BY r.timestamp DESC
      LIMIT 100
      `,
      { address: normalizedAddress }
    );

    // Outgoing attestations (this address attesting about others)
    const outgoingResult = await session.run(
      `
      MATCH (attester:Address {id: $address})-[r:ATTESTS]->(target:Address)
      RETURN target.id AS targetId,
             target.label AS targetLabel,
             r.predicate AS predicate,
             r.stakeAmount AS stake,
             r.timestamp AS timestamp
      ORDER BY r.timestamp DESC
      LIMIT 100
      `,
      { address: normalizedAddress }
    );

    return {
      incoming: incomingResult.records.map(r => r.toObject()),
      outgoing: outgoingResult.records.map(r => r.toObject()),
    };
  } finally {
    await session.close();
  }
}

/**
 * Get graph statistics
 */
export async function getGraphStats(): Promise<{
  addressCount: number;
  attestationCount: number;
  predicateDistribution: Record<string, number>;
  lastSyncedAt: string | null;
  lastSyncStatus: string | null;
  lastSyncDurationMs: number | null;
  lastSyncNodesCreated: number | null;
  lastSyncEdgesCreated: number | null;
}> {
  const session = getSession();

  try {
    const countResult = await session.run(`
      MATCH (a:Address)
      WITH count(a) as addressCount
      MATCH ()-[r:ATTESTS]->()
      RETURN addressCount, count(r) as attestationCount
    `);

    const predicateResult = await session.run(`
      MATCH ()-[r:ATTESTS]->()
      RETURN r.predicate as predicate, count(*) as count
      ORDER BY count DESC
      LIMIT 20
    `);

    const metaResult = await session.run(`
      OPTIONAL MATCH (m:Meta {key: 'sync'})
      RETURN m.lastSyncedAt AS lastSyncedAt,
             m.lastSyncStatus AS lastSyncStatus,
             m.lastSyncDurationMs AS lastSyncDurationMs,
             m.lastSyncNodesCreated AS lastSyncNodesCreated,
             m.lastSyncEdgesCreated AS lastSyncEdgesCreated
    `);

    const counts = countResult.records[0];
    const predicateDistribution: Record<string, number> = {};

    for (const record of predicateResult.records) {
      const predicate = record.get('predicate') || 'unknown';
      const count = record.get('count').toNumber();
      predicateDistribution[predicate] = count;
    }

    const metaRecord = metaResult.records[0];
    const lastSyncedAt: string | null = metaRecord?.get('lastSyncedAt') ?? null;
    const lastSyncStatus: string | null = metaRecord?.get('lastSyncStatus') ?? null;

    const toNullableNumber = (value: unknown): number | null => {
      if (value === null || value === undefined) return null;
      if (typeof value === 'number') return value;
      if (typeof value === 'object' && value !== null && 'toNumber' in value && typeof (value as { toNumber: unknown }).toNumber === 'function') {
        return (value as { toNumber: () => number }).toNumber();
      }
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    };

    const lastSyncDurationMs = toNullableNumber(metaRecord?.get('lastSyncDurationMs'));
    const lastSyncNodesCreated = toNullableNumber(metaRecord?.get('lastSyncNodesCreated'));
    const lastSyncEdgesCreated = toNullableNumber(metaRecord?.get('lastSyncEdgesCreated'));

    return {
      addressCount: counts.get('addressCount').toNumber(),
      attestationCount: counts.get('attestationCount').toNumber(),
      predicateDistribution,
      lastSyncedAt,
      lastSyncStatus,
      lastSyncDurationMs,
      lastSyncNodesCreated,
      lastSyncEdgesCreated,
    };
  } finally {
    await session.close();
  }
}

// ============ Network graph (for visualization) ============

export interface NetworkGraphNode {
  id: string;
  label: string | null;
}

export interface NetworkGraphEdge {
  from: string;
  to: string;
  predicate: string;
  stake: number;
}

export interface NetworkGraph {
  nodes: NetworkGraphNode[];
  edges: NetworkGraphEdge[];
}

const MAX_NETWORK_HOPS = 5;

function neoNumberToNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (
    typeof value === 'object' &&
    value !== null &&
    'toNumber' in value &&
    typeof (value as { toNumber: unknown }).toNumber === 'function'
  ) {
    return (value as { toNumber: () => number }).toNumber();
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Return every address reachable from `address` within `maxHops` ATTESTS
 * edges (in either direction), plus all ATTESTS edges whose endpoints both
 * sit inside that reachable set. Intended for client-side graph rendering.
 *
 * maxHops is clamped to 1..MAX_NETWORK_HOPS and inlined into the Cypher
 * pattern -- variable-length pattern depth cannot be parameterized, so we
 * validate strictly before interpolation.
 */
export async function getNetworkGraph(
  address: string,
  maxHops: number,
): Promise<NetworkGraph> {
  if (!Number.isInteger(maxHops) || maxHops < 1 || maxHops > MAX_NETWORK_HOPS) {
    throw new Error(
      `maxHops must be an integer between 1 and ${MAX_NETWORK_HOPS} (got ${maxHops})`,
    );
  }

  const normalized = address.toLowerCase();
  const session = getSession();

  try {
    const nodesResult = await session.run(
      `
      MATCH (start:Address {id: $address})
      OPTIONAL MATCH (start)-[:ATTESTS*1..${maxHops}]-(n:Address)
      WITH start, collect(DISTINCT n) AS neighbors
      WITH [x IN ([start] + neighbors) WHERE x IS NOT NULL] AS allNodes
      UNWIND allNodes AS node
      RETURN DISTINCT node.id AS id, node.label AS label
      `,
      { address: normalized },
    );

    const nodes: NetworkGraphNode[] = nodesResult.records.map(r => ({
      id: r.get('id') as string,
      label: (r.get('label') ?? null) as string | null,
    }));

    if (nodes.length === 0) {
      return { nodes: [], edges: [] };
    }

    const ids = nodes.map(n => n.id);

    const edgesResult = await session.run(
      `
      UNWIND $ids AS fromId
      MATCH (from:Address {id: fromId})-[r:ATTESTS]->(to:Address)
      WHERE to.id IN $ids
      RETURN from.id AS from,
             to.id AS to,
             r.predicate AS predicate,
             r.stakeAmount AS stake
      `,
      { ids },
    );

    const edges: NetworkGraphEdge[] = edgesResult.records.map(r => ({
      from: r.get('from') as string,
      to: r.get('to') as string,
      predicate: (r.get('predicate') ?? 'unknown') as string,
      stake: neoNumberToNumber(r.get('stake')),
    }));

    return { nodes, edges };
  } finally {
    await session.close();
  }
}

/**
 * Clear all data from the graph (use with caution)
 */
export async function clearGraph(): Promise<void> {
  const session = getSession();

  try {
    log('warn', 'Clearing all graph data');

    // Delete all relationships first
    await session.run(`
      MATCH ()-[r]->()
      DELETE r
    `);

    // Delete all nodes
    await session.run(`
      MATCH (n)
      DELETE n
    `);

    log('info', 'Graph cleared successfully');
  } catch (error) {
    log('error', 'Failed to clear graph', { error: String(error) });
    throw error;
  } finally {
    await session.close();
  }
}
