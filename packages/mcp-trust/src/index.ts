/**
 * Intuition Trust Engine - Entry Point
 *
 * This module provides the main API for the trust engine,
 * including sync operations, graph queries, and trust algorithms.
 */

import 'dotenv/config';
import express, { Request, Response } from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  CallToolRequest,
  CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'node:crypto';
import {
  loadConfig,
  initializeDriver,
  verifyConnection,
  closeDriver,
  getSession,
  setNeo4jAvailable,
  isNeo4jAvailable
} from './config/neo4j.js';
import { initializeGraphQLClient } from './graphql/client.js';
import { setupSchema } from './graph/schema.js';
import {
  getGraphStats,
  getAttestationsForAddress
} from './graph/queries.js';
import { runSync } from './indexer/sync.js';
import { log } from './utils/logger.js';
import {
  computeEigenTrust,
  computeAgentRank,
  computeCompositeScore,
  simulateSybilAttack,
  computePersonalizedTrust,
  computePersonalizedTrustNetwork,
  findTrustPaths,
  TrustScore,
} from './algorithms/index.js';
import { TRUST_PREDICATES, DEFAULT_WEIGHTS } from './config/predicates.js';
import { startCronSync, stopCronSync, getSyncStatus } from './cron.js';

// Concurrency guard for the run_sync MCP tool. Prevents a client-triggered
// sync from running alongside another client-triggered sync. Note: the cron
// path has its own guard in cron.ts, so this flag only protects the tool path.
let isSyncRunning = false;

/**
 * Initialize the trust engine.
 * All failures are non-fatal — the server stays alive regardless.
 * Tools that require Neo4j will return descriptive errors until it connects.
 */
export async function initialize(): Promise<void> {
  try {
    const config = loadConfig();

    initializeDriver(config);
    initializeGraphQLClient(config);

    try {
      const connected = await verifyConnection();
      if (connected) {
        setNeo4jAvailable(true);
        await setupSchema();
        log('info', 'Trust engine initialized with Neo4j connection');
      } else {
        log('warn', 'Neo4j is unreachable — starting without database connectivity. Tools requiring Neo4j will return errors until the connection is restored.');
      }
    } catch (error) {
      log('warn', 'Neo4j connection failed during startup', { error: String(error) });
      log('warn', 'Starting without database connectivity. Tools requiring Neo4j will return errors until the connection is restored.');
    }
  } catch (error) {
    log('warn', 'Trust engine initialization failed — server will continue without backend services', { error: String(error) });
  }
}

/**
 * Shutdown the trust engine
 */
export async function shutdown(): Promise<void> {
  await closeDriver();
  log('info', 'Trust engine shutdown complete');
}

// Export main functionality
export { runSync } from './indexer/sync.js';
export { getGraphStats, getAttestationsForAddress } from './graph/queries.js';
export { verifyConnection, isNeo4jAvailable } from './config/neo4j.js';

// Export trust algorithms
export * from './algorithms/index.js';

// ============ MCP Server Setup ============

const SERVER_CONFIG = {
  name: 'intuition-trust-engine',
  version: '1.2.0',
} as const;

const TRUST_TOOLS = [
  {
    name: 'get_graph_stats',
    description: 'Get Neo4j graph statistics including node counts, edge counts, and label distributions.',
    inputSchema: { type: 'object' as const, properties: {}, additionalProperties: false },
  },
  {
    name: 'compute_eigentrust',
    description: 'Compute global EigenTrust scores across the entire attestation graph. Returns ranked trust scores for all addresses.',
    inputSchema: { type: 'object' as const, properties: {}, additionalProperties: false },
  },
  {
    name: 'compute_agentrank',
    description: 'Compute global AgentRank (PageRank-based) scores across the attestation graph. Returns ranked influence scores.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        topN: { type: 'number', description: 'Number of top agents to return (default 20)' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'compute_composite_score',
    description: 'Compute a composite trust score for an address combining EigenTrust, AgentRank, and optionally personalized transitive trust.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        address: { type: 'string', description: 'The address to evaluate' },
        fromAddress: { type: 'string', description: 'Optional source address for personalized transitive trust perspective' },
        eigentrustWeight: { type: 'number', description: 'Override EigenTrust weight in composite (0-1, default 0.4)' },
        agentRankWeight: { type: 'number', description: 'Override AgentRank weight in composite (0-1, default 0.3)' },
        transitiveTrustWeight: { type: 'number', description: 'Override transitive trust weight in composite (0-1, default 0.3)' },
        predicateWeights: {
          type: 'object',
          description: 'Custom predicate weights to override defaults per query. Keys are predicate names, values are numeric weights. Only affects the transitive-trust component; EigenTrust and AgentRank ignore predicate weights.',
        },
      },
      required: ['address'],
      additionalProperties: false,
    },
  },
  {
    name: 'compute_personalized_trust',
    description: 'Compute personalized trust score from one address to another, following attestation paths in the graph.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        fromAddress: {
          oneOf: [
            { type: 'string', description: 'Single source address' },
            { type: 'array', items: { type: 'string' }, description: 'Group of source addresses — trust is averaged across the group' },
          ],
          description: 'Source address or array of addresses (group anchor mode)',
        },
        toAddress: { type: 'string', description: 'Target address' },
        maxHops: { type: 'number', description: 'Maximum path length (default 3)' },
        minStake: { type: 'number', description: 'Minimum stake threshold (default 0)' },
        predicateWeights: {
          type: 'object',
          description: 'Custom predicate weights to override defaults per query. Keys are predicate names, values are numeric weights.',
        },
      },
      required: ['fromAddress', 'toAddress'],
      additionalProperties: false,
    },
  },
  {
    name: 'find_trust_paths',
    description: 'Find all trust paths between two addresses in the attestation graph, ranked by strength.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        fromAddress: { type: 'string', description: 'Source address' },
        toAddress: { type: 'string', description: 'Target address' },
        maxHops: { type: 'number', description: 'Maximum path length (default 3)' },
      },
      required: ['fromAddress', 'toAddress'],
      additionalProperties: false,
    },
  },
  {
    name: 'simulate_sybil_attack',
    description: 'Simulate a sybil attack on the trust graph and measure resistance. Injects fake nodes with collusion edges and compares EigenTrust and AgentRank scores before and after.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        numSybilNodes: { type: 'number', description: 'Number of sybil nodes to inject (default 50)' },
        targetAddress: { type: 'string', description: 'Optional target address to attempt boosting' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_predicate_config',
    description: 'Return the current predicate list with their on-chain term IDs and default trust weights. No parameters needed.',
    inputSchema: { type: 'object' as const, properties: {}, additionalProperties: false },
  },
  {
    name: 'get_sync_status',
    description: 'Returns the current auto-sync cron job status including whether it is running, the next scheduled run time, the last run time, and whether the last run succeeded.',
    inputSchema: { type: 'object' as const, properties: {}, additionalProperties: false },
  },
  {
    name: 'run_sync',
    description: 'Manually trigger a graph sync from Intuition GraphQL to Neo4j. Fetches latest attestations and updates the trust graph. Returns sync result with nodes created, edges created, and duration.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        maxPages: {
          type: 'number',
          description: 'Maximum pages to fetch (default: 10, max recommended: 50)',
        },
      },
      additionalProperties: false,
    },
  },
] as const;

