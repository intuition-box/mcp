import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runSync } from '../sync.js';
import type { AddressNode, AttestationEdge, IntuitionTriple } from '../../types/index.js';

// Mock Neo4j config
const mockRun = vi.fn();
const mockClose = vi.fn();

vi.mock('../../config/neo4j.js', () => ({
  loadConfig: () => ({
    neo4j: { uri: 'bolt://localhost:7687', username: 'neo4j', password: 'test' },
    graphql: { endpoint: 'https://api.example.com/graphql' },
    sync: { batchSize: 100, pageSize: 1000 },
  }),
  initializeDriver: vi.fn(),
  verifyConnection: vi.fn().mockResolvedValue(true),
  closeDriver: vi.fn(),
  getSession: () => ({ run: mockRun, close: mockClose }),
}));

// Mock schema setup
vi.mock('../../graph/schema.js', () => ({
  setupSchema: vi.fn(),
}));

// Mock GraphQL client
const mockFetchAllTriples = vi.fn();

vi.mock('../../graphql/client.js', () => ({
  initializeGraphQLClient: vi.fn(),
  fetchAllTriples: (...args: unknown[]) => mockFetchAllTriples(...args),
}));

// Mock transform
const mockTransformTriples = vi.fn();

vi.mock('../transform.js', () => ({
  transformTriples: (...args: unknown[]) => mockTransformTriples(...args),
}));

// Mock graph queries
const mockUpsertAddresses = vi.fn();
const mockUpsertAttestations = vi.fn();
const mockGetGraphStats = vi.fn();
const mockClearGraph = vi.fn();

vi.mock('../../graph/queries.js', () => ({
  upsertAddresses: (...args: unknown[]) => mockUpsertAddresses(...args),
  upsertAttestations: (...args: unknown[]) => mockUpsertAttestations(...args),
  getGraphStats: (...args: unknown[]) => mockGetGraphStats(...args),
  clearGraph: (...args: unknown[]) => mockClearGraph(...args),
}));

vi.mock('../../utils/logger.js', () => ({
  log: vi.fn(),
}));

// Suppress dotenv import
vi.mock('dotenv/config', () => ({}));

beforeEach(() => {
  mockRun.mockReset();
  mockClose.mockReset();
  mockFetchAllTriples.mockReset();
  mockTransformTriples.mockReset();
  mockUpsertAddresses.mockReset();
  mockUpsertAttestations.mockReset();
  mockGetGraphStats.mockReset();
  mockClearGraph.mockReset();
});

// ============ Helpers ============

function makeTriple(id: string): IntuitionTriple {
  return {
    term_id: id,
    subject_id: 'atom-subject',
    predicate_id: 'atom-predicate',
    object_id: 'atom-object',
    creator_id: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    created_at: '2026-01-15T12:00:00Z',
    subject: null,
    predicate: null,
    object: null,
    creator: null,
    triple_vault: null,
  };
}

function makeNode(id: string): AddressNode {
  return {
    id,
    label: 'test',
    total_stake: 1,
    attestation_count: 1,
    last_updated: '2026-01-01T00:00:00Z',
  };
}

function makeEdge(tripleId: string): AttestationEdge {
  return {
    from: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    to: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    predicate: 'trusts',
    stake_amount: 1,
    triple_id: tripleId,
    timestamp: '2026-01-01T00:00:00Z',
  };
}

/**
 * Create an async generator that yields the given batches.
 * This mimics fetchAllTriples' async generator behavior.
 */
async function* makeBatchGenerator(batches: IntuitionTriple[][]): AsyncGenerator<IntuitionTriple[]> {
  for (const batch of batches) {
    yield batch;
  }
}

function setupStandardMocks(batches: IntuitionTriple[][]) {
  // fetchAllTriples returns an async generator
  mockFetchAllTriples.mockReturnValue(makeBatchGenerator(batches));

  // transformTriples returns nodes map + edges
  mockTransformTriples.mockImplementation((triples: IntuitionTriple[]) => {
    const nodes = new Map<string, AddressNode>();
    const edges: AttestationEdge[] = [];
    for (const t of triples) {
      nodes.set('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', makeNode('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'));
      nodes.set('0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', makeNode('0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'));
      edges.push(makeEdge(t.term_id));
    }
    return { nodes, edges };
  });

  // upsertAddresses returns the count of nodes
  mockUpsertAddresses.mockImplementation((nodes: AddressNode[]) =>
    Promise.resolve(nodes.length),
  );

  // upsertAttestations returns the count of edges
  mockUpsertAttestations.mockImplementation((edges: AttestationEdge[]) =>
    Promise.resolve(edges.length),
  );

  // getGraphStats returns summary after sync
  mockGetGraphStats.mockResolvedValue({
    addressCount: 2,
    attestationCount: batches.flat().length,
    predicateDistribution: { trusts: batches.flat().length },
    lastSyncedAt: null,
    lastSyncStatus: null,
    lastSyncDurationMs: null,
    lastSyncNodesCreated: null,
    lastSyncEdgesCreated: null,
    lastSyncErrorCount: null,
  });

  // Meta node write
  mockRun.mockResolvedValue({ records: [] });
}

// ============ runSync ============

