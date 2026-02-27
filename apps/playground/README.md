# Intuition MCP Server

A Model Context Protocol (MCP) server that enables AI agents to query trust scores, attestations, and reputation data from Intuition's decentralized knowledge graph.

## Overview

This project provides a standardized interface for AI agents like Claude and ChatGPT to access Intuition's attestation system. Built using the Model Context Protocol, it exposes four core tools for querying trust data and verifying credentials on-chain.

## Features

- **Trust Score Calculation** - Aggregate trust scores for Ethereum addresses based on attestation patterns
- **Attestation Queries** - Search and filter attestations with flexible parameters
- **Credential Verification** - Verify specific claims and credentials for addresses
- **Expert Discovery** - Find highly trusted addresses in specific domains
- **ENS Support** - Resolve ENS names to Ethereum addresses
- **RESTful API** - HTTP endpoints for direct integration
- **Interactive Dashboard** - Web-based testing interface

## Tech Stack

- Next.js 14 (App Router)
- TypeScript
- MCP SDK (@modelcontextprotocol/sdk)
- GraphQL (graphql-request)
- Tailwind CSS + shadcn/ui
- Vercel (deployment)

## Installation
```bash
git clone https://github.com/rudazy/Intuition-.git
cd Intuition-
npm install
```

## Configuration

Create a `.env.local` file:
```env
NEXT_PUBLIC_INTUITION_GRAPH_URL=https://mainnet.intuition.sh/v1/graphql
NEXT_PUBLIC_CHAIN_ID=1155
NEXT_PUBLIC_RPC_URL=https://rpc.intuition.systems/http
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Development
```bash
npm run dev
```

Visit http://localhost:3000 to access the dashboard.

## MCP Server Usage

### Claude Desktop Configuration

Add to your Claude Desktop config file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
```json
{
  "mcpServers": {
    "intuition": {
      "command": "node",
      "args": ["/path/to/Intuition-/lib/mcp/server.js"]
    }
  }
}
```

### Available Tools

**getTrustScore(address: string)**
- Returns aggregated trust score and breakdown

**getAttestations(filters: object)**
- Query attestations with optional filters

**verifyCredential(address: string, claim: string)**
- Verify specific credentials for an address

**findTrustedExperts(topic: string, limit: number)**
- Discover highly trusted addresses in a domain

## API Endpoints
```bash
# Get trust score
GET /api/trust-score?address=0x...

# Query attestations
GET /api/attestations?subject=0x...

# Execute MCP tool
POST /api/mcp
{
  "tool": "getTrustScore",
  "params": { "address": "0x..." }
}
```

## Network Information

- **Chain ID**: 1155 (Intuition Mainnet)
- **RPC**: https://rpc.intuition.systems/http
- **Explorer**: https://explorer.intuition.systems
- **GraphQL**: https://mainnet.intuition.sh/v1/graphql (Mainnet data)

**Note**: The GraphQL API indexes mainnet attestation data. The blockchain operates on mainnet (Chain 1155), and attestation queries return mainnet results.

## Project Structure
```
/app
  /api              # API routes
  /dashboard        # Interactive UI
  /docs             # Documentation
/lib
  /intuition        # Intuition client
  /mcp              # MCP server logic
/components
  /ui               # UI components
```

## Deployment

The application is deployed at: https://www.intuitionmcp.xyz

Deploy your own:
```bash
vercel --prod
```

## Use Cases

- AI-powered credential verification
- Trust-gated content access
- Reputation-based filtering
- Expert discovery systems
- Decentralized identity verification

## Trust Score Algorithm

### Current Implementation (MVP)

The trust score calculation uses:

- **Predicate Weighting**: Hardcoded weights for common predicates (verified=1.5x, trusted=1.3x, expert=1.2x)
- **Normalization**: Scores normalized as percentage of total attestations
- **Positive/Negative Signals**: Tracks both endorsements and warnings

### Future Enhancements

**Transitive Trust Computation**
- Implement relative trust scores using graph traversal
- Integration with [EAS Transitive Trust SDK](https://github.com/ethereum-attestation-service/transitive-trust-sdk)
- Read more: [Transitive Trust Model](https://mirror.xyz/0xeee68aECeB4A9e9f328a46c39F50d83fA0239cDF)

**Graph Indexer**
- Current GraphQL limitations prevent deep graph traversal
- Future: Spark-based indexer for full trust graph analysis
- Enable computation of network effects and trust propagation

**Governance-Based Weights**
- Move from hardcoded to community-governed predicate weights
- Implement whitelist of high-quality predicates
- Dynamic weight adjustment based on network consensus

**Minimum Stake Threshold**
- Filter attestations below minimum TRUST token stake
- Configurable threshold (currently MVP without filtering)
- Normalize by user's total position rather than absolute stake

## Contributing

This project was built for the Intuition Ecosystem Grant program.

## Links

- [Live Demo](https://www.intuitionmcp.xyz)
- [Video demo](https://youtu.be/um_NLbhYy6s)
- [Intuition Portal](https://portal.intuition.systems/)
- [Intuition Documentation](https://docs.intuition.systems/)
- [MCP Documentation](https://modelcontextprotocol.io/)

## License

MIT License

---

Built with Next.js, TypeScript, and the Model Context Protocol.
