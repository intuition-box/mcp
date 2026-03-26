/**
 * Configurable auto-sync cron job.
 *
 * Environment variables:
 *   SYNC_SCHEDULE          - Cron expression (default "0 * * * *", hourly)
 *   SYNC_INTERVAL_PRESET   - Human-friendly alias: "hourly" | "daily" | "twice-daily"
 *                            Takes precedence over SYNC_SCHEDULE when set.
 *   ENABLE_SYNC_CRON       - Must be "true" for cron to start (checked in index.ts)
 */

import { schedule, validate, type ScheduledTask } from 'node-cron';
import { runSync } from './indexer/sync.js';
import { log } from './utils/logger.js';

// ============ Preset map ============

const INTERVAL_PRESETS: Record<string, string> = {
  hourly:      '0 * * * *',
  daily:       '0 0 * * *',
  'twice-daily': '0 0,12 * * *',
};

// ============ State ============

let task: ScheduledTask | null = null;
let syncRunning = false;
let lastRunSuccess: boolean | null = null;

// ============ Schedule resolution ============

function resolveSchedule(): string {
  const preset = process.env.SYNC_INTERVAL_PRESET?.toLowerCase();
  if (preset && INTERVAL_PRESETS[preset]) {
    return INTERVAL_PRESETS[preset];
  }
  if (preset) {
    log('warn', `Unknown SYNC_INTERVAL_PRESET "${preset}", falling back to SYNC_SCHEDULE or default`);
  }

  const explicit = process.env.SYNC_SCHEDULE;
  if (explicit) {
    if (!validate(explicit)) {
      log('warn', `Invalid SYNC_SCHEDULE "${explicit}", falling back to default hourly`);
      return '0 * * * *';
    }
    return explicit;
  }

  return '0 * * * *';
}

// ============ Sync runner (error-safe) ============

async function executeSyncJob(): Promise<void> {
  if (syncRunning) {
    log('warn', 'Sync already in progress, skipping scheduled run');
    return;
  }

  syncRunning = true;
  const startedAt = new Date().toISOString();
  log('info', 'Cron sync started', { startedAt });

  try {
    const result = await runSync();
    lastRunSuccess = result.errors.length === 0;
    log('info', 'Cron sync finished', {
      duration: `${(result.duration / 1000).toFixed(2)}s`,
      nodes: result.nodesCreated,
      edges: result.edgesCreated,
      errors: result.errors.length,
    });
  } catch (error) {
    lastRunSuccess = false;
    log('error', 'Cron sync failed', { error: String(error) });
  } finally {
    syncRunning = false;
  }
}

// ============ Public API ============

export function startCronSync(): void {
  if (task) {
    log('warn', 'Cron sync already started');
    return;
  }

  const expression = resolveSchedule();

  task = schedule(expression, executeSyncJob, {
    name: 'intuition-sync',
    noOverlap: true,
  });

  const nextRun = task.getNextRun();
  log('info', 'Cron sync scheduled', {
    schedule: expression,
    nextRun: nextRun ? nextRun.toISOString() : 'unknown',
  });
}

export function stopCronSync(): void {
  if (!task) {
    return;
  }
  task.stop();
  task = null;
  log('info', 'Cron sync stopped');
}

export interface SyncStatus {
  isRunning: boolean;
  nextRun: string;
  lastRunSuccess: boolean | null;
}

export function getSyncStatus(): SyncStatus {
  const nextRun = task?.getNextRun();
  return {
    isRunning: syncRunning,
    nextRun: nextRun ? nextRun.toISOString() : 'not scheduled',
    lastRunSuccess,
  };
}
