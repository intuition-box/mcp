import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { getMcpBySlug } from '@/lib/mcp-registry';

const TIMEOUT_MS = 8000;

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get('slug');

  if (!slug) {
    return NextResponse.json({ error: 'Missing slug parameter' }, { status: 400 });
  }

  const entry = getMcpBySlug(slug);
  if (!entry) {
    return NextResponse.json({ error: 'Unknown MCP server' }, { status: 404 });
  }

  let client: Client | null = null;

  try {
    const mcpUrl = new URL('/mcp', entry.serverUrl);
    client = new Client({ name: 'playground-inspector', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(mcpUrl);

    const connectAndFetch = async () => {
      await client!.connect(transport);
      return client!.listTools();
    };

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Connection timed out')), TIMEOUT_MS)
    );

    const result = await Promise.race([connectAndFetch(), timeout]);

    return NextResponse.json({ tools: result.tools, serverUrl: entry.serverUrl });
  } catch (streamableError) {
    // StreamableHTTP failed — close the client before retrying with SSE
    if (client) {
      client.close().catch(() => {});
      client = null;
    }

    try {
      const sseUrl = new URL('/sse', entry.serverUrl);
      client = new Client({ name: 'playground-inspector', version: '1.0.0' });
      const sseTransport = new SSEClientTransport(sseUrl);

      const connectAndFetch = async () => {
        await client!.connect(sseTransport);
        return client!.listTools();
      };

      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('SSE connection timed out')), TIMEOUT_MS)
      );

      const result = await Promise.race([connectAndFetch(), timeout]);

      return NextResponse.json({ tools: result.tools, serverUrl: entry.serverUrl });
    } catch (sseError) {
      const streamableMessage = streamableError instanceof Error ? streamableError.message : String(streamableError);
      const sseMessage = sseError instanceof Error ? sseError.message : String(sseError);
      return NextResponse.json(
        {
          error: 'Failed to reach MCP server',
          details: `StreamableHTTP: ${streamableMessage}; SSE: ${sseMessage}`,
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
