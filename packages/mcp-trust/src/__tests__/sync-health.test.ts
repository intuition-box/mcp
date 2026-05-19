import { describe, it, expect } from 'vitest';
import {
  computeSyncHealth,
  STALE_THRESHOLD_MS,
} from '../utils/sync-health.js';

const NOW = new Date('2026-05-19T12:00:00Z');

describe('computeSyncHealth', () => {
  it('returns "unknown" when no sync has run yet', () => {
    expect(
      computeSyncHealth({ lastSyncedAt: null, lastSyncStatus: null }, NOW),
    ).toBe('unknown');
  });

  it('returns "unknown" when lastSyncedAt is unparseable', () => {
    expect(
      computeSyncHealth({ lastSyncedAt: 'not-a-date', lastSyncStatus: 'success' }, NOW),
    ).toBe('unknown');
  });

  it('returns "degraded" when lastSyncStatus is not "success"', () => {
    expect(
      computeSyncHealth(
        { lastSyncedAt: NOW.toISOString(), lastSyncStatus: 'partial' },
        NOW,
      ),
    ).toBe('degraded');
    expect(
      computeSyncHealth(
        { lastSyncedAt: NOW.toISOString(), lastSyncStatus: 'failed' },
        NOW,
      ),
    ).toBe('degraded');
  });

  it('returns "stale" when last successful sync is older than 24h', () => {
    const old = new Date(NOW.getTime() - STALE_THRESHOLD_MS - 1000).toISOString();
    expect(
      computeSyncHealth({ lastSyncedAt: old, lastSyncStatus: 'success' }, NOW),
    ).toBe('stale');
  });

  it('returns "healthy" when last successful sync is within 24h', () => {
    const recent = new Date(NOW.getTime() - 60 * 1000).toISOString();
    expect(
      computeSyncHealth({ lastSyncedAt: recent, lastSyncStatus: 'success' }, NOW),
    ).toBe('healthy');
  });

  it('treats missing lastSyncStatus as success for age classification', () => {
    const recent = new Date(NOW.getTime() - 60 * 1000).toISOString();
    expect(
      computeSyncHealth({ lastSyncedAt: recent, lastSyncStatus: null }, NOW),
    ).toBe('healthy');
  });

  it('classifies a status error even when the sync is recent', () => {
    const recent = new Date(NOW.getTime() - 60 * 1000).toISOString();
    expect(
      computeSyncHealth({ lastSyncedAt: recent, lastSyncStatus: 'failed' }, NOW),
    ).toBe('degraded');
  });

  it('threshold boundary: exactly 24h ago is healthy, +1ms is stale', () => {
    const exact = new Date(NOW.getTime() - STALE_THRESHOLD_MS).toISOString();
    const past = new Date(NOW.getTime() - STALE_THRESHOLD_MS - 1).toISOString();
    expect(
      computeSyncHealth({ lastSyncedAt: exact, lastSyncStatus: 'success' }, NOW),
    ).toBe('healthy');
    expect(
      computeSyncHealth({ lastSyncedAt: past, lastSyncStatus: 'success' }, NOW),
    ).toBe('stale');
  });

  it('defaults `now` to current wall clock', () => {
    const veryOld = new Date(0).toISOString();
    expect(
      computeSyncHealth({ lastSyncedAt: veryOld, lastSyncStatus: 'success' }),
    ).toBe('stale');
  });
});
