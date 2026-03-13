import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
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
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'Failed to reach MCP server', details: message },
      { status: 502 }
    );
  } finally {
    if (client) {
      client.close().catch(() => {});
    }
  }
}
