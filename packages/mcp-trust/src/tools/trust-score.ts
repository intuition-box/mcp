import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { graphqlClient, gql } from "../lib/graphql-client.js";
import {
  filterByTrustPredicate,
  getPredicateWeight,
  type WeightProfile,
} from "../lib/predicates.js";

const TrustScoreSchema = z.object({
  address: z.string().describe("Wallet address to compute trust score for"),
  weights: z
    .record(z.string(), z.number().min(0).max(1))
    .optional()
    .describe(
      'Custom predicate weight profile. Example: {"trusts": 0.9, "vouches for": 0.6, "follows": 0.1}'
    ),
});

const ATTESTATIONS_QUERY = gql`
  query GetAttestations($address: String!) {
    triples(
      where: {
        _or: [
          { subject: { label: { _ilike: $address } } }
          { object: { label: { _ilike: $address } } }
        ]
      }
      limit: 500
      order_by: { id: desc }
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
        currentSharePrice
        positionCount
      }
      counterVault {
        totalShares
        currentSharePrice
        positionCount
      }
      blockTimestamp
    }
  }
`;

interface Triple {
  id: string;
  subject: { id: string; label: string | null };
  predicate: { id: string; label: string | null };
  object: { id: string; label: string | null };
  vault: {
    totalShares: string;
    currentSharePrice: string;
    positionCount: number;
  } | null;
  counterVault: {
    totalShares: string;
    currentSharePrice: string;
    positionCount: number;
  } | null;
  blockTimestamp: string;
}

interface AttestationsResponse {
  triples: Triple[];
}

interface PredicateBreakdown {
  count: number;
  weight: number;
  contribution: number;
}

function computeTrustScore(
  triples: Triple[],
  weights?: WeightProfile
): {
  score: number;
  breakdown: Record<string, PredicateBreakdown>;
  totalAttestations: number;
  filteredAttestations: number;
} {
  const breakdown: Record<string, PredicateBreakdown> = {};
  let totalWeightedScore = 0;
  let totalWeight = 0;
  let filteredCount = 0;

  for (const triple of triples) {
    const pred = (triple.predicate.label ?? "unknown").toLowerCase().trim();

    if (!filterByTrustPredicate(pred, weights)) continue;

    filteredCount++;
    const weight = getPredicateWeight(pred, weights);
    const forPositions = triple.vault?.positionCount ?? 0;
    const againstPositions = triple.counterVault?.positionCount ?? 0;
    const totalPositions = forPositions + againstPositions;
    const normalizedSentiment =
      totalPositions > 0
        ? (forPositions - againstPositions) / totalPositions
        : 0;

    const contribution = weight * (0.5 + 0.5 * normalizedSentiment);
    totalWeightedScore += contribution;
    totalWeight += weight;

    if (!breakdown[pred]) {
      breakdown[pred] = { count: 0, weight, contribution: 0 };
    }
    breakdown[pred].count++;
    breakdown[pred].contribution += contribution;
  }

  const raw =
    totalWeight > 0 ? (totalWeightedScore / totalWeight) * 100 : 0;

  return {
    score: Math.min(Math.max(Math.round(raw), 0), 100),
    breakdown,
    totalAttestations: triples.length,
    filteredAttestations: filteredCount,
  };
}

export function registerTrustScore(server: McpServer): void {
  server.tool(
    "trust_score",
    "Compute a weighted trust score for a wallet address. Filters to trust-related predicates only. Accepts optional custom weight profile per query.",
    TrustScoreSchema.shape,
    async (params) => {
      const { address, weights } = TrustScoreSchema.parse(params);

      try {
        const data = await graphqlClient.request<AttestationsResponse>(
          ATTESTATIONS_QUERY,
          { address: address.toLowerCase() }
        );

        const result = computeTrustScore(data.triples, weights);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  address,
                  trustScore: result.score,
                  totalAttestations: result.totalAttestations,
                  trustAttestations: result.filteredAttestations,
                  weightsUsed: weights ?? "default",
                  breakdown: result.breakdown,
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
              text: `Error computing trust score: ${message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}