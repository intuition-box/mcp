/**
 * GraphQL client for Intuition Protocol API
 */

import { GraphQLClient } from 'graphql-request';
import { Config, IntuitionTriple, TriplesQueryResponse } from '../types/index.js';
import { GET_TRIPLES_QUERY, GET_TRIPLES_COUNT_QUERY } from './queries.js';
import { log } from '../utils/logger.js';

let client: GraphQLClient | null = null;

/**
 * Initialize the GraphQL client
 */
export function initializeGraphQLClient(config: Config): GraphQLClient {
  if (client) {
    return client;
  }

  client = new GraphQLClient(config.graphql.endpoint, {
    headers: {
      'Content-Type': 'application/json',
    },
  });

  return client;
}

/**
 * Get the current client instance
 */
export function getGraphQLClient(): GraphQLClient {
  if (!client) {
    throw new Error('GraphQL client not initialized. Call initializeGraphQLClient first.');
  }
  return client;
}

/**
 * Fetch total count of triples in the database
 */
export async function fetchTriplesCount(): Promise<number> {
  const gqlClient = getGraphQLClient();

  try {
    const response = await gqlClient.request<{
      triples_aggregate: { aggregate: { count: number } };
    }>(GET_TRIPLES_COUNT_QUERY);

    return response.triples_aggregate.aggregate.count;
  } catch (error) {
    log('error', 'Failed to fetch triples count', { error: String(error) });
    throw error;
  }
}

/**
 * Fetch triples with pagination
 */
export async function fetchTriples(
  limit: number,
  offset: number
): Promise<IntuitionTriple[]> {
  const gqlClient = getGraphQLClient();

  try {
    const response = await gqlClient.request<TriplesQueryResponse>(
      GET_TRIPLES_QUERY,
      { limit, offset }
    );

    return response.triples;
  } catch (error) {
    log('error', 'Failed to fetch triples', {
      error: String(error),
      limit,
      offset
    });
    throw error;
  }
}

/**
 * Fetch all triples with automatic pagination
 * Yields batches to avoid memory overflow
 */
export async function* fetchAllTriples(
  pageSize: number,
  maxPages?: number
): AsyncGenerator<IntuitionTriple[], void, unknown> {
  let offset = 0;
  let pageCount = 0;
  let hasMore = true;

  const totalCount = await fetchTriplesCount();
  log('info', `Starting to fetch triples`, { totalCount, pageSize });

  while (hasMore) {
    if (maxPages && pageCount >= maxPages) {
      log('info', 'Reached maximum page limit', { maxPages });
      break;
    }

    const triples = await fetchTriples(pageSize, offset);

    if (triples.length === 0) {
      hasMore = false;
      break;
    }

    yield triples;

    pageCount++;
    offset += pageSize;
    hasMore = triples.length > 0 && offset < totalCount;

    log('info', `Fetched page ${pageCount}`, {
      triplesInPage: triples.length,
      totalFetched: offset,
      progress: `${Math.min(100, Math.round((offset / totalCount) * 100))}%`
    });

    // Small delay to avoid rate limiting
    await delay(100);
  }

  log('info', 'Finished fetching all triples', {
    totalPages: pageCount,
    totalFetched: offset
  });
}

/**
 * Utility delay function
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
