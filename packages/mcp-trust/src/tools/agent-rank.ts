import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { graphqlClient, gql } from "../lib/graphql-client.js";
import { isTrustPredicate } from "../lib/predicates.js";

const AgentRankSchema = z.object({
  iterations: z.number().min(1).max(50).default(10).describe("Number of PageRank iterations"),
  damping: z.number().min(0).max(1).default(0.85).describe("Damping factor"),
  limit: z.number().min(1).max(100).default(20).describe("Max results to return"),
});

const NETWORK_QUERY = gql`
  query NetworkGraph($limit: Int!) {
    triples(
      limit: $limit
      order_by: { vault: { positionCount: desc } }
    ) {
      subject {
        id
        label
      }
      predicate {
        id
        label
      }
      object {
        id
        label
      }
      vault {
        positionCount
      }
    }
  }
`;

interface NetworkTriple {
  subject: { id: string; label: string | null };
  predicate: { id: string; label: string | null };
  object: { id: string; label: string | null };
  vault: { positionCount: number } | null;
}

interface NetworkResponse {
  triples: NetworkTriple[];
}

function computeAgentRank(
  triples: NetworkTriple[],
  iterations: number,
  damping: number
): Map<string, number> {
  const inLinks = new Map<string, Map<string, number>>();
  const outDegree = new Map<string, number>();
  const nodes = new Set<string>();

  for (const triple of triples) {
    const pred = (triple.predicate.label ?? "").toLowerCase().trim();
    if (!isTrustPredicate(pred)) continue;

    const from = triple.subject.id.toLowerCase();
    const to = triple.object.id.toLowerCase();
    const weight = triple.vault?.positionCount ?? 1;

    nodes.add(from);
    nodes.add(to);

    if (!inLinks.has(to)) inLinks.set(to, new Map());
    inLinks.get(to)!.set(from, (inLinks.get(to)!.get(from) ?? 0) + weight);

    outDegree.set(from, (outDegree.get(from) ?? 0) + weight);
  }

  const n = nodes.size;
  if (n === 0) return new Map();

  const scores = new Map<string, number>();
  const initial = 1 / n;
  for (const node of nodes) scores.set(node, initial);

  for (let iter = 0; iter < iterations; iter++) {
    const newScores = new Map<string, number>();

    for (const node of nodes) {
      let incoming = 0;
      const links = inLinks.get(node);

      if (links) {
        for (const [from, weight] of links) {
          const fromOut = outDegree.get(from) ?? 1;
          incoming += ((scores.get(from) ?? 0) * weight) / fromOut;
        }
      }

      newScores.set(node, (1 - damping) / n + damping * incoming);
    }

    scores.clear();
    for (const [key, val] of newScores) scores.set(key, val);
  }

  return scores;
}

export function registerAgentRank(server: McpServer): void {
  server.tool(
    "agent_rank",
    "Compute AgentRank (PageRank-style) influence scores across the entire Intuition trust network. Identifies the most influential and central addresses.",
    AgentRankSchema.shape,
    async (params) => {
      const { iterations, damping, limit } = AgentRankSchema.parse(params);

      try {
        const data = await graphqlClient.request<NetworkResponse>(
          NETWORK_QUERY,
          { limit: 1000 }
        );

        const scores = computeAgentRank(data.triples, iterations, damping);

        const sorted = Array.from(scores.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, limit)
          .map(([addr, score], rank) => ({
            rank: rank + 1,
            address: addr,
            agentRankScore: Math.round(score * 10000) / 10000,
          }));

        const totalNodes = scores.size;
        const avgScore = totalNodes > 0
          ? Array.from(scores.values()).reduce((a, b) => a + b, 0) / totalNodes
          : 0;

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  networkSize: totalNodes,
                  iterations,
                  damping,
                  averageScore: Math.round(avgScore * 10000) / 10000,
                  topAgents: sorted,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        return {
          content: [
            {
              type: "text" as const,
              text: `Error computing AgentRank: ${message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}