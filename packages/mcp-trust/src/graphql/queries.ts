/**
 * GraphQL queries for Intuition API
 * Schema discovered via introspection on 2024-01-29
 */

import { gql } from 'graphql-request';

/**
 * Fetch triples with related data for trust graph
 * Uses correct field names from schema introspection
 */
export const GET_TRIPLES_QUERY = gql`
  query GetTriples($limit: Int!, $offset: Int!) {
    triples(
      limit: $limit
      offset: $offset
    ) {
      term_id
      subject_id
      predicate_id
      object_id
      creator_id
      created_at
      subject {
        term_id
        label
        type
        wallet_id
        creator_id
      }
      predicate {
        term_id
        label
        type
      }
      object {
        term_id
        label
        type
        wallet_id
        creator_id
      }
      creator {
        id
        label
        type
      }
      triple_vault {
        total_shares
        total_assets
        position_count
        market_cap
      }
    }
  }
`;

/**
 * Count total triples
 */
export const GET_TRIPLES_COUNT_QUERY = gql`
  query GetTriplesCount {
    triples_aggregate {
      aggregate {
        count
      }
    }
  }
`;

/**
 * Fetch atoms by type
 */
export const GET_ATOMS_BY_TYPE_QUERY = gql`
  query GetAtomsByType($type: atom_type!, $limit: Int!, $offset: Int!) {
    atoms(
      where: { type: { _eq: $type } }
      limit: $limit
      offset: $offset
    ) {
      term_id
      label
      type
      wallet_id
      creator_id
      created_at
    }
  }
`;