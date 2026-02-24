import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { graphqlClient, gql } from "../lib/graphql-client.js";
import { isTrustPredicate } from "../lib/predicates.js";

const SybilDetectSchema = z.object({
  address: z.string().describe("Address to analyze for sybil indicators"),
  threshold: z
    .number()
    .min(0)
    .max(1)
    .default(0.7)
    .describe("Suspicion threshold (0-1). Higher = stricter detection"),
});

const ACCOUNT_ACTIVITY_QUERY = gql`
  query AccountActivity($address: String!) {
    asSubject: triples(
      where: { subject: { label: { _ilike: $address } } }
      order_by: { id: desc }
      limit: 200
    ) {
      id
      subject { id label }
      predicate { id label }
      object { id label }
      vault { positionCount totalShares }
      blockTimestamp
    }
    asObject: triples(
      where: { object: { label: { _ilike: $address } } }
      order_by: { id: desc }
      limit: 200
    ) {
      id
      subject { id label }
      predicate { id label }
      object { id label }
      vault { positionCount totalShares }
      blockTimestamp
    }
  }
`;

interface ActivityTriple {
  id: string;
  subject: { id: string; label: string | null };
  predicate: { id: string; label: string | null };
  object: { id: string; label: string | null };
  vault: { positionCount: number; totalShares: string } | null;
  blockTimestamp: string;
}

interface ActivityResponse {
  asSubject: ActivityTriple[];
  asObject: ActivityTriple[];
}

interface SybilSignal {
  indicator: string;
  severity: "low" | "medium" | "high";
  score: number;
  detail: string;
}

function analyzeSybilSignals(
  address: string,
  outgoing: ActivityTriple[],
  incoming: ActivityTriple[]
): SybilSignal[] {
  const signals: SybilSignal[] = [];

  // Signal 1: Low incoming trust relative to outgoing
  const outTrust = outgoing.filter((t) =>
    isTrustPredicate((t.predicate.label ?? "").toLowerCase())
  );
  const inTrust = incoming.filter((t) =>
    isTrustPredicate((t.predicate.label ?? "").toLowerCase())
  );

  if (outTrust.length > 5 && inTrust.length === 0) {
    signals.push({
      indicator: "no_incoming_trust",
      severity: "high",
      score: 0.9,
      detail: `${outTrust.length} outgoing trust attestations but zero incoming. Typical of sybil accounts that attest but receive no organic trust.`,
    });
  } else if (outTrust.length > 0 && inTrust.length > 0) {
    const ratio = outTrust.length / inTrust.length;
    if (ratio > 10) {
      signals.push({
        indicator: "extreme_out_in_ratio",
        severity: "high",
        score: 0.8,
        detail: `Out/in trust ratio of ${ratio.toFixed(1)}:1. Heavily skewed toward giving trust without receiving it.`,
      });
    } else if (ratio > 5) {
      signals.push({
        indicator: "high_out_in_ratio",
        severity: "medium",
        score: 0.5,
        detail: `Out/in trust ratio of ${ratio.toFixed(1)}:1. Moderately skewed.`,
      });
    }
  }

  // Signal 2: Burst activity (many attestations in short timeframe)
  if (outgoing.length >= 5) {
    const timestamps = outgoing
      .map((t) => new Date(t.blockTimestamp).getTime())
      .sort((a, b) => a - b);

    const firstFive = timestamps.slice(0, 5);
    const spanMinutes =
      (firstFive[firstFive.length - 1] - firstFive[0]) / (1000 * 60);

    if (spanMinutes < 5 && spanMinutes >= 0) {
      signals.push({
        indicator: "burst_activity",
        severity: "high",
        score: 0.85,
        detail: `${firstFive.length} attestations within ${spanMinutes.toFixed(1)} minutes. Suggests automated or coordinated behavior.`,
      });
    } else if (spanMinutes < 30) {
      signals.push({
        indicator: "rapid_activity",
        severity: "medium",
        score: 0.5,
        detail: `${firstFive.length} attestations within ${spanMinutes.toFixed(1)} minutes.`,
      });
    }
  }

  // Signal 3: Low position diversity (only interacts with few addresses)
  const uniqueTargets = new Set(
    outgoing.map((t) => t.object.id.toLowerCase())
  );
  if (outgoing.length > 10 && uniqueTargets.size <= 3) {
    signals.push({
      indicator: "low_target_diversity",
      severity: "high",
      score: 0.75,
      detail: `${outgoing.length} outgoing attestations targeting only ${uniqueTargets.size} unique addresses. Concentrated interaction pattern.`,
    });
  }

  // Signal 4: No stake behind attestations
  const noStake = outgoing.filter(
    (t) => !t.vault || t.vault.positionCount === 0
  );
  if (outgoing.length > 5 && noStake.length / outgoing.length > 0.8) {
    signals.push({
      indicator: "low_stake_commitment",
      severity: "medium",
      score: 0.6,
      detail: `${Math.round((noStake.length / outgoing.length) * 100)}% of attestations have zero staking positions. Low economic commitment.`,
    });
  }

  return signals;
}

export function registerSybilDetect(server: McpServer): void {
  server.tool(
    "sybil_detect",
    "Analyze an address for sybil attack indicators. Checks trust ratio, burst activity, target diversity, and stake commitment.",
    SybilDetectSchema.shape,
    async (params) => {
      const { address, threshold } = SybilDetectSchema.parse(params);

      try {
        const data = await graphqlClient.request<ActivityResponse>(
          ACCOUNT_ACTIVITY_QUERY,
          { address: address.toLowerCase() }
        );

        const signals = analyzeSybilSignals(
          address,
          data.asSubject,
          data.asObject
        );

        const avgScore =
          signals.length > 0
            ? signals.reduce((sum, s) => sum + s.score, 0) / signals.length
            : 0;

        const isSuspicious = avgScore >= threshold;

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  address,
                  isSuspicious,
                  suspicionScore: Math.round(avgScore * 100) / 100,
                  threshold,
                  verdict: isSuspicious
                    ? "Address exhibits sybil-like behavior patterns"
                    : "No strong sybil indicators detected",
                  signals,
                  activity: {
                    outgoingAttestations: data.asSubject.length,
                    incomingAttestations: data.asObject.length,
                  },
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
              text: `Error analyzing sybil signals: ${message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}