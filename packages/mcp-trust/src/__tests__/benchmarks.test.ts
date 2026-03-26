/**
 * Performance benchmark suite for trust scoring algorithms
 *
 * Measures query execution time for all major scoring operations
 * against a realistic mock graph of 100 addresses and 500 edges.
 * Each benchmark runs the operation 5 times, recording min/max/avg
 * duration, and asserts that average time stays under 3 seconds.
 */

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

// ============ Test Data Generation ============

const NUM_ADDRESSES = 100;
const NUM_EDGES = 500;
const BENCHMARK_RUNS = 5;
const TARGET_MS = 3000;

const PREDICATES = ['trusts', 'follow', 'vouches', 'visits_for_work', 'visits_for_learning'];

/**
 * Generate deterministic address list: 0x000...000 through 0x000...063
 */
function generateAddresses(count: number): string[] {
  return Array.from({ length: count }, (_, i) => {
    const hex = i.toString(16).padStart(40, '0');
    return `0x${hex}`;
  });
}

/**
 * Generate deterministic edges with varied stakes and predicates.
 * Uses prime-based index mapping for pseudo-random but repeatable distribution.
 */
function generateEdges(
  addresses: string[],
  count: number
): Array<{ from: string; to: string; stakeAmount: number; predicate: string }> {
  const edges: Array<{ from: string; to: string; stakeAmount: number; predicate: string }> = [];
  const n = addresses.length;

  for (let i = 0; edges.length < count && i < count * 2; i++) {
    const fromIdx = (i * 7919) % n;
    const toIdx = ((i * 6271) + 1) % n;
    if (fromIdx === toIdx) continue;

    edges.push({
      from: addresses[fromIdx],
      to: addresses[toIdx],
      stakeAmount: ((i % 10) + 1) * 1e17, // 0.1 to 1.0 ETH in wei
      predicate: PREDICATES[i % PREDICATES.length],
    });
  }

  return edges;
}

const TEST_ADDRESSES = generateAddresses(NUM_ADDRESSES);
const TEST_EDGES = generateEdges(TEST_ADDRESSES, NUM_EDGES);

// Pick two addresses that are connected for path-based tests
const ADDR_SOURCE = TEST_ADDRESSES[0];
const ADDR_TARGET = TEST_ADDRESSES[5];

// ============ Mock Path Objects ============

/**
 * Build a Neo4j-style Path mock with segments, nodes, and relationships.
 */
function createMockPath(
  nodeIds: string[],
  predicates: string[],
  stakes: number[]
): { segments: Array<{ start: { properties: { id: string } }; end: { properties: { id: string } }; relationship: { properties: { predicate: string; stakeAmount: number } } }> } {
  const segments = [];
  for (let i = 0; i < predicates.length; i++) {
    segments.push({
      start: { properties: { id: nodeIds[i] } },
      end: { properties: { id: nodeIds[i + 1] } },
      relationship: {
        properties: {
          predicate: predicates[i],
          stakeAmount: stakes[i],
        },
      },
    });
  }
  return { segments };
}

/**
 * Pre-built paths between ADDR_SOURCE and ADDR_TARGET at varying hop counts.
 * Simulates realistic Neo4j path query results.
 */
function generateMockPathRecords(): Array<{ get: (key: string) => unknown }> {
  const paths = [
    // 1-hop direct paths
    createMockPath(
      [ADDR_SOURCE, ADDR_TARGET],
      ['trusts'],
      [5e17]
    ),
    createMockPath(
      [ADDR_SOURCE, ADDR_TARGET],
      ['follow'],
      [3e17]
    ),
    // 2-hop paths through intermediaries
    createMockPath(
      [ADDR_SOURCE, TEST_ADDRESSES[10], ADDR_TARGET],
      ['trusts', 'trusts'],
      [8e17, 4e17]
    ),
    createMockPath(
      [ADDR_SOURCE, TEST_ADDRESSES[20], ADDR_TARGET],
      ['vouches', 'trusts'],
      [6e17, 7e17]
    ),
    createMockPath(
      [ADDR_SOURCE, TEST_ADDRESSES[30], ADDR_TARGET],
      ['follow', 'follow'],
      [2e17, 3e17]
    ),
    // 3-hop paths
    createMockPath(
      [ADDR_SOURCE, TEST_ADDRESSES[15], TEST_ADDRESSES[25], ADDR_TARGET],
      ['trusts', 'vouches', 'trusts'],
      [9e17, 5e17, 6e17]
    ),
    createMockPath(
      [ADDR_SOURCE, TEST_ADDRESSES[40], TEST_ADDRESSES[50], ADDR_TARGET],
      ['follow', 'trusts', 'follow'],
      [4e17, 3e17, 2e17]
    ),
  ];

  return paths.map(path => ({
    get: (key: string) => {
      if (key === 'path') return path;
      if (key === 'pathStake') return 1;
      return null;
    },
  }));
}

