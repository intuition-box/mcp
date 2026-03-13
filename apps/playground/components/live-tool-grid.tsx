'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { McpTool } from '@/lib/mcp-registry';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LiveTool {
  name: string;
  description?: string;
  inputSchema?: {
    type?: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

type ConnectionStatus = 'loading' | 'live' | 'fallback';

interface LiveToolGridProps {
  slug: string;
  serverUrl: string;
  registryTools: readonly McpTool[];
}

// ---------------------------------------------------------------------------
// Icons (inline SVG — no external dependency)
// ---------------------------------------------------------------------------

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

function CopyIcon({ className }: { className?: string }) {
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
        d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75"
      />
    </svg>
  );
}

function ExternalLinkIcon({ className }: { className?: string }) {
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
        d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ToolCard({ tool, isLive }: { tool: LiveTool; isLive: boolean }) {
  const paramCount = Object.keys(tool.inputSchema?.properties ?? {}).length;

  return (
    <Card className="group flex flex-col bg-white transition-shadow hover:shadow-md">
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 transition-colors group-hover:bg-indigo-100">
            <CommandLineIcon className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base font-semibold">
              <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-sm text-gray-800">
                {tool.name}
              </code>
            </CardTitle>
            {isLive && paramCount > 0 && (
              <p className="mt-1 text-[11px] text-gray-400">
                {paramCount} {paramCount === 1 ? 'parameter' : 'parameters'}
              </p>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 pt-0">
        <CardDescription className="text-sm leading-relaxed text-gray-600">
          {tool.description ?? 'No description available.'}
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

function SkeletonCard() {
  return (
    <div className="rounded-xl border bg-white p-5 animate-pulse">
      <div className="mb-3 flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-gray-100" />
        <div className="h-4 w-32 rounded bg-gray-100" />
      </div>
      <div className="space-y-2">
        <div className="h-3 w-full rounded bg-gray-100" />
        <div className="h-3 w-4/5 rounded bg-gray-100" />
      </div>
      <div className="mt-4 h-8 w-full rounded-md bg-gray-100" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Copy row helper
// ---------------------------------------------------------------------------

function CopyRow({
  label,
  value,
  id,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  id: string;
  copied: string | null;
  onCopy: (value: string, id: string) => void;
}) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">
        {label}
      </p>
      <div className="flex items-center gap-2 rounded-md border bg-white px-3 py-2">
        <code className="min-w-0 flex-1 truncate font-mono text-xs text-gray-700">
          {value}
        </code>
        <button
          onClick={() => onCopy(value, id)}
          className="shrink-0 text-gray-400 transition-colors hover:text-gray-600"
          aria-label={`Copy ${label}`}
        >
          {copied === id ? (
            <span className="text-[10px] font-semibold text-green-600">Copied</span>
          ) : (
            <CopyIcon className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function LiveToolGrid({ slug, serverUrl, registryTools }: LiveToolGridProps) {
  const [status, setStatus] = useState<ConnectionStatus>('loading');
  const [tools, setTools] = useState<LiveTool[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchTools() {
      try {
        const res = await fetch(`/api/mcp/live-tools?slug=${encodeURIComponent(slug)}`);
        if (cancelled) return;

        if (!res.ok) {
          const data: unknown = await res.json().catch(() => ({}));
          const msg =
            data && typeof data === 'object' && 'error' in data
              ? String((data as { error: unknown }).error)
              : `HTTP ${res.status}`;
          throw new Error(msg);
        }

        const data = await res.json();
        if (cancelled) return;

        setTools(data.tools ?? []);
        setStatus('live');
      } catch {
        if (cancelled) return;
        // Fall back to registry definitions
        setTools(registryTools.map((t) => ({ name: t.name, description: t.description })));
        setStatus('fallback');
      }
    }

    fetchTools();
    return () => {
      cancelled = true;
    };
  }, [slug, registryTools]);

  const copyToClipboard = useCallback(async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard API unavailable (e.g. non-secure context)
    }
  }, []);

  const skeletonCount = registryTools.length;

  return (
    <div>
      {/* Section header with live status badge */}
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Available Tools</h2>

        {status === 'loading' && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-gray-400" />
            Connecting...
          </span>
        )}
        {status === 'live' && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" />
            Live &mdash; {tools.length} {tools.length === 1 ? 'tool' : 'tools'}
          </span>
        )}
        {status === 'fallback' && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
            Registry &mdash; server offline
          </span>
        )}
      </div>

      {/* Fallback notice */}
      {status === 'fallback' && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Could not reach the MCP server. Showing cached tool definitions from the registry.
          Start the server with{' '}
          <code className="rounded bg-amber-100 px-1 font-mono text-xs">npm run dev</code>{' '}
          to see live tool data.
        </div>
      )}

      {/* Tool grid */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {status === 'loading'
          ? Array.from({ length: skeletonCount }, (_, i) => <SkeletonCard key={i} />)
          : tools.map((tool) => (
              <ToolCard key={tool.name} tool={tool} isLive={status === 'live'} />
            ))}
      </div>

      {/* MCP Inspector panel */}
      <div className="mt-10 rounded-xl border bg-gray-50 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">MCP Inspector</h3>
            <p className="mt-1 max-w-sm text-sm text-gray-500">
              Run the MCP Inspector locally to browse, call, and debug this server's tools
              interactively.
            </p>
          </div>
          <a
            href="http://localhost:6274"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
          >
            Open Inspector
            <ExternalLinkIcon className="h-3.5 w-3.5" />
          </a>
        </div>

        <div className="mt-5 space-y-3">
          <CopyRow
            label="Start inspector"
            value="npx @modelcontextprotocol/inspector"
            id="install"
            copied={copied}
            onCopy={copyToClipboard}
          />
          <CopyRow
            label="StreamableHTTP endpoint"
            value={`${serverUrl}/mcp`}
            id="mcp"
            copied={copied}
            onCopy={copyToClipboard}
          />
          <CopyRow
            label="SSE endpoint (legacy)"
            value={`${serverUrl}/sse`}
            id="sse"
            copied={copied}
            onCopy={copyToClipboard}
          />
        </div>
      </div>
    </div>
  );
}
