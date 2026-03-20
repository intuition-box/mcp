import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { getMcpBySlug } from '@/lib/mcp-registry';

export const maxDuration = 300;

const TIMEOUT_MS = 300000;

export async function POST(request: NextRequest) {
  let body: { slug?: string; toolName?: string; arguments?: Record<string, unknown> };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { slug, toolName, arguments: toolArgs } = body;

  if (!slug || !toolName) {
    return NextResponse.json({ error: 'Missing slug or toolName' }, { status: 400 });
  }

  const entry = getMcpBySlug(slug);
  if (!entry) {
    return NextResponse.json({ error: 'Unknown MCP server' }, { status: 404 });
  }

  let client: Client | null = null;

  try {
    const mcpUrl = new URL('/mcp', entry.serverUrl);
    client = new Client({ name: 'playground-caller', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(mcpUrl);

    const connectAndCall = async () => {
      await client!.connect(transport);
      return client!.callTool({ name: toolName, arguments: toolArgs ?? {} });
    };

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Request timed out')), TIMEOUT_MS)
    );

    const result = await Promise.race([connectAndCall(), timeout]);
    return NextResponse.json({ result });
  } catch (streamableError) {
    if (client) {
      client.close().catch(() => {});
      client = null;
    }

    try {
      const sseUrl = new URL('/sse', entry.serverUrl);
      client = new Client({ name: 'playground-caller', version: '1.0.0' });
      const sseTransport = new SSEClientTransport(sseUrl);

      const connectAndCall = async () => {
        await client!.connect(sseTransport);
        return client!.callTool({ name: toolName, arguments: toolArgs ?? {} });
      };

      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('SSE request timed out')), TIMEOUT_MS)
      );

      const result = await Promise.race([connectAndCall(), timeout]);
      return NextResponse.json({ result });
    } catch (sseError) {
      const streamMsg = streamableError instanceof Error ? streamableError.message : String(streamableError);
      const sseMsg = sseError instanceof Error ? sseError.message : String(sseError);
      return NextResponse.json(
        {
          error: 'Failed to call tool',
          details: `StreamableHTTP: ${streamMsg}; SSE: ${sseMsg}`,
        },
        { status: 502 }
      );
    }
  } finally {
    if (client) {
      client.close().catch(() => {});
    }
  }
}