// MCP tool call handler — routes to existing engine functions
async function handleToolCall(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
  switch (name) {
    case 'get_graph_stats': {
      const stats = await getGraphStats();
      return { content: [{ type: 'text', text: JSON.stringify(stats, null, 2) }] };
    }
    case 'compute_eigentrust': {
      const result = await computeEigenTrust();
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            iterations: result.iterations,
            converged: result.converged,
            computationTimeMs: result.computationTimeMs,
            totalScored: result.scores.length,
            top20: result.scores.slice(0, 20),
          }, null, 2),
        }],
      };
    }
    case 'compute_agentrank': {
      const topN = typeof args.topN === 'number' ? args.topN : 20;
      const result = await computeAgentRank(undefined, topN);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            iterations: result.iterations,
            converged: result.converged,
            computationTimeMs: result.computationTimeMs,
            totalRanked: result.ranks.size,
            influenceMetrics: result.influenceMetrics,
            topAgents: result.topAgents,
          }, null, 2),
        }],
      };
    }
    case 'compute_composite_score': {
      const address = args.address as string;
      const fromAddress = args.fromAddress as string | undefined;
      const etW = typeof args.eigentrustWeight === 'number' ? args.eigentrustWeight : undefined;
      const arW = typeof args.agentRankWeight === 'number' ? args.agentRankWeight : undefined;
      const ttW = typeof args.transitiveTrustWeight === 'number' ? args.transitiveTrustWeight : undefined;
      const predicateWeights = (args.predicateWeights && typeof args.predicateWeights === 'object' && !Array.isArray(args.predicateWeights))
        ? args.predicateWeights as Record<string, number>
        : undefined;
      const hasWeightOverrides = etW !== undefined || arW !== undefined || ttW !== undefined;
      const config = (hasWeightOverrides || predicateWeights !== undefined)
        ? {
            ...(hasWeightOverrides && {
              weights: { eigentrust: etW ?? 0.4, agentrank: arW ?? 0.3, transitiveTrust: ttW ?? 0.3 },
            }),
            ...(predicateWeights !== undefined && { predicateWeights }),
          }
        : undefined;
      const result = await computeCompositeScore(address, fromAddress, config);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
    case 'compute_personalized_trust': {
      const predicateWeights = (args.predicateWeights && typeof args.predicateWeights === 'object' && !Array.isArray(args.predicateWeights))
        ? args.predicateWeights as Record<string, number>
        : undefined;
      const fromAddress = Array.isArray(args.fromAddress)
        ? args.fromAddress as string[]
        : args.fromAddress as string;
      const result = await computePersonalizedTrust({
        fromAddress,
        toAddress: args.toAddress as string,
        maxHops: typeof args.maxHops === 'number' ? args.maxHops : 3,
        minStake: typeof args.minStake === 'number' ? args.minStake : 0,
        predicateWeights,
      });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
    case 'find_trust_paths': {
      const maxHops = typeof args.maxHops === 'number' ? args.maxHops : 3;
      const result = await findTrustPaths(args.fromAddress as string, args.toAddress as string, maxHops);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            pathCount: result.paths.length,
            nodesVisited: result.nodesVisited,
            paths: result.paths.slice(0, 10),
            strongestPath: result.strongestPath,
          }, null, 2),
        }],
      };
    }
    case 'simulate_sybil_attack': {
      const numSybilNodes = typeof args.numSybilNodes === 'number' ? args.numSybilNodes : 50;
      const targetAddress = typeof args.targetAddress === 'string' ? args.targetAddress : undefined;
      const numCollusionEdges = numSybilNodes * 4;
      const result = await simulateSybilAttack({
        numSybilNodes,
        numCollusionEdges,
        targetAddress,
      });
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            sybilNodesCreated: result.sybilNodesCreated,
            sybilEdgesCreated: result.sybilEdgesCreated,
            computationTimeMs: result.computationTimeMs,
            eigentrustResistance: result.impact.eigentrustResistance,
            agentrankResistance: result.impact.agentrankResistance,
            maxScoreChangeEigentrust: result.impact.maxScoreChangeEigentrust,
            maxScoreChangeAgentrank: result.impact.maxScoreChangeAgentrank,
            verdict: {
              eigentrust: `${Math.round(result.impact.eigentrustResistance * 100)}% resistance`,
              agentrank: `${Math.round(result.impact.agentrankResistance * 100)}% resistance`,
            },
          }, null, 2),
        }],
      };
    }
    case 'get_predicate_config': {
      const predicates = Object.entries(TRUST_PREDICATES).map(([name, entry]) => ({
        name,
        termId: entry.termId,
        defaultWeight: entry.weight,
      }));
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ predicates, defaultWeights: DEFAULT_WEIGHTS }, null, 2),
        }],
      };
    }
    case 'get_sync_status': {
      // Combine in-memory cron state with persisted Meta node fields so the
      // response survives server restarts.
      const status = getSyncStatus();
      const graphStats = await getGraphStats();
      const combined = {
        isRunning: status.isRunning,
        nextRun: status.nextRun,
        lastSyncedAt: graphStats.lastSyncedAt ?? null,
        lastSyncStatus: graphStats.lastSyncStatus ?? null,
        lastSyncDurationMs: graphStats.lastSyncDurationMs ?? null,
        lastSyncNodesCreated: graphStats.lastSyncNodesCreated ?? null,
        lastSyncEdgesCreated: graphStats.lastSyncEdgesCreated ?? null,
        lastRunSuccess: status.lastRunSuccess,
      };
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(combined, null, 2),
        }],
      };
    }
    case 'run_sync': {
      if (isSyncRunning) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: 'Sync already in progress. Try again when current sync completes.',
            }),
          }],
        };
      }
      isSyncRunning = true;
      try {
        const maxPages = typeof args.maxPages === 'number' ? args.maxPages : 10;
        // clearFirst is intentionally hardcoded to false. It wipes the entire
        // Neo4j graph and must never be triggered from a public-facing tool.
        // Re-add behind an auth gate if an admin-only variant is needed.
        const result = await runSync({ maxPages, clearFirst: false });
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result, null, 2),
          }],
        };
      } finally {
        isSyncRunning = false;
      }
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// Factory: creates a configured MCP Server instance with trust tool handlers
function createTrustServerInstance(): Server {
  const instance = new Server(SERVER_CONFIG, {
    capabilities: { tools: {} },
  });

  instance.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TRUST_TOOLS.map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
  }));

  instance.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
    const { name } = request.params;
    const args = (request.params.arguments ?? {}) as Record<string, unknown>;
    log('info', `Tool call: ${name}`, { args });

    try {
      return await handleToolCall(name, args);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log('error', `Tool call failed: ${name}`, { error: message });
      return {
        content: [{ type: 'text' as const, text: `Error executing ${name}: ${message}` }],
        isError: true,
      };
    }
  });

  return instance;
}

