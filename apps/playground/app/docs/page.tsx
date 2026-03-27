"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { getMcpRegistry } from "@/lib/mcp-registry";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// ---------------------------------------------------------------------------
// Navigation structure
// ---------------------------------------------------------------------------

interface NavItem {
  id: string;
  label: string;
  children?: NavItem[];
}

const NAV_ITEMS: NavItem[] = [
  { id: "overview", label: "Overview" },
  { id: "installation", label: "Installation" },
  { id: "monorepo-structure", label: "Monorepo Structure" },
  { id: "claude-desktop", label: "Claude Desktop Integration" },
  { id: "tools-reference", label: "Tools Reference" },
  { id: "http-api", label: "HTTP API Endpoints" },
  {
    id: "algorithms",
    label: "Algorithm Documentation",
    children: [
      { id: "algo-eigentrust", label: "EigenTrust" },
      { id: "algo-agentrank", label: "AgentRank" },
      { id: "algo-composite", label: "Composite Scoring" },
      { id: "algo-transitive", label: "Multi-Hop Transitive Trust" },
      { id: "algo-sybil", label: "Sybil Resistance" },
      { id: "algo-indexer", label: "Graph Indexer" },
      { id: "algo-predicates", label: "Predicate Weights" },
    ],
  },
  { id: "resources", label: "Resources" },
];

const ALL_SECTION_IDS = NAV_ITEMS.flatMap((item) =>
  item.children ? [item.id, ...item.children.map((c) => c.id)] : [item.id]
);

const ALGORITHMS_URL =
  "https://github.com/intuition-box/mcp/blob/main/packages/mcp-trust/ALGORITHMS.md";

// ---------------------------------------------------------------------------
// Algorithm summaries
// ---------------------------------------------------------------------------

interface AlgorithmSummary {
  id: string;
  name: string;
  anchor: string;
  description: string;
}

const ALGORITHM_SUMMARIES: AlgorithmSummary[] = [
  {
    id: "algo-eigentrust",
    name: "EigenTrust",
    anchor: "#1-eigentrust",
    description:
      "Iterative power-iteration algorithm computing global trust scores by propagating normalized attestation weights across the graph until convergence. Based on the Kamvar, Schlosser, Garcia-Molina (2003) paper for sybil-resistant reputation.",
  },
  {
    id: "algo-agentrank",
    name: "AgentRank",
    anchor: "#2-agentrank",
    description:
      "PageRank variant with stake-weighted edges for influence ranking. Produces per-node influence scores alongside network-level metrics including Gini coefficient and Shannon entropy for inequality and diversity measurement.",
  },
  {
    id: "algo-composite",
    name: "Composite Scoring",
    anchor: "#3-composite-scoring-engine",
    description:
      "Weighted combination of EigenTrust (0.4), AgentRank (0.3), and Transitive Trust (0.3) into a normalized 0\u2013100 score with confidence indicators. Supports per-query weight overrides and batch computation.",
  },
  {
    id: "algo-transitive",
    name: "Multi-Hop Transitive Trust",
    anchor: "#4-multi-hop-transitive-trust",
    description:
      "Personalized trust propagation through multi-hop paths with configurable per-hop decay, stake weighting, and predicate-specific multipliers. Supports both targeted pairwise queries and full outgoing network scans.",
  },
  {
    id: "algo-sybil",
    name: "Sybil Resistance",
    anchor: "#5-sybil-resistance",
    description:
      "Simulation-based detection that injects synthetic sybil clusters into the graph, measures their impact on trust scores, then cleans up. Produces a resistance score quantifying how well the network withstands coordinated manipulation.",
  },
  {
    id: "algo-indexer",
    name: "Graph Indexer",
    anchor: "#6-graph-indexer",
    description:
      "Pipeline syncing Intuition attestation data from the GraphQL API into Neo4j using cursor-based pagination and batch MERGE operations. Tracks sync health metrics including duration, error counts, and graph size.",
  },
  {
    id: "algo-predicates",
    name: "Predicate Weights",
    anchor: "#7-predicate-weights",
    description:
      "Configurable weight system where each attestation predicate (trusts, follows, is-qualified) carries a numeric multiplier scaling its contribution to trust calculations. Supports per-query overrides and custom predicate registration.",
  },
];

