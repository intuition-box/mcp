import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import {
  tools,
  handleGetTrustScore,
  handleGetAttestations,
  handleVerifyCredential,
  handleFindTrustedExperts,
} from './tools.js';

/**
 * Intuition MCP Server
 *
 * Provides Model Context Protocol (MCP) tools for interacting with the Intuition attestation system.
 * This server exposes four main tools:
 * - getTrustScore: Get trust score for an address
 * - getAttestations: Query attestations with filters
 * - verifyCredential: Verify if an address has a specific claim
 * - findTrustedExperts: Find trusted experts in a topic
 */
class IntuitionMCPServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'intuition-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
    this.setupErrorHandling();
  }

  private setupHandlers() {
    // Handle tool listing requests
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools,
      };
    });

    // Handle tool execution requests
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: params } = request.params;

      try {
        let result: any;

        switch (name) {
          case 'getTrustScore':
            result = await handleGetTrustScore(params || {});
            break;

          case 'getAttestations':
            result = await handleGetAttestations(params || {});
            break;

          case 'verifyCredential':
            result = await handleVerifyCredential(params || {});
            break;

          case 'findTrustedExperts':
            result = await handleFindTrustedExperts(params || {});
            break;

          default:
            throw new Error(`Unknown tool: ${name}`);
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

        // Log error for debugging
        console.error(`Error executing tool ${name}:`, error);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  error: errorMessage,
                  tool: name,
                  params,
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }
    });
  }

  private setupErrorHandling() {
    this.server.onerror = (error) => {
      console.error('[MCP Server Error]:', error);
    };

    process.on('SIGINT', async () => {
      console.log('\nShutting down Intuition MCP server...');
      await this.server.close();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('\nShutting down Intuition MCP server...');
      await this.server.close();
      process.exit(0);
    });
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Intuition MCP server running on stdio');
  }
}

// Start the server
const server = new IntuitionMCPServer();
server.start().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
