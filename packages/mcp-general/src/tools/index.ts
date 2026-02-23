import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerSearchAtoms } from "./search-atoms.js";
import { registerGetAtom } from "./get-atom.js";
import { registerGetTriple } from "./get-triple.js";
import { registerGetPositions } from "./get-positions.js";

export function registerTools(server: McpServer): void {
  registerSearchAtoms(server);
  registerGetAtom(server);
  registerGetTriple(server);
  registerGetPositions(server);
}