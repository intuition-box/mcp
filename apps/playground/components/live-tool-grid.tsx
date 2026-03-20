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
import { Input } from '@/components/ui/input';
import type { McpTool } from '@/lib/mcp-registry';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SchemaProperty {
  type?: string;
  description?: string;
  [key: string]: unknown;
}

interface LiveTool {
  name: string;
  description?: string;
  inputSchema?: {
    type?: string;
    properties?: Record<string, SchemaProperty>;
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
// Icons (inline SVG)
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

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
  );
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
    </svg>
  );
}

function ErrorIcon({ className }: { className?: string }) {
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
        d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Placeholder helpers
// ---------------------------------------------------------------------------

/** Custom placeholders keyed by "toolName::fieldName". */
const FIELD_PLACEHOLDERS: Record<string, string> = {
  'get-account-info::address': 'e.g. 0xC3FBd93fCb4c12FB159424A3B0d6E30b0e8c364D',
  'get_account_info::address': 'e.g. 0xC3FBd93fCb4c12FB159424A3B0d6E30b0e8c364D',
};

function getFieldPlaceholder(
  toolName: string,
  fieldName: string,
  prop: SchemaProperty,
  isRequired: boolean,
): string {
  // Check for a tool-specific override first
  const override = FIELD_PLACEHOLDERS[`${toolName}::${fieldName}`];
  if (override) return override;

  if (prop.type === 'array') return 'e.g. ethereum, bitcoin';
  if (prop.type === 'object') return 'Enter JSON...';
  return isRequired ? 'Required' : 'Optional';
}

// ---------------------------------------------------------------------------
// ToolCard — interactive with Try/Run functionality
// ---------------------------------------------------------------------------

interface ToolResult {
  content?: Array<{ type: string; text?: string; [key: string]: unknown }>;
  isError?: boolean;
  [key: string]: unknown;
}

function ToolCard({
  tool,
  isLive,
  slug,
  lastSyncedAt,
}: {
  tool: LiveTool;
  isLive: boolean;
  slug: string;
  lastSyncedAt?: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ToolResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const properties = tool.inputSchema?.properties ?? {};
  const required = tool.inputSchema?.required ?? [];
  const paramEntries = Object.entries(properties);
  const paramCount = paramEntries.length;
  const canTry = isLive;

  function handleExpand() {
    setExpanded(true);
    setResult(null);
    setError(null);
    const initial: Record<string, string> = {};
    for (const [key] of paramEntries) {
      initial[key] = '';
    }
    setFormValues(initial);
  }

  function handleCollapse() {
    setExpanded(false);
    setResult(null);
    setError(null);
    setFormValues({});
  }

  function updateField(key: string, value: string) {
    setFormValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleRun() {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // Convert form strings to typed values based on schema
      const args: Record<string, unknown> = {};
      for (const [key, schema] of paramEntries) {
        const value = formValues[key];
        if (value === '' || value === undefined) continue;
        const prop = schema as SchemaProperty;
        if (prop.type === 'number' || prop.type === 'integer') {
          const num = Number(value);
          if (isNaN(num)) {
            throw new Error(`"${key}" must be a valid number`);
          }
          args[key] = num;
        } else if (prop.type === 'boolean') {
          args[key] = value === 'true';
        } else if (prop.type === 'object') {
          try {
            args[key] = JSON.parse(value);
          } catch {
            throw new Error(`"${key}" must be valid JSON`);
          }
        } else if (prop.type === 'array') {
          // Auto-wrap plain text input into a JSON array.
          // If the user typed valid JSON array syntax, honour it as-is.
          const trimmed = value.trim();
          if (trimmed.startsWith('[')) {
            try {
              args[key] = JSON.parse(trimmed);
            } catch {
              throw new Error(`"${key}" looks like JSON but is not valid`);
            }
          } else {
            // Comma-separated values -> string array
            args[key] = trimmed
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean);
          }
        } else {
          args[key] = value;
        }
      }

      // Validate required fields
      for (const reqKey of required) {
        if (args[reqKey] === undefined || args[reqKey] === '') {
          throw new Error(`"${reqKey}" is required`);
        }
      }

      const res = await fetch('/api/mcp/call-tool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, toolName: tool.name, arguments: args }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.details || data.error || `Request failed (${res.status})`);
      }

      setResult(data.result as ToolResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  // Extract display text from MCP tool result
  function getResultDisplay(): { text: string; isError: boolean } {
    if (!result) return { text: '', isError: false };

    const isErr = result.isError === true;

    // MCP results have content array with type/text entries
    if (result.content && Array.isArray(result.content)) {
      const textParts = result.content
        .filter((c) => c.type === 'text' && typeof c.text === 'string')
        .map((c) => c.text as string);

      if (textParts.length > 0) {
        const joined = textParts.join('\n');
        // Try to parse and re-format as JSON for readability
        try {
          const parsed = JSON.parse(joined);
          return { text: JSON.stringify(parsed, null, 2), isError: isErr };
        } catch {
          return { text: joined, isError: isErr };
        }
      }
    }

    // Fallback: stringify the entire result
    return { text: JSON.stringify(result, null, 2), isError: isErr };
  }

  // --- Collapsed view ---
  if (!expanded) {
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
          {canTry ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleExpand}
              className="w-full gap-2 text-indigo-600 border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
              aria-label={`Try ${tool.name}`}
            >
              <PlayIcon className="h-3.5 w-3.5" />
              Try
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled
              className="w-full gap-2 text-gray-400"
              aria-label={`Try ${tool.name} (server offline)`}
            >
              <PlayIcon className="h-3.5 w-3.5" />
              Try
              <span className="ml-auto text-[10px] font-normal uppercase tracking-wider text-gray-400">
                Offline
              </span>
            </Button>
          )}
        </CardFooter>
      </Card>
    );
  }

  // --- Expanded view ---
  const resultDisplay = getResultDisplay();

  return (
    <Card className="col-span-1 sm:col-span-2 lg:col-span-3 flex flex-col bg-white shadow-md border-indigo-200">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
              <CommandLineIcon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-base font-semibold">
                <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-sm text-gray-800">
                  {tool.name}
                </code>
              </CardTitle>
              <CardDescription className="mt-1.5 text-sm leading-relaxed text-gray-600">
                {tool.description ?? 'No description available.'}
              </CardDescription>
            </div>
          </div>
          <button
            onClick={handleCollapse}
            className="shrink-0 rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {/* Parameter form */}
        {paramEntries.length > 0 ? (
          <div className="rounded-lg border bg-gray-50 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Parameters
            </p>
            <div className="space-y-3">
              {paramEntries.map(([key, schema]) => {
                const prop = schema as SchemaProperty;
                const isRequired = required.includes(key);
                const inputType =
                  prop.type === 'number' || prop.type === 'integer'
                    ? 'number'
                    : 'text';

                return (
                  <div key={key}>
                    <label
                      htmlFor={`param-${tool.name}-${key}`}
                      className="mb-1 flex items-baseline gap-1 text-sm font-medium text-gray-700"
                    >
                      <code className="font-mono text-xs">{key}</code>
                      {isRequired && (
                        <span className="text-red-500" title="Required">*</span>
                      )}
                      {prop.type && (
                        <span className="text-[10px] font-normal text-gray-400">
                          {prop.type}
                        </span>
                      )}
                    </label>
                    {prop.description && (
                      <p className="mb-1 text-[11px] text-gray-400">{prop.description}</p>
                    )}
                    {prop.type === 'boolean' ? (
                      <select
                        id={`param-${tool.name}-${key}`}
                        value={formValues[key] ?? ''}
                        onChange={(e) => updateField(key, e.target.value)}
                        disabled={loading}
                        className="flex h-9 w-full rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                      >
                        <option value="">-- select --</option>
                        <option value="true">true</option>
                        <option value="false">false</option>
                      </select>
                    ) : (
                      <>
                        <Input
                          id={`param-${tool.name}-${key}`}
                          type={inputType}
                          value={formValues[key] ?? ''}
                          onChange={(e) => updateField(key, e.target.value)}
                          disabled={loading}
                          placeholder={getFieldPlaceholder(tool.name, key, prop, isRequired)}
                          className="h-9 text-sm"
                        />
                        {tool.name === 'run_sync' && key === 'maxPages' && lastSyncedAt && (
                          <p className="mt-1 text-[11px] text-gray-400">
                            Last synced: {lastSyncedAt}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed bg-gray-50 px-4 py-3 text-center text-sm text-gray-500">
            This tool takes no parameters.
          </div>
        )}

        {/* Actions */}
        <div className="mt-4 flex items-center gap-3">
          <Button
            onClick={handleRun}
            disabled={loading}
            size="sm"
            className="gap-2 bg-indigo-600 text-white hover:bg-indigo-700"
          >
            {loading ? (
              <>
                <SpinnerIcon className="h-3.5 w-3.5 animate-spin" />
                Running...
              </>
            ) : (
              <>
                <PlayIcon className="h-3.5 w-3.5" />
                Run
              </>
            )}
          </Button>
          <Button
            onClick={handleCollapse}
            variant="ghost"
            size="sm"
            disabled={loading}
            className="text-gray-500"
          >
            Cancel
          </Button>
        </div>

        {/* Error display */}
        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4">
            <div className="flex items-start gap-2">
              <ErrorIcon className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-red-800">Tool call failed</p>
                <p className="mt-1 text-sm text-red-600 break-all">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Result display */}
        {result && !error && (
          <div className="mt-4 rounded-lg border bg-gray-50 p-4">
            <div className="mb-2 flex items-center gap-2">
              {resultDisplay.isError ? (
                <>
                  <ErrorIcon className="h-4 w-4 text-amber-500" />
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">
                    Tool Error Response
                  </p>
                </>
              ) : (
                <>
                  <CheckIcon className="h-4 w-4 text-green-500" />
                  <p className="text-xs font-semibold uppercase tracking-wide text-green-600">
                    Result
                  </p>
                </>
              )}
            </div>
            <pre
              className={`max-h-96 overflow-auto rounded-md border p-3 text-xs leading-relaxed ${
                resultDisplay.isError
                  ? 'border-amber-200 bg-amber-50 text-amber-900'
                  : 'border-gray-200 bg-white text-gray-800'
              }`}
            >
              {resultDisplay.text}
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

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
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

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

        // Fetch last sync time for trust-score playground
        if (slug === 'trust-score') {
          try {
            const statsRes = await fetch('/api/mcp/call-tool', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ slug, toolName: 'get_graph_stats', arguments: {} }),
            });
            if (statsRes.ok) {
              const statsData = await statsRes.json();
              const text = statsData?.result?.content?.[0]?.text;
              if (text) {
                const parsed = JSON.parse(text);
                if (parsed?.lastSyncedAt) {
                  const d = new Date(parsed.lastSyncedAt);
                  setLastSyncedAt(d.toLocaleString('en-US', {
                    month: 'short', day: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                    timeZone: 'UTC',
                    timeZoneName: 'short',
                  }));
                }
              }
            }
          } catch {
            // silently ignore
          }
        }
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
      // Clipboard API unavailable
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
              <ToolCard
                key={tool.name}
                tool={tool}
                isLive={status === 'live'}
                slug={slug}
                lastSyncedAt={lastSyncedAt}
              />
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
            Inspect Locally
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
