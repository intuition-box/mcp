import Link from "next/link";
import type { Metadata } from "next";
import { getMcpRegistry } from "@/lib/mcp-registry";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const metadata: Metadata = {
  title: "Documentation | Intuition MCP",
  description:
    "Complete guide to the Intuition MCP monorepo — installation, Claude Desktop integration, and tool reference for both the Intuition MCP and Trust Score MCP servers.",
};

// ---------------------------------------------------------------------------
// Reusable presentational helpers
// ---------------------------------------------------------------------------

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="text-2xl font-bold text-gray-900">{children}</h2>;
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg bg-slate-900 p-4 text-sm leading-relaxed text-slate-100">
      {children}
    </pre>
  );
}

function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-slate-100 px-1.5 py-0.5 text-sm text-slate-800">
      {children}
    </code>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DocsPage() {
  const mcps = getMcpRegistry();
  const totalTools = mcps.reduce((sum, m) => sum + m.tools.length, 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Page header */}
        <div className="mb-12">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900">
            Documentation
          </h1>
          <p className="mt-2 text-lg text-gray-600">
            Complete guide to the Intuition MCP monorepo
          </p>
        </div>

        <div className="space-y-14">
          {/* ----------------------------------------------------------------
              Introduction
          ---------------------------------------------------------------- */}
          <section className="space-y-4">
            <SectionHeading>Introduction</SectionHeading>
            <p className="leading-relaxed text-gray-700">
              The Intuition MCP monorepo ships{" "}
              <strong>{mcps.length} MCP servers</strong> exposing{" "}
              <strong>{totalTools} tools</strong> that let AI assistants like
              Claude query the Intuition knowledge graph, compute trust scores,
              and verify on-chain reputation data.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              {mcps.map((mcp) => (
                <Card key={mcp.id} className="bg-white">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{mcp.name}</CardTitle>
                    <CardDescription className="text-xs">
                      {mcp.tools.length} tools &middot;{" "}
                      <Link
                        href={`/playground/${encodeURIComponent(mcp.slug)}`}
                        className="text-indigo-600 hover:underline"
                      >
                        View playground
                      </Link>
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0 text-sm text-gray-600">
                    {mcp.description}
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          {/* ----------------------------------------------------------------
              Installation
          ---------------------------------------------------------------- */}
          <section className="space-y-4">
            <SectionHeading>Installation</SectionHeading>
            <Card className="bg-white">
              <CardContent className="space-y-6 pt-6">
                <div>
                  <h3 className="mb-2 font-semibold text-gray-900">
                    1. Clone the monorepo
                  </h3>
                  <CodeBlock>
{`git clone https://github.com/intuition-box/mcp.git
cd mcp`}
                  </CodeBlock>
                </div>

                <div>
                  <h3 className="mb-2 font-semibold text-gray-900">
                    2. Install dependencies
                  </h3>
                  <p className="mb-2 text-sm text-gray-600">
                    Run <InlineCode>npm install</InlineCode> at the repository
                    root. Workspaces are configured so every package gets its
                    dependencies resolved in one pass.
                  </p>
                  <CodeBlock>npm install</CodeBlock>
                </div>

                <div>
                  <h3 className="mb-2 font-semibold text-gray-900">
                    3. Configure environment
                  </h3>
                  <CodeBlock>
{`# apps/playground/.env.local
NEXT_PUBLIC_INTUITION_GRAPH_URL=https://graph.intuition.systems/graphql`}
                  </CodeBlock>
                </div>

                <div>
                  <h3 className="mb-2 font-semibold text-gray-900">
                    4. Start the playground
                  </h3>
                  <CodeBlock>
{`cd apps/playground
npm run dev`}
                  </CodeBlock>
                  <p className="mt-2 text-sm text-gray-600">
                    The playground runs at{" "}
                    <InlineCode>http://localhost:3000</InlineCode> and gives you
                    an interactive UI to explore both MCP servers.
                  </p>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* ----------------------------------------------------------------
              Monorepo Structure
          ---------------------------------------------------------------- */}
          <section className="space-y-4">
            <SectionHeading>Monorepo Structure</SectionHeading>
            <Card className="bg-white">
              <CardContent className="pt-6">
                <CodeBlock>
{`mcp/
├── packages/
│   ├── mcp-general/       # Intuition MCP server (knowledge graph)
│   └── mcp-trust/         # Trust Score MCP server (EigenTrust, AgentRank)
├── apps/
│   └── playground/        # Next.js interactive playground & docs
├── package.json           # Workspace root
└── README.md`}
                </CodeBlock>
              </CardContent>
            </Card>
          </section>

          {/* ----------------------------------------------------------------
              Claude Desktop Integration
          ---------------------------------------------------------------- */}
          <section className="space-y-4">
            <SectionHeading>Claude Desktop Integration</SectionHeading>
            <Card className="bg-white">
              <CardHeader>
                <CardTitle className="text-lg">
                  Configure both MCP servers
                </CardTitle>
                <CardDescription>
                  Add the following to your Claude Desktop config file to
                  register both servers.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="mb-1 text-sm font-semibold text-gray-900">
                    Config file location
                  </h4>
                  <ul className="space-y-1 text-sm text-gray-600">
                    <li>
                      macOS:{" "}
                      <InlineCode>
                        ~/Library/Application Support/Claude/claude_desktop_config.json
                      </InlineCode>
                    </li>
                    <li>
                      Windows:{" "}
                      <InlineCode>
                        %APPDATA%\Claude\claude_desktop_config.json
                      </InlineCode>
                    </li>
                  </ul>
                </div>

                <CodeBlock>
{`{
  "mcpServers": {
    "intuition": {
      "command": "node",
      "args": [
        "/absolute/path/to/mcp/packages/mcp-general/dist/index.js"
      ],
      "env": {
        "NEXT_PUBLIC_INTUITION_GRAPH_URL": "https://graph.intuition.systems/graphql"
      }
    },
    "trust-score": {
      "command": "node",
      "args": [
        "/absolute/path/to/mcp/packages/mcp-trust/dist/index.js"
      ],
      "env": {
        "NEXT_PUBLIC_INTUITION_GRAPH_URL": "https://graph.intuition.systems/graphql"
      }
    }
  }
}`}
                </CodeBlock>

                <p className="text-sm text-gray-600">
                  Replace <InlineCode>/absolute/path/to/mcp</InlineCode> with
                  the actual path where you cloned the repository. Restart
                  Claude Desktop after saving changes.
                </p>
              </CardContent>
            </Card>
          </section>

          {/* ----------------------------------------------------------------
              Tools Reference — generated from the registry
          ---------------------------------------------------------------- */}
          <section className="space-y-6">
            <SectionHeading>Tools Reference</SectionHeading>

            {mcps.map((mcp) => (
              <div key={mcp.id} className="space-y-4">
                <h3 className="flex items-center gap-2 text-xl font-semibold text-gray-900">
                  {mcp.name}
                  <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-600/20">
                    {mcp.tools.length} tools
                  </span>
                </h3>

                <div className="grid gap-3">
                  {mcp.tools.map((tool) => (
                    <Card key={tool.name} className="bg-white">
                      <CardHeader className="pb-0">
                        <CardTitle className="text-base">
                          <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-sm text-indigo-700">
                            {tool.name}
                          </code>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-2 text-sm text-gray-600">
                        {tool.description}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </section>

          {/* ----------------------------------------------------------------
              HTTP API Endpoints
          ---------------------------------------------------------------- */}
          <section className="space-y-4">
            <SectionHeading>HTTP API Endpoints</SectionHeading>
            <p className="text-gray-700">
              When the playground dev server is running you can also call the
              tools via HTTP.
            </p>

            <div className="space-y-4">
              <Card className="bg-white">
                <CardHeader className="pb-0">
                  <CardTitle className="text-base">
                    GET /api/trust-score
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-3">
                  <CodeBlock>
{`curl "http://localhost:3000/api/trust-score?address=0x..."`}
                  </CodeBlock>
                </CardContent>
              </Card>

              <Card className="bg-white">
                <CardHeader className="pb-0">
                  <CardTitle className="text-base">
                    GET /api/attestations
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-3">
                  <CodeBlock>
{`curl "http://localhost:3000/api/attestations?subject=0x...&limit=50"`}
                  </CodeBlock>
                </CardContent>
              </Card>

              <Card className="bg-white">
                <CardHeader className="pb-0">
                  <CardTitle className="text-base">
                    POST /api/mcp
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-3">
                  <CodeBlock>
{`curl -X POST http://localhost:3000/api/mcp \\
  -H "Content-Type: application/json" \\
  -d '{
    "tool": "verifyCredential",
    "params": {
      "address": "0x...",
      "claim": "expert-in-defi"
    }
  }'`}
                  </CodeBlock>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* ----------------------------------------------------------------
              Resources
          ---------------------------------------------------------------- */}
          <section className="space-y-4">
            <SectionHeading>Resources</SectionHeading>
            <div className="grid gap-4 sm:grid-cols-2">
              <Card className="bg-white">
                <CardHeader>
                  <CardTitle className="text-base">
                    Intuition Systems
                  </CardTitle>
                  <CardDescription>
                    Learn about the Intuition protocol
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Link
                    href="https://intuition.systems"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-indigo-600 hover:underline"
                  >
                    intuition.systems &rarr;
                  </Link>
                </CardContent>
              </Card>

              <Card className="bg-white">
                <CardHeader>
                  <CardTitle className="text-base">
                    Model Context Protocol
                  </CardTitle>
                  <CardDescription>
                    Official MCP specification
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Link
                    href="https://modelcontextprotocol.io"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-indigo-600 hover:underline"
                  >
                    modelcontextprotocol.io &rarr;
                  </Link>
                </CardContent>
              </Card>

              <Card className="bg-white">
                <CardHeader>
                  <CardTitle className="text-base">
                    GitHub Repository
                  </CardTitle>
                  <CardDescription>
                    View source code &amp; contribute
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Link
                    href="https://github.com/intuition-box/mcp"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-indigo-600 hover:underline"
                  >
                    github.com/intuition-box/mcp &rarr;
                  </Link>
                </CardContent>
              </Card>

              <Card className="bg-white">
                <CardHeader>
                  <CardTitle className="text-base">
                    MCP Directory
                  </CardTitle>
                  <CardDescription>
                    Explore &amp; try all available servers
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Link
                    href="/"
                    className="text-sm text-indigo-600 hover:underline"
                  >
                    Browse MCP Directory &rarr;
                  </Link>
                </CardContent>
              </Card>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
