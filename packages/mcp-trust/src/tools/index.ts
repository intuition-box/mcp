import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTrustScore } from "./trust-score.js";
import { registerEigenTrust } from "./eigentrust.js";
import { registerAgentRank } from "./agent-rank.js";
import { registerSybilDetect } from "./sybil-detect.js";

export function registerTools(server: McpServer): void {
  registerTrustScore(server);
  registerEigenTrust(server);
  registerAgentRank(server);
  registerSybilDetect(server);
}