/**
 * Pre-built outgoing paths from ADDR_SOURCE to various targets.
 * Used by computePersonalizedTrustNetwork and findOutgoingTrustPaths.
 */
function generateOutgoingPathRecords(): Array<{ get: (key: string) => unknown }> {
  const targets = TEST_ADDRESSES.slice(1, 16);
  const records: Array<{ get: (key: string) => unknown }> = [];

  for (const target of targets) {
    const path = createMockPath(
      [ADDR_SOURCE, target],
      ['trusts'],
      [5e17]
    );
    records.push({
      get: (key: string) => {
        if (key === 'path') return path;
        if (key === 'pathStake') return 5e17;
        return null;
      },
    });
  }

  return records;
}

const MOCK_PATH_RECORDS = generateMockPathRecords();
const MOCK_OUTGOING_RECORDS = generateOutgoingPathRecords();

// ============ Query Router ============

/**
 * Routes Neo4j session.run() calls to the appropriate mock data
 * based on Cypher query pattern matching.
 */
async function queryRouter(
  query: string,
  params?: Record<string, unknown>
): Promise<{ records: Array<{ get: (key: string) => unknown }> }> {
  // fetchGraphData -- address list
  if (query.includes('MATCH (a:Address)') && query.includes('a.id as id')) {
    return {
      records: TEST_ADDRESSES.map(id => ({
        get: (key: string) => (key === 'id' ? id : null),
      })),
    };
  }

  // fetchGraphData -- edge list (avoid matching path queries)
  if (
    query.includes('MATCH (from:Address)-[r:ATTESTS]->(to:Address)') &&
    !query.includes('path')
  ) {
    return {
      records: TEST_EDGES.map(e => ({
        get: (key: string) => {
          switch (key) {
            case 'fromId': return e.from;
            case 'toId': return e.to;
            case 'stakeAmount': return e.stakeAmount;
            case 'predicate': return e.predicate;
            default: return null;
          }
        },
      })),
    };
  }

  // findTrustPaths -- path query with specific target
  if (query.includes('MATCH path =') && query.includes('$toAddress')) {
    return { records: MOCK_PATH_RECORDS };
  }

  // findOutgoingTrustPaths -- path query without specific target
  if (query.includes('MATCH path =') && !query.includes('$toAddress')) {
    return { records: MOCK_OUTGOING_RECORDS };
  }

  // getDirectTrust -- single attestation lookup
  if (query.includes('r.stakeAmount as stakeAmount') && query.includes('LIMIT 1')) {
    return {
      records: [{
        get: (key: string) => {
          switch (key) {
            case 'stakeAmount': return 5e17;
            case 'predicate': return 'trusts';
            case 'timestamp': return Date.now();
            default: return null;
          }
        },
      }],
    };
  }

  // Sybil injection -- create nodes
  if (query.includes('CREATE (a:Address') && query.includes('UNWIND $nodes')) {
    const nodes = params?.nodes as unknown[] | undefined;
    const count = nodes?.length ?? 0;
    return {
      records: [{ get: () => ({ toNumber: () => count }) }],
    };
  }

  // Sybil injection -- create edges
  if (query.includes('CREATE (from)-[r:ATTESTS') && query.includes('UNWIND $edges')) {
    const edges = params?.edges as unknown[] | undefined;
    const count = edges?.length ?? 0;
    return {
      records: [{ get: () => ({ toNumber: () => count }) }],
    };
  }

  // Sybil cleanup
  if (query.includes('DETACH DELETE')) {
    return { records: [] };
  }

  // Default fallback
  return { records: [] };
}

// ============ Mocks ============

vi.mock('../config/neo4j.js', () => ({
  getSession: () => ({
    run: vi.fn().mockImplementation(queryRouter),
    close: vi.fn().mockResolvedValue(undefined),
  }),
  // Some modules import these -- provide no-op stubs
  loadConfig: () => ({
    neo4j: { uri: 'bolt://localhost:7687', username: 'neo4j', password: 'test' },
    graphql: { endpoint: 'https://api.example.com/graphql' },
    sync: { batchSize: 100, pageSize: 1000 },
  }),
  initializeDriver: vi.fn(),
  verifyConnection: vi.fn().mockResolvedValue(true),
  closeDriver: vi.fn(),
}));

vi.mock('../utils/logger.js', () => ({
  log: vi.fn(),
}));

// ============ Imports (after mocks) ============

import { computeEigenTrust } from '../algorithms/eigentrust.js';
import { computeAgentRank } from '../algorithms/agentrank.js';
import {
  computeCompositeScore,
  clearScoreCache,
} from '../algorithms/scoring-engine.js';
import { findTrustPaths } from '../algorithms/pathfinding.js';
import { simulateSybilAttack } from '../algorithms/sybil-simulation.js';

