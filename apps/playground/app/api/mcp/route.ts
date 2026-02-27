import { NextRequest, NextResponse } from 'next/server';
import {
  handleGetTrustScore,
  handleGetAttestations,
  handleVerifyCredential,
  handleFindTrustedExperts,
} from '@/lib/mcp/tools';

/**
 * POST /api/mcp
 *
 * MCP tool execution endpoint
 *
 * Request body:
 * {
 *   "tool": "getTrustScore" | "getAttestations" | "verifyCredential" | "findTrustedExperts",
 *   "params": { ... }
 * }
 *
 * Example:
 * {
 *   "tool": "getTrustScore",
 *   "params": {
 *     "address": "0x1234567890123456789012345678901234567890"
 *   }
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tool, params } = body;

    // Validate request body
    if (!tool) {
      return NextResponse.json(
        { error: 'Missing required field: tool' },
        { status: 400 }
      );
    }

    if (!params || typeof params !== 'object') {
      return NextResponse.json(
        { error: 'Missing or invalid params object' },
        { status: 400 }
      );
    }

    let result: any;

    // Route to appropriate tool handler
    switch (tool) {
      case 'getTrustScore':
        result = await handleGetTrustScore(params);
        break;

      case 'getAttestations':
        result = await handleGetAttestations(params);
        break;

      case 'verifyCredential':
        result = await handleVerifyCredential(params);
        break;

      case 'findTrustedExperts':
        result = await handleFindTrustedExperts(params);
        break;

      default:
        return NextResponse.json(
          {
            error: `Unknown tool: ${tool}`,
            availableTools: [
              'getTrustScore',
              'getAttestations',
              'verifyCredential',
              'findTrustedExperts',
            ],
          },
          { status: 400 }
        );
    }

    return NextResponse.json({
      success: true,
      tool,
      data: result,
    });
  } catch (error) {
    console.error('Error executing MCP tool:', error);

    // Handle validation errors (from Zod)
    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json(
        {
          success: false,
          error: 'Validation error',
          details: error.message,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to execute tool',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/mcp
 *
 * Get available MCP tools and their schemas
 */
export async function GET() {
  return NextResponse.json({
    success: true,
    tools: [
      {
        name: 'getTrustScore',
        description: 'Get trust score for an Ethereum address',
        params: {
          address: 'string (Ethereum address)',
        },
        example: {
          tool: 'getTrustScore',
          params: {
            address: '0x1234567890123456789012345678901234567890',
          },
        },
      },
      {
        name: 'getAttestations',
        description: 'Query attestations with filters',
        params: {
          creator: 'string (optional)',
          subject: 'string (optional)',
          predicate: 'string (optional)',
          object: 'string (optional)',
          minConfidence: 'number 0-1 (optional)',
          fromTimestamp: 'number (optional)',
          toTimestamp: 'number (optional)',
          limit: 'number 1-1000 (optional)',
          offset: 'number (optional)',
        },
        example: {
          tool: 'getAttestations',
          params: {
            subject: '0x1234567890123456789012345678901234567890',
            limit: 50,
          },
        },
      },
      {
        name: 'verifyCredential',
        description: 'Verify if an address has a specific credential',
        params: {
          address: 'string (Ethereum address)',
          claim: 'string',
        },
        example: {
          tool: 'verifyCredential',
          params: {
            address: '0x1234567890123456789012345678901234567890',
            claim: 'expert-in-defi',
          },
        },
      },
      {
        name: 'findTrustedExperts',
        description: 'Find trusted experts in a topic',
        params: {
          topic: 'string',
          limit: 'number 1-100 (optional, default: 10)',
        },
        example: {
          tool: 'findTrustedExperts',
          params: {
            topic: 'solidity',
            limit: 10,
          },
        },
      },
    ],
  });
}
