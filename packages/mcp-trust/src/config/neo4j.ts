/**
 * Neo4j database configuration and connection management
 */

import neo4j, { Driver, Session, auth } from 'neo4j-driver';
import { Config } from '../types/index.js';

let driver: Driver | null = null;
let neo4jAvailable = false;

/**
 * Check if Neo4j is currently reachable
 */
export function isNeo4jAvailable(): boolean {
  return neo4jAvailable;
}

/**
 * Update Neo4j availability state
 */
export function setNeo4jAvailable(available: boolean): void {
  neo4jAvailable = available;
}

/**
 * Load and validate configuration from environment variables
 */
export function loadConfig(): Config {
  const requiredVars = [
    'NEO4J_URI',
    'NEO4J_USERNAME',
    'NEO4J_PASSWORD',
    'GRAPHQL_ENDPOINT'
  ];

  const missing = requiredVars.filter(v => !process.env[v]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  return {
    neo4j: {
      uri: process.env.NEO4J_URI!,
      username: process.env.NEO4J_USERNAME!,
      password: process.env.NEO4J_PASSWORD!,
    },
    graphql: {
      endpoint: process.env.GRAPHQL_ENDPOINT!,
    },
    sync: {
      batchSize: parseInt(process.env.SYNC_BATCH_SIZE || '100', 10),
      pageSize: parseInt(process.env.SYNC_PAGE_SIZE || '1000', 10),
    },
  };
}

/**
 * Initialize Neo4j driver with connection pooling
 */
export function initializeDriver(config: Config): Driver {
  if (driver) {
    return driver;
  }

  driver = neo4j.driver(
    config.neo4j.uri,
    auth.basic(config.neo4j.username, config.neo4j.password),
    {
      maxConnectionPoolSize: 50,
      connectionAcquisitionTimeout: 30000,
      connectionTimeout: 30000,
    }
  );

  return driver;
}

/**
 * Get the current driver instance
 */
export function getDriver(): Driver {
  if (!driver) {
    throw new Error('Neo4j driver not initialized. Call initializeDriver first.');
  }
  return driver;
}

/**
 * Get a new session for database operations.
 * Throws a descriptive error if Neo4j is not available.
 */
export function getSession(): Session {
  if (!neo4jAvailable) {
    throw new Error(
      'Neo4j is currently unavailable. The server started without a database connection. ' +
      'Check Neo4j configuration and connectivity.'
    );
  }
  return getDriver().session();
}

/**
 * Verify database connection
 */
export async function verifyConnection(): Promise<boolean> {
  const session = getSession();
  try {
    const result = await session.run('RETURN 1 as test');
    return result.records.length > 0;
  } catch (error) {
    console.error('Connection verification failed:', error);
    return false;
  } finally {
    await session.close();
  }
}

/**
 * Close the driver connection
 */
export async function closeDriver(): Promise<void> {
  if (driver) {
    await driver.close();
    driver = null;
  }
}
