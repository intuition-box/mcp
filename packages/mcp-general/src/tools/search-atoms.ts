import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { graphqlClient, gql } from "../lib/graphql-client.js";

const SearchAtomsSchema = z.object({
  query: z.string().describe("Search term to find atoms by label"),
  limit: z.number().min(1).max(50).default(10).describe("Max results to return"),
  offset: z.number().min(0).default(0).describe("Pagination offset"),
});

const SEARCH_ATOMS_QUERY = gql`
  query SearchAtoms($query: String!, $limit: Int!, $offset: Int!) {
    atoms(
      where: { label: { _ilike: $query } }
      limit: $limit
      offset: $offset
      order_by: { id: desc }
    ) {
      id
      label
      type
      emoji
      image
      vault {
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

interface SearchAtomsResponse {
  atoms: Array<{
    id: string;
    label: string;
    type: string;
    emoji: string | null;
    image: string | null;
    vault: {
      totalShares: string;
      currentSharePrice: string;
      positionCount: number;
    } | null;
    creator: {
      id: string;
      label: string | null;
    } | null;
    blockTimestamp: string;
  }>;
}

export function registerSearchAtoms(server: McpServer): void {
  server.tool(
    "search_atoms",
    "Search for atoms in the Intuition knowledge graph by label. Returns matching atoms with vault stats and creator info.",
    SearchAtomsSchema.shape,
    async (params) => {
      const { query, limit, offset } = SearchAtomsSchema.parse(params);

      try {
        const data = await graphqlClient.request<SearchAtomsResponse>(
          SEARCH_ATOMS_QUERY,
          {
            query: `%${query}%`,
            limit,
            offset,
          }
        );

        if (!data.atoms.length) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No atoms found matching "${query}".`,
              },
            ],
          };
        }

        const results = data.atoms.map((atom) => ({
          id: atom.id,
          label: atom.label,
          type: atom.type,
          emoji: atom.emoji,
          positions: atom.vault?.positionCount ?? 0,
          totalShares: atom.vault?.totalShares ?? "0",
          sharePrice: atom.vault?.currentSharePrice ?? "0",
          creator: atom.creator?.label ?? atom.creator?.id ?? "unknown",
          timestamp: atom.blockTimestamp,
        }));

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
              text: `Error searching atoms: ${message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}