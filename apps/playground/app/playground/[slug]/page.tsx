import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { getMcpBySlug, getMcpRegistry, type McpEntry } from "@/lib/mcp-registry";
import { Button } from "@/components/ui/button";
import { LiveToolGrid } from "@/components/live-tool-grid";

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

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function PlaygroundPage({ params }: PageProps) {
  const { slug } = await params;
  const entry = getMcpBySlug(slug);

  if (!entry) {
    notFound();
  }

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

          {entry.serverUrl && (
            <div className="flex shrink-0 items-center gap-1.5 self-start rounded-md bg-gray-50 px-3 py-1.5 text-xs text-gray-500 ring-1 ring-inset ring-gray-200">
              <CommandLineIcon className="h-3.5 w-3.5 text-indigo-400" />
              <span className="font-mono">{entry.serverUrl}</span>
            </div>
          )}
        </div>
      </section>

      {/* Live tool grid — fetches tools dynamically from the running MCP server */}
      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <LiveToolGrid
          slug={entry.slug}
          serverUrl={entry.serverUrl}
          registryTools={entry.tools}
        />
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
