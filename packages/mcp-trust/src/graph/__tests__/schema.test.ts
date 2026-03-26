import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupSchema, verifySchema } from '../schema.js';

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

// ============ setupSchema ============

describe('setupSchema', () => {
  it('creates all expected constraints and indexes', async () => {
    // 5 session.run calls: 1 constraint + 4 indexes
    mockRun.mockResolvedValue({ records: [] });

    await setupSchema();

    expect(mockRun).toHaveBeenCalledTimes(5);

    const queries = mockRun.mock.calls.map((c: unknown[]) => c[0] as string);

    // Unique constraint on Address id
    expect(queries[0]).toContain('CREATE CONSTRAINT');
    expect(queries[0]).toContain('address_id_unique');

    // Index on Address label
    expect(queries[1]).toContain('CREATE INDEX');
    expect(queries[1]).toContain('address_label_index');

    // Index on ATTESTS predicate
    expect(queries[2]).toContain('attests_predicate_index');

    // Index on ATTESTS timestamp
    expect(queries[3]).toContain('attests_timestamp_index');

    // Index on ATTESTS tripleId
    expect(queries[4]).toContain('attests_triple_id_index');
  });

  it('uses IF NOT EXISTS for idempotent setup', async () => {
    mockRun.mockResolvedValue({ records: [] });

    await setupSchema();

    for (const call of mockRun.mock.calls) {
      const query = call[0] as string;
      expect(query).toContain('IF NOT EXISTS');
    }
  });

  it('closes session after success', async () => {
    mockRun.mockResolvedValue({ records: [] });

    await setupSchema();

    expect(mockClose).toHaveBeenCalledOnce();
  });

  it('closes session and rethrows on error', async () => {
    // First call succeeds, second fails
    mockRun
      .mockResolvedValueOnce({ records: [] })
      .mockRejectedValueOnce(new Error('Schema error'));

    await expect(setupSchema()).rejects.toThrow('Schema error');
    expect(mockClose).toHaveBeenCalledOnce();
  });
});

// ============ verifySchema ============

describe('verifySchema', () => {
  it('returns true when address_id_unique constraint exists', async () => {
    mockRun.mockResolvedValueOnce({
      records: [
        { get: (key: string) => key === 'name' ? 'address_id_unique' : null },
        { get: (key: string) => key === 'name' ? 'other_constraint' : null },
      ],
    });

    const result = await verifySchema();

    expect(result).toBe(true);
  });

  it('returns false when constraint is missing', async () => {
    mockRun.mockResolvedValueOnce({
      records: [
        { get: (key: string) => key === 'name' ? 'some_other_constraint' : null },
      ],
    });

    const result = await verifySchema();

    expect(result).toBe(false);
  });

  it('returns false for empty constraints list', async () => {
    mockRun.mockResolvedValueOnce({ records: [] });

    const result = await verifySchema();

    expect(result).toBe(false);
  });

  it('runs SHOW CONSTRAINTS query', async () => {
    mockRun.mockResolvedValueOnce({ records: [] });

    await verifySchema();

    const query = mockRun.mock.calls[0][0] as string;
    expect(query).toContain('SHOW CONSTRAINTS');
  });

  it('closes session after verification', async () => {
    mockRun.mockResolvedValueOnce({ records: [] });

    await verifySchema();

    expect(mockClose).toHaveBeenCalledOnce();
  });

  it('closes session even when query fails', async () => {
    mockRun.mockRejectedValueOnce(new Error('Query failed'));

    await expect(verifySchema()).rejects.toThrow('Query failed');
    expect(mockClose).toHaveBeenCalledOnce();
  });
});
