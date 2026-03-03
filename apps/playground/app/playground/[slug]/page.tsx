import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { getMcpBySlug, getMcpRegistry, type McpEntry, type McpTool } from "@/lib/mcp-registry";
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
// Static param generation — pre-renders every known slug at build time
// ---------------------------------------------------------------------------

export function generateStaticParams(): { slug: string }[] {
  return getMcpRegistry().map((entry) => ({ slug: entry.slug }));
}

// ---------------------------------------------------------------------------
// Dynamic metadata
// ---------------------------------------------------------------------------

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const entry = getMcpBySlug(slug);
  if (!entry) {
    return { title: "Not Found | Intuition MCP" };
  }
  return {
    title: `${entry.name} — Playground | Intuition MCP`,
    description: entry.description,
  };
}

// ---------------------------------------------------------------------------
// Status badge (same visual language as the directory page)
// ---------------------------------------------------------------------------

const STATUS_STYLES: Record<McpEntry["status"], { label: string; className: string }> = {
  official: {
    label: "Official",
    className: "bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-600/20",
  },
  community: {
    label: "Community",
    className: "bg-gray-50 text-gray-700 ring-1 ring-inset ring-gray-600/20",
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
// Inline SVG icons
// ---------------------------------------------------------------------------

function ArrowLeftIcon({ className }: { className?: string }) {
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
        d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"
      />
    </svg>
  );
}

function CommandLineIcon({ className }: { className?: string }) {
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
        d="m6.75 7.5 3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0 0 21 18V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v12a2.25 2.25 0 0 0 2.25 2.25Z"
      />
    </svg>
  );
}

function PlayIcon({ className }: { className?: string }) {
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
        d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Tool card
// ---------------------------------------------------------------------------

function ToolCard({ tool, index }: { tool: McpTool; index: number }) {
  return (
    <Card className="group flex flex-col bg-white transition-shadow hover:shadow-md">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 transition-colors group-hover:bg-indigo-100">
            <CommandLineIcon className="h-4 w-4" />
          </div>
          <CardTitle className="text-base font-semibold">
            <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-sm text-gray-800">
              {tool.name}
            </code>
          </CardTitle>
        </div>
      </CardHeader>

      <CardContent className="flex-1 pt-0">
        <CardDescription className="text-sm leading-relaxed text-gray-600">
          {tool.description}
        </CardDescription>
      </CardContent>

      <CardFooter className="pt-0">
        <Button
          variant="outline"
          size="sm"
          disabled
          className="w-full gap-2 text-gray-400"
          aria-label={`Try ${tool.name} (coming soon)`}
        >
          <PlayIcon className="h-3.5 w-3.5" />
          Try
          <span className="ml-auto text-[10px] font-normal uppercase tracking-wider text-gray-400">
            Soon
          </span>
        </Button>
      </CardFooter>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function PlaygroundPage({ params }: PageProps) {
  const { slug } = await params;
  const entry = getMcpBySlug(slug);

  if (!entry) {
    notFound();
  }

  const toolCount = entry.tools.length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      {/* Back link + header */}
      <section className="mx-auto max-w-7xl px-4 pt-10 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 transition-colors hover:text-indigo-600"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Back to Directory
        </Link>

        <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
                {entry.name}
              </h1>
              <StatusBadge status={entry.status} />
            </div>
            <p className="mt-3 max-w-3xl text-base leading-relaxed text-gray-600">
              {entry.description}
            </p>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-2">
            <div className="flex items-center gap-2 rounded-lg border bg-white px-4 py-2.5 text-sm text-gray-500 shadow-sm">
              <CommandLineIcon className="h-4 w-4 text-indigo-500" />
              <span>
                <span className="font-semibold text-gray-900">{toolCount}</span>{" "}
                {toolCount === 1 ? "tool" : "tools"}
              </span>
            </div>
            {entry.serverUrl && (
              <div className="flex items-center gap-1.5 rounded-md bg-gray-50 px-3 py-1.5 text-xs text-gray-500 ring-1 ring-inset ring-gray-200">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" />
                <span className="font-mono">{entry.serverUrl}</span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Tool grid */}
      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <h2 className="mb-6 text-lg font-semibold text-gray-900">
          Available Tools
        </h2>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {entry.tools.map((tool, i) => (
            <ToolCard key={tool.name} tool={tool} index={i} />
          ))}
        </div>
      </section>

      {/* CTA banner */}
      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        <div className="rounded-2xl border bg-white p-8 text-center shadow-sm sm:p-12">
          <h2 className="text-2xl font-bold text-gray-900">
            Ready to integrate?
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-gray-600">
            Add this MCP server to your Claude Desktop config or call the tools
            directly from your AI agent.
          </p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700">
              <Link href="/docs">View Documentation</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/">Browse All MCPs</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
