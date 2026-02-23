import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { graphqlClient, gql } from "../lib/graphql-client.js";

const GetPositionsSchema = z.object({
  address: z.string().describe("Wallet address to get positions for"),
  limit: z.number().min(1).max(50).default(20).describe("Max results to return"),
  offset: z.number().min(0).default(0).describe("Pagination offset"),
});

const GET_POSITIONS_QUERY = gql`
  query GetPositions($address: String!, $limit: Int!, $offset: Int!) {
    positions(
      where: { accountId: { _ilike: $address } }
      limit: $limit
      offset: $offset
      order_by: { shares: desc }
    ) {
      id
      shares
      vault {
        id
        totalShares
        currentSharePrice
        atom {
          id
          label
          type
        }
        triple {
          id
          label
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
        }
      }
    }
  }
`;

interface GetPositionsResponse {
  positions: Array<{
    id: string;
    shares: string;
    vault: {
      id: string;
      totalShares: string;
      currentSharePrice: string;
      atom: {
        id: string;
        label: string | null;
        type: string;
      } | null;
      triple: {
        id: string;
        label: string | null;
        subject: { id: string; label: string | null };
        predicate: { id: string; label: string | null };
        object: { id: string; label: string | null };
      } | null;
    };
  }>;
}

export function registerGetPositions(server: McpServer): void {
  server.tool(
    "get_positions",
    "Get all staking positions held by a wallet address, showing which atoms and triples they have staked on.",
    GetPositionsSchema.shape,
    async (params) => {
      const { address, limit, offset } = GetPositionsSchema.parse(params);

      try {
        const data = await graphqlClient.request<GetPositionsResponse>(
          GET_POSITIONS_QUERY,
          {
            address: address.toLowerCase(),
            limit,
            offset,
          }
        );

        if (!data.positions.length) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No positions found for address "${address}".`,
              },
            ],
          };
        }

        const results = data.positions.map((p) => {
          const base: Record<string, unknown> = {
            id: p.id,
            shares: p.shares,
            sharePrice: p.vault.currentSharePrice,
          };

          if (p.vault.atom) {
            base.type = "atom";
            base.atom = {
              id: p.vault.atom.id,
              label: p.vault.atom.label,
            };
          } else if (p.vault.triple) {
            const t = p.vault.triple;
            base.type = "triple";
            base.triple = {
              id: t.id,
              subject: t.subject.label ?? t.subject.id,
              predicate: t.predicate.label ?? t.predicate.id,
              object: t.object.label ?? t.object.id,
            };
          }

          return base;
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(results, null, 2),
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
              text: `Error fetching positions: ${message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}