// ============ HTTP Server ============

interface TransportSession {
  transport: StreamableHTTPServerTransport;
  server: Server;
  lastActivity: number;
  createdAt: number;
}

const SESSION_TIMEOUT = 5 * 60 * 1000;
const SESSION_CLEANUP_INTERVAL = 60 * 1000;
const SESSION_MAX_AGE = 30 * 60 * 1000;

const transports: Record<string, TransportSession> = {};
const sseTransports: Record<string, SSEServerTransport> = {};

// Cleanup stale sessions periodically
function startSessionCleanup(): void {
  setInterval(() => {
    const now = Date.now();
    Object.entries(transports).forEach(async ([sessionId, session]) => {
      const isInactive = now - session.lastActivity > SESSION_TIMEOUT;
      const isExpired = now - session.createdAt > SESSION_MAX_AGE;
      if (isInactive || isExpired) {
        log('info', `Cleaning up ${isInactive ? 'inactive' : 'expired'} session: ${sessionId}`);
        try {
          await session.transport.close();
        } catch (error) {
          log('warn', 'Error closing transport during cleanup', { error: String(error) });
        } finally {
          delete transports[sessionId];
        }
      }
    });
  }, SESSION_CLEANUP_INTERVAL);
}

async function runHttpServer(): Promise<void> {
  const app = express();
  const port = parseInt(process.env.PORT || '3002', 10);
  app.use(express.json());

  // Health check — always available regardless of Neo4j state
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      name: SERVER_CONFIG.name,
      version: SERVER_CONFIG.version,
      neo4j: isNeo4jAvailable() ? 'connected' : 'unavailable',
      activeSessions: Object.keys(transports).length,
      activeSSESessions: Object.keys(sseTransports).length,
      uptime: process.uptime(),
    });
  });

  // MCP endpoint — StreamableHTTP transport
  app.post('/mcp', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    try {
      if (!sessionId) {
        // New session
        const sessionServer = createTrustServerInstance();
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (newSessionId) => {
            log('info', `MCP session initialized: ${newSessionId}`);
            transports[newSessionId] = {
              transport,
              server: sessionServer,
              lastActivity: Date.now(),
              createdAt: Date.now(),
            };
          },
        });

        try {
          await sessionServer.connect(transport);
          await transport.handleRequest(req, res, req.body);
        } catch (error) {
          log('error', 'Failed to initialize MCP session', { error: String(error) });
          try { await transport.close(); } catch (_) { /* cleanup */ }
          if (!res.writableEnded) {
            res.status(500).json({
              jsonrpc: '2.0',
              error: { code: -32001, message: 'Failed to initialize MCP connection' },
              id: null,
            });
          }
        }
        return;
      }

      // Existing session
      const session = transports[sessionId];
      if (!session) {
        res.status(401).json({
          jsonrpc: '2.0',
          error: { code: -32001, message: 'Invalid session, please reinitialize' },
          id: null,
        });
        return;
      }

      session.lastActivity = Date.now();
      await session.transport.handleRequest(req, res, req.body);
    } catch (error) {
      log('error', 'MCP request error', { error: String(error) });
      if (!res.writableEnded) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    }
  });

  // SSE endpoint for backward compatibility
  app.get('/sse', async (_req: Request, res: Response) => {
    const sseServer = createTrustServerInstance();
    const transport = new SSEServerTransport('/messages', res);
    sseTransports[transport.sessionId] = transport;
    res.on('close', () => { delete sseTransports[transport.sessionId]; });
    await sseServer.connect(transport);
  });

  app.post('/messages', async (req: Request, res: Response) => {
    const sessionId = req.query.sessionId as string;
    const transport = sseTransports[sessionId];
    if (transport) {
      await transport.handlePostMessage(req, res, req.body);
    } else {
      res.status(400).send('No transport found for sessionId');
    }
  });

  // Session cleanup on DELETE
  app.delete('/mcp', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string;
    if (sessionId && transports[sessionId]) {
      try { await transports[sessionId].transport.close(); } catch (_) { /* cleanup */ }
      delete transports[sessionId];
    }
    res.status(200).send('Session terminated');
  });

  // Start the HTTP server unconditionally — this MUST happen before Neo4j init
  const httpServer = app.listen(port, '0.0.0.0', () => {
    log('info', `Trust engine HTTP server listening on 0.0.0.0:${port}`);
  });

  httpServer.keepAliveTimeout = 120000;
  httpServer.headersTimeout = 120000;

  startSessionCleanup();

  // Attempt Neo4j connection in background — never kills the server
  initialize()
    .then(() => {
      if (process.env.ENABLE_SYNC_CRON === 'true') {
        startCronSync();
      }
    })
    .catch((error) => {
      log('warn', 'Background initialization failed', { error: String(error) });
    });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    log('info', 'SIGTERM received, shutting down gracefully');
    stopCronSync();
    httpServer.close(async () => {
      await shutdown();
      log('info', 'Server closed');
    });
  });
}

