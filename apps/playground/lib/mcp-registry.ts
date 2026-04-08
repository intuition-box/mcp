/**
 * MCP Registry — canonical source of truth for all available MCP servers
 * in the Intuition ecosystem.
 *
 * The registry is immutable at runtime (readonly types + Object.freeze)
 * to prevent accidental mutation from consumer code.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Provenance status of an MCP server. */
export type McpStatus = 'official' | 'community';

/** A single tool exposed by an MCP server. */
export interface McpTool {
  readonly name: string;
  readonly description: string;
}

/** A registered MCP server entry. */
export interface McpEntry {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** URL-safe slug used for client-side routing. */
  readonly slug: string;
  readonly status: McpStatus;
  readonly tools: readonly McpTool[];
  /** Remote server URL. Empty string when not yet deployed. */
  readonly serverUrl: string;
}

// ---------------------------------------------------------------------------
// Registry data
// ---------------------------------------------------------------------------

const registry: readonly McpEntry[] = Object.freeze([
  Object.freeze<McpEntry>({
    id: 'intuition-official',
    name: 'Intuition MCP',
    description:
      'Official Model Context Protocol server for the Intuition knowledge graph. ' +
      'Provides read access to accounts, relationships, atoms, and list data ' +
      'across the Intuition network.',
    slug: 'official',
    status: 'official',
    tools: Object.freeze<McpTool[]>([
      {
        name: 'get-account-info',
        description: 'Retrieve detailed profile and metadata for an Intuition account.',
      },
      {
        name: 'get-followers',
        description: 'List accounts that follow a given account.',
      },
      {
        name: 'get-following',
        description: 'List accounts that a given account is following.',
      },
      {
        name: 'get-inbound-relations',
        description: 'Retrieve inbound relation edges pointing to an account.',
      },
      {
        name: 'get-outgoing-edges',
        description: 'Retrieve outgoing relation edges originating from an account.',
      },
      {
        name: 'search-account-ids',
        description: 'Search for account identifiers matching a query string.',
      },
      {
        name: 'search-atoms',
        description: 'Search atoms in the knowledge graph by label or content.',
      },
      {
        name: 'search-lists',
        description: 'Search curated lists within the Intuition network.',
      },
    ]),
    serverUrl: process.env.NEXT_PUBLIC_MCP_GENERAL_URL || 'http://localhost:3001',
  }),

  Object.freeze<McpEntry>({
    id: 'trust-score',
    name: 'Trust Score MCP',
    description:
      'MCP server for graph-based trust computation. Implements EigenTrust, ' +
      'AgentRank, sybil detection, and composite scoring over the Intuition ' +
      'attestation graph.',
    slug: 'trust-score',
    status: 'community',
    tools: Object.freeze<McpTool[]>([
      {
        name: 'eigentrust',
        description: 'Compute EigenTrust scores for a set of agents in the trust graph.',
      },
      {
        name: 'agentrank',
        description: 'Rank agents using the AgentRank algorithm over attestation edges.',
      },
      {
        name: 'composite-score',
        description:
          'Generate a weighted composite trust score combining multiple trust signals.',
      },
      {
        name: 'sybil-simulation',
        description: 'Run a sybil-resistance simulation to detect coordinated fake identities.',
      },
      {
        name: 'transitive-trust',
        description: 'Calculate transitive trust between two agents across intermediate paths.',
      },
      {
        name: 'network-stats',
        description: 'Return aggregate statistics about the trust network topology.',
      },
      {
        name: 'trust-path',
        description: 'Find the strongest trust path between a source and target agent.',
      },
      {
        name: 'get_sync_status',
        description:
          'Returns the current auto-sync cron job status -- whether it is running, ' +
          'next scheduled run, last run time, and whether the last run succeeded.',
      },
    ]),
    serverUrl: process.env.NEXT_PUBLIC_MCP_TRUST_URL || 'http://localhost:3002',
  }),
]);

// ---------------------------------------------------------------------------
// Accessors
// ---------------------------------------------------------------------------

/** Slug validation pattern — lowercase alphanumeric and hyphens only. */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Return the full registry array.
 *
 * The returned reference is frozen; callers cannot add, remove, or mutate
 * entries.
 */
export function getMcpRegistry(): readonly McpEntry[] {
  return registry;
}

/**
 * Look up a single MCP entry by its URL slug.
 *
 * @param slug - URL-safe identifier (e.g. `"official"`, `"trust-score"`).
 * @returns The matching `McpEntry`, or `undefined` if no match is found or
 *          the slug format is invalid.
 */
export function getMcpBySlug(slug: string): McpEntry | undefined {
  if (!SLUG_PATTERN.test(slug)) {
    return undefined;
  }
  return registry.find((entry) => entry.slug === slug);
}
