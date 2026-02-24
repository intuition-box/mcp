import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { graphqlClient, gql } from "../lib/graphql-client.js";
import { isTrustPredicate, getPredicateWeight, type WeightProfile } from "../lib/predicates.js";

const EigenTrustSchema = z.object({
  address: z.string().describe("Seed address to compute EigenTrust from"),
  iterations: z.number().min(1).max(50).default(5).describe("Number of convergence iterations"),
  damping: z.number().min(0).max(1).default(0.85).describe("Damping factor (like PageRank)"),
  weights: z
    .record(z.string(), z.number().min(0).max(1))
    .optional()
    .describe("Custom predicate weight profile"),
  limit: z.number().min(1).max(100).default(20).describe("Max results to return"),
});

const TRUST_GRAPH_QUERY = gql`
  query TrustGraph($limit: Int!) {
    triples(
      limit: $limit
      order_by: { vault: { positionCount: desc } }
    ) {
      id
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
        totalShares
        positionCount
      }
      counterVault {
        totalShares
        positionCount
      }
    }
  }
`;

interface GraphTriple {
  id: string;
  subject: { id: string; label: string | null };
  predicate: { id: string; label: string | null };
  object: { id: string; label: string | null };
  vault: { totalShares: string; positionCount: number } | null;
  counterVault: { totalShares: string; positionCount: number } | null;
}

interface GraphResponse {
  triples: GraphTriple[];
}

function buildTrustMatrix(
  triples: GraphTriple[],
  weights?: WeightProfile
): { matrix: Map<string, Map<string, number>>; nodes: Set<string> } {
  const matrix = new Map<string, Map<string, number>>();
  const nodes = new Set<string>();

  for (const triple of triples) {
    const pred = (triple.predicate.label ?? "").toLowerCase().trim();
    if (!isTrustPredicate(pred)) continue;

    const from = triple.subject.id.toLowerCase();
    const to = triple.object.id.toLowerCase();
    const weight = getPredicateWeight(pred, weights);
    const forCount = triple.vault?.positionCount ?? 0;
    const againstCount = triple.counterVault?.positionCount ?? 0;
    const sentiment = forCount / Math.max(forCount + againstCount, 1);
    const edgeWeight = weight * sentiment;

    if (edgeWeight <= 0) continue;

    nodes.add(from);
    nodes.add(to);

    if (!matrix.has(from)) matrix.set(from, new Map());
    const row = matrix.get(from)!;
    row.set(to, (row.get(to) ?? 0) + edgeWeight);
  }

  // Normalize rows
  for (const [, row] of matrix) {
    let sum = 0;
    for (const val of row.values()) sum += val;
    if (sum > 0) {
      for (const [key, val] of row) row.set(key, val / sum);
    }
  }

  return { matrix, nodes };
}

function runEigenTrust(
  matrix: Map<string, Map<string, number>>,
  nodes: Set<string>,
  seedAddress: string,
  iterations: number,
  damping: number
): Map<string, number> {
  const n = nodes.size;
  if (n === 0) return new Map();

  const nodeArray = Array.from(nodes);
  const scores = new Map<string, number>();
  const seed = seedAddress.toLowerCase();

  // Initialize: seed node gets 1.0, rest get 0
  for (const node of nodeArray) {
    scores.set(node, node === seed ? 1.0 : 0);
  }

  for (let iter = 0; iter < iterations; iter++) {
    const newScores = new Map<string, number>();

    for (const node of nodeArray) {
      let incoming = 0;

      for (const [from, row] of matrix) {
        const weight = row.get(node);
        if (weight && weight > 0) {
          incoming += (scores.get(from) ?? 0) * weight;
        }
      }

      const teleport = node === seed ? (1 - damping) : 0;
      newScores.set(node, damping * incoming + teleport);
    }

    // Normalize
    let total = 0;
    for (const val of newScores.values()) total += val;
    if (total > 0) {
      for (const [key, val] of newScores) newScores.set(key, val / total);
    }

    scores.clear();
    for (const [key, val] of newScores) scores.set(key, val);
  }

  return scores;
}

export function registerEigenTrust(server: McpServer): void {
  server.tool(
    "eigentrust",
    "Run EigenTrust algorithm from a seed address to compute trust propagation scores across the network. Filters to trust predicates only.",
    EigenTrustSchema.shape,
    async (params) => {
      const { address, iterations, damping, weights, limit } =
        EigenTrustSchema.parse(params);

      try {
        const data = await graphqlClient.request<GraphResponse>(
          TRUST_GRAPH_QUERY,
          { limit: 1000 }
        );

        const { matrix, nodes } = buildTrustMatrix(data.triples, weights);
        const scores = runEigenTrust(matrix, nodes, address, iterations, damping);

        const sorted = Array.from(scores.entries())
          .filter(([addr]) => addr !== address.toLowerCase())
          .sort((a, b) => b[1] - a[1])
          .slice(0, limit)
          .map(([addr, score], rank) => ({
            rank: rank + 1,
            address: addr,
            eigenTrustScore: Math.round(score * 10000) / 10000,
          }));

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  seedAddress: address,
                  iterations,
                  damping,
                  nodesInGraph: nodes.size,
                  edgesProcessed: data.triples.length,
                  weightsUsed: weights ?? "default",
                  topTrusted: sorted,
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
              text: `Error running EigenTrust: ${message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}