// ============ CLI Command Handlers ============

/**
 * Format a trust score for display (full addresses for copy/paste)
 */
function formatTrustScore(score: TrustScore, index?: number): string {
  const prefix = index !== undefined ? `${(index + 1).toString().padStart(3)}. ` : '';
  const scoreStr = score.score.toFixed(6);
  const confStr = (score.confidence * 100).toFixed(1);
  const pathStr = score.pathCount.toString();

  return `${prefix}${score.address}\n     Score: ${scoreStr} | Confidence: ${confStr}% | Paths: ${pathStr}`;
}

/**
 * Run EigenTrust algorithm and display results
 */
async function runEigenTrustCommand(): Promise<void> {
  console.log('\nComputing global EigenTrust scores...\n');

  const result = await computeEigenTrust();

  console.log('='.repeat(80));
  console.log('EigenTrust Results');
  console.log('='.repeat(80));
  console.log(`Iterations: ${result.iterations}`);
  console.log(`Converged: ${result.converged ? 'Yes' : 'No'}`);
  console.log(`Computation time: ${result.computationTimeMs}ms`);
  console.log(`Total addresses scored: ${result.scores.length}`);
  console.log('-'.repeat(80));
  console.log('\nTop 20 Addresses by Trust Score:\n');

  const top20 = result.scores.slice(0, 20);
  for (let i = 0; i < top20.length; i++) {
    console.log(formatTrustScore(top20[i], i));
  }

  console.log('\n' + '='.repeat(80));
}

/**
 * Compute personalized trust between two addresses
 */
async function runTrustCommand(fromAddress: string, toAddress: string): Promise<void> {
  console.log(`\nComputing trust: ${fromAddress} -> ${toAddress}\n`);

  const score = await computePersonalizedTrust({
    fromAddress,
    toAddress,
    maxHops: 3,
    minStake: 0,
  });

  console.log('='.repeat(80));
  console.log('Personalized Trust Result');
  console.log('='.repeat(80));
  console.log(`From:       ${fromAddress}`);
  console.log(`To:         ${toAddress}`);
  console.log('-'.repeat(80));
  console.log(`Trust Score:  ${score.score.toFixed(6)}`);
  console.log(`Confidence:   ${(score.confidence * 100).toFixed(1)}%`);
  console.log(`Path Count:   ${score.pathCount}`);

  if (score.sources.length > 0) {
    console.log(`Sources:      ${score.sources.slice(0, 5).join(', ')}${score.sources.length > 5 ? '...' : ''}`);
  }

  // Interpretation
  console.log('-'.repeat(80));
  console.log('Interpretation:');
  if (score.score === 0) {
    console.log('  No trust path exists between these addresses.');
  } else if (score.score < 0.1) {
    console.log('  Very low trust - weak or distant connection.');
  } else if (score.score < 0.3) {
    console.log('  Low trust - some indirect connections exist.');
  } else if (score.score < 0.5) {
    console.log('  Moderate trust - reasonable connection strength.');
  } else if (score.score < 0.7) {
    console.log('  Good trust - strong connections exist.');
  } else {
    console.log('  High trust - very strong direct or near-direct attestations.');
  }

  console.log('='.repeat(80));
}

/**
 * Compute trust network from an address
 */
async function runNetworkCommand(sourceAddress: string, maxHops: number): Promise<void> {
  console.log(`\nComputing trust network from: ${sourceAddress} (max ${maxHops} hops)\n`);

  const network = await computePersonalizedTrustNetwork(sourceAddress, maxHops);

  console.log('='.repeat(80));
  console.log('Trust Network Results');
  console.log('='.repeat(80));
  console.log(`Source:     ${sourceAddress}`);
  console.log(`Max Hops:   ${maxHops}`);
  console.log(`Reachable:  ${network.size} addresses`);
  console.log('-'.repeat(80));

  if (network.size === 0) {
    console.log('\nNo reachable addresses found from this source.');
  } else {
    // Sort by score and show top 20
    const sorted = Array.from(network.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);

    console.log('\nTop 20 Most Trusted Addresses:\n');
    for (let i = 0; i < sorted.length; i++) {
      console.log(formatTrustScore(sorted[i], i));
    }

    // Show score distribution
    const scores = Array.from(network.values()).map(s => s.score);
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    const maxScore = Math.max(...scores);
    const minScore = Math.min(...scores);

    console.log('\nScore Distribution:');
    console.log(`  Min:     ${minScore.toFixed(6)}`);
    console.log(`  Max:     ${maxScore.toFixed(6)}`);
    console.log(`  Average: ${avgScore.toFixed(6)}`);
  }

  console.log('\n' + '='.repeat(80));
}

/**
 * Find and display trust paths between addresses
 */