// ---------------------------------------------------------------------------
// Presentational helpers
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
// Sidebar
// ---------------------------------------------------------------------------

function Sidebar({
  activeSection,
  onNavigate,
  onBackToTop,
}: {
  activeSection: string;
  onNavigate: (id: string) => void;
  onBackToTop: () => void;
}) {
  const activeParent = NAV_ITEMS.find(
    (item) =>
      item.id === activeSection ||
      item.children?.some((c) => c.id === activeSection),
  )?.id;

  return (
    <aside className="fixed left-0 top-16 z-40 flex h-[calc(100vh-4rem)] w-[260px] flex-col border-r border-indigo-100 bg-slate-50/80 backdrop-blur-sm">
      {/* Sidebar header */}
      <div className="flex items-center gap-2.5 border-b border-indigo-100 px-5 py-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-indigo-500 to-purple-600">
          <svg
            className="h-4 w-4 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
        </div>
        <span className="text-sm font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
          Intuition MCP Docs
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const isActive =
              activeSection === item.id || activeParent === item.id;
            const isExpanded =
              item.children &&
              (activeParent === item.id ||
                item.children.some((c) => c.id === activeSection));

            return (
              <li key={item.id}>
                <button
                  onClick={() => onNavigate(item.id)}
                  className={`
                    flex w-full items-center rounded-md px-3 py-2 text-left text-sm
                    transition-colors duration-150
                    ${
                      isActive
                        ? "border-l-2 border-indigo-600 bg-indigo-50 font-medium text-indigo-700"
                        : "border-l-2 border-transparent text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                    }
                  `}
                >
                  {item.label}
                  {item.children && (
                    <svg
                      className={`ml-auto h-3.5 w-3.5 text-gray-400 transition-transform duration-200 ${
                        isExpanded ? "rotate-90" : ""
                      }`}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M8.25 4.5l7.5 7.5-7.5 7.5"
                      />
                    </svg>
                  )}
                </button>

                {item.children && isExpanded && (
                  <ul className="ml-4 mt-0.5 space-y-0.5">
                    {item.children.map((child) => {
                      const childActive = activeSection === child.id;
                      return (
                        <li key={child.id}>
                          <button
                            onClick={() => onNavigate(child.id)}
                            className={`
                              flex w-full items-center rounded-md px-3 py-1.5 text-left text-xs
                              transition-colors duration-150
                              ${
                                childActive
                                  ? "border-l-2 border-indigo-500 bg-indigo-50 font-medium text-indigo-600"
                                  : "border-l-2 border-transparent text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                              }
                            `}
                          >
                            {child.label}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Back to top */}
      <div className="border-t border-indigo-100 px-3 py-3">
        <button
          onClick={onBackToTop}
          className="flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
        >
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4.5 15.75l7.5-7.5 7.5 7.5"
            />
          </svg>
          Back to top
        </button>
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState("overview");
  const mcps = getMcpRegistry();
  const totalTools = mcps.reduce((sum, m) => sum + m.tools.length, 0);

  useEffect(() => {
    document.title = "Documentation | Intuition MCP";
  }, []);

  // Track which section is visible via IntersectionObserver
  useEffect(() => {
    const visibleEntries = new Map<string, IntersectionObserverEntry>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            visibleEntries.set(entry.target.id, entry);
          } else {
            visibleEntries.delete(entry.target.id);
          }
        }

        if (visibleEntries.size > 0) {
          let topmost: string | null = null;
          let topY = Infinity;
          for (const [id, entry] of visibleEntries) {
            if (entry.boundingClientRect.top < topY) {
              topY = entry.boundingClientRect.top;
              topmost = id;
            }
          }
          if (topmost) setActiveSection(topmost);
        }
      },
      { rootMargin: "-80px 0px -40% 0px", threshold: 0 },
    );

    for (const id of ALL_SECTION_IDS) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, []);

  const scrollToSection = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      <Sidebar
        activeSection={activeSection}
        onNavigate={scrollToSection}
        onBackToTop={scrollToTop}
      />

      {/* Main content */}
      <main className="ml-[260px] min-h-screen">
        <div className="mx-auto max-w-4xl px-6 py-12 lg:px-10">
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
            {/* ---------------------------------------------------------------
                Overview
            --------------------------------------------------------------- */}
            <section id="overview" className="scroll-mt-20 space-y-4">
              <SectionHeading>Overview</SectionHeading>
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

            {/* ---------------------------------------------------------------
                Installation
            --------------------------------------------------------------- */}
            <section id="installation" className="scroll-mt-20 space-y-4">
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

            {/* ---------------------------------------------------------------
                Monorepo Structure
            --------------------------------------------------------------- */}
            <section id="monorepo-structure" className="scroll-mt-20 space-y-4">
              <SectionHeading>Monorepo Structure</SectionHeading>
              <Card className="bg-white">
                <CardContent className="pt-6">
                  <CodeBlock>
{`mcp/
\u251c\u2500\u2500 packages/
\u2502   \u251c\u2500\u2500 mcp-general/       # Intuition MCP server (knowledge graph)
\u2502   \u2514\u2500\u2500 mcp-trust/         # Trust Score MCP server (EigenTrust, AgentRank)
\u251c\u2500\u2500 apps/
\u2502   \u2514\u2500\u2500 playground/        # Next.js interactive playground & docs
\u251c\u2500\u2500 package.json           # Workspace root
\u2514\u2500\u2500 README.md`}
                  </CodeBlock>
                </CardContent>
              </Card>
            </section>

            {/* ---------------------------------------------------------------
                Claude Desktop Integration
            --------------------------------------------------------------- */}
            <section id="claude-desktop" className="scroll-mt-20 space-y-4">
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

            {/* ---------------------------------------------------------------
                Tools Reference
            --------------------------------------------------------------- */}
            <section id="tools-reference" className="scroll-mt-20 space-y-6">
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

            {/* ---------------------------------------------------------------
                HTTP API Endpoints
            --------------------------------------------------------------- */}
            <section id="http-api" className="scroll-mt-20 space-y-4">
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

            {/* ---------------------------------------------------------------
                Algorithm Documentation
            --------------------------------------------------------------- */}
            <section id="algorithms" className="scroll-mt-20 space-y-6">
              <SectionHeading>Algorithm Documentation</SectionHeading>
              <p className="leading-relaxed text-gray-700">
                The Trust Score MCP server implements seven core algorithm areas
                for computing reputation, influence, and sybil resistance over
                the Intuition attestation graph. Each algorithm is documented in
                detail in the{" "}
                <Link
                  href={ALGORITHMS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-indigo-600 hover:underline"
                >
                  full technical specification
                </Link>
                .
              </p>

              <div className="grid gap-4">
                {ALGORITHM_SUMMARIES.map((algo) => (
                  <Card
                    key={algo.id}
                    id={algo.id}
                    className="scroll-mt-20 bg-white"
                  >
                    <CardHeader className="pb-1">
                      <CardTitle className="text-base">{algo.name}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 pt-0">
                      <p className="text-sm leading-relaxed text-gray-600">
                        {algo.description}
                      </p>
                      <Link
                        href={`${ALGORITHMS_URL}${algo.anchor}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block text-xs font-medium text-indigo-600 hover:underline"
                      >
                        Read full specification &rarr;
                      </Link>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>

            {/* ---------------------------------------------------------------
                Resources
            --------------------------------------------------------------- */}
            <section id="resources" className="scroll-mt-20 space-y-4">
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
      </main>
    </div>
  );
}
