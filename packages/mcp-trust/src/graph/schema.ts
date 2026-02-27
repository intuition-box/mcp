/**
 * Neo4j schema setup and constraints
 */

import { getSession } from '../config/neo4j.js';
import { log } from '../utils/logger.js';

/**
 * Create indexes and constraints for optimal query performance
 */
export async function setupSchema(): Promise<void> {
  const session = getSession();

  try {
    log('info', 'Setting up Neo4j schema constraints and indexes');

    // Create unique constraint on Address id
    await session.run(`
      CREATE CONSTRAINT address_id_unique IF NOT EXISTS
      FOR (a:Address) REQUIRE a.id IS UNIQUE
    `);

    // Create index on Address label for fast lookups
    await session.run(`
      CREATE INDEX address_label_index IF NOT EXISTS
      FOR (a:Address) ON (a.label)
    `);

    // Create index on ATTESTS relationship properties
    await session.run(`
      CREATE INDEX attests_predicate_index IF NOT EXISTS
      FOR ()-[r:ATTESTS]-() ON (r.predicate)
    `);

    await session.run(`
      CREATE INDEX attests_timestamp_index IF NOT EXISTS
      FOR ()-[r:ATTESTS]-() ON (r.timestamp)
    `);

    await session.run(`
      CREATE INDEX attests_triple_id_index IF NOT EXISTS
      FOR ()-[r:ATTESTS]-() ON (r.tripleId)
    `);

    log('info', 'Schema setup complete');
  } catch (error) {
    log('error', 'Failed to setup schema', { error: String(error) });
    throw error;
  } finally {
    await session.close();
  }
}

/**
 * Verify schema is properly configured
 */
export async function verifySchema(): Promise<boolean> {
  const session = getSession();

  try {
    const result = await session.run(`
      SHOW CONSTRAINTS
    `);

    const constraints = result.records.map(r => r.get('name'));
    const hasAddressConstraint = constraints.some(
      (name: string) => name?.includes('address_id_unique')
    );

    log('info', 'Schema verification', {
      constraintCount: constraints.length,
      hasAddressConstraint
    });

    return hasAddressConstraint;
  } finally {
    await session.close();
  }
}