async function runPathsCommand(fromAddress: string, toAddress: string, maxHops: number): Promise<void> {
  console.log(`\nFinding trust paths: ${fromAddress} -> ${toAddress} (max ${maxHops} hops)\n`);

  const result = await findTrustPaths(fromAddress, toAddress, maxHops);

  console.log('='.repeat(80));
  console.log('Trust Paths Results');
  console.log('='.repeat(80));
  console.log(`From:         ${fromAddress}`);
  console.log(`To:           ${toAddress}`);
  console.log(`Max Hops:     ${maxHops}`);
  console.log(`Paths Found:  ${result.paths.length}`);
  console.log(`Nodes Visited: ${result.nodesVisited}`);
  console.log('-'.repeat(80));

  if (result.paths.length === 0) {
    console.log('\nNo paths found between these addresses.');
  } else {
    console.log('\nTop 10 Strongest Paths:\n');

    const topPaths = result.paths.slice(0, 10);
    for (let i = 0; i < topPaths.length; i++) {
      const path = topPaths[i];
      const hopCount = path.predicates.length;
      const totalStake = path.stakes.reduce((a, b) => a + b, 0);

      console.log(`Path ${i + 1} (${hopCount} hop${hopCount > 1 ? 's' : ''}):`);

      // Show path visualization with full addresses
      for (let j = 0; j < path.addresses.length; j++) {
        const addr = path.addresses[j];

        if (j < path.predicates.length) {
          const predicate = path.predicates[j];
          const stake = path.stakes[j];
          console.log(`  ${addr}`);
          console.log(`    --[${predicate}, stake: ${stake}]-->`);
        } else {
          console.log(`  ${addr}`);
        }
      }

      console.log(`  Total Stake: ${totalStake} | Decay: ${path.totalDecay.toFixed(4)}`);
      console.log('');
    }

    if (result.strongestPath) {
      console.log('-'.repeat(80));
      console.log('Strongest Path Summary:');
      console.log(`  Hops: ${result.strongestPath.predicates.length}`);
      console.log(`  Predicates: ${result.strongestPath.predicates.join(' -> ')}`);
      console.log(`  Total Decay: ${result.strongestPath.totalDecay.toFixed(6)}`);
    }
  }

  console.log('\n' + '='.repeat(80));
}

/**
 * Interpret Gini coefficient for human-readable output
 */
function interpretGini(gini: number): string {
  if (gini < 0.2) return 'Very equal - influence is broadly distributed';
  if (gini < 0.4) return 'Moderately equal - some concentration emerging';
  if (gini < 0.6) return 'Moderate inequality - clear influence hierarchy';
  if (gini < 0.8) return 'High inequality - influence concentrated in few agents';
  return 'Extreme inequality - near-total concentration';
}

/**
 * Run AgentRank algorithm and display results
 *
 * @param topN - Number of top agents to display (default 20)
 */
async function runAgentRankCommand(topN: number = 20): Promise<void> {
  console.log('\nComputing global AgentRank scores...\n');

  const result = await computeAgentRank(undefined, topN);

  const displayCount = Math.min(topN, result.topAgents.length);

  console.log('='.repeat(80));
  console.log('AgentRank Results');
  console.log('='.repeat(80));
  console.log(`Iterations:             ${result.iterations}`);
  console.log(`Converged:              ${result.converged ? 'Yes' : 'No'}`);
  console.log(`Computation time:       ${result.computationTimeMs}ms`);
  console.log(`Total addresses ranked: ${result.ranks.size}`);
  console.log('-'.repeat(80));

  // Influence metrics
  const m = result.influenceMetrics;
  console.log('\nInfluence Distribution:');
  console.log(`  Gini Coefficient:  ${m.giniCoefficient.toFixed(4)}  (${interpretGini(m.giniCoefficient)})`);
  console.log(`  Shannon Entropy:   ${m.entropy.toFixed(4)} bits`);
  console.log(`  Top 10% Share:     ${(m.top10PctShare * 100).toFixed(2)}% of total rank`);
  console.log(`  Median Rank:       ${m.medianRank.toFixed(6)}`);

  // Rank distribution summary
  const rankValues = Array.from(result.ranks.values());
  const minRank = Math.min(...rankValues);
  const maxRank = Math.max(...rankValues);
  const avgRank = rankValues.reduce((a, b) => a + b, 0) / rankValues.length;

  console.log('\nRank Distribution:');
  console.log(`  Min:     ${minRank.toFixed(6)}`);
  console.log(`  Max:     ${maxRank.toFixed(6)}`);
  console.log(`  Average: ${avgRank.toFixed(6)}`);
  console.log(`  Ratio (max/min): ${minRank > 0 ? (maxRank / minRank).toFixed(2) + 'x' : 'N/A'}`);

  console.log('-'.repeat(80));
  console.log(`\nTop ${displayCount} Agents by Rank:\n`);

  for (let i = 0; i < displayCount; i++) {
    const agent = result.topAgents[i];
    console.log(formatAgentRankEntry(agent, i));
  }

  console.log('\n' + '='.repeat(80));
}

/**
 * Format a single AgentRank entry for display
 */
function formatAgentRankEntry(agent: { address: string; rank: number; inDegree: number; outDegree: number }, index: number): string {
  const prefix = `${(index + 1).toString().padStart(3)}. `;
  const rankStr = agent.rank.toFixed(6);
  const inStr = agent.inDegree.toString().padStart(4);
  const outStr = agent.outDegree.toString().padStart(4);

  return `${prefix}${agent.address}\n     Rank: ${rankStr} | In: ${inStr} | Out: ${outStr}`;
}

/**
 * Compute and display composite trust score for an address
 *
 * @param address - The address to evaluate
 * @param fromAddress - Optional source for personalized transitive trust
 */
