import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { graphqlClient, gql } from "../lib/graphql-client.js";

const GetTripleSchema = z.object({
  id: z.string().describe("The triple ID to retrieve"),
});

const GET_TRIPLE_QUERY = gql`
  query GetTriple($id: numeric!) {
    triple(id: $id) {
      id
      label
      subject {
        id
        label
        type
        emoji
      }
      predicate {
        id
        label
        type
        emoji
      }
      object {
        id
        label
        type
        emoji
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
      creator {
        id
        label
      }
      blockTimestamp
    }
  }
`;

interface GetTripleResponse {
  triple: {
    id: string;
    label: string | null;
    subject: { id: string; label: string | null; type: string; emoji: string | null };
    predicate: { id: string; label: string | null; type: string; emoji: string | null };
    object: { id: string; label: string | null; type: string; emoji: string | null };
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
    creator: {
      id: string;
      label: string | null;
    } | null;
    blockTimestamp: string;
  } | null;
}

export function registerGetTriple(server: McpServer): void {
  server.tool(
    "get_triple",
    "Get detailed information about a specific triple (subject-predicate-object claim) by ID, including for/against vault positions.",
    GetTripleSchema.shape,
    async (params) => {
      const { id } = GetTripleSchema.parse(params);

      try {
        const data = await graphqlClient.request<GetTripleResponse>(
          GET_TRIPLE_QUERY,
          { id: parseInt(id, 10) }
        );

        if (!data.triple) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Triple with ID "${id}" not found.`,
              },
            ],
          };
        }

        const t = data.triple;
        const result = {
          id: t.id,
          label: t.label,
          claim: {
            subject: t.subject.label ?? t.subject.id,
            predicate: t.predicate.label ?? t.predicate.id,
            object: t.object.label ?? t.object.id,
          },
          for: {
            positions: t.vault?.positionCount ?? 0,
            totalShares: t.vault?.totalShares ?? "0",
            sharePrice: t.vault?.currentSharePrice ?? "0",
          },
          against: {
            positions: t.counterVault?.positionCount ?? 0,
            totalShares: t.counterVault?.totalShares ?? "0",
            sharePrice: t.counterVault?.currentSharePrice ?? "0",
          },
          creator: t.creator?.label ?? t.creator?.id ?? "unknown",
          timestamp: t.blockTimestamp,
        };

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
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
              text: `Error fetching triple: ${message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}