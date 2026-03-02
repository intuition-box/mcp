# Intuition MCP Monorepo

Model Context Protocol servers for the [Intuition](https://intuition.systems) knowledge graph and trust network. Ships two MCP servers and an interactive playground for exploring them.

**Playground:** [mcp.intuition.box](https://mcp.intuition.box)

## Monorepo Structure

```
├── packages/
│   ├── mcp-general/       # @intuition-box/mcp-general — Intuition knowledge graph MCP
│   │                        8 tools: accounts, followers, relations, atoms, lists
│   └── mcp-trust/         # @intuition-box/mcp-trust — Trust scoring MCP
│                            7 tools: EigenTrust, AgentRank, sybil detection, composite scores
├── apps/
│   └── playground/        # Next.js app — MCP directory, per-server playgrounds, docs
└── package.json           # npm workspaces root
```

## Getting Started

### Prerequisites

- Node.js >= 18
- npm >= 9 (ships with Node 18+)

### Quick Start

```bash
git clone https://github.com/intuition-box/mcp.git
cd mcp
npm install
npm run dev
```

`npm run dev` starts the playground at [http://localhost:3000](http://localhost:3000).

> **Note:** An `.npmrc` with `legacy-peer-deps=true` is checked in so `npm install` works without extra flags.

### Running Individual Packages

```bash
# Intuition MCP server (watch mode)
npm run dev --workspace packages/mcp-general

# Trust Score MCP server
npm run dev --workspace packages/mcp-trust
```

### Building

```bash
# Build all workspaces
npm run build

# Build a single package
npm run build --workspace packages/mcp-general
npm run build --workspace packages/mcp-trust
```

### Testing

```bash
# Run all workspace tests
npm test

# Run tests for a specific package
npm test --workspace packages/mcp-trust
```

## Claude Desktop Integration

Add both servers to your Claude Desktop config to give Claude access to the full Intuition toolkit.

**Config file location:**
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "intuition": {
      "command": "node",
      "args": ["/absolute/path/to/mcp/packages/mcp-general/dist/index.js"],
      "env": {
        "NEXT_PUBLIC_INTUITION_GRAPH_URL": "https://graph.intuition.systems/graphql"
      }
    },
    "trust-score": {
      "command": "node",
      "args": ["/absolute/path/to/mcp/packages/mcp-trust/dist/index.js"],
      "env": {
        "NEXT_PUBLIC_INTUITION_GRAPH_URL": "https://graph.intuition.systems/graphql"
      }
    }
  }
}
```

Replace `/absolute/path/to/mcp` with the path where you cloned the repo. Restart Claude Desktop after saving.

## Packages

### @intuition-box/mcp-general

MCP server for the Intuition knowledge graph. Provides read access to accounts, relationships, atoms, and curated lists.

| Tool | Description |
|---|---|
| `get-account-info` | Retrieve profile and metadata for an account |
| `get-followers` | List accounts following a given account |
| `get-following` | List accounts a given account follows |
| `get-inbound-relations` | Inbound relation edges pointing to an account |
| `get-outgoing-edges` | Outgoing relation edges from an account |
| `search-account-ids` | Search account identifiers by query string |
| `search-atoms` | Search atoms by label or content |
| `search-lists` | Search curated lists |

### @intuition-box/mcp-trust

Trust computation engine over the Intuition attestation graph. Implements EigenTrust, AgentRank, sybil detection, and path-based trust.

| Tool | Description |
|---|---|
| `eigentrust` | Compute EigenTrust scores for agents in the trust graph |
| `agentrank` | Rank agents using AgentRank over attestation edges |
| `composite-score` | Weighted composite trust score from multiple signals |
| `sybil-simulation` | Sybil-resistance simulation for fake identity detection |
| `transitive-trust` | Transitive trust between two agents across paths |
| `network-stats` | Aggregate statistics about trust network topology |
| `trust-path` | Strongest trust path between source and target agents |

## License

MIT
