/**
 * Stream adapter layer for pluggable data sources.
 *
 * Abstracts the triple-fetching interface so runSync can consume
 * data from any backend -- the current Intuition GraphQL API,
 * a future streaming backend (e.g. intuition-rs), or a local
 * fixture for testing.
 *
 * To add a new backend:
 * 1. Implement the StreamDataSource interface
 * 2. Pass the instance to runSync (once it accepts a data source)
 */

import type { IntuitionTriple } from '../types/index.js';
import { fetchTriples, fetchTriplesCount } from '../graphql/client.js';

// ============ Interface ============

/**
 * Pluggable data source for triple ingestion.
 *
 * Any backend that can paginate triples implements this interface
 * and becomes a drop-in replacement for the default GraphQL source.
 */
export interface StreamDataSource {
  /**
   * Fetch a page of triples.
   *
   * @param pageSize - Maximum number of triples to return
   * @param offset - Zero-based offset for pagination
   * @returns Array of triples (may be shorter than pageSize on the last page)
   */
  getTriples(pageSize: number, offset: number): Promise<IntuitionTriple[]>;

  /**
   * Return the total number of triples available in the source.
   * Used to track progress and determine when pagination is complete.
   */
  getTriplesCount(): Promise<number>;
}

// ============ GraphQL Implementation ============

/**
 * Default data source backed by the Intuition GraphQL API.
 *
 * Wraps the existing fetchTriples/fetchTriplesCount functions so
 * the current sync pipeline can be expressed in terms of the
 * StreamDataSource interface with zero behavioral changes.
 */
export class GraphQLDataSource implements StreamDataSource {
  async getTriples(pageSize: number, offset: number): Promise<IntuitionTriple[]> {
    return fetchTriples(pageSize, offset);
  }

  async getTriplesCount(): Promise<number> {
    return fetchTriplesCount();
  }
}