async function runScoreCommand(address: string, fromAddress?: string): Promise<void> {
  console.log(`\nComputing composite trust score for: ${address}`);
  if (fromAddress) {
    console.log(`From perspective of: ${fromAddress}`);
  }
  console.log('');

  const result = await computeCompositeScore(address, fromAddress);

  const b = result.breakdown;

  // Derive effective weights (same logic as scoring engine)
  const baseWeights = { eigentrust: 0.4, agentrank: 0.3, transitiveTrust: 0.3 };
  let weights: { eigentrust: number; agentrank: number; transitiveTrust: number };

  if (fromAddress) {
    weights = { ...baseWeights };
  } else {
    const globalTotal = baseWeights.eigentrust + baseWeights.agentrank;
    weights = {
      eigentrust: baseWeights.eigentrust / globalTotal,
      agentrank: baseWeights.agentrank / globalTotal,
      transitiveTrust: 0,
    };
  }

  // Compute per-component contribution (weight * normalized * 100)
  const etContribution = weights.eigentrust * b.eigentrust.normalizedScore * 100;
  const arContribution = weights.agentrank * b.agentrank.normalizedScore * 100;
  const ttContribution = weights.transitiveTrust * b.transitiveTrust.score * 100;

  console.log('='.repeat(80));
  console.log('Composite Trust Score');
  console.log('='.repeat(80));
  console.log(`Address:    ${result.address}`);
  console.log(`Score:      ${result.compositeScore.toFixed(2)} / 100`);
  console.log(`Confidence: ${(result.confidence * 100).toFixed(1)}%`);
  console.log('-'.repeat(80));

  // Breakdown table with Weight and Contribution columns
  console.log('\n  Score Breakdown:\n');

  const col1 = 20;
  const col2 = 12;
  const col3 = 12;
  const col4 = 8;
  const col5 = 10;

  const pad = (s: string, w: number) => s.padEnd(w);
  const divider = '  +-'
    + '-'.repeat(col1) + '-+-'
    + '-'.repeat(col2) + '-+-'
    + '-'.repeat(col3) + '-+-'
    + '-'.repeat(col4) + '-+-'
    + '-'.repeat(col5) + '-+';

  console.log(divider);
  console.log(
    `  | ${pad('Component', col1)} | ${pad('Raw Score', col2)} | ${pad('Normalized', col3)} | ${pad('Weight', col4)} | ${pad('Contrib.', col5)} |`
  );
  console.log(divider);

  const row = (label: string, raw: string, norm: string, weight: string, contrib: string) => {
    console.log(
      `  | ${pad(label, col1)} | ${pad(raw, col2)} | ${pad(norm, col3)} | ${pad(weight, col4)} | ${pad(contrib, col5)} |`
    );
  };

  row(
    'EigenTrust',
    b.eigentrust.score.toFixed(6),
    b.eigentrust.normalizedScore.toFixed(4),
    `${(weights.eigentrust * 100).toFixed(0)}%`,
    etContribution.toFixed(2)
  );
  row(
    'AgentRank',
    b.agentrank.score.toFixed(6),
    b.agentrank.normalizedScore.toFixed(4),
    `${(weights.agentrank * 100).toFixed(0)}%`,
    arContribution.toFixed(2)
  );
  row(
    'Transitive Trust',
    b.transitiveTrust.score.toFixed(6),
    b.transitiveTrust.score.toFixed(4),
    `${(weights.transitiveTrust * 100).toFixed(0)}%`,
    ttContribution.toFixed(2)
  );

  console.log(divider);
  console.log(
    `  | ${pad('TOTAL', col1)} | ${pad('', col2)} | ${pad('', col3)} | ${pad('100%', col4)} | ${pad(result.compositeScore.toFixed(2), col5)} |`
  );
  console.log(divider);

  // Metadata
  console.log(`\n  Network:  ${result.metadata.totalNodes} nodes`);
  console.log(`  Compute:  ${result.metadata.computeTimeMs}ms`);
  console.log(`  Data age: ${result.metadata.dataFreshness.toISOString()}`);

  // Interpretation
  console.log('-'.repeat(80));
  console.log('\nInterpretation:');
  const cs = result.compositeScore;
  if (cs >= 80) {
    console.log('  Highly trusted — strong global reputation and influence.');
  } else if (cs >= 60) {
    console.log('  Well trusted — solid reputation across multiple signals.');
  } else if (cs >= 40) {
    console.log('  Moderately trusted — some presence in the network.');
  } else if (cs >= 20) {
    console.log('  Low trust — limited network activity or reputation.');
  } else {
    console.log('  Minimal trust — very little network presence or new address.');
  }

  console.log('\n' + '='.repeat(80));
}

/**
 * Run sybil attack simulation and display results
 *
 * @param numNodes - Number of sybil nodes to inject
 * @param targetAddress - Optional target address to boost
 */
async function runSybilCommand(numNodes: number, targetAddress?: string): Promise<void> {
  // Collusion edges scale with node count: ~4 edges per sybil node
  const numCollusionEdges = numNodes * 4;

  console.log('\n' + '='.repeat(80));
  console.log('Sybil Attack Simulation');
  console.log('='.repeat(80));
  console.log(`Sybil nodes:      ${numNodes}`);
  console.log(`Collusion edges:  ${numCollusionEdges}`);
  console.log(`Stake per edge:   0.01 ETH`);
  if (targetAddress) {
    console.log(`Target address:   ${targetAddress}`);
  }
  console.log('-'.repeat(80));

  const phaseMessages: Record<string, string> = {
    baseline:  'Computing baseline scores on clean graph...',
    injecting: `Creating ${numNodes} sybil nodes with ${numCollusionEdges} collusion edges...`,
    computing: 'Running algorithms on contaminated graph...',
    cleanup:   'Cleaning up sybil nodes...',
    done:      'Comparing results...',
  };

  const result = await simulateSybilAttack({
    numSybilNodes: numNodes,
    numCollusionEdges,
    targetAddress,
    onProgress: (phase: string) => {
      const msg = phaseMessages[phase];
      if (msg) {
        console.log(`\n  [*] ${msg}`);
      }
    },
  });

  const im = result.impact;

  // ---- Summary ----
  console.log('\n' + '-'.repeat(80));
  console.log(`Sybil nodes created:  ${result.sybilNodesCreated}`);
  console.log(`Sybil edges created:  ${result.sybilEdgesCreated}`);
  console.log(`Computation time:     ${result.computationTimeMs}ms`);

  // ---- Results Table ----
  const hasTarget = targetAddress && im.targetBoostEigentrust !== undefined;

  console.log('\n' + '-'.repeat(80));
  console.log('\n  Results:\n');

  // Column widths
  const col1 = 22; // Metric name
  const col2 = 14; // EigenTrust value
  const col3 = 14; // AgentRank value

  const hdr = (s: string, w: number) => s.padEnd(w);
  const divider = '  +-' + '-'.repeat(col1) + '-+-' + '-'.repeat(col2) + '-+-' + '-'.repeat(col3) + '-+';

  console.log(divider);
  console.log(`  | ${hdr('Metric', col1)} | ${hdr('EigenTrust', col2)} | ${hdr('AgentRank', col3)} |`);
  console.log(divider);

  // Row helper
  const row = (label: string, etVal: string, arVal: string) => {
    console.log(`  | ${hdr(label, col1)} | ${hdr(etVal, col2)} | ${hdr(arVal, col3)} |`);
  };

  row(
    'Resistance Score',
    im.eigentrustResistance.toFixed(4),
    im.agentrankResistance.toFixed(4)
  );
  row(
    'Max Score Change',
    im.maxScoreChangeEigentrust.toFixed(6),
    im.maxScoreChangeAgentrank.toFixed(6)
  );
  row(
    'Avg Score Change',
    im.avgScoreChangeEigentrust.toFixed(6),
    im.avgScoreChangeAgentrank.toFixed(6)
  );

  if (hasTarget) {
    const etBoost = im.targetBoostEigentrust!;
    const arBoost = im.targetBoostAgentrank!;
    row(
      'Target Boost',
      (etBoost >= 0 ? '+' : '') + etBoost.toFixed(6),
      (arBoost >= 0 ? '+' : '') + arBoost.toFixed(6)
    );
  }

  console.log(divider);

  // ---- Resistance Bars ----
  console.log('\n  Resistance:');
  console.log(`    EigenTrust:  ${resistanceBar(im.eigentrustResistance)}  ${(im.eigentrustResistance * 100).toFixed(0)}%`);
  console.log(`    AgentRank:   ${resistanceBar(im.agentrankResistance)}  ${(im.agentrankResistance * 100).toFixed(0)}%`);

  // ---- Target Detail ----
  if (hasTarget) {
    const etBase = result.baselineScores.eigentrust.get(targetAddress!) || 0;
    const arBase = result.baselineScores.agentrank.get(targetAddress!) || 0;
    const etBoost = im.targetBoostEigentrust!;
    const arBoost = im.targetBoostAgentrank!;

    console.log(`\n  Target Score Change (${targetAddress}):`);
    console.log(`    EigenTrust:  ${etBase.toFixed(6)} -> ${(etBase + etBoost).toFixed(6)}`);
    console.log(`    AgentRank:   ${arBase.toFixed(6)} -> ${(arBase + arBoost).toFixed(6)}`);
  }

  // ---- Verdict ----
  console.log('\n' + '-'.repeat(80));
  const etPct = Math.round(im.eigentrustResistance * 100);
  const arPct = Math.round(im.agentrankResistance * 100);

  console.log(
    `\n  Verdict: EigenTrust showed ${classifyResistance(im.eigentrustResistance)} sybil resistance (${etPct}%).` +
    `\n           AgentRank showed ${classifyResistance(im.agentrankResistance)} sybil resistance (${arPct}%).`
  );

  console.log('\n' + '='.repeat(80));
}

