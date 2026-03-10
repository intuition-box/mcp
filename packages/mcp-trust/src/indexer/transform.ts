/**
 * Transform Intuition triples to Neo4j graph format
 */

import type {
  IntuitionTriple,
  AddressNode,
  AttestationEdge,
  TransformResult,
} from '../types/index.js';
import { logger } from '../utils/logger.js';

/**
 * Check if string is valid Ethereum address
 */
export function isValidAddress(value: string | null | undefined): value is string {
  if (!value) return false;
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

/**
 * Calculate stake from triple_vault data
 * total_assets represents the actual staked value
 */
export function calculateStake(vault: IntuitionTriple['triple_vault']): number {
  if (!vault) return 0;
  
  try {
    // total_assets is the staked value in wei
    const totalAssets = BigInt(vault.total_assets || '0');
    // Convert from wei to ETH (18 decimals)
    return Number(totalAssets) / 1e18;
  } catch {
    return 0;
  }
}

/**
 * Extract address node from atom or account
 */
export function extractAddressNode(
  id: string,
  label: string | null,
  stake: number,
  timestamp: string
): AddressNode | null {
  if (!isValidAddress(id)) {
    return null;
  }

  return {
    id: id.toLowerCase(),
    label: label || id.slice(0, 10) + '...',
    total_stake: stake,
    attestation_count: 1,
    last_updated: timestamp,
  };
}

/**
 * Transform a single triple into graph nodes and edge
 * 
 * Trust model:
 * - Creator attests to the subject with a specific predicate
 * - Edge: creator -> subject (with predicate label and stake)
 */
export function transformTriple(
  triple: IntuitionTriple
): { nodes: AddressNode[]; edge: AttestationEdge | null } {
  const nodes: AddressNode[] = [];
  let edge: AttestationEdge | null = null;

  const timestamp = triple.created_at || new Date().toISOString();
  const stake = calculateStake(triple.triple_vault);

  // Extract creator address (the attester)
  const creatorId = triple.creator?.id || triple.creator_id;
  if (isValidAddress(creatorId)) {
    const creatorNode = extractAddressNode(
      creatorId,
      triple.creator?.label || null,
      stake,
      timestamp
    );
    if (creatorNode) nodes.push(creatorNode);
  }

  // Extract subject address (the attestation target)
  // For trust graphs, we care about attestations TO addresses
  const subjectWallet = triple.subject?.wallet_id;
  if (isValidAddress(subjectWallet)) {
    const subjectNode = extractAddressNode(
      subjectWallet,
      triple.subject?.label || null,
      0, // Subject doesn't gain stake from this triple
      timestamp
    );
    if (subjectNode) nodes.push(subjectNode);

    // Create edge: creator attests to subject
    if (isValidAddress(creatorId)) {
      edge = {
        from: creatorId.toLowerCase(),
        to: subjectWallet.toLowerCase(),
        predicate: triple.predicate?.label || 'attests',
        stake_amount: stake,
        triple_id: triple.term_id,
        timestamp,
      };
    }
  }

  if (!edge && triple.term_id) {
    logger.debug('Triple skipped - no valid edge', {
      term_id: triple.term_id,
      creator_id: creatorId,
      subject_wallet: subjectWallet,
      has_valid_creator: isValidAddress(creatorId),
      has_valid_subject: isValidAddress(subjectWallet),
    });
  }

  return { nodes, edge };
}

/**
 * Transform batch of triples to graph format
 */
export function transformTriples(triples: IntuitionTriple[]): TransformResult {
  const nodesMap = new Map<string, AddressNode>();
  const edges: AttestationEdge[] = [];

  for (const triple of triples) {
    try {
      const { nodes, edge } = transformTriple(triple);

      // Merge nodes (accumulate stake and attestation count)
      for (const node of nodes) {
        const existing = nodesMap.get(node.id);
        if (existing) {
          existing.total_stake += node.total_stake;
          existing.attestation_count += node.attestation_count;
          if (node.last_updated > existing.last_updated) {
            existing.last_updated = node.last_updated;
          }
        } else {
          nodesMap.set(node.id, node);
        }
      }

      // Add edge if valid
      if (edge) {
        edges.push(edge);
      }
    } catch (error) {
      logger.debug('Failed to transform triple', {
        term_id: triple.term_id,
        error: String(error),
      });
    }
  }

  logger.debug('Transformed batch', {
    inputTriples: triples.length,
    outputNodes: nodesMap.size,
    outputEdges: edges.length,
  });

  return { nodes: nodesMap, edges };
}