// ============ Benchmark Infrastructure ============

interface BenchmarkResult {
  operation: string;
  runs: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  passed: boolean;
}

const allResults: BenchmarkResult[] = [];

/**
 * Run an async operation multiple times and collect timing statistics.
 */
async function benchmark(
  operation: string,
  fn: () => Promise<unknown>,
  runs: number = BENCHMARK_RUNS
): Promise<BenchmarkResult> {
  const durations: number[] = [];

  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    await fn();
    durations.push(performance.now() - start);
  }

  const avg = durations.reduce((a, b) => a + b, 0) / durations.length;

  const result: BenchmarkResult = {
    operation,
    runs,
    avgMs: Math.round(avg * 100) / 100,
    minMs: Math.round(Math.min(...durations) * 100) / 100,
    maxMs: Math.round(Math.max(...durations) * 100) / 100,
    passed: avg < TARGET_MS,
  };

  allResults.push(result);
  return result;
}

// ============ Benchmarks ============

describe('Performance Benchmarks', () => {
  describe(`${NUM_ADDRESSES} nodes, ${TEST_EDGES.length} edges, ${BENCHMARK_RUNS} runs each, target < ${TARGET_MS}ms avg`, () => {
    beforeEach(() => {
      clearScoreCache();
    });

    it('computeEigenTrust -- full network computation', async () => {
      const result = await benchmark('computeEigenTrust', () => computeEigenTrust());

      expect(result.passed).toBe(true);
      expect(result.avgMs).toBeLessThan(TARGET_MS);
    });

    it('computeAgentRank -- full network computation', async () => {
      const result = await benchmark('computeAgentRank', () => computeAgentRank());

      expect(result.passed).toBe(true);
      expect(result.avgMs).toBeLessThan(TARGET_MS);
    });

    it('computeCompositeScore -- single address, no fromAddress', async () => {
      const result = await benchmark('compositeScore (global)', () =>
        computeCompositeScore(ADDR_TARGET)
      );

      expect(result.passed).toBe(true);
      expect(result.avgMs).toBeLessThan(TARGET_MS);
    });

    it('computeCompositeScore -- single address, with fromAddress', async () => {
      const result = await benchmark('compositeScore (personalized)', () =>
        computeCompositeScore(ADDR_TARGET, ADDR_SOURCE)
      );

      expect(result.passed).toBe(true);
      expect(result.avgMs).toBeLessThan(TARGET_MS);
    });

    it('findTrustPaths -- 3 hop traversal', async () => {
      const result = await benchmark('findTrustPaths (3 hops)', () =>
        findTrustPaths(ADDR_SOURCE, ADDR_TARGET, 3)
      );

      expect(result.passed).toBe(true);
      expect(result.avgMs).toBeLessThan(TARGET_MS);
    });

    it('simulateSybilAttack -- 10 sybil nodes', async () => {
      const result = await benchmark('simulateSybilAttack (10 nodes)', () =>
        simulateSybilAttack({ numSybilNodes: 10, numCollusionEdges: 40 })
      );

      expect(result.passed).toBe(true);
      expect(result.avgMs).toBeLessThan(TARGET_MS);
    });
  });

  // Print summary table after all benchmarks
  afterAll(() => {
    const separator = '-'.repeat(96);
    const lines: string[] = [
      '',
      separator,
      'BENCHMARK RESULTS SUMMARY',
      separator,
      formatRow('Operation', 'Runs', 'Avg (ms)', 'Min (ms)', 'Max (ms)', 'Status'),
      separator,
    ];

    for (const r of allResults) {
      lines.push(
        formatRow(
          r.operation,
          String(r.runs),
          r.avgMs.toFixed(2),
          r.minMs.toFixed(2),
          r.maxMs.toFixed(2),
          r.passed ? 'PASS' : 'FAIL'
        )
      );
    }

    lines.push(separator);

    const allPassed = allResults.every(r => r.passed);
    lines.push(
      allPassed
        ? `All ${allResults.length} benchmarks passed (target: < ${TARGET_MS}ms avg)`
        : `FAILURES DETECTED -- ${allResults.filter(r => !r.passed).length} of ${allResults.length} exceeded ${TARGET_MS}ms`
    );
    lines.push(separator);
    lines.push('');

    console.log(lines.join('\n'));
  });
});

// ============ Formatting ============

function formatRow(
  op: string,
  runs: string,
  avg: string,
  min: string,
  max: string,
  status: string
): string {
  return [
    op.padEnd(38),
    runs.padStart(5),
    avg.padStart(12),
    min.padStart(12),
    max.padStart(12),
    status.padStart(8),
  ].join('  ');
}