/**
 * Visual bar for resistance score (20-char width)
 */
function resistanceBar(resistance: number): string {
  const filled = Math.round(resistance * 20);
  const empty = 20 - filled;
  return '[' + '#'.repeat(filled) + '-'.repeat(empty) + ']';
}

/**
 * Classify resistance for the verdict line
 */
function classifyResistance(resistance: number): string {
  if (resistance >= 0.95) return 'excellent';
  if (resistance >= 0.85) return 'strong';
  if (resistance >= 0.70) return 'moderate';
  if (resistance >= 0.50) return 'weak';
  return 'poor';
}

/**
 * Run debug diagnostics to find addresses with connections
 */
async function runDebugCommand(): Promise<void> {
  console.log('\nRunning graph diagnostics...\n');

  const session = getSession();

  try {
    console.log('='.repeat(80));
    console.log('Graph Diagnostics');
    console.log('='.repeat(80));

    // Top 10 addresses by OUTGOING attestation count
    console.log('\nTop 10 Addresses by OUTGOING Attestations:\n');
    const outgoingResult = await session.run(`
      MATCH (a:Address)-[r:ATTESTS]->(b:Address)
      RETURN a.id as address, count(r) as outgoing
      ORDER BY outgoing DESC
      LIMIT 10
    `);

    for (const record of outgoingResult.records) {
      const addr = record.get('address');
      const count = record.get('outgoing').toNumber();
      console.log(`  ${addr}`);
      console.log(`    Outgoing: ${count}`);
    }

    // Top 10 addresses by INCOMING attestation count
    console.log('\n' + '-'.repeat(80));
    console.log('\nTop 10 Addresses by INCOMING Attestations:\n');
    const incomingResult = await session.run(`
      MATCH (a:Address)-[r:ATTESTS]->(b:Address)
      RETURN b.id as address, count(r) as incoming
      ORDER BY incoming DESC
      LIMIT 10
    `);

    for (const record of incomingResult.records) {
      const addr = record.get('address');
      const count = record.get('incoming').toNumber();
      console.log(`  ${addr}`);
      console.log(`    Incoming: ${count}`);
    }

    // Sample edges
    console.log('\n' + '-'.repeat(80));
    console.log('\nSample Edges (first 20):\n');
    const edgesResult = await session.run(`
      MATCH (a:Address)-[r:ATTESTS]->(b:Address)
      RETURN a.id as fromAddr, b.id as toAddr, r.predicate as predicate, r.stakeAmount as stake
      LIMIT 20
    `);

    for (let i = 0; i < edgesResult.records.length; i++) {
      const record = edgesResult.records[i];
      const from = record.get('fromAddr');
      const to = record.get('toAddr');
      const predicate = record.get('predicate') || 'unknown';
      const stake = record.get('stake');
      const stakeNum = stake && stake.toNumber ? stake.toNumber() : stake;

      console.log(`${(i + 1).toString().padStart(2)}. FROM: ${from}`);
      console.log(`    TO:   ${to}`);
      console.log(`    Predicate: ${predicate} | Stake: ${stakeNum}`);
      console.log('');
    }

    // Find addresses that both give AND receive attestations (good for path testing)
    console.log('-'.repeat(80));
    console.log('\nAddresses with BOTH Outgoing AND Incoming (best for path testing):\n');
    const bothResult = await session.run(`
      MATCH (a:Address)-[r1:ATTESTS]->(b:Address)
      WITH a, count(r1) as outgoing
      WHERE outgoing > 0
      MATCH (c:Address)-[r2:ATTESTS]->(a)
      WITH a, outgoing, count(r2) as incoming
      WHERE incoming > 0
      RETURN a.id as address, outgoing, incoming
      ORDER BY outgoing + incoming DESC
      LIMIT 10
    `);

    if (bothResult.records.length === 0) {
      console.log('  No addresses found with both incoming and outgoing attestations.');
    } else {
      for (const record of bothResult.records) {
        const addr = record.get('address');
        const outgoing = record.get('outgoing').toNumber();
        const incoming = record.get('incoming').toNumber();
        console.log(`  ${addr}`);
        console.log(`    Outgoing: ${outgoing} | Incoming: ${incoming}`);
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('\nTip: Use addresses from "OUTGOING" list as source, "INCOMING" as target for path queries.');
    console.log('Example: npm run dev paths <outgoing-addr> <incoming-addr>');
    console.log('='.repeat(80));

  } finally {
    await session.close();
  }
}

// CLI interface when run directly
async function main(): Promise<void> {
  const command = process.argv[2];

  try {
    await initialize();

    switch (command) {
      case 'sync':
        const maxPages = process.argv[3] ? parseInt(process.argv[3], 10) : undefined;
        await runSync({ maxPages });
        break;

      case 'stats':
        const stats = await getGraphStats();
        console.log('\nGraph Statistics:');
        console.log(JSON.stringify(stats, null, 2));
        break;

      case 'query':
        const address = process.argv[3];
        if (!address) {
          console.error('Usage: npm run dev query <address>');
          return;
        }
        const attestations = await getAttestationsForAddress(address);
        console.log('\nAttestations for', address);
        console.log(JSON.stringify(attestations, null, 2));
        break;

      case 'verify':
        const isConnected = await verifyConnection();
        console.log('Connection status:', isConnected ? 'OK' : 'FAILED');
        break;

      case 'eigentrust':
        await runEigenTrustCommand();
        break;

      case 'agentrank': {
        const topIdx = process.argv.indexOf('--top');
        const agentRankTopN = topIdx !== -1 && process.argv[topIdx + 1]
          ? parseInt(process.argv[topIdx + 1], 10)
          : 20;
        await runAgentRankCommand(agentRankTopN);
        break;
      }

      case 'score': {
        const scoreAddr = process.argv[3];
        if (!scoreAddr) {
          console.error('Usage: npm run dev score <address> [--from <address>]');
          return;
        }
        const fromIdx = process.argv.indexOf('--from');
        const scoreFrom = fromIdx !== -1 && process.argv[fromIdx + 1]
          ? process.argv[fromIdx + 1]
          : undefined;
        await runScoreCommand(scoreAddr, scoreFrom);
        break;
      }

      case 'trust':
        const fromAddr = process.argv[3];
        const toAddr = process.argv[4];
        if (!fromAddr || !toAddr) {
          console.error('Usage: npm run dev trust <fromAddress> <toAddress>');
          return;
        }
        await runTrustCommand(fromAddr, toAddr);
        break;

      case 'network':
        const sourceAddr = process.argv[3];
        const hops = process.argv[4] ? parseInt(process.argv[4], 10) : 3;
        if (!sourceAddr) {
          console.error('Usage: npm run dev network <address> [maxHops]');
          return;
        }
        await runNetworkCommand(sourceAddr, hops);
        break;

      case 'paths':
        const pathFrom = process.argv[3];
        const pathTo = process.argv[4];
        const pathHops = process.argv[5] ? parseInt(process.argv[5], 10) : 3;
        if (!pathFrom || !pathTo) {
          console.error('Usage: npm run dev paths <fromAddress> <toAddress> [maxHops]');
          return;
        }
        await runPathsCommand(pathFrom, pathTo, pathHops);
        break;

      case 'sybil': {
        const nodesIdx = process.argv.indexOf('--nodes');
        const sybilNodes = nodesIdx !== -1 && process.argv[nodesIdx + 1]
          ? parseInt(process.argv[nodesIdx + 1], 10)
          : 50;
        const targetIdx = process.argv.indexOf('--target');
        const sybilTarget = targetIdx !== -1 && process.argv[targetIdx + 1]
          ? process.argv[targetIdx + 1]
          : undefined;
        await runSybilCommand(sybilNodes, sybilTarget);
        break;
      }

      case 'debug':
        await runDebugCommand();
        break;

      default:
        console.log(`
Intuition Trust Engine CLI

Usage:
  npm run dev sync [maxPages]  - Sync data from Intuition API
  npm run dev stats            - Show graph statistics
  npm run dev query <address>  - Query attestations for an address
  npm run dev verify           - Verify database connection

Trust Algorithms:
  npm run dev eigentrust                      - Compute global EigenTrust scores
  npm run dev agentrank [--top N]              - Compute global AgentRank (PageRank) scores
  npm run dev score <addr> [--from <addr>]    - Composite trust score (main API)
  npm run dev trust <from> <to>               - Compute trust from one address to another
  npm run dev network <address> [maxHops]     - Compute trust network from an address
  npm run dev paths <from> <to> [maxHops]     - Find trust paths between addresses

Security Analysis:
  npm run dev sybil [--nodes N] [--target addr] - Run sybil attack simulation

Diagnostics:
  npm run dev debug                           - Show graph connection diagnostics

Examples:
  npm run dev sync 5                          - Sync first 5 pages
  npm run dev query 0x1234...                 - Get attestations for address
  npm run dev score 0xabc... --from 0xdef...   - Composite score from a perspective
  npm run dev trust 0xabc... 0xdef...         - How much should 0xabc trust 0xdef?
  npm run dev agentrank --top 50              - Show top 50 agents by PageRank
  npm run dev sybil --nodes 100 --target 0xabc - Sybil test with 100 nodes targeting 0xabc
  npm run dev network 0xabc... 2              - Trust network within 2 hops
        `);
        break;
    }
  } catch (error) {
    log('error', 'Command failed', { error: String(error) });
  } finally {
    await shutdown();
  }
}

// Route based on server mode — HTTP starts Express first, CLI runs commands directly
const serverMode = process.env.SERVER_MODE || 'cli';

if (serverMode === 'http') {
  runHttpServer().catch((error) => {
    console.error('Fatal HTTP server error:', error);
  });
} else {
  main();
}
