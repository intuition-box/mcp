/**
 * Type definitions matching Intuition GraphQL schema
 * Discovered via introspection on 2026-01-29
 */

// ============ GraphQL Response Types ============

export interface IntuitionAtom {
  term_id: string;
  label: string | null;
  type: string; // atom_type scalar
  wallet_id: string;
  creator_id: string;
  created_at?: string;
}

export interface IntuitionAccount {
  id: string;
  label: string;
  type: string; // account_type scalar
}

export interface IntuitionTripleVault {
  total_shares: string; // numeric as string
  total_assets: string; // numeric as string
  position_count: string; // bigint as string
  market_cap: string; // numeric as string
}

export interface IntuitionTriple {
  term_id: string;
  subject_id: string;
  predicate_id: string;
  object_id: string;
  creator_id: string;
  created_at: string;
  subject: IntuitionAtom | null;
  predicate: IntuitionAtom | null;
  object: IntuitionAtom | null;
  creator: IntuitionAccount | null;
  triple_vault: IntuitionTripleVault | null;
}

// ============ Neo4j Graph Types ============

export interface AddressNode {
  id: string;
  label: string;
  total_stake: number;
  attestation_count: number;
  last_updated: string;
}

export interface AttestationEdge {
  from: string; // attester address
  to: string; // target address (subject of triple)
  predicate: string;
  stake_amount: number;
  triple_id: string; // unique triple identifier
  timestamp: string;
}

export interface TransformResult {
  nodes: Map<string, AddressNode>;
  edges: AttestationEdge[];
}

// ============ Config Types ============

export interface Config {
  neo4jUri: string;
  neo4jUser: string;
  neo4jPassword: string;
  graphqlEndpoint: string;
  batchSize: number;
  pageSize: number;
}

// ============ Sync Types ============

export interface SyncResult {
  nodesCreated: number;
  edgesCreated: number;
  errors: number;
  duration: number;
}

export interface SyncOptions {
  maxPages?: number;
  clearFirst?: boolean;
}