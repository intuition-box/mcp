/**
 * Address-list parser for MCP tool inputs.
 *
 * Accepts: string[], JSON-array string ('["0x..","0x.."]'), or a
 * space/comma-separated string ("0xa, 0xb 0xc"). Returns a flat string[]
 * with empties stripped. Anything else returns [].
 */

export function parseAddressList(input: unknown): string[] {
  if (Array.isArray(input)) {
    return input
      .filter((x): x is string => typeof x === 'string')
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }

  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (trimmed.length === 0) return [];

    // JSON-array form
    if (trimmed.startsWith('[')) {
      try {
        const parsed: unknown = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed
            .filter((x): x is string => typeof x === 'string')
            .map(s => s.trim())
            .filter(s => s.length > 0);
        }
      } catch {
        // fall through to delimiter parsing
      }
    }

    return trimmed
      .split(/[\s,]+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }

  return [];
}
