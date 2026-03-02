# Intuition MCP Playground

Interactive Next.js app for exploring the Intuition MCP ecosystem — browse the MCP directory, try tool playgrounds, and read the docs.

## Quick Start

From the **monorepo root**:

```bash
npm install
npm run dev
```

Or directly from this directory:

```bash
npm run dev
```

Opens at [http://localhost:3000](http://localhost:3000).

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | Run ESLint |

## Tech Stack

- Next.js 16 (App Router)
- TypeScript
- Tailwind CSS + Radix UI
- MCP SDK (`@modelcontextprotocol/sdk`)

## Project Structure

```
app/            # Next.js App Router pages
components/     # React components
  ui/           # Shared UI primitives
lib/            # Utilities, MCP registry, client logic
  mcp/          # MCP server entry point
```

## License

MIT
