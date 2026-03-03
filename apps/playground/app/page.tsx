import Link from "next/link";
import { getMcpRegistry, type McpEntry } from "@/lib/mcp-registry";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

const STATUS_STYLES: Record<McpEntry["status"], { label: string; className: string }> = {
  official: {
    label: "Official",
    className:
      "bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-600/20",
  },
  community: {
    label: "Community",
    className:
      "bg-gray-50 text-gray-700 ring-1 ring-inset ring-gray-600/20",
  },
};

function StatusBadge({ status }: { status: McpEntry["status"] }) {
  const style = STATUS_STYLES[status];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${style.className}`}
    >
      {style.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Inline SVG icons (avoids an external icon dependency)
// ---------------------------------------------------------------------------

function ToolIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.049.58.025 1.193-.14 1.743"
      />
    </svg>
  );
}

function ArrowRightIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// MCP Card
// ---------------------------------------------------------------------------

function McpCard({ entry }: { entry: McpEntry }) {
  const toolCount = entry.tools.length;

  return (
    <Card className="group relative flex flex-col bg-white transition-shadow hover:shadow-lg">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-xl">{entry.name}</CardTitle>
          <StatusBadge status={entry.status} />
        </div>
        <CardDescription className="mt-2 line-clamp-3 text-sm leading-relaxed text-gray-600">
          {entry.description}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex-1">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <ToolIcon className="h-4 w-4 shrink-0" />
          <span>
            {toolCount} {toolCount === 1 ? "tool" : "tools"} available
          </span>
        </div>

        <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1.5">
          {entry.tools.map((tool) => (
            <li
              key={tool.name}
              className="truncate text-xs text-gray-500"
              title={tool.description}
            >
              <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] text-gray-700">
                {tool.name}
              </code>
            </li>
          ))}
        </ul>
      </CardContent>

      <CardFooter>
        <Button asChild className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700">
          <Link href={`/playground/${encodeURIComponent(entry.slug)}`}>
            Try Playground
            <ArrowRightIcon className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Home() {
  const mcps = getMcpRegistry();

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      {/* Hero */}
      <section className="mx-auto max-w-7xl px-4 pb-4 pt-20 text-center sm:px-6 lg:px-8">
        <div className="inline-flex items-center rounded-full bg-indigo-100 px-4 py-2">
          <span className="text-sm font-semibold text-indigo-600">
            Model Context Protocol
          </span>
        </div>

        <h1 className="mt-6 text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
          Intuition MCP Directory
        </h1>

        <p className="mx-auto mt-4 max-w-2xl text-lg leading-relaxed text-gray-600">
          Explore the available MCP servers in the Intuition ecosystem.
          Connect AI agents to trust scores, knowledge graphs, and
          reputation data.
        </p>
      </section>

      {/* Directory grid */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-8 md:grid-cols-2">
          {mcps.map((entry) => (
            <McpCard key={entry.id} entry={entry} />
          ))}
        </div>
      </section>

      {/* Stats banner */}
      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        <div className="rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 p-12 text-white">
          <div className="grid gap-8 text-center md:grid-cols-3">
            <div>
              <div className="text-4xl font-bold">
                {mcps.length}
              </div>
              <div className="mt-1 text-indigo-200">MCP Servers</div>
            </div>
            <div>
              <div className="text-4xl font-bold">
                {mcps.reduce((sum, m) => sum + m.tools.length, 0)}
              </div>
              <div className="mt-1 text-indigo-200">Total Tools</div>
            </div>
            <div>
              <div className="text-4xl font-bold">100% Open</div>
              <div className="mt-1 text-indigo-200">No API Key Required</div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-16 border-t">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between md:flex-row">
            <div className="mb-4 text-gray-600 md:mb-0">
              &copy; {new Date().getFullYear()} Intuition MCP Server. Open
              source AI agent integration.
            </div>
            <div className="flex space-x-6">
              <Link
                href="https://x.com/0xIntuition"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-gray-600 hover:text-indigo-600"
              >
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
                Twitter
              </Link>
              <Link
                href="https://portal.intuition.systems/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-600 hover:text-indigo-600"
              >
                Portal
              </Link>
              <Link
                href="https://docs.intuition.systems/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-600 hover:text-indigo-600"
              >
                Docs
              </Link>
              <Link
                href="https://github.com/intuition-box/mcp"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-600 hover:text-indigo-600"
              >
                GitHub
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
