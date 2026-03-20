/**
 * Main synchronization service for Intuition data
 */

import 'dotenv/config';
import {
  loadConfig,
  initializeDriver,
  verifyConnection,
  closeDriver,
  getSession
} from '../config/neo4j.js';
import { initializeGraphQLClient, fetchAllTriples } from '../graphql/client.js';
import { transformTriples } from './transform.js';
import { setupSchema } from '../graph/schema.js';
import { upsertAddresses, upsertAttestations, getGraphStats } from '../graph/queries.js';
import { SyncResult } from '../types/index.js';
import { log } from '../utils/logger.js';

/**
 * Run the full synchronization process
 */
export async function runSync(options: {
  maxPages?: number;
  clearFirst?: boolean;
} = {}): Promise<SyncResult> {
  const startTime = Date.now();
  const result: SyncResult = {
    nodesCreated: 0,
    nodesUpdated: 0,
    edgesCreated: 0,
    edgesUpdated: 0,
    errors: [],
    duration: 0,
  };

  log('info', '='.repeat(60));
  log('info', 'Starting Intuition Trust Engine Sync');
  log('info', '='.repeat(60));

  try {
    // Load configuration
    const config = loadConfig();
    log('info', 'Configuration loaded', {
      neo4jUri: config.neo4j.uri.replace(/\/\/.*@/, '//***@'),
      graphqlEndpoint: config.graphql.endpoint,
      batchSize: config.sync.batchSize,
      pageSize: config.sync.pageSize,
    });

    // Initialize Neo4j
    initializeDriver(config);
    const connected = await verifyConnection();
    if (!connected) {
      throw new Error('Failed to verify Neo4j connection');
    }
    log('info', 'Neo4j connection verified');

    // Setup schema
    await setupSchema();

    // Initialize GraphQL client
    initializeGraphQLClient(config);
    log('info', 'GraphQL client initialized');

    // Optional: Clear existing data
    if (options.clearFirst) {
      const { clearGraph } = await import('../graph/queries.js');
      await clearGraph();
    }

    // Fetch and process triples
    let totalNodes = 0;
    let totalEdges = 0;
    let batchNumber = 0;

    for await (const triples of fetchAllTriples(config.sync.pageSize, options.maxPages)) {
      batchNumber++;
      log('info', `Processing batch ${batchNumber}`, { triplesCount: triples.length });

      // Transform triples to graph format
      const { nodes, edges } = transformTriples(triples);

      // Convert nodes map to array
      const nodesArray = Array.from(nodes.values());

      // Upsert in smaller batches to avoid memory issues
      const batchSize = config.sync.batchSize;

      // Upsert nodes
      for (let i = 0; i < nodesArray.length; i += batchSize) {
        const batch = nodesArray.slice(i, i + batchSize);
        try {
          const count = await upsertAddresses(batch);
          totalNodes += count;
        } catch (error) {
          const errMsg = `Failed to upsert nodes batch ${i / batchSize + 1}: ${error}`;
          log('error', errMsg);
          result.errors.push(errMsg);
        }
      }

      // Upsert edges
      for (let i = 0; i < edges.length; i += batchSize) {
        const batch = edges.slice(i, i + batchSize);
        try {
          const count = await upsertAttestations(batch);
          totalEdges += count;
        } catch (error) {
          const errMsg = `Failed to upsert edges batch ${i / batchSize + 1}: ${error}`;
          log('error', errMsg);
          result.errors.push(errMsg);
        }
      }

      log('info', `Batch ${batchNumber} complete`, {
        nodesProcessed: nodesArray.length,
        edgesProcessed: edges.length,
      });
    }

    result.nodesCreated = totalNodes;
    result.edgesCreated = totalEdges;

    // Write sync timestamp to Neo4j
    const metaSession = getSession();
    try {
      await metaSession.run(
        `MERGE (m:Meta {key: 'sync'}) SET m.lastSyncedAt = $now`,
        { now: new Date().toISOString() }
      );
    } finally {
      await metaSession.close();
    }

    // Get final stats
    const stats = await getGraphStats();
    log('info', 'Final graph statistics', stats);

  } catch (error) {
    const errMsg = `Sync failed: ${error}`;
    log('error', errMsg);
    result.errors.push(errMsg);
  } finally {
    await closeDriver();
  }

  result.duration = Date.now() - startTime;

  log('info', '='.repeat(60));
  log('info', 'Sync Complete', {
    duration: `${(result.duration / 1000).toFixed(2)}s`,
    nodes: result.nodesCreated,
    edges: result.edgesCreated,
    errors: result.errors.length,
  });
  log('info', '='.repeat(60));

  return result;
}

// Run sync if executed directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  runSync({ maxPages: 10 })
    .then(result => {
      if (result.errors.length > 0) {
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}