describe('runSync', () => {
  it('calls fetchAllTriples and upsertAddresses and upsertAttestations', async () => {
    const triples = [makeTriple('t1'), makeTriple('t2')];
    setupStandardMocks([triples]);

    await runSync();

    expect(mockFetchAllTriples).toHaveBeenCalledOnce();
    expect(mockTransformTriples).toHaveBeenCalledWith(triples);
    expect(mockUpsertAddresses).toHaveBeenCalled();
    expect(mockUpsertAttestations).toHaveBeenCalled();
  });

  it('writes Meta node on success', async () => {
    setupStandardMocks([[makeTriple('t1')]]);

    await runSync();

    // The Meta node write happens via getSession().run() with MERGE (m:Meta)
    expect(mockRun).toHaveBeenCalled();
    const metaCall = mockRun.mock.calls.find(
      (call: unknown[]) => (call[0] as string).includes('Meta'),
    );
    expect(metaCall).toBeDefined();

    const metaQuery = metaCall![0] as string;
    expect(metaQuery).toContain('MERGE');
    expect(metaQuery).toContain("key: 'sync'");
    expect(metaQuery).toContain('lastSyncedAt');
    expect(metaQuery).toContain('nodesCreated');
    expect(metaQuery).toContain('edgesCreated');
    expect(metaQuery).toContain('status');
  });

  it('returns SyncResult with nodesCreated, edgesCreated, duration', async () => {
    setupStandardMocks([[makeTriple('t1'), makeTriple('t2')]]);

    const result = await runSync();

    expect(result.nodesCreated).toBe(2); // 2 unique nodes per batch
    expect(result.edgesCreated).toBe(2); // 2 triples -> 2 edges
    expect(result.duration).toBeGreaterThanOrEqual(0);
    expect(result.errors).toHaveLength(0);
  });

  it('handles fetchAllTriples error gracefully', async () => {
    // fetchAllTriples throws during iteration
    mockFetchAllTriples.mockReturnValue(
      (async function* () {
        throw new Error('GraphQL fetch failed');
      })(),
    );
    mockGetGraphStats.mockResolvedValue({
      addressCount: 0,
      attestationCount: 0,
      predicateDistribution: {},
      lastSyncedAt: null,
      lastSyncStatus: null,
      lastSyncDurationMs: null,
      lastSyncNodesCreated: null,
      lastSyncEdgesCreated: null,
      lastSyncErrorCount: null,
    });

    const result = await runSync();

    // Should not throw -- errors captured in result.errors
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('GraphQL fetch failed');
  });

  it('clearFirst option clears graph before sync', async () => {
    setupStandardMocks([[makeTriple('t1')]]);

    await runSync({ clearFirst: true });

    expect(mockClearGraph).toHaveBeenCalled();
  });

  it('does not clear graph when clearFirst is false', async () => {
    setupStandardMocks([[makeTriple('t1')]]);

    await runSync({ clearFirst: false });

    expect(mockClearGraph).not.toHaveBeenCalled();
  });

  it('processes multiple batches from fetchAllTriples', async () => {
    const batch1 = [makeTriple('t1')];
    const batch2 = [makeTriple('t2'), makeTriple('t3')];
    setupStandardMocks([batch1, batch2]);

    const result = await runSync();

    // transformTriples should be called once per batch
    expect(mockTransformTriples).toHaveBeenCalledTimes(2);
    // 2 nodes per batch upserted, plus edges
    expect(result.nodesCreated).toBe(4); // 2 nodes * 2 batches
    expect(result.edgesCreated).toBe(3); // 1 + 2 edges
  });

  it('sets status to partial when errors occur during upsert', async () => {
    mockFetchAllTriples.mockReturnValue(makeBatchGenerator([[makeTriple('t1')]]));
    mockTransformTriples.mockReturnValue({
      nodes: new Map([['0xaa', makeNode('0xaa')]]),
      edges: [makeEdge('t1')],
    });

    // upsertAddresses succeeds
    mockUpsertAddresses.mockResolvedValue(1);
    // upsertAttestations fails
    mockUpsertAttestations.mockRejectedValue(new Error('Edge write failed'));

    mockGetGraphStats.mockResolvedValue({
      addressCount: 1,
      attestationCount: 0,
      predicateDistribution: {},
      lastSyncedAt: null,
      lastSyncStatus: null,
      lastSyncDurationMs: null,
      lastSyncNodesCreated: null,
      lastSyncEdgesCreated: null,
      lastSyncErrorCount: null,
    });
    mockRun.mockResolvedValue({ records: [] });

    const result = await runSync();

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('Failed to upsert edges');

    // Meta node should reflect 'partial' status
    const metaCall = mockRun.mock.calls.find(
      (call: unknown[]) => (call[0] as string).includes('Meta'),
    );
    if (metaCall) {
      const params = metaCall[1] as Record<string, unknown>;
      expect(params.status).toBe('partial');
      expect(params.errorCount).toBe(1);
    }
  });

  it('returns duration even when sync throws', async () => {
    // loadConfig works but verifyConnection fails
    const { verifyConnection } = await import('../../config/neo4j.js');
    (verifyConnection as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);

    const result = await runSync();

    expect(result.duration).toBeGreaterThanOrEqual(0);
    expect(typeof result.duration).toBe('number');
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
