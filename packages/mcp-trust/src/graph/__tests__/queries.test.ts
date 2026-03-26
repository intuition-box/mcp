import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getGraphStats,
  getAttestationsForAddress,
  upsertAddresses,
  upsertAttestations,
  clearGraph,
} from '../queries.js';
import type { AddressNode, AttestationEdge } from '../../types/index.js';

// Mock Neo4j session
const mockRun = vi.fn();
const mockClose = vi.fn();
vi.mock('../../config/neo4j.js', () => ({
  getSession: () => ({ run: mockRun, close: mockClose }),
}));

vi.mock('../../utils/logger.js', () => ({
  log: vi.fn(),
}));

beforeEach(() => {
  mockRun.mockReset();
  mockClose.mockReset();
});

// ============ Helpers ============

function makeAddressNode(overrides?: Partial<AddressNode>): AddressNode {
  return {
    id: '0x1234567890abcdef1234567890abcdef12345678',
    label: 'test-node',
    total_stake: 100,
    attestation_count: 1,
    last_updated: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeAttestationEdge(overrides?: Partial<AttestationEdge>): AttestationEdge {
  return {
    from: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    to: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    predicate: 'trusts',
    stake_amount: 50,
    triple_id: 'triple-001',
    timestamp: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

// ============ getGraphStats ============

describe('getGraphStats', () => {
  it('returns all expected fields', async () => {
    // Count query: addressCount + attestationCount
    mockRun.mockResolvedValueOnce({
      records: [{
        get: (key: string) => {
          if (key === 'addressCount') return { toNumber: () => 42 };
          if (key === 'attestationCount') return { toNumber: () => 108 };
          return null;
        },
      }],
    });

    // Predicate distribution query
    mockRun.mockResolvedValueOnce({
      records: [
        {
          get: (key: string) => {
            if (key === 'predicate') return 'trusts';
            if (key === 'count') return { toNumber: () => 80 };
            return null;
          },
        },
        {
          get: (key: string) => {
            if (key === 'predicate') return 'follow';
            if (key === 'count') return { toNumber: () => 28 };
            return null;
          },
        },
      ],
    });

    // Meta node query
    mockRun.mockResolvedValueOnce({
      records: [{
        get: (key: string) => {
          switch (key) {
            case 'lastSyncedAt': return '2026-03-25T10:00:00Z';
            case 'lastSyncStatus': return 'success';
            case 'lastSyncDurationMs': return { toNumber: () => 5000 };
            case 'lastSyncNodesCreated': return { toNumber: () => 42 };
            case 'lastSyncEdgesCreated': return { toNumber: () => 108 };
            case 'lastSyncErrorCount': return { toNumber: () => 0 };
            default: return null;
          }
        },
      }],
    });

    const stats = await getGraphStats();

    expect(stats.addressCount).toBe(42);
    expect(stats.attestationCount).toBe(108);
    expect(stats.predicateDistribution).toEqual({ trusts: 80, follow: 28 });
    expect(stats.lastSyncedAt).toBe('2026-03-25T10:00:00Z');
    expect(stats.lastSyncStatus).toBe('success');
    expect(stats.lastSyncDurationMs).toBe(5000);
    expect(stats.lastSyncNodesCreated).toBe(42);
    expect(stats.lastSyncEdgesCreated).toBe(108);
    expect(stats.lastSyncErrorCount).toBe(0);
  });

  it('handles null Meta node (no sync yet)', async () => {
    // Count query
    mockRun.mockResolvedValueOnce({
      records: [{
        get: (key: string) => {
          if (key === 'addressCount') return { toNumber: () => 0 };
          if (key === 'attestationCount') return { toNumber: () => 0 };
          return null;
        },
      }],
    });

    // Empty predicate distribution
    mockRun.mockResolvedValueOnce({ records: [] });

    // OPTIONAL MATCH returns record with all nulls when Meta node doesn't exist
    mockRun.mockResolvedValueOnce({
      records: [{
        get: () => null,
      }],
    });

    const stats = await getGraphStats();

    expect(stats.addressCount).toBe(0);
    expect(stats.attestationCount).toBe(0);
    expect(stats.predicateDistribution).toEqual({});
    expect(stats.lastSyncedAt).toBeNull();
    expect(stats.lastSyncStatus).toBeNull();
    expect(stats.lastSyncDurationMs).toBeNull();
    expect(stats.lastSyncNodesCreated).toBeNull();
    expect(stats.lastSyncEdgesCreated).toBeNull();
    expect(stats.lastSyncErrorCount).toBeNull();
  });

  it('handles plain number values in Meta node fields', async () => {
    // Count query
    mockRun.mockResolvedValueOnce({
      records: [{
        get: (key: string) => {
          if (key === 'addressCount') return { toNumber: () => 10 };
          if (key === 'attestationCount') return { toNumber: () => 20 };
          return null;
        },
      }],
    });

    // Empty predicates
    mockRun.mockResolvedValueOnce({ records: [] });

    // Meta with plain numbers instead of Neo4j Integers
    mockRun.mockResolvedValueOnce({
      records: [{
        get: (key: string) => {
          switch (key) {
            case 'lastSyncedAt': return '2026-03-25T10:00:00Z';
            case 'lastSyncStatus': return 'partial';
            case 'lastSyncDurationMs': return 3000;
            case 'lastSyncNodesCreated': return 10;
            case 'lastSyncEdgesCreated': return 20;
            case 'lastSyncErrorCount': return 2;
            default: return null;
          }
        },
      }],
    });

    const stats = await getGraphStats();

    expect(stats.lastSyncDurationMs).toBe(3000);
    expect(stats.lastSyncNodesCreated).toBe(10);
    expect(stats.lastSyncEdgesCreated).toBe(20);
    expect(stats.lastSyncErrorCount).toBe(2);
  });

  it('closes session after success', async () => {
    mockRun.mockResolvedValueOnce({
      records: [{
        get: (key: string) => {
          if (key === 'addressCount') return { toNumber: () => 0 };
          if (key === 'attestationCount') return { toNumber: () => 0 };
          return null;
        },
      }],
    });
    mockRun.mockResolvedValueOnce({ records: [] });
    mockRun.mockResolvedValueOnce({ records: [{ get: () => null }] });

    await getGraphStats();

    expect(mockClose).toHaveBeenCalledOnce();
  });

  it('closes session on error', async () => {
    mockRun.mockRejectedValueOnce(new Error('Connection lost'));

    await expect(getGraphStats()).rejects.toThrow('Connection lost');
    expect(mockClose).toHaveBeenCalledOnce();
  });
});

// ============ getAttestationsForAddress ============

describe('getAttestationsForAddress', () => {
  it('returns incoming and outgoing attestations', async () => {
    const incomingRecord = {
      toObject: () => ({
        attesterId: '0xaaaa',
        attesterLabel: 'Alice',
        predicate: 'trusts',
        stake: 100,
        timestamp: '2026-01-15T12:00:00Z',
      }),
    };
    const outgoingRecord = {
      toObject: () => ({
        targetId: '0xbbbb',
        targetLabel: 'Bob',
        predicate: 'endorses',
        stake: 50,
        timestamp: '2026-01-16T12:00:00Z',
      }),
    };

    // Incoming query
    mockRun.mockResolvedValueOnce({ records: [incomingRecord] });
    // Outgoing query
    mockRun.mockResolvedValueOnce({ records: [outgoingRecord] });

    const result = await getAttestationsForAddress('0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC');

    expect(result.incoming).toHaveLength(1);
    expect(result.incoming[0]).toEqual({
      attesterId: '0xaaaa',
      attesterLabel: 'Alice',
      predicate: 'trusts',
      stake: 100,
      timestamp: '2026-01-15T12:00:00Z',
    });
    expect(result.outgoing).toHaveLength(1);
    expect(result.outgoing[0]).toEqual({
      targetId: '0xbbbb',
      targetLabel: 'Bob',
      predicate: 'endorses',
      stake: 50,
      timestamp: '2026-01-16T12:00:00Z',
    });
  });

  it('lowercases the address parameter', async () => {
    mockRun.mockResolvedValueOnce({ records: [] });
    mockRun.mockResolvedValueOnce({ records: [] });

    await getAttestationsForAddress('0xAABBCCDDEEFF00112233445566778899AABBCCDD');

    // Both queries should receive the lowercased address
    const incomingParams = mockRun.mock.calls[0][1] as { address: string };
    const outgoingParams = mockRun.mock.calls[1][1] as { address: string };
    expect(incomingParams.address).toBe('0xaabbccddeeff00112233445566778899aabbccdd');
    expect(outgoingParams.address).toBe('0xaabbccddeeff00112233445566778899aabbccdd');
  });

  it('returns empty arrays when no attestations exist', async () => {
    mockRun.mockResolvedValueOnce({ records: [] });
    mockRun.mockResolvedValueOnce({ records: [] });

    const result = await getAttestationsForAddress('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');

    expect(result.incoming).toEqual([]);
    expect(result.outgoing).toEqual([]);
  });

  it('runs incoming query with MATCH pattern targeting the address', async () => {
    mockRun.mockResolvedValueOnce({ records: [] });
    mockRun.mockResolvedValueOnce({ records: [] });

    await getAttestationsForAddress('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');

    const incomingQuery = mockRun.mock.calls[0][0] as string;
    expect(incomingQuery).toContain('ATTESTS');
    expect(incomingQuery).toContain('target:Address');
    expect(incomingQuery).toContain('$address');

    const outgoingQuery = mockRun.mock.calls[1][0] as string;
    expect(outgoingQuery).toContain('ATTESTS');
    expect(outgoingQuery).toContain('attester:Address');
    expect(outgoingQuery).toContain('$address');
  });

  it('closes session after success', async () => {
    mockRun.mockResolvedValueOnce({ records: [] });
    mockRun.mockResolvedValueOnce({ records: [] });

    await getAttestationsForAddress('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');

    expect(mockClose).toHaveBeenCalledOnce();
  });

  it('closes session on error', async () => {
    mockRun.mockRejectedValueOnce(new Error('Session expired'));

    await expect(
      getAttestationsForAddress('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
    ).rejects.toThrow('Session expired');
    expect(mockClose).toHaveBeenCalledOnce();
  });
});

// ============ upsertAddresses ============

describe('upsertAddresses', () => {
  it('with empty array does nothing', async () => {
    const result = await upsertAddresses([]);

    expect(result).toBe(0);
    expect(mockRun).not.toHaveBeenCalled();
  });

  it('with nodes calls MERGE correctly', async () => {
    const nodes = [
      makeAddressNode({ id: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }),
      makeAddressNode({ id: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' }),
    ];

    mockRun.mockResolvedValueOnce({
      records: [{ get: () => ({ toNumber: () => 2 }) }],
    });

    const count = await upsertAddresses(nodes);

    expect(count).toBe(2);
    expect(mockRun).toHaveBeenCalledOnce();

    // Verify the query uses MERGE and the nodes are passed as params
    const query = mockRun.mock.calls[0][0] as string;
    const params = mockRun.mock.calls[0][1] as { nodes: AddressNode[] };
    expect(query).toContain('MERGE');
    expect(query).toContain('ON CREATE SET');
    expect(query).toContain('ON MATCH SET');
    expect(params.nodes).toHaveLength(2);
  });

  it('closes session after upsert', async () => {
    mockRun.mockResolvedValueOnce({
      records: [{ get: () => ({ toNumber: () => 1 }) }],
    });

    await upsertAddresses([makeAddressNode()]);

    expect(mockClose).toHaveBeenCalledOnce();
  });

  it('closes session on error', async () => {
    mockRun.mockRejectedValueOnce(new Error('Write failed'));

    await expect(upsertAddresses([makeAddressNode()])).rejects.toThrow('Write failed');
    expect(mockClose).toHaveBeenCalledOnce();
  });
});

// ============ upsertAttestations ============

describe('upsertAttestations', () => {
  it('with empty array does nothing', async () => {
    const result = await upsertAttestations([]);

    expect(result).toBe(0);
    expect(mockRun).not.toHaveBeenCalled();
  });

  it('with edges calls MERGE correctly', async () => {
    const edges = [
      makeAttestationEdge({ triple_id: 'triple-001' }),
      makeAttestationEdge({ triple_id: 'triple-002' }),
    ];

    mockRun.mockResolvedValueOnce({
      records: [{ get: () => ({ toNumber: () => 2 }) }],
    });

    const count = await upsertAttestations(edges);

    expect(count).toBe(2);
    expect(mockRun).toHaveBeenCalledOnce();

    const query = mockRun.mock.calls[0][0] as string;
    const params = mockRun.mock.calls[0][1] as { edges: AttestationEdge[] };
    expect(query).toContain('MERGE');
    expect(query).toContain('ATTESTS');
    expect(query).toContain('tripleId');
    expect(params.edges).toHaveLength(2);
  });

  it('closes session after upsert', async () => {
    mockRun.mockResolvedValueOnce({
      records: [{ get: () => ({ toNumber: () => 1 }) }],
    });

    await upsertAttestations([makeAttestationEdge()]);

    expect(mockClose).toHaveBeenCalledOnce();
  });
});

// ============ clearGraph ============

describe('clearGraph', () => {
  it('calls delete queries in correct order (relationships then nodes)', async () => {
    mockRun.mockResolvedValueOnce({ records: [] }); // delete relationships
    mockRun.mockResolvedValueOnce({ records: [] }); // delete nodes

    await clearGraph();

    expect(mockRun).toHaveBeenCalledTimes(2);

    // First call: delete relationships
    const firstQuery = mockRun.mock.calls[0][0] as string;
    expect(firstQuery).toContain('DELETE r');

    // Second call: delete nodes
    const secondQuery = mockRun.mock.calls[1][0] as string;
    expect(secondQuery).toContain('DELETE n');
  });

  it('closes session after clearing', async () => {
    mockRun.mockResolvedValueOnce({ records: [] });
    mockRun.mockResolvedValueOnce({ records: [] });

    await clearGraph();

    expect(mockClose).toHaveBeenCalledOnce();
  });

  it('closes session and rethrows on error', async () => {
    mockRun.mockRejectedValueOnce(new Error('Permission denied'));

    await expect(clearGraph()).rejects.toThrow('Permission denied');
    expect(mockClose).toHaveBeenCalledOnce();
  });
});
