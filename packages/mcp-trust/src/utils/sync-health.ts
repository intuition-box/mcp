/**
 * Pure classifier that maps sync metadata onto a health status.
 *
 * - "healthy"  -> last sync succeeded and was within STALE_THRESHOLD_MS
 * - "degraded" -> last sync status was something other than "success"
 * - "stale"    -> last sync succeeded but was longer ago than STALE_THRESHOLD_MS
 * - "unknown"  -> no sync has run yet, or lastSyncedAt is unparseable
 */

export type SyncHealthStatus = 'healthy' | 'degraded' | 'stale' | 'unknown';

export interface SyncHealthInput {
  lastSyncedAt: string | null;
  lastSyncStatus: string | null;
}

export const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

export function computeSyncHealth(
  input: SyncHealthInput,
  now: Date = new Date(),
): SyncHealthStatus {
  if (!input.lastSyncedAt) return 'unknown';

  const lastMs = new Date(input.lastSyncedAt).getTime();
  if (!Number.isFinite(lastMs)) return 'unknown';

  if (input.lastSyncStatus && input.lastSyncStatus !== 'success') {
    return 'degraded';
  }

  const ageMs = now.getTime() - lastMs;
  if (ageMs > STALE_THRESHOLD_MS) return 'stale';

  return 'healthy